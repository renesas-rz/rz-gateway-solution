import React, { useEffect, useState, useRef } from "react";
import {
        Box,
        Typography,
        Grid,
        Card,
        Switch,
        Dialog,
        DialogTitle,
        DialogContent,
        IconButton
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { useBaseURL } from "../../BaseURLContext";
import { FanIcon, TemperatureIcon, HumidityIcon } from "../../icon";
import { ChartIcon } from "../../icon";
import * as api from "../../api";
import HumidityChart from "./humidityData";
import ChartPage from "./ChartData";


function DeviceStatus(){
   
return(
   <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          height: "80vh",
          bgcolor: "#f9f9f9",
          borderRadius: 3,
        }}
      >
        <Typography variant="h2" color="text.secondary" gutterBottom>
          ⚠️ Smart Home Device is Inactive
        </Typography>
      </Box>
)
}

// Single Device Row
function DeviceRow({ name, icon, checked, setChecked, label, isPending }) {
        return (
                <Card sx={{ p: 2, mb: 2 }}>
                        <Grid container alignItems="center" spacing={2}>
                                {/* Label */}
                                <Grid item xs={2}>
                                        <Typography variant="h6" fontWeight="bold">
                                                {name}
                                        </Typography>
                                </Grid>
                                {/* Icon */}
                                <Grid item xs={2}>
                                        {icon}
                                </Grid>

                                {/* Status */}
                                <Grid item xs={2}>
                                        {/* <Typography variant="body1" fontWeight="600"> */}
                                        {/* {checked ? "ON" : "OFF"}
                                                {label} */}
                                        <Typography
                                                variant="body1"
                                                fontWeight="600"
                                                sx={{
                                                        transition: "color 0.3s ease",
                                                        position: "relative",
                                                        overflow: "hidden",
                                                        ...(isPending
                                                                ? {
                                                                        color: "transparent",
                                                                        background: "linear-gradient(90deg, rgba(0,150,255,0.2) 0%, rgba(0,150,255,0.4) 50%, rgba(0,150,255,0.2) 100%)",
                                                                        backgroundSize: "200% 100%",
                                                                        animation: "labelPulse 1.5s infinite linear",
                                                                        WebkitBackgroundClip: "text",
                                                                        WebkitTextFillColor: "transparent",
                                                                }
                                                                : {
                                                                        color:"black",
                                                                }),
                                                        "@keyframes labelPulse": {
                                                                "0%": { backgroundPosition: "200% 0" },
                                                                "100%": { backgroundPosition: "-200% 0" },
                                                        },
                                                }}
                                        >
                                                {label}
                                        </Typography>
                                        {/* </Typography> */}
                                </Grid>

                                {/* Toggle */}
                                <Grid item xs={3}>
                                        <Switch
                                                data-testid={name}
                                                checked={checked}
                                                onChange={(e) => setChecked(e.target.checked)}
                                                inputProps={{ "aria-label": name, "data-testid": `${name}-switch` }}
                                                sx={{
                                                        "& .MuiSwitch-switchBase.Mui-checked": { color: "green" },
                                                        "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                                                                backgroundColor: "green",
                                                        },
                                                }}
                                        />
                                </Grid>
                        </Grid>
                </Card>
        );
}


// Sensor Row
function SensorRow({ name, icon, value, units, chartID, uniqueID, onChartClick }) {
        const testId = uniqueID ? `${chartID}-${uniqueID}` : chartID
        return (
                <Card sx={{ p: 2, mb: 2 }}>
                        <Grid container alignItems="center" spacing={2}>
                                {/* Label */}
                                <Grid item xs={2}>
                                        <Typography variant="h6" fontWeight="bold" >
                                                {name}
                                        </Typography>
                                </Grid>

                                {/* Icon */}
                                <Grid item xs={2}>
                                        {icon}
                                </Grid>

                                {/* Value (instead of status) */}
                                <Grid item xs={2}>
                                        <Typography data-testid={`${testId}-value`} variant="body1" fontWeight="600">
                                                {value} {units}
                                        </Typography>
                                </Grid>

                                {/* Chart Icon  */}
                                <Grid item xs={3} sx={{ ml: 2 }}>
                                        <button data-testid={testId} onClick={onChartClick} style={{ all: 'unset', display: "inline-flex", cursor: "pointer", lineHeight: "0" }}>
                                                <ChartIcon />
                                        </button>
                                </Grid>
                        </Grid>
                </Card>
        );
}


export default function DevicesPage() {
        const [fanOn, setFanOn] = useState(false);
        const [lightOn, setLightOn] = useState(false);
        const [tempertureValue, setTemperatureValue] = useState(0)
        const [humidityValue, setHumidityValue] = useState(0)
        const [shadowFanOn, setShadowFanOn] = useState(false);   // backend value (from shadow)
        const [shadowLightOn, setShadowLightOn] = useState(false); // backend value (from shadow)
        const [fanPending, setFanPending] = useState(false)
        const [lightPending, setlightPending] = useState(false);
        const [healthOk, setHealthOk] = useState(true)

        const [openChart, setOpenChart] = useState(null)
        const { baseURL } = useBaseURL();
        const fanCooldown = useRef(false);
        const lightCooldown = useRef(false);
        // ---------- Fetch Shadow ----------
        const fetchStatus = async () => {
                try {
                        if (!baseURL) return;

                        const [shadowRes, statusRes] = await Promise.all([
                                api.shadow(baseURL),
                                api.getStatus(baseURL)
                        ])
                        const reported = shadowRes.data?.state?.reported;
                        const healthStatus = statusRes.data.status === 'online'? true : false
                        setHealthOk(healthStatus)
                        if (!healthStatus) {
                                return;
                        }

                        if (reported) {
                                //only update from shadow if not pending
                                if (!fanPending) setShadowFanOn(reported.fan || false);
                                if (!lightPending) setShadowLightOn(reported.light || false);

                                setTemperatureValue(reported.temperature_c || 0);
                                setHumidityValue(reported.humidity || 0);

                                // Once backend confirms same value, clear pending
                                if (fanPending && reported.fan === fanOn) setFanPending(false);
                                if (lightPending && reported.light === lightOn) setlightPending(false);
                        }
                } catch (error) {
                        console.log("Error fetching shadow:", error);
                        alert(error)
                }
        };

        useEffect(() => {
                fetchStatus();
                const intervalId = setInterval(fetchStatus, 5000);
                return () => clearInterval(intervalId);
        }, [baseURL, fanPending, lightPending]);

        // Sync toggles when backend value changes (only if not pending)
        useEffect(() => {
                if (!fanPending) setFanOn(shadowFanOn);
        }, [shadowFanOn]);

        useEffect(() => {
                if (!lightPending) setLightOn(shadowLightOn);
        }, [shadowLightOn]);

        // user-driven toggle (does not depend on shadow)
        const handleFanStatus = async (status) => {
                if (fanCooldown.current) return; // prevent  toggles
                fanCooldown.current = true;
                setTimeout(() => (fanCooldown.current = false), 5000);
                setFanOn(status); // toggle 
                setFanPending(true)
                try {
                        await api.fanToggle(baseURL, status);
                } catch (error) {
                        console.log("Error updating fan:", error);
                        setFanOn((prev) => !prev); // revert if failed
                        setFanPending(false);
                        alert(error)
                }
        };

        const handleBulbStatus = async (baseURL, status) => {
                if (lightCooldown.current) return;
                lightCooldown.current = true;
                setTimeout(() => (lightCooldown.current = false), 5000);
                setLightOn(status); // toggle 
                setlightPending(true)
                try {
                        await api.lightToggle(baseURL, status);
                } catch (error) {
                        console.log("Error updating light:", error);
                        setLightOn((prev) => !prev)
                        alert(error)
                }
        };

        if (!healthOk) {
                return <DeviceStatus />
        }

        return (
                <Box sx={{ p: 2 }}>
                        {/* Fan Row */}

                        <DeviceRow
                                name="Fan"
                                icon={<FanIcon data-testid="fan-icon" sx={{ fontSize: 50 }} />}
                                checked={fanOn}
                                setChecked={handleFanStatus}
                                label={shadowFanOn ? "ON" : "OFF"}
                                isPending={fanPending}
                        />

                        {/* Light Row */}
                        <DeviceRow
                                name="Light"
                                icon={<LightbulbOutlinedIcon data-testid="light-icon" sx={{ fontSize: 50 }} />}
                                checked={lightOn}
                                setChecked={(checked) => handleBulbStatus(baseURL, checked)}
                                label={shadowLightOn ? "ON" : "OFF"}
                                isPending={lightPending}
                        />
                        <SensorRow
                                name="Temperature"
                                icon={<TemperatureIcon data-testid="temp-icon" sx={{ fontSize: 50 }} />}
                                value={tempertureValue}
                                units="°C"
                                chartID="temperatureChart"
                                uniqueID="main"
                                onChartClick={() => setOpenChart("Temperature")}
                        />
                        <SensorRow
                                name="Relative Humidity"
                                icon={<HumidityIcon sx={{ fontSize: 50 }} />}
                                value={humidityValue}
                                units="%"
                                chartID="humidityChart"
                                uniqueID="main"
                                onChartClick={() => setOpenChart("Humidity")}
                        />

                        {/*Dialog Row*/}
                        <Dialog
                                open={!!openChart}
                                onClose={() => setOpenChart(null)}
                                maxWidth="md"
                                fullWidth
                        >
                                <DialogTitle  sx={{ p: 2 }}>
                                        <Box
                                                sx={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        width: "100%",
                                                }}
                                        >
                                                <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>
                                                        {openChart === "Temperature" ? "Temperature Chart" : "Humidity Chart"}
                                                </span>
                                                <IconButton
                                                        edge="end"
                                                        color="inherit"
                                                        onClick={() => setOpenChart(null)}
                                                        aria-label="close"
                                                        sx={{ m1: 2 }}
                                                >
                                                        <CloseIcon />
                                                </IconButton>
                                        </Box>
                                </DialogTitle>
                                <DialogContent>
                                        {openChart === "Temperature" && (
                                                <ChartPage />
                                        )}
                                        {openChart === "Humidity" && (
                                                <HumidityChart />
                                        )}
                                </DialogContent>
                        </Dialog>
                </Box>
        );
}