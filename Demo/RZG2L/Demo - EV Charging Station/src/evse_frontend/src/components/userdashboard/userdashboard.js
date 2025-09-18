import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Chip,
} from "@mui/material";
import Snackbar from '@mui/material/Snackbar';
import MetricPlot from "./metricdataplot";

import { StartCharging, StopCharging, mockStationsData, getStationList, showMeterReading, getStationListforAdmin, getMeterRate } from "../api";
import { useBaseURL } from "../../BaseURLContext";

export default function UserDashboard() {
  const { baseURL, statusData } = useBaseURL();

  const [selectedStationId, setSelectedStationId] = useState("");
  const [selectedConnectorId, setSelectedConnectorId] = useState("");
  const [chargeStatus, setChargeStatus] = useState(false)
  const [snackOpen, setSnackOpen] = useState(false)
  const [timestamps, setTimeStamps] = useState([])
  const [energyKWh, setEnergyKWh] = useState([])
  const [isStopEnabled, setIsStopEnabled] = useState(false)
  const [showPlot, setShowPlot] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingPage, setLoadingPage] = useState(true)
  const [meterRate, setMeterRate] = useState('')


  const [mockStations, setmockStations] = useState(null);


  useEffect(() => {
    const fetchData = async () => {
      if (!baseURL) return;

      //  const response = await getStationList(baseURL);

      const { data: stationData, error: stationError } = await getStationListforAdmin(baseURL);
      if (stationError) {
        // console.error("Failed to fetch station list:", stationError);
        setLoadingPage(false)
        return;
      }
      if (stationData && statusData != "Inoperative") {
        setmockStations(stationData)
        const response = await getMeterRate(baseURL, stationData[0].id)
        setMeterRate(response.charge_rate)

      }
      else {
        setmockStations([])
      }
      setLoadingPage(false)
    }
    fetchData();
  }, [statusData])

  if (loadingPage || statusData === null) {
    return null;
  }



  const handleStart = async () => {
    setChargeStatus(true)
    setSnackOpen(true)
    setIsStopEnabled(false)
    setShowPlot(false)
    setLoading(true)
    setTimeout(() => {
      setIsStopEnabled(true)
    }, 5000)

    const data = await StartCharging(baseURL, selectedStationId);

  };

  const handleStop = async () => {
    setChargeStatus(false)
    setSnackOpen(false)
    setShowPlot(true)
    setLoading(false)
    try {
      const data = await StopCharging(baseURL, selectedStationId)
      const meterReading = await showMeterReading(baseURL, selectedStationId)
      const sortedReadings = [...meterReading.data.readings].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      let previous = 0;
      const energyKWh = [];
      const timestamps = [];

      sortedReadings.forEach(r => {
        const value = r.sampled_values?.[0]?.value / 1000 || 0;
        if (value >= previous) {
          energyKWh.push(value);
          timestamps.push(r.timestamp);
          previous = value;
        }
      });

      setTimeStamps(timestamps);
      setEnergyKWh(energyKWh);
    }
    catch (error) {
      console.log("Error", error)
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Snackbar
        message="Charging started"
        open={snackOpen}
        autoHideDuration={1000}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />

      {statusData === 'Operative' && mockStations.length > 0 ? mockStations.map((stationId, index) => (
        <>
          <Typography variant="h5" gutterBottom sx={{ color: "#00026D" }}>
            Active Charging Stations
          </Typography>
          <Grid container spacing={2}>
            {/* {mockStations.map((stationId, index) => ( */}
            <Grid item xs={12} md={6} key={index}>
              <Card
                sx={{
                  border: "1px solid #d1d1d1",
                  borderRadius: 2,
                  boxShadow: 3,
                }}>
                <CardContent>
                  <Typography variant="h6" sx={{ color: "#00026D" }}>Station: {stationId.id}</Typography>

                  <Box mt={1}>
                    <Typography variant="subtitle2">Connectors:</Typography>
                    {/* Placeholder chip if you don’t have actual connector data */}
                    <Chip
                      label={`Connector 1: Gun1`}
                      color="default"
                      variant="outlined"
                      sx={{ mr: 1, mb: 1 }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            {/* ))} */}
          </Grid>

          <Box
            mt={4}
            sx={{
              p: 3,
              backgroundColor: "#f4f4fc",
              borderRadius: 2,
              boxShadow: 1,
            }}
          >
            <Typography variant="h6" sx={{ mb: 2 }}>
              Control Station
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Select Station</InputLabel>
                  <Select
                    value={selectedStationId}
                    label="Select Station"
                    onChange={(e) => {
                      setSelectedStationId(e.target.value);
                      setSelectedConnectorId("");
                    }}
                  >
                    {mockStations.map((station) => (
                      <MenuItem key={station.id} value={station.id}>
                        {station.id}
                      </MenuItem>
                    ))}
                  </Select>

                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth >
                  <InputLabel>Select Connector</InputLabel>
                  <Select
                    value={meterRate}
                    label="Select Connector"
                    onChange={(e) => setSelectedConnectorId(e.target.value)}
                    disabled
                  >

                    <MenuItem key={1} value={meterRate}>
                      Gun 1 - {meterRate} kW
                    </MenuItem>

                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Box mt={3} display="flex" gap={2}>
              <Button
                variant="contained"
                disabled={!selectedStationId}
                onClick={handleStart}
                sx={{ backgroundColor: "#00a152" }}
              >
                Start Charging
              </Button>
              <Button
                variant="outlined"
                // disabled={!selectedStationId || !selectedConnectorId}
                disabled={!chargeStatus || !isStopEnabled}
                onClick={handleStop}
                sx={{ color: "#d32f2f", borderColor: "#d32f2f" }}
              >
                Stop Charging
              </Button>
            </Box>
          </Box>
          {showPlot && (loading || timestamps.length > 0 || energyKWh.length > 0) && (
          <MetricPlot
            timestamps={timestamps}
            energyKWh={energyKWh}
            showPlot={showPlot}
            chargeStatus={chargeStatus}
            loading={loading}
          />
          )}
        </>
      )) : (<Typography><h1>No stations available</h1></Typography>)}

    </Box>


  );
}

