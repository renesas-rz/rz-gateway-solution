import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict
from websockets.server import serve
from ocpp.routing import on
from ocpp.v201 import ChargePoint as cp
from ocpp.v201 import call_result, call
from ocpp.v201.enums import Action, ChargingProfileKindType, ChargingProfilePurposeType, ChargingRateUnitType
from fastapi import FastAPI, Query
import uvicorn
import os
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class AvailabilityRequest(BaseModel):
    status: str
    evse_id: int
    connector_id: int

class ChargingProfileRequest(BaseModel):
    evse_id: int
    meter_rate_kw: float

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
connected_stations: Dict[str, "ChargePoint"] = {}
registered_stations: Dict[str, "ChargePoint"] = {}

meter_readings: Dict[str, list] = {}
latest_charging_rates = 50


class ChargePoint(cp):
    @on(Action.BootNotification)
    def on_boot_notification(self, charging_station, reason, **kwargs):
        logger.info(f"BootNotification received from {self.id}")
        logger.info(f"Charging Station: {charging_station}")
        logger.info(f"Reason: {reason}")
        print("Currretn registered state", registered_stations)
        connected_stations[self.id] = self
        # if current_status == "Inoperative":
        #     logger.warning(f"Charger {self.id} rejected due to non-operative state")
        #     return call_result.BootNotificationPayload(
        #         current_time=datetime.now(timezone.utc).isoformat(),
        #         interval=10,
        #         status="Rejected")
        registered_stations[self.id] = {
            "id": self.id,
            "charging_station": charging_station,
            "reason": reason,
            "status": "Operative"
            }
        return call_result.BootNotificationPayload(
            current_time=datetime.now(timezone.utc).isoformat(),
            interval=10,
            status="Accepted"
        )

    @on(Action.Heartbeat)
    def on_heartbeat(self, **kwargs):
        logger.info(f"Heartbeat received from {self.id}")
        return call_result.HeartbeatPayload(
            current_time=datetime.now(timezone.utc).isoformat()
        )

    @on(Action.MeterValues)
    async def on_meter_values(self, evse_id, meter_value, **kwargs):
        logger.info(f" Meter Values received from {self.id}")
        logger.info(f"EVSE ID: {evse_id}")
        logger.info(f"Raw meter_value: {meter_value}")
        
        try:
            # Initialize meter readings for this charge point if not exists
            if self.id not in meter_readings:
                meter_readings[self.id] = []
            
            # Process each meter value in the array
            for mv in meter_value:
                logger.info(f"Processing meter value: {mv}")
                
                meter_reading = {
                    "evse_id": evse_id,
                    "timestamp": mv.get('timestamp', datetime.now(timezone.utc).isoformat()),
                    "sampled_values": []
                }
                
                sampled_values = mv.get('sampled_value', [])
                for sv in sampled_values:
                    sampled_value_data = {
                        "value": sv.get('value', 'N/A'),
                        "measurand": sv.get('measurand', 'Unknown'),
                        "unit": sv.get('unit_of_measure', {}).get('unit', 'Unknown') if sv.get('unit_of_measure') else 'Unknown',
                        "multiplier": sv.get('unit_of_measure', {}).get('multiplier', 0) if sv.get('unit_of_measure') else 0
                    }
                    meter_reading["sampled_values"].append(sampled_value_data)
                    logger.info(f" Sampled Value: {sampled_value_data}")
                
                meter_readings[self.id].append(meter_reading)
            
            logger.info(f"Successfully stored {len(meter_value)} meter values for {self.id}")
            
        except Exception as e:
            logger.error(f" Error processing meter values from {self.id}: {e}")
            logger.error(f" Raw data: evse_id={evse_id}, meter_value={meter_value}")
        
        return call_result.MeterValuesPayload()


# WebSocket handler for OCPP
async def on_connect(websocket, path):
    cp_id = path.strip("/")
    logger.info(f"New charge point connecting: {cp_id}")

    charge_point = ChargePoint(cp_id, websocket)
    connected_stations[cp_id] = charge_point

    try:
        await charge_point.start()
    except Exception as e:
        logger.error(f"Error handling charge point {cp_id}: {e}")
    finally:
        connected_stations.pop(cp_id, None)
        registered_stations[cp_id]["status"] = "Inoperative"
        logger.info(f"Charge point {cp_id} disconnected")


async def start_websocket_server():
    logger.info("Starting OCPP WebSocket server on ws://0.0.0.0:9000")
    async with serve(on_connect, "0.0.0.0", 9000, subprotocols=["ocpp2.0.1"]):
        await asyncio.Future()


@app.get("/stations")
async def list_stations():
    return {"stations": list(connected_stations.keys())}


@app.post("/stations/{cp_id}/start")
async def start_charging(cp_id: str):
    if cp_id in connected_stations:
        cp = connected_stations[cp_id]
        try:
            request = call.RequestStartTransactionPayload(
                id_token={"id_token": "TEST1234", "type": "ISO14443"},
                remote_start_id=1,
                evse_id=1
            )
            response = await cp.call(request)
            return {"status": response.status}
        except Exception as e:
            logger.error(f"Error starting charging for {cp_id}: {e}")
            return {"status": "error", "message": str(e)}
    return {"status": "station not connected"}


@app.post("/stations/{cp_id}/stop")
async def stop_charging(cp_id: str):
    if cp_id in connected_stations:
        cp = connected_stations[cp_id]
        try:
            request = call.RequestStopTransactionPayload(
                transaction_id="1"
            )
            response = await cp.call(request)
            return {"status": response.status}
        except Exception as e:
            logger.error(f"Error stopping charging for {cp_id}: {e}")
            return {"status": "error", "message": str(e)}
    return {"status": "station not connected"}


@app.get("/stations/{cp_id}/meter-history")
async def get_meter_history(cp_id: str):
    logger.info(f"Requesting meter history for {cp_id}")
    logger.info(f"Available stations with meter data: {list(meter_readings.keys())}")
    
    if cp_id in meter_readings:
        return {
            "station": cp_id, 
            "readings": meter_readings[cp_id],
            "total_readings": len(meter_readings[cp_id])
        }
    else:
        return {
            "status": "no meter readings found", 
            "station": cp_id,
            "connected": cp_id in connected_stations,
            "available_stations": list(meter_readings.keys())
        }

@app.post("/stations/{cp_id}/availability")
async def change_availability(cp_id: str, payload: AvailabilityRequest):
    # print("SSSSSSS----",connected_stations)
    global connected_stations, registered_stations
    try:
        cp = connected_stations[cp_id]
        request = call.ChangeAvailabilityPayload(
                operational_status=payload.status, # "Operative" or "Inoperative
                evse = {"id": payload.evse_id,
                    "connectorId": payload.connector_id
                    })
        response = await cp.call(request)
        if response is None:
                return {"status": "no response from charge point"}
        if payload.status == "Inoperative" and response.status == "Accepted": 
                #connected_stations.pop(cp_id, None)
                registered_stations[cp_id]["status"] = "Inoperative"
                return {"status": response.status}
        elif payload.status == "Operative" and response.status == "Accepted":
            registered_stations[cp_id]["status"] = "Operative"
            return {"status": response.status}
    
    except Exception as e:
        return {"status": "error", "message": str(e)}
    
@app.get("/stations/get_meter_rate")
async def get_charge_rate():
    if latest_charging_rates is None:
        return {"status": "sucsess", "message": "no charge set"}
    return {"status": "success", "charge_rate": latest_charging_rates}
    
@app.post("/stations/{cp_id}/change_profile")
async def set_charging_profile(cp_id: str, req: ChargingProfileRequest):
    global latest_charging_rates
    # if cp_id not in connected_stations:
    #     return {"status": "station not connected"}
    cp = connected_stations[cp_id]
    try:
        latest_charging_rates = req.meter_rate_kw
        charging_profile = {"id": 1, 
                            "stackLevel": 0,
                            "chargingProfilePurpose": ChargingProfilePurposeType.tx_profile,
                            "chargingProfileKind": ChargingProfileKindType.absolute,
                            "chargingSchedule": [{
                                "id": 1, # schedule ID
                                "duration": 3600, # seconds
                "chargingRateUnit": ChargingRateUnitType.watts, 
                "chargingSchedulePeriod": [{
                     "startPeriod": 0, # start immediately
                     "limit": req.meter_rate_kw * 1000, # kW → W
                     "numberPhases": 3
                     }]}]}
        # Request payload
        request = call.SetChargingProfilePayload(
            evse_id=req.evse_id,
            charging_profile=charging_profile)
        response = await cp.call(request)
        return {"status": response.status}
    except Exception as e:
        logger.error(f"Error starting transaction with profile for {cp_id}: {e}")
        return {"status": "error", "message": str(e)}
    
@app.get("/stations/admin")
def get_admin_stations():
    print("Connected statios", connected_stations)
    return[{"id": cp_id, **info}
        for cp_id, info in registered_stations.items()]

@app.get("/meter-readings/all")
async def get_all_meter_readings():
    """Get all meter readings from all stations"""
    return {"all_readings": meter_readings}


@app.get("/")
async def root():
    return {
        "message": "OCPP Central Server", 
        "connected_stations": len(connected_stations),
        "stations_with_meter_data": len(meter_readings)
    }

@app.get("/status/{cp_id}")
async def get_status(cp_id: str):
    status = registered_stations.get(cp_id, {}).get("status", "Operative")
    return {"cp_id": cp_id, "status": status}

@app.get("/health")
async def health():
    return {"status":"OK"}
    


async def main():
    config = uvicorn.Config(app, host="0.0.0.0", port=8001, log_level="info")
    server = uvicorn.Server(config)

    await asyncio.gather(
        server.serve(),
        start_websocket_server()
    )

if __name__ == "__main__":
    asyncio.run(main())

