import json
import logging
import os
import boto3
import threading
import time
from awscrt import io
from awsiot import mqtt_connection_builder
from awscrt.mqtt import QoS
import shutil
import subprocess
import logging
import uuid
import socket
import subprocess
import sys

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


hostname = socket.gethostname()
unique_suffix = str(uuid.uuid4())[:8]
client_id = f"g2l_core_ota_{hostname}_{unique_suffix}"
bucket_name= os.getenv("BUCKET_NAME")
endpoint = os.getenv("IOT_ENDPOINT")
access_key = os.getenv("AWS_ACCESS_KEY_ID")
secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
ca_filepath = "/opt/greengrass/certs/AmazonRootCA1.pem"
cert = "/opt/greengrass/certs/cert.pem"
private_key = "/opt/greengrass/certs/private.key"
region = "us-east-1"
topic = "download/task"

# Use the existing DownloadWorker work directory
ggc_root = os.environ.get('GGC_ROOT_PATH', '/greengrass/v2')
download_dir = os.path.join(ggc_root, 'work', 'DownloadWorker', 'bundle_downloads')

# Create the downloads subdirectory
os.makedirs(download_dir, exist_ok=True)
logger.info(f"Download directory: {download_dir}")

# Connection state tracking
connection_established = False
subscription_established = False
resubscribe_lock = threading.Lock()

# Callback functions for connection events
def on_connection_interrupted(connection, error, **kwargs):
    """Callback when connection is interrupted"""
    global connection_established, subscription_established
    connection_established = False
    subscription_established = False
    logger.warning(f"Connection interrupted: {error}")


def on_connection_resumed(connection, return_code, session_present, **kwargs):
    """Callback when connection is resumed"""
    global connection_established
    connection_established = True
    logger.info(f"Connection resumed. Return code: {return_code}, Session present: {session_present}")
    
    # Add a small delay before resubscribing to ensure connection is fully established
    def delayed_resubscribe():
        time.sleep(2)  # Wait 2 seconds
        if not subscription_established:
            try:
                logger.info("Resubscribing to topic after connection resume...")
                resubscribe_to_topic()
            except Exception as e:
                logger.error(f"Failed to resubscribe: {e}")
    
    # Run resubscription in a separate thread to avoid blocking the callback
    threading.Thread(target=delayed_resubscribe, daemon=True).start()

def resubscribe_to_topic():
    """Resubscribe to the topic with improved error handling"""
    global subscription_established
    
    with resubscribe_lock:
        if subscription_established:
            logger.info("Already subscribed, skipping resubscription")
            return
            
        max_retries = 3
        for attempt in range(max_retries):
            try:
                logger.info(f"Attempting to resubscribe to topic: {topic} (attempt {attempt + 1}/{max_retries})")
                
                # Check if connection is still established
                if not connection_established:
                    logger.warning("Connection not established, cannot resubscribe")
                    return
                
                subscribe_future, packet_id = mqtt_connection.subscribe(
                    topic=topic,
                    qos=QoS.AT_LEAST_ONCE,
                    callback=handle_message
                )
                
                # Wait for subscription with timeout
                subscribe_result = subscribe_future.result(timeout=15)
                subscription_established = True
                logger.info(f"Successfully resubscribed to topic: {topic} with packet_id: {packet_id}")
                return
                
            except Exception as e:
                logger.error(f"Resubscription attempt {attempt + 1} failed: {e}")
                subscription_established = False
                
                if attempt < max_retries - 1:
                    time.sleep(5)  # Wait before retry
                else:
                    logger.error(f"Failed to resubscribe after {max_retries} attempts")

# Init event loop and MQTT connection
event_loop_group = io.EventLoopGroup(1)
host_resolver = io.DefaultHostResolver(event_loop_group)
client_bootstrap = io.ClientBootstrap(event_loop_group, host_resolver)

mqtt_connection = mqtt_connection_builder.mtls_from_path(
    endpoint=endpoint,
    port=8883,
    cert_filepath=cert,
    pri_key_filepath=private_key,
    client_bootstrap=client_bootstrap,
    ca_filepath=ca_filepath,
    on_connection_interrupted=on_connection_interrupted,
    on_connection_resumed=on_connection_resumed,
    client_id=client_id,
    clean_session=True,
    keep_alive_secs=60, 
    ping_timeout_ms=30000,
    protocol_operation_timeout_ms=60000 
)



def install_bundle(path):
    def log_message(level, message):
        """Force immediate logging that Greengrass will capture"""
        timestamp = __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        print(f"[{timestamp}] [{level}] {message}", flush=True)
        
        try:
            if level.upper() == 'INFO':
                logger.info(message)
            elif level.upper() == 'ERROR':
                logger.error(message)
            elif level.upper() == 'EXCEPTION':
                logger.exception(message)
            
            # Force flush logger handlers
            for handler in logger.handlers:
                try:
                    handler.flush()
                except:
                    pass
        except:
            pass
        
        # Force system flush
        sys.stdout.flush()
        sys.stderr.flush()
    
    try:
        log_message('INFO', f"Looking for .raucb bundle in: {path}")
        
        bundle_file = None
        for file in os.listdir(path):
            if file.endswith(".raucb"):
                bundle_file = os.path.join(path, file)
                log_message('INFO', f"Found bundle file: {bundle_file}")
                break
                
        if bundle_file is None:
            log_message('ERROR', f"No .raucb bundle file found in directory: {path}")
            return False
            
        log_message('INFO', f"Starting RAUC install on {bundle_file}")
        
        process = subprocess.Popen(
            ["rauc", "install", bundle_file], 
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=0,
            universal_newlines=True
        )
        
        pid = process.pid
        log_message('INFO', f"Process started with PID: {pid}")
        
        # Stream output line by line
        output_lines = []
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                line = line.strip()
                log_message('INFO', f"RAUC: {line}")
                output_lines.append(line)
        
        return_code = process.wait()
        
        # Log final results
        final_output = "\n".join(output_lines)
        log_message('INFO', f"RAUC install complete output:\n{final_output}")
        
        if return_code == 0:
            log_message('INFO', "RAUC install completed successfully.")
            return True
        else:
            log_message('ERROR', f"RAUC install failed with exit code {return_code}")
            return False
            
    except FileNotFoundError:
        log_message('ERROR', f"Directory not found: {path}")
        return False
    except subprocess.SubprocessError as e:
        log_message('ERROR', f"Subprocess error during RAUC install: {e}")
        return False
    except Exception as e:
        log_message('EXCEPTION', f"Exception during RAUC install: {e}")
        return False


def download_s3_folder(bucket_name, prefix, local_dir):
    """Download a folder from S3 recursively using default credential provider chain."""
    logger.info(f"Using region: {region}")
    
    # Do NOT explicitly pass access_key or secret_key here
    s3 = boto3.client(
        's3',
        region_name=region
    )

    paginator = s3.get_paginator('list_objects_v2')
    downloaded_files = 0
    total_size = 0
    logger.info(f"Downloading folder: s3://{bucket_name}/{prefix}")
    
    for page in paginator.paginate(Bucket=bucket_name, Prefix=prefix):
        if 'Contents' not in page:
            logger.warning(f"No objects found with prefix: {prefix}")
            continue
        for obj in page['Contents']:
            key = obj['Key']
            file_size = obj['Size']
            if key.endswith('/'):
                continue
            if key.startswith(prefix):
                rel_path = key[len(prefix):].lstrip('/')
            else:
                rel_path = os.path.basename(key)
            if not rel_path:
                continue

            local_path = os.path.join(local_dir, rel_path)
            local_dir_path = os.path.dirname(local_path)
            if local_dir_path and local_dir_path != local_dir:
                os.makedirs(local_dir_path, exist_ok=True)
            
            try:
                logger.info(f"Downloading: {key} ({file_size} bytes) → {local_path}")
                s3.download_file(bucket_name, key, local_path)
                downloaded_files += 1
                total_size += file_size
            except Exception as e:
                logger.error(f"Error downloading {key}: {e}")
                continue

    logger.info(f"Folder download complete: {downloaded_files} files, {total_size} bytes")
    return {
        "files": downloaded_files,
        "total_size": total_size,
        "local_path": local_path if downloaded_files else None
    }


def handle_message(topic, payload, dup, qos, retain, **kwargs):
    """Callback on receiving MQTT message."""
    try:
        logger.info(f"Received message on {topic} (QoS: {qos}, DUP: {dup}, RETAIN: {retain})")
        message = json.loads(payload.decode('utf-8'))
        logger.info(f"Message content: {message}")
        
        bundle_key = message.get("bundle_key")
        if not bundle_key:
            logger.error("Missing bundle_key in payload.")
            return
            
        #bucket_name = message.get("bucket_name", "bundlebucketota")
        
        logger.info(f"Starting S3 download: s3://{bucket_name}/{bundle_key}")
        os.makedirs(download_dir, exist_ok=True)
        result = download_s3_folder(bucket_name, bundle_key, download_dir)
        print(f"Downloaded {result['files']} files totaling {result['total_size']} bytes  download_location: {result['local_path']}")

        if result["local_path"]:
            downloaded_dir = os.path.dirname(result["local_path"])
            # Run ls -la on that directory
            threading.Thread(target=install_bundle, args=(downloaded_dir,), daemon=True).start()
        
    except Exception as e:
        logger.exception("Error handling MQTT message")

def main():
    global connection_established, subscription_established
    
    try:
        # Connect with retry logic
        max_retries = 3
        for attempt in range(max_retries):
            try:
                logger.info(f"Connecting to {endpoint}... (attempt {attempt + 1}/{max_retries})")
                connect_future = mqtt_connection.connect()
                connect_future.result(timeout=30)  # 30 second timeout
                connection_established = True
                logger.info("Connected!")
                break
            except Exception as e:
                logger.error(f"Connection attempt {attempt + 1} failed: {e}")
                if attempt == max_retries - 1:
                    raise
                time.sleep(5)  # Wait before retry
        
        # Subscribe with retry logic
        for attempt in range(max_retries):
            try:
                logger.info(f"Subscribing to topic: {topic} (attempt {attempt + 1}/{max_retries})")
                subscribe_future, packet_id = mqtt_connection.subscribe(
                    topic=topic,
                    qos=QoS.AT_LEAST_ONCE,
                    callback=handle_message
                )
                subscribe_future.result(timeout=30)  # 30 second timeout
                subscription_established = True
                logger.info(f"Subscribed to topic: {topic} with packet_id: {packet_id}")
                break
            except Exception as e:
                logger.error(f"Subscription attempt {attempt + 1} failed: {e}")
                if attempt == max_retries - 1:
                    raise
                time.sleep(5)  # Wait before retry
        
        # Keep script running with connection monitoring
        logger.info("Waiting for messages. Press Ctrl+C to exit.")
        consecutive_failures = 0
        max_consecutive_failures = 5
        
        while True:
            try:
                time.sleep(5)  # Check every 5 seconds
                
                # Reset failure counter if connection is good
                if connection_established:
                    consecutive_failures = 0
                    
                    # If connection is good but subscription is lost, try to resubscribe
                    if not subscription_established:
                        logger.warning("Connection established but subscription lost. Attempting to resubscribe...")
                        resubscribe_to_topic()
                else:
                    consecutive_failures += 1
                    logger.warning(f"Connection not established. Consecutive failures: {consecutive_failures}")
                    
                    if consecutive_failures >= max_consecutive_failures:
                        logger.error("Too many consecutive connection failures. Exiting.")
                        break
                        
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                consecutive_failures += 1
                
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
    finally:
        # Cleanup
        try:
            if connection_established:
                logger.info("Disconnecting...")
                disconnect_future = mqtt_connection.disconnect()
                disconnect_future.result(timeout=10)
                logger.info("Disconnected.")
        except Exception as e:
            logger.error(f"Error during disconnect: {e}")

if __name__ == "__main__":
    main()