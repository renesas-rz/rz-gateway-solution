import asyncio
import logging
import os
import time
from datetime import datetime, timezone
import sys
from ocpp.v201 import ChargePoint as cp
from ocpp.v201 import call, call_result
from ocpp.v201.enums import Action, BootReasonType, MeasurandType, GetChargingProfileStatusType
from ocpp.routing import on

try:
    import websockets
    from websockets.exceptions import ConnectionClosedError
except ModuleNotFoundError:
    print("Please install websockets: pip install websockets")
    exit(1)

logger = logging.getLogger()
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# # Setup logging
# logging.basicConfig(level=logging.INFO,
#                     format='%(asctime)s - %(levelname)s - %(message)s',
#                     handlers=[logging.StreamHandler(sys.stdout)])
# logger = logging.getLogger(__name__)


class ChargePoint(cp):
    def __init__(self, id, connection):
        super().__init__(id, connection)
        self.meter_task = None
        self.energy_counter = 1000

    async def send_heartbeat(self, interval: int):
        request = call.HeartbeatPayload()
        while True:
            await self.call(request)
            await asyncio.sleep(interval)

    async def send_boot_notification(self):
        request = call.BootNotificationPayload(
            charging_station={"model": "RZG2L", "vendor_name": "Renesas Electronics"},
            reason=BootReasonType.power_up,
        )
        response = await self.call(request)
        if response.status == "Accepted":
            logger.info("BootNotification accepted.")
            await self.send_heartbeat(response.interval)
        else:
            logger.warning(f"BootNotification rejected with status: {response.status}")

    async def send_meter_values(self):
        """Periodically send meter values during active transaction."""
        while True:
            self.energy_counter += 100
            request = call.MeterValuesPayload(
                evse_id=1,
                meter_value=[{
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "sampled_value": [{
                        "value": self.energy_counter,
                        "measurand": MeasurandType.energy_active_import_register.value,
                        "unit_of_measure": {
                            "unit": "Wh",
                            "multiplier": 0
                        }
                    }]
                }]
            )
            logger.info(f"Sending MeterValues: Energy={self.energy_counter}Wh")
            try:
                await self.call(request)
            except Exception as e:
                logger.error(f"Failed to send meter values: {e}")
            await asyncio.sleep(5)

    @on(Action.RequestStartTransaction)
    async def on_remote_start_transaction(self, id_token, evse_id, **kwargs):
        logger.info(f"RemoteStartTransaction received: id_token={id_token}, EVSE={evse_id}")
        if not self.meter_task or self.meter_task.done():
            self.meter_task = asyncio.create_task(self.send_meter_values())
        return call_result.RequestStartTransactionPayload(status="Accepted")

    @on(Action.RequestStopTransaction)
    async def on_remote_stop_transaction(self, transaction_id, **kwargs):
        logger.info(f"RemoteStopTransaction received: transaction_id={transaction_id}")
        if self.meter_task:
            self.meter_task.cancel()
            try:
                await self.meter_task
            except asyncio.CancelledError:
                logger.info("Meter task cancelled cleanly.")
        return call_result.RequestStopTransactionPayload(status="Accepted")
    
    @on("ChangeAvailability")
    def on_change_availability(self, operational_status, evse):
        print(f"Received ChangeAvailability:{operational_status} for EVSE:{evse}")
        return call_result.ChangeAvailabilityPayload(status="Accepted")
    
    @on("SetChargingProfile")
    async def on_set_charging_profile(self, evse_id, charging_profile):
        return call_result.SetChargingProfilePayload(status=GetChargingProfileStatusType.accepted)


async def start_ocpp_client(server_url: str, charge_point_id: str = "CP_1"):
    """Connects to OCPP Central System via WebSocket."""
    logger.info(f" Connecting to OCPP server: {server_url}")
    async with websockets.connect(server_url, subprotocols=["ocpp2.0.1"]) as ws:
        cp = ChargePoint(charge_point_id, ws)
        await asyncio.gather(cp.start(), cp.send_boot_notification())




def greengrass_handler():
    server_url =os.getenv("OCPP_SERVER_URL")
    charge_point_id = os.getenv("CHARGE_POINT_ID", "CP_1")
    if not server_url:
        raise ValueError("Missing OCPP server URL")

    ws_uri = f"ws://{server_url}:9000/{charge_point_id}"

    # **Main loop**: never returns, so Greengrass keeps the Lambda container alive
    while True:
        try:
            logger.info(f" Connecting to OCPP server at {ws_uri} …")
            # This will run until the socket closes or an exception occurs
            asyncio.run(start_ocpp_client(ws_uri, charge_point_id))

            # If we get here, the connection closed cleanly (no exception)
            logger.warning(" WebSocket closed cleanly; reconnecting in 5s…")

        except ConnectionClosedError as e:
            logger.warning(f" ConnectionClosedError: {e}; reconnecting in 5s…")

        except Exception as e:
            logger.error(f" Unexpected error in OCPP client: {e}", exc_info=True)
            logger.info("Reconnecting in 5s…")

        # back‑off before retrying
        time.sleep(5)

if __name__ == "__main__":
    greengrass_handler()