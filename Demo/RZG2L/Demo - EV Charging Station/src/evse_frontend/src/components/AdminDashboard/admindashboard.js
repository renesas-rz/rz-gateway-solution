import React, { useState, useEffect } from "react";
import { Box, Grid, Paper, Typography, FormControl, InputLabel, Select, MenuItem, Button } from "@mui/material";
import { setChargerAvailable, resetChargerRate, getStationList, getChargerByStation, fetchChargeUtilization, fecthEnergyUsage, getStationListforAdmin } from "../api";
import Plot from "react-plotly.js";
import { useBaseURL } from "../../BaseURLContext";
import Snackbar from '@mui/material/Snackbar';

export default function AdminDashboard() {

  const {baseURL, statusData} = useBaseURL();
  const [selectedStation, setSelectedStation] = useState("");
  const [selectedCharger, setSelectedCharger] = useState("50");
  const [snackOpen, setSnackOpen] = useState(false);
  const [chargeSnack, setChargeSnack] = useState(false)
  const [stations, setStations] = useState([])
  
  const [chargerUtilization, setChargerUtilization] = useState({})

  const [energyUsage, setEnergyUsage] = useState({})

  const [chargerState, setChargerState] = useState(true)

  const [buttonActive, setButtonActvie] = useState(true)


  // useEffect(() => {
  //   fetchChargeUtilization().then((data) => {
  //     setChargerUtilization(data)
  //   })

  //   fecthEnergyUsage().then((data) => {
  //     setEnergyUsage(data)
  //   })
  // }, [])

  useEffect(() => {
    
    const fetchInitial = async () => {

      if(!baseURL) return;

      const { data: stationData, error: stationError } = await getStationListforAdmin(baseURL);

      if (stationError) {
        // console.error("Failed to fetch station list:", stationError);
        return;
      }

      setStations(stationData);
      
      const defaultStation = stationData.stations;
      setSelectedStation(defaultStation); // This will trigger the next useEffect

    }

    fetchInitial();
  }, []);

  useEffect(() => {
    if (!baseURL) return;

    setButtonActvie(statusData)
    setSnackOpen(false)
    setChargeSnack(false)
    // return () => clearInterval(interval);
  }, [statusData]);


  const handleStationChange = (event) => {
    setSelectedStation(event.target.value);
  };

  const handleChargerChange = (event) => {
    setSelectedCharger(event.target.value);
  };

  const handleSetAvailable = async (value) => {

    try {
      const data = await setChargerAvailable(baseURL, value, selectedStation, selectedCharger);

      if (data.status === "Accepted") {
        value ? setChargerState(true) : setChargerState(false)
        setSnackOpen(true)
      } else {
        // alert("ChangeAvailability failed: " + data.status);
         console.log("Issue")
      }

    } catch (err) {
      console.log(err)
      alert(`${err}`)
    }
  };

  const handleChargeRate = async () => {
    try {
      setChargeSnack(true)
      const data = await resetChargerRate(baseURL, selectedStation, selectedCharger)
      // alert(`${data}`)
      if (data === 'Accepted') {
        setTimeout(() => {
          setChargeSnack(false)
        }, 2000)

      }
    }
    catch (err) {
      alert(`${err}`)
    }
  };


  return (
    <Box sx={{ p: 3 }}>
      <Snackbar
              message="Please wait....."
              open={snackOpen}
              autoHideDuration={5000}
              anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            />
      <Snackbar
        message="Charge Rate changing....."
        open={chargeSnack}
        autoHideDuration={5000}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
      <Typography variant="h4" gutterBottom>
        Control Center
      </Typography>
     {stations.length>0 && (
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Station</InputLabel>
            <Select value={selectedStation} onChange={handleStationChange} label="Station">
              {stations.map((station) =>
                <MenuItem key={station.id} value={String(station.id)}>{station.id}</MenuItem>
              )}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Charger</InputLabel>
            <Select value={selectedCharger} onChange={handleChargerChange} label="Charger">
              <MenuItem key="Gun1" value='50'>Gun 1 - 50 kW</MenuItem>
               <MenuItem key="Gun1" value='100'>Gun 1 - 100 kW</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="h6">Actions</Typography>
            <Button variant="contained" color="primary" onClick={() => handleSetAvailable(true)} disabled={!selectedCharger || !selectedStation || buttonActive === 'Operative'}>
              Set Available
            </Button>
            <Button variant="contained" color="error" onClick={() => handleSetAvailable(false)} disabled={!selectedCharger || !selectedStation || !chargerState || buttonActive === 'Inoperative'}>
              Set UnAvailable
            </Button>
            <Button variant="outlined" color="secondary" onClick={handleChargeRate} disabled={!selectedCharger || !selectedStation}>
              Set Charge Rate
            </Button>
            
          </Paper>
        </Grid>
      </Grid>
)}

      {/* <Grid container spacing={3} sx={{ mt: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 2 }}>
            <Typography variant="h6">Charger Utilization</Typography>
            <Plot
              data={[chargerUtilization]}
              layout={{
                height: 250,
                margin: { t: 20, b: 30, l: 40, r: 20 },
                xaxis: { title: "Charger" },
                yaxis: { title: "% Utilization" },
                responsive: true,
              }}
              style={{ width: "100%" }}
              useResizeHandler
            />
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper elevation={3} sx={{ p: 2 }}>
            <Typography variant="h6">Weekly Energy Usage</Typography>
            <Plot
              data={[energyUsage]}
              layout={{
                height: 250,
                margin: { t: 20, b: 30, l: 40, r: 20 },
                xaxis: { title: "Day" },
                yaxis: { title: "kWh" },
                responsive: true,
              }}
              style={{ width: "100%" }}
              useResizeHandler
            />
          </Paper>
        </Grid>
      </Grid> */}
    </Box>
  );
}