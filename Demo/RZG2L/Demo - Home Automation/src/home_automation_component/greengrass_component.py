#!/usr/bin/env python3
import os
import json
import time
import threading
import logging
from datetime import datetime, timezone
import boto3
from stream_manager import StreamManagerClient
from stream_manager import MessageStreamDefinition
from stream_manager import StrategyOnFull
from stream_manager import ReadMessagesOptions

# Greengrass IPC imports
import awsiot.greengrasscoreipc
import awsiot.greengrasscoreipc.client as client
from awsiot.greengrasscoreipc.model import (
    UpdateThingShadowRequest,
    GetThingShadowRequest,
    SubscribeToIoTCoreRequest,
    QOS
)

# -------- Logging --------
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("RZG2L_HomeAuto_Log")

# -------- Config --------
THING_NAME = os.getenv("THING_NAME", "home_automation_thing")
LOOP_SEC = float(os.getenv("LOOP_SEC", "60.0"))

# Stream Manager
STREAM_NAME = os.getenv("SM_STREAM_NAME", "humidity_stream")
TS_DB = os.getenv("TS_DB", "homeautomation_db")
TS_TABLE = os.getenv("TS_TABLE", "humidity_readings")
ENABLE_TS_EXPORT = os.getenv("ENABLE_TS_EXPORT", "true").lower() in ("1", "true", "yes")


# Sensor paths
TEMP_SENSOR_PATH = os.getenv("TEMP_SENSOR_PATH", "/sys/class/hwmon/hwmon1/temp1_input")
HUM_SENSOR_PATH = os.getenv("HUM_SENSOR_PATH", "/sys/class/hwmon/hwmon1/humidity1_input")

# Mock Sensor paths
# TEMP_SENSOR_PATH = os.getenv("TEMP_SENSOR_PATH", "/tmp/mock_sensors/temp1_input")
# HUM_SENSOR_PATH = os.getenv("HUM_SENSOR_PATH", "/tmp/mock_sensors/humidity1_input")

# Timestream client
timestream = boto3.client("timestream-write", region_name=os.getenv("AWS_REGION", "us-east-1"))

# -------- GPIO Driver --------

# class GpioDriver:
#     def __init__(self, mock_mode=True):
#         self.led_on = False
#         self.fan_on = False
#         self.mock_mode = mock_mode
        
#         if self.mock_mode:
#             # Create mock GPIO directory in /tmp for testing
#             self.mock_gpio_dir = "/tmp/mock_gpio"
#             os.makedirs(self.mock_gpio_dir, exist_ok=True)
            
#             self.led_gpio_path = os.path.join(self.mock_gpio_dir, "P42_4_value")
#             self.fan_gpio_path = os.path.join(self.mock_gpio_dir, "P47_2_value")
            
#             # Initialize with OFF state
#             with open(self.led_gpio_path, "w") as f:
#                 f.write("0")
#             with open(self.fan_gpio_path, "w") as f:
#                 f.write("0")
            
#             log.info(f"[MOCK MODE] GPIO simulation enabled at {self.mock_gpio_dir}")

#     def read_led_state(self) -> bool:
#         """
#         Read current LED state from GPIO
#         Returns True if ON (value="1"), False if OFF (value="0")
#         """
#         try:
#             with open(self.led_gpio_path, "r") as f:
#                 value = f.read().strip()
#                 state = value == "1"
#                 self.led_on = state
#                 return state
#         except Exception as e:
#             log.error(f"Failed to read LED state: {e}")
#             return self.led_on  # Return cached state on error
    
#     def read_fan_state(self) -> bool:
#         """
#         Read current Fan state from GPIO
#         Returns True if ON (value="1"), False if OFF (value="0")
#         """
#         try:
#             with open(self.fan_gpio_path, "r") as f:
#                 value = f.read().strip()
#                 state = value == "1"
#                 self.fan_on = state
#                 return state
#         except Exception as e:
#             log.error(f"Failed to read Fan state: {e}")
#             return self.fan_on  # Return cached state on error

#     def set_led(self, on: bool):
#         """
#         Control LED via GPIO sysfs
#         ON = write "1", OFF = write "0"
#         """
#         try:
#             value = "1" if on else "0"
#             with open(self.led_gpio_path, "w") as f:
#                 f.write(value)
#             self.led_on = on
            
#             if self.mock_mode:
#                 log.info(f"[MOCK GPIO LED] {'ON' if on else 'OFF'} (wrote '{value}' to {self.led_gpio_path})")
#             else:
#                 log.info(f"[GPIO LED] {'ON' if on else 'OFF'}")
#         except Exception as e:
#             log.error(f"Failed to set LED: {e}")
    
#     def set_fan(self, on: bool):
#         """
#         Control DC Motor (Fan) via GPIO sysfs
#         ON = write "1", OFF = write "0"
#         """
#         try:
#             value = "1" if on else "0"
#             with open(self.fan_gpio_path, "w") as f:
#                 f.write(value)
#             self.fan_on = on
            
#             if self.mock_mode:
#                 log.info(f"[MOCK GPIO FAN] {'ON' if on else 'OFF'} (wrote '{value}' to {self.fan_gpio_path})")
#             else:
#                 log.info(f"[GPIO FAN] {'ON' if on else 'OFF'}")
#         except Exception as e:
#             log.error(f"Failed to set Fan: {e}")
    

class GpioDriver:
    def __init__(self):
        self.led_on = False
        self.fan_on = False
        self.led_gpio_path = "/sys/class/gpio/P42_4/value"
        self.fan_gpio_path = "/sys/class/gpio/P47_2/value"
        
        # Verify GPIO paths exist
        if not os.path.exists(self.led_gpio_path):
            log.warning(f"LED GPIO path not found: {self.led_gpio_path}")
        if not os.path.exists(self.fan_gpio_path):
            log.warning(f"Fan GPIO path not found: {self.fan_gpio_path}")
    
    def read_led_state(self) -> bool:
        """
        Read current LED state from GPIO
        Returns True if ON (value="1"), False if OFF (value="0")
        """
        try:
            with open(self.led_gpio_path, "r") as f:
                value = f.read().strip()
                state = value == "1"
                self.led_on = state
                return state
        except Exception as e:
            log.error(f"Failed to read LED state: {e}")
            return self.led_on  # Return cached state on error
    
    def read_fan_state(self) -> bool:
        """
        Read current Fan state from GPIO
        Returns True if ON (value="1"), False if OFF (value="0")
        """
        try:
            with open(self.fan_gpio_path, "r") as f:
                value = f.read().strip()
                state = value == "1"
                self.fan_on = state
                return state
        except Exception as e:
            log.error(f"Failed to read Fan state: {e}")
            return self.fan_on  # Return cached state on error
    
    def set_led(self, on: bool):
        """
        Control LED via GPIO sysfs
        ON = write "1", OFF = write "0"
        """
        try:
            value = "1" if on else "0"
            with open(self.led_gpio_path, "w") as f:
                f.write(value)
            self.led_on = on
            log.info(f"[GPIO LED] {'ON' if on else 'OFF'}")
        except Exception as e:
            log.error(f"Failed to set LED: {e}")
    
    def set_fan(self, on: bool):
        """
        Control DC Motor (Fan) via GPIO sysfs
        ON = write "1", OFF = write "0"
        """
        try:
            value = "1" if on else "0"
            with open(self.fan_gpio_path, "w") as f:
                f.write(value)
            self.fan_on = on
            log.info(f"[GPIO FAN] {'ON' if on else 'OFF'}")
        except Exception as e:
            log.error(f"Failed to set Fan: {e}")

# -------- Stream Manager --------
SM_CLIENT = None

def init_stream_manager():
    global SM_CLIENT
    try:
        SM_CLIENT = StreamManagerClient()
        SM_CLIENT.create_message_stream(
            MessageStreamDefinition(
                name=STREAM_NAME,
                max_size=268435456,
                stream_segment_size=16777216,
                time_to_live_millis=300000,
                strategy_on_full=StrategyOnFull.OverwriteOldestData,
            )
        )
        log.info(f"Stream '{STREAM_NAME}' created")
    except Exception as e:
        if "already exists" in str(e).lower():
            log.info(f"Stream '{STREAM_NAME}' already exists")
        else:
            log.error(f"Stream Manager init failed: {e}")
            SM_CLIENT = None

def sm_put_timestream_point(ts_epoch_ms: int, temperature: float, humidity: float):
    """Append telemetry reading to Stream Manager for offline buffering"""
    if SM_CLIENT is None:
        return False
    try:
        payload = json.dumps({
            "ts": ts_epoch_ms,
            "temperature_c": round(temperature, 3),
            "humidity": round(humidity, 3),
            "thing": THING_NAME
        }).encode("utf-8")
        SM_CLIENT.append_message(STREAM_NAME, payload)
        log.info(" appending message to stream manager")
        return True
    except Exception as e:
        log.error(f"Failed to append to Stream Manager: {e}")
        return False

def timestream_worker():
    """Background worker to flush Stream Manager data to Timestream when online"""
    if SM_CLIENT is None:
        log.warning("Stream Manager not available; Timestream worker disabled")
        return

    log.info("Timestream worker started")
    last_read_sequence = 0  
    
    while True:
        try:
            msgs = SM_CLIENT.read_messages(
                STREAM_NAME,
                ReadMessagesOptions(
                    desired_start_sequence_number=last_read_sequence,
                    min_message_count=1, 
                    max_message_count=25, 
                    read_timeout_millis=10000
                )
            )
            
            if not msgs:
                time.sleep(1)
                continue
            
            records = []
            
            for m in msgs:
                try:
                    data = json.loads(m.payload.decode("utf-8"))
                    records.append({
                        "Dimensions": [
                            {"Name": "ThingName", "Value": data.get("thing", THING_NAME)}
                        ],
                        "MeasureName": "environment",
                        "MeasureValueType": "MULTI",
                        "Time": str(data["ts"]),
                        "MeasureValues": [
                            {"Name": "temperature_c", "Value": str(data["temperature_c"]), "Type": "DOUBLE"},
                            {"Name": "humidity", "Value": str(data["humidity"]), "Type": "DOUBLE"},
                        ]
                    })
                    last_read_sequence = m.sequence_number
                except Exception as e:
                    log.warning(f"Bad payload skipped: {e}")

            if records:
                try:
                    timestream.write_records(
                        DatabaseName=TS_DB,
                        TableName=TS_TABLE,
                        Records=records
                    )
                    log.info(f"Wrote {len(records)} records to Timestream (last_seq: {last_read_sequence})")
                    time.sleep(1)  
                        
                except Exception as e:
                    log.error(f"Timestream write failed: {e}")
                    time.sleep(10)
                
        except Exception as e:
            if "ResourceNotFoundException" in str(e) or "no message" in str(e).lower():
                time.sleep(5)
            else:
                log.error(f"Timestream worker error: {e}")
                time.sleep(5)

# -------- Greengrass IPC Shadow Management --------
ipc_client = None
shadow_desired = {"light": False, "fan": False}
shadow_reported = {"light": False, "fan": False}
_apply_shadow_to_gpio = None
_gpio_driver = None

def on_shadow_delta_received(event):
    """Callback for shadow delta messages"""
    try:
        message = str(event.message.payload, "utf-8")
        doc = json.loads(message)
        state = doc.get("state", {})
        log.info(f"DELTA received: {state}")
        _apply_shadow_to_local(state)
    except Exception as e:
        log.error(f"Delta handler error: {e}")

def on_shadow_delta_error(error):
    """Callback for shadow delta subscription errors"""
    log.error(f"Shadow delta stream error: {error}")

def on_shadow_delta_closed():
    """Callback when shadow delta stream closes"""
    log.warning("Shadow delta stream closed")

def init_ipc():
    """Initialize Greengrass IPC client"""
    global ipc_client
    try:
        ipc_client = awsiot.greengrasscoreipc.connect()
        log.info("Greengrass IPC connected")
        return True
    except Exception as e:
        log.error(f"Failed to connect to Greengrass IPC: {e}")
        return False

def subscribe_to_shadow_delta():
    """Subscribe to shadow delta updates via IPC"""
    try:
        request = SubscribeToIoTCoreRequest()
        request.topic_name = f"$aws/things/{THING_NAME}/shadow/update/delta"
        request.qos = QOS.AT_LEAST_ONCE
        
        handler = client.SubscribeToIoTCoreStreamHandler()
        handler.on_stream_event = on_shadow_delta_received
        handler.on_stream_error = on_shadow_delta_error
        handler.on_stream_closed = on_shadow_delta_closed
        
        operation = ipc_client.new_subscribe_to_iot_core(handler)
        future = operation.activate(request)
        future.result(timeout=10)
        
        log.info(f"Subscribed to shadow delta: $aws/things/{THING_NAME}/shadow/update/delta")
        return operation
    except Exception as e:
        log.error(f"Failed to subscribe to shadow delta: {e}")
        return None
    
def get_shadow():
    """Request current shadow state"""
    try:
        request = GetThingShadowRequest()
        request.thing_name = THING_NAME
        
        operation = ipc_client.new_get_thing_shadow()
        operation.activate(request)
        result = operation.get_response().result(timeout=10)
        
        shadow_doc = json.loads(result.payload)
        desired = shadow_doc.get("state", {}).get("desired", {})
        reported = shadow_doc.get("state", {}).get("reported", {})
        
        log.info(f"Shadow retrieved - desired: {desired}, reported: {reported}")
        
        # Apply any differences
        for key in ["light", "fan"]:
            if key in desired and desired[key] != reported.get(key):
                log.info(f"Applying initial delta for {key}: {desired[key]}")
                _apply_shadow_to_local({key: desired[key]})
                
    except Exception as e:
        log.error(f"Failed to get shadow: {e}")

def publish_reported_state(temp_c: float, hum: float, led_on: bool, fan_on: bool):
    """Update shadow reported state via IPC"""
    global shadow_reported
    
    if ipc_client is None:
        log.warning("IPC client not available")
        return
        
    try:
        payload = {
            "state": {
                "reported": {
                    "light": led_on,
                    "fan": fan_on,
                    "temperature_c": round(temp_c, 2),
                    "humidity": round(hum, 2),
                    "ts": int(time.time() * 1000)
                }
            }
        }
        
        request = UpdateThingShadowRequest()
        request.thing_name = THING_NAME
        request.payload = json.dumps(payload).encode()
        
        operation = ipc_client.new_update_thing_shadow()
        operation.activate(request)
        result = operation.get_response().result(timeout=10)
        
        shadow_reported["light"] = led_on
        shadow_reported["fan"] = fan_on
        log.info(f"Reported state updated: light={led_on}, fan={fan_on}")
        
    except Exception as e:
        log.error(f"Failed to publish reported state: {e}")

def update_desired_state(led_on: bool, fan_on: bool):
    """Update shadow desired state when manual changes detected"""
    if ipc_client is None:
        log.warning("IPC client not available")
        return
        
    try:
        payload = {
            "state": {
                "desired": {
                    "light": led_on,
                    "fan": fan_on
                }
            }
        }
        
        request = UpdateThingShadowRequest()
        request.thing_name = THING_NAME
        request.payload = json.dumps(payload).encode()
        
        operation = ipc_client.new_update_thing_shadow()
        operation.activate(request)
        result = operation.get_response().result(timeout=10)
        
        shadow_desired["light"] = led_on
        shadow_desired["fan"] = fan_on
        log.info(f"Desired state updated from manual change: light={led_on}, fan={fan_on}")
        
    except Exception as e:
        log.error(f"Failed to update desired state: {e}")

def _apply_shadow_to_local(state: dict):
    """Apply desired shadow state to local GPIO and update reported state"""
    try:
        log.info(f"Applying shadow state: {state}")
        updated = False
        
        for key in ["light", "fan"]:
            if key in state:
                prev = shadow_desired[key]
                shadow_desired[key] = bool(state[key])
                
                if _apply_shadow_to_gpio:
                    _apply_shadow_to_gpio(key, shadow_desired[key])
                    
                updated = updated or (prev != shadow_desired[key])
        
        if updated:
            sensor = FileSensor(temp_path=TEMP_SENSOR_PATH, hum_path=HUM_SENSOR_PATH)
            temp_c, hum = sensor.read()
            publish_reported_state(temp_c, hum, shadow_desired["light"], shadow_desired["fan"])
            
    except Exception as e:
        log.error(f"Error in _apply_shadow_to_local: {e}")

# -------- Sensor Reader --------
class FileSensor:
    def __init__(self, temp_path: str, hum_path: str = None):
        self.temp_path = temp_path
        self.hum_path = hum_path

    def read(self):
        """Read temperature and humidity from sysfs files"""
        temp_c, hum = None, None

        try:
            if os.path.exists(self.temp_path):
                with open(self.temp_path, "r") as f:
                    raw_temp = int(f.read().strip())
                    temp_c = raw_temp / 1000.0
        except Exception as e:
            log.error(f"Failed to read temperature: {e}")

        try:
            if self.hum_path and os.path.exists(self.hum_path):
                with open(self.hum_path, "r") as f:
                    raw_hum = int(f.read().strip())
                    hum = raw_hum / 1000.0 if raw_hum > 100 else float(raw_hum)
        except Exception as e:
            log.error(f"Failed to read humidity: {e}")

        # Fallback to dummy data if sensor unavailable
        if temp_c is None:
            temp_c = 34.4
        if hum is None:
            hum = 32.7
            
        return temp_c, hum

def main():
    global _apply_shadow_to_gpio, _gpio_driver
    
    log.info("Starting Home Automation Greengrass Component")
    
    # Initialize Stream Manager
    init_stream_manager()
    
    # Start Timestream worker thread
    threading.Thread(target=timestream_worker, daemon=True).start()
    
    # Initialize GPIO
    gpio = GpioDriver()
    _gpio_driver = gpio
    
    # Read initial GPIO state from hardware
    initial_led_state = gpio.read_led_state()
    initial_fan_state = gpio.read_fan_state()
    log.info(f"Initial GPIO state read: LED={initial_led_state}, FAN={initial_fan_state}")
    
    # Initialize shadow_desired with actual hardware state
    shadow_desired["light"] = initial_led_state
    shadow_desired["fan"] = initial_fan_state
    
    def _apply_gpio_state(device: str, on: bool):
        try:
            if device == "light":
                gpio.set_led(on)
            elif device == "fan":
                gpio.set_fan(on)
        except Exception as e:
            log.warning(f"Failed to set {device} from shadow: {e}")

    _apply_shadow_to_gpio = _apply_gpio_state
    
    # Initialize sensor
    sensor = FileSensor(temp_path=TEMP_SENSOR_PATH, hum_path=HUM_SENSOR_PATH)
    
    # Initialize Greengrass IPC for shadow management
    ipc_ok = init_ipc()
    if not ipc_ok:
        log.warning("IPC not initialized; shadow control disabled")
    else:
        # Subscribe to shadow deltas
        subscribe_to_shadow_delta()
        
        # Report initial state to shadow (both reported and desired)
        temp_c, hum = sensor.read()
        
        # Update both desired and reported with initial hardware state
        try:
            payload = {
                "state": {
                    "desired": {
                        "light": initial_led_state,
                        "fan": initial_fan_state
                    },
                    "reported": {
                        "light": initial_led_state,
                        "fan": initial_fan_state,
                        "temperature_c": round(temp_c, 2),
                        "humidity": round(hum, 2),
                        "ts": int(time.time() * 1000)
                    }
                }
            }
            
            request = UpdateThingShadowRequest()
            request.thing_name = THING_NAME
            request.payload = json.dumps(payload).encode()
            
            operation = ipc_client.new_update_thing_shadow()
            operation.activate(request)
            result = operation.get_response().result(timeout=10)
            
            log.info(f"Initial shadow state published: light={initial_led_state}, fan={initial_fan_state}")
        except Exception as e:
            log.error(f"Failed to publish initial shadow state: {e}")
        
        # Get cloud shadow state after a short delay
        time.sleep(2)
        get_shadow()
    
    last_led = shadow_desired.get("light", False)
    last_fan = shadow_desired.get("fan", False)
    
    log.info("Entering main control loop")
    
    # Main telemetry and control loop
    while True:
        start = time.time()
        
        # Read sensor data
        temp_c, hum = sensor.read()
        log.info(f"Sensor read: temp={temp_c}°C, humidity={hum}%")
        
        # Buffer telemetry to Stream Manager (works offline)
        now_ms = int(time.time() * 1000)
        sm_put_timestream_point(now_ms, temp_c, hum)
        
        # Check for manual GPIO state changes
        current_led_state = gpio.read_led_state()
        current_fan_state = gpio.read_fan_state()
        
        manual_change_detected = False
        
        # Detect if hardware state differs from shadow desired state
        if current_led_state != shadow_desired.get("light", False):
            log.warning(f"Manual LED change detected: {current_led_state} (was {shadow_desired.get('light')})")
            shadow_desired["light"] = current_led_state
            manual_change_detected = True
            
        if current_fan_state != shadow_desired.get("fan", False):
            log.warning(f"Manual FAN change detected: {current_fan_state} (was {shadow_desired.get('fan')})")
            shadow_desired["fan"] = current_fan_state
            manual_change_detected = True
        
        # If manual change detected, update shadow desired state
        if manual_change_detected and ipc_ok:
            update_desired_state(current_led_state, current_fan_state)
            publish_reported_state(temp_c, hum, current_led_state, current_fan_state)
            last_led = current_led_state
            last_fan = current_fan_state
        else:
            # Normal periodic shadow update
            if ipc_ok:
                try:
                    publish_reported_state(temp_c, hum, shadow_desired["light"], shadow_desired["fan"])
                except Exception as e:
                    log.warning(f"publish shadow report failed in main loop: {e}")
        
            # Check if shadow state changed (from cloud)
            led_on = bool(shadow_desired.get("light", False))
            fan_on = bool(shadow_desired.get("fan", False))
            
            state_changed = False
            
            if led_on != last_led:
                gpio.set_led(led_on)
                last_led = led_on
                state_changed = True
                
            if fan_on != last_fan:
                gpio.set_fan(fan_on)
                last_fan = fan_on
                state_changed = True
            
            # Update reported state if GPIO changed
            if state_changed and ipc_ok:
                publish_reported_state(temp_c, hum, led_on, fan_on)
        
        # Loop pacing
        elapsed = time.time() - start
        sleep_time = max(0, LOOP_SEC - elapsed)
        time.sleep(sleep_time)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("Exiting...")
    except Exception as e:
        log.error(f"Fatal error: {e}", exc_info=True)