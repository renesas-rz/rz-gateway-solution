import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  Alert
} from '@mui/material';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Link from '@mui/material/Link';
import Snackbar from '@mui/material/Snackbar';
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useBaseURL } from '../../BaseURLContext';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import { deviceList, deviceFirmwareUpdate, getVersions } from '../api';


const Visualizer = () => {
  const { baseURL } = useBaseURL();
  const [selectedFirmware, setSelectedFirmware] = useState('');
  const [devices, setdevices] = useState([])
  const [firmVersions, setFirmVersions] = useState([])
  const [alertData, setAlertData] = useState({ open: false, message: "", severity: "success" });



  
  useEffect(() => {
    if (!baseURL) return;

    deviceList().then((data) => {
      setdevices(data);
    });

    getVersions(baseURL).then((res) => {
      const bundlePaths = res.bundles || [];

      // Get the first segment before "/" only if "/" exists
      const folderNames = bundlePaths
        .filter(path => path.includes("/")) // ensure there's a slash
        .map(path => path.split("/")[0]);   // extract part before slash

      // Get unique folder names
      const uniqueVersions = Array.from(new Set(folderNames));

      setFirmVersions(uniqueVersions);
    });
  }, [baseURL]);

  const handleFirmwareChange = (event, deviceId) => {
    // Logic to update firmware selection for the specific device (deviceId)
    const value = event.target.value;
    console.log(`Selected firmware for device ${deviceId}:`, event.target.value);

    setSelectedFirmware(prev => ({
      ...prev,
      [deviceId]: value
    }));
  };

  const handleUpdate = async (deviceId) => {
    // Simulate OTA update process for the specific device (deviceId)
    const result = await deviceFirmwareUpdate(baseURL, deviceId, selectedFirmware)
    if (result.statusCode === 200) {
      setAlertData({
        open: true,
        message: result.message,
        severity: "success"
      });
    }
    else {
      setAlertData({
        open: true,
        message: result.message,
        severity: "error"
      })
    }

    setTimeout(() => {
      setAlertData(prev => ({ ...prev, open: false }))
    }, 6000)
    // alert(`Updating device ${deviceId} to firmware version ${selectedFirmware}...`);
  };


  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        OTA Update
      </Typography>
      <Grid container spacing={2}>
        {devices.map((device) => (
          <Grid item xs={12} sm={6} md={4} key={device.id} >
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" flexWrap="nowrap" gap={2}>
                  <Typography variant="h6">{device.name} </Typography> <Stack direction="row" spacing={1}>

                    {device.isActive ? <Chip label="Active" variant="outlined" sx={{ backgroundColor: '#4caf50' }} /> :
                      <Chip label="InActive" variant="outlined" sx={{ backgroundColor: 'red' }} />}

                  </Stack>
                </Box>
               
               <Tooltip title="Will be implemented in next phase" placement="top">
                <Typography sx={{ mt: 1, fontSize: '1.2rem', fontWeight: 'bold', color: '#4caf50',
                  visibility: device.hasUpdate ? 'visible' : 'hidden',
                  animation: 'blink 1s step-start 0s infinite',}}>
                    Latest Firmware  Availabe</Typography></Tooltip>


                <Typography variant="body2" sx={{ fontSize: '1.0rem' }}>
                  Current Firmware: {device.currentFirmware}
                </Typography>
                <FormControl fullWidth margin="normal">
                  <InputLabel id={`firmware-select-label-${device.id}`}>
                    Select Firmware
                  </InputLabel>
                  <Select
                    label={`firmware-select-label-${device.id}`}
                    id={`firmware-select-${device.id}`}
                    value={selectedFirmware[device.id]} 
                    onChange={(event) => handleFirmwareChange(event, device.id)}
                  >
                    {firmVersions.map((version) => (
                      <MenuItem key={version} value={version}>
                        {version}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => handleUpdate(firmVersions)}
                  disabled={!selectedFirmware[device.id] || device.currentFirmware === selectedFirmware[device.id]} // Enable only if firmware is selected
                >
                  Update
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {alertData.open && (
        <Alert
          sx={{ mt: 2 }}
          severity={alertData.severity}
          icon={
            alertData.severity === "success"
              ? <CheckCircleIcon fontSize="inherit" />
              : <ErrorOutlineIcon fontSize="inherit" />
          }

        >
          {alertData.message}
        </Alert>
      )}


    </Box>
  );
};

export default Visualizer;
