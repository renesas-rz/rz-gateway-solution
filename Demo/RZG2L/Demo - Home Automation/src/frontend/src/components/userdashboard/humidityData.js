// HumidityChart.js
import React, { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { getReadings } from "../../api";
import { useBaseURL } from "../../BaseURLContext";

import {
    Box,
    Typography,
    CircularProgress
} from "@mui/material";

function HumidityChart() {
    const [data, setData] = useState([]);
    const [loader, setLoader] = useState(false)
    const { baseURL } = useBaseURL();

    useEffect(() => {
        let loaderTimer;
        const fetchTemperatureData = async (baseURL) => {
            try {
                if (!baseURL) return;
                const res = await getReadings(baseURL);
                const jsonData = res.data;
                if (Array.isArray(jsonData) && jsonData.length > 0) {
                    const formattedData = jsonData.map((d) => ({
                        timestamp: new Date(d.timestamp).toLocaleTimeString(),
                        humidity: d.humidity
                    }
                    ))
                    setData(formattedData)
                    setLoader(false);
                }
                else {
                    setData([])
                }
            } catch (error) {
                console.error("Error fetching chart data:", error);
                alert(error)
            }
        };

        fetchTemperatureData(baseURL);

        // start a timer is data not loaded in 2 seconds
        loaderTimer = setTimeout(() => {
            if (data.length === 0) {
                setLoader(true)
            }
        }, 2000)
        const interval = setInterval(() => fetchTemperatureData(baseURL), 5000);

        return () => {
            clearInterval(interval);
            clearTimeout(loaderTimer)
        }
    }, [baseURL]);



    return (
        <div style={{ padding: "20px", width: "100%", height: "600px", position: "relative" }}>


            {data.length > 0 ? (
                <Plot
                    data={[
                        {
                            x: data.map(d => d.timestamp).reverse(),   // timestamps
                            y: data.map(d => d.humidity).reverse(), // values
                            type: "line",
                            mode: "lines+markers",
                            marker: { color: "green" },
                        }
                    ]}
                    layout={{
                        title: "Humidity Data", xaxis: {
                            title: {
                                text: "Time", // X-axis label
                                font: {
                                    size: 14,
                                    color: "#333",
                                },
                            },
                        },
                        yaxis: {
                            title: {
                                text: "Humidity (%)", // Y-axis label
                                font: {
                                    size: 14,
                                    color: "#333",
                                },
                            },
                        },
                        margin: { l: 60, r: 30, t: 60, b: 60 }, // adds spacing for labels
                    }} style={{ width: "100%", height: "100%" }}
                />
            ) : (
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        height: "60vh",
                        flexDirection: "column",
                    }}
                >
                    <CircularProgress />
                    <Typography variant="body1" sx={{ mt: 2 }}>
                        Loading chart data...
                    </Typography>
                </Box>
            )}


        </div>
    );
}

export default HumidityChart;