"""**********************************************************************************************************************
* DISCLAIMER
* This software is supplied by Renesas Electronics Corporation and is only intended for use with Renesas products. No
* other uses are authorized. This software is owned by Renesas Electronics Corporation and is protected under all
* applicable laws, including copyright laws.
* THIS SOFTWARE IS PROVIDED "AS IS" AND RENESAS MAKES NO WARRANTIES REGARDING
* THIS SOFTWARE, WHETHER EXPRESS, IMPLIED OR STATUTORY, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. ALL SUCH WARRANTIES ARE EXPRESSLY DISCLAIMED. TO THE MAXIMUM
* EXTENT PERMITTED NOT PROHIBITED BY LAW, NEITHER RENESAS ELECTRONICS CORPORATION NOR ANY OF ITS AFFILIATED COMPANIES
* SHALL BE LIABLE FOR ANY DIRECT, INDIRECT, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES FOR ANY REASON RELATED TO THIS
* SOFTWARE, EVEN IF RENESAS OR ITS AFFILIATES HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
* Renesas reserves the right, without notice, to make changes to this software and to discontinue the availability of
* this software. By using this software, you agree to the additional terms and conditions found by accessing the
* following link:
* http://www.renesas.com/disclaimer
*
* Copyright (C) 2025 Renesas Electronics Corporation. All rights reserved.
***********************************************************************************************************************"""
import json
import time
import logging
import traceback
import smbus2
from awsiot.greengrasscoreipc import connect
from awsiot.greengrasscoreipc.model import PublishToIoTCoreRequest, QOS

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MQTT Topic and QoS
TOPIC_NAME = "hs3001/data"
TIMEOUT = 10  # Timeout in seconds
MAX_RETRIES = 3  # Retry attempts for sensor reading

# Initialize Greengrass IPC
try:
    ipc_client = connect()
    logger.info("Greengrass IPC client connected successfully.")
except Exception as e:
    logger.error(f"Failed to connect to Greengrass IPC: {str(e)}")
    ipc_client = None

# I2C sensor settings
I2C_BUS = 0 # Change if needed (use `ls /dev/i2c-*` to confirm)
HS3001_ADDRESS = 0x44


def read_sensor_data():
    """ Reads data from the HS3001 sensor via I2C with retries. """
    logger.info("DEBUG: Entering read_sensor_data function.")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            bus = smbus2.SMBus(I2C_BUS)

            # Wake up sensor by writing a dummy command
            bus.write_byte(HS3001_ADDRESS, 0x00)
            time.sleep(0.05)  # Allow time for measurement

            # Read 4 bytes of data from the sensor
            data = bus.read_i2c_block_data(HS3001_ADDRESS, 0, 4)
            bus.close()

            if len(data) < 4:
                raise ValueError("Incomplete data received from HS3001 sensor.")

            # Convert raw data into meaningful values
            raw_humidity = (data[0] << 8) | data[1]
            raw_temperature = (data[2] << 8) | data[3]

            # Extract relevant bits (based on datasheet)
            raw_humidity &= 0x3FFF  # 14-bit humidity
            raw_temperature = (raw_temperature >> 2) & 0x3FFF  # 14-bit temperature

            humidity = (raw_humidity / 16383.0) * 100.0
            temperature = ((raw_temperature / 16383.0) * 165.0) - 40.0

            sensor_data = {
                "humidity": round(humidity, 2),
                "temperature": round(temperature, 2),
                "timestamp": time.time()
            }
            logger.info(f"Sensor Data Read (Attempt {attempt}): {sensor_data}")
            return sensor_data

        except Exception as e:
            logger.error(f"Error reading sensor data (Attempt {attempt}): {str(e)}")
            logger.error(traceback.format_exc())

        time.sleep(1)  # Small delay before retrying

    logger.error("Failed to read sensor data after multiple attempts.")
    return None


def publish_to_mqtt(sensor_data):
    """ Publishes sensor data to AWS IoT Core via Greengrass IPC. """
    logger.info("DEBUG: Entering publish_to_mqtt function.")
    if ipc_client is None:
        logger.error("Cannot publish - IPC client not initialized.")
        return False

    try:
        payload = json.dumps(sensor_data)
        request = PublishToIoTCoreRequest(
            topic_name=TOPIC_NAME,
            qos=QOS.AT_LEAST_ONCE,
            payload=payload.encode("utf-8")
        )
        operation = ipc_client.new_publish_to_iot_core()
        future = operation.activate(request)
        future.result(TIMEOUT)  # Blocking call with timeout

        logger.info(f"Successfully Published to {TOPIC_NAME}: {payload}")
        return True
    except Exception as e:
        logger.error(f"Failed to publish data: {str(e)}")
        logger.error(traceback.format_exc())
        return False


if __name__ == "__main__":
    """ Runs continuously, reading and publishing sensor data. """
    logger.info("Starting HS3001 Sensor Publisher")
    while True:
        try:
            sensor_data = read_sensor_data()
            if sensor_data:
                publish_to_mqtt(sensor_data)
            time.sleep(10)  # Wait before next read
        except KeyboardInterrupt:
            logger.info("Stopping HS3001 Sensor Publisher")
            break
