import json
import boto3
import logging
import os

# Configure logging for Greengrass
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize IoT client - Greengrass will provide credentials
iot_client = boto3.client("iot-data", region_name= "us-east-1")

def lambda_handler(event, context):
    """
    Lambda handler for Greengrass Lambda component
    """
    try:
        logger.info(f"Received event: {json.dumps(event)}")
        
        # Validate event structure
        if not isinstance(event, dict):
            logger.error("Event must be a dictionary")
            return {
                "statusCode": 400,
                "body": json.dumps({"message": "Invalid event format"})
            }
        
        action = event.get("action")
        if action == "download_bundle":
            bundle_key = event.get("bundle_key")
            
            if not bundle_key:
                logger.error("bundle_key is required for download_bundle action")
                return {
                    "statusCode": 400,
                    "body": json.dumps({"message": "bundle_key is required"})
                }
            
            # Prepare message for download worker
            message = {
                "action": "download",
                "bundle_key": bundle_key,
                "timestamp": context.aws_request_id if context else None
            }
            
            try:
                # Publish to IoT topic
                response = iot_client.publish(
                    topic="download/task",
                    qos=1,
                    payload=json.dumps(message)
                )
                
                logger.info(f"Successfully published download task for {bundle_key}")
                
                return {
                    "statusCode": 200,
                    "body": json.dumps({
                        "message": f"Download task for {bundle_key} sent successfully",
                        "messageId": response.get("MessageId")
                    })
                }
                
            except Exception as e:
                logger.error(f"Failed to publish IoT message: {str(e)}")
                return {
                    "statusCode": 500,
                    "body": json.dumps({
                        "message": "Failed to send download task",
                        "error": str(e)
                    })
                }
        
        else:
            logger.warning(f"Unknown action: {action}")
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": f"Unknown action: {action}",
                    "supported_actions": ["download_bundle"]
                })
            }
            
    except Exception as e:
        logger.error(f"Unexpected error in lambda_handler: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "message": "Internal server error",
                "error": str(e)
            })
        }

