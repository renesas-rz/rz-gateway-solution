#!/usr/bin/env python3
import os
import boto3
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import time
from datetime import datetime
import uvicorn
import json
from fastapi.middleware.cors import CORSMiddleware

THING_NAME = os.getenv("THING_NAME", "home_automation_thing")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
TIMESTREAM_DB = os.getenv("TS_DB", "homeautomation_db")
TIMESTREAM_TABLE = os.getenv("TS_TABLE", "humidity_readings")
IOT_ENDPOINT = os.getenv("IOT_ENDPOINT")


iot_data = boto3.client("iot-data",
                         region_name=AWS_REGION,
                         endpoint_url=f"https://{IOT_ENDPOINT}"
                         )
timestream = boto3.client("timestream-query", region_name=AWS_REGION)


app = FastAPI(title="Home Automation API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)   

OFFLINE_THRESHOLD_SECONDS = 120 


class DeviceStatus(BaseModel):
    thingName: str
    status: str  # "online" or "offline"
    lastSeen: int
    lastSeenHuman: str
    secondsSinceLastSeen: int
    offlineThresholdSeconds: int
    state: Dict[str, Any]


class LedRequest(BaseModel):
    state: bool  


class FanRequest(BaseModel):
    state: bool  



class SensorRecord(BaseModel):
    timestamp: str  
    ts: int 
    temperature_c: float
    humidity: float



def update_shadow(desired_state: dict):
    """Update Thing Shadow with desired state"""
    try:
        payload = {
            "state": {
                "desired": desired_state
            }
        }
        resp = iot_data.update_thing_shadow(
            thingName=THING_NAME,
            payload=json.dumps(payload).encode("utf-8")
        )
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Shadow update failed: {e}")


@app.get("/health")
async def health_check():
    return {"status":"OK"}

@app.post("/led")
def set_led(req: LedRequest):
    """Turn LED on/off via Thing Shadow"""
    ok = update_shadow({"light": req.state})
    return {"thing": THING_NAME, "led": req.state, "updated": ok}

@app.post("/fan")
def set_led(req: FanRequest):
    """Turn LED on/off via Thing Shadow"""
    ok = update_shadow({"fan": req.state})
    return {"thing": THING_NAME, "fan": req.state, "updated": ok}



@app.get("/shadow")
def get_shadow():
    """Fetch current device shadow (desired + reported)"""
    try:
        resp = iot_data.get_thing_shadow(thingName=THING_NAME)
        import json

        shadow = json.loads(resp["payload"].read())
        return shadow
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get shadow: {e}")


@app.get("/sensor-data", response_model=List[SensorRecord])
def get_sensor_data(limit: int = 10):
    """
    Query recent sensor data from Timestream.
    Default: last 10 records
    """
    try:
        query = f"""
            SELECT 
                CAST(time AS VARCHAR) as time_iso,
                temperature_c, 
                humidity
            FROM "{TIMESTREAM_DB}"."{TIMESTREAM_TABLE}"
            ORDER BY time DESC
            LIMIT {limit}
        """
        res = timestream.query(QueryString=query)
        records = []
        
        for row in res["Rows"]:
            data = {}
            for col, meta in zip(row["Data"], res["ColumnInfo"]):
                name = meta["Name"]
                if "ScalarValue" in col:
                    val = col["ScalarValue"]
                    if name in ("temperature_c", "humidity"):
                        data[name] = float(val)
                    elif name == "time_iso":

                        if '.' in val:
                            base, fractional = val.rsplit('.', 1)
                            val = f"{base}.{fractional[:6]}"  
                        
                        from datetime import datetime
                        dt = datetime.fromisoformat(val)
                        data["timestamp"] = dt.isoformat()
                        data["ts"] = int(dt.timestamp() * 1000)
            
            if "temperature_c" in data and "humidity" in data and "timestamp" in data:
                records.append(SensorRecord(**data))
        
        return records
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Timestream query failed: {e}")

@app.get("/device-status", response_model=DeviceStatus)
async def get_device_status():
    """
    Get device online/offline status based on shadow last update time
    
    Parameters:
    - thingName: The AWS IoT Thing name (e.g., "home_automation_thing")
    
    Returns:
    - Device status with last seen timestamp and current state
    """
    try:
        # Get the thing shadow
        response = iot_data.get_thing_shadow(thingName=THING_NAME)
        shadow_document = json.loads(response['payload'].read())
        
        # Extract reported state
        reported_state = shadow_document.get('state', {}).get('reported', {})
        metadata = shadow_document.get('metadata', {}).get('reported', {})
        
        # Get the most recent timestamp from METADATA (not root timestamp!)
        last_update_timestamp = 0
        
        # Find the most recent timestamp from metadata fields
        for field, field_metadata in metadata.items():
            if isinstance(field_metadata, dict) and 'timestamp' in field_metadata:
                field_timestamp = field_metadata['timestamp']
                if field_timestamp > last_update_timestamp:
                    last_update_timestamp = field_timestamp
        
        # If no metadata timestamp found, check if device has ever reported
        if last_update_timestamp == 0:
            raise HTTPException(
                status_code=404,
                detail=f"No reported state found for device: {THING_NAME}"
            )
        
        # Calculate time since last update
        current_timestamp = int(time.time())
        seconds_since_last_seen = current_timestamp - last_update_timestamp
        
        # Determine online/offline status
        status = "online" if seconds_since_last_seen < OFFLINE_THRESHOLD_SECONDS else "offline"
        
        # Convert timestamp to human-readable format
        last_seen_human = datetime.fromtimestamp(last_update_timestamp).strftime('%Y-%m-%d %H:%M:%S UTC')
        
        return DeviceStatus(
            thingName=THING_NAME,
            status=status,
            lastSeen=last_update_timestamp,
            lastSeenHuman=last_seen_human,
            secondsSinceLastSeen=seconds_since_last_seen,
            offlineThresholdSeconds=OFFLINE_THRESHOLD_SECONDS,
            state=reported_state
        )
        
    except iot_data.exceptions.ResourceNotFoundException:
        raise HTTPException(
            status_code=404,
            detail=f"Thing shadow not found for: {THING_NAME}"
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error retrieving device status: {str(e)}"
        )

if __name__ == "__main__":
    uvicorn.run("main:app",host="0.0.0.0",port=8000,reload=True)