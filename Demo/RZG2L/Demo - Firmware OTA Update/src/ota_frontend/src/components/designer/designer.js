import React, { useEffect } from "react";
import { useState } from "react";
import styles from "./designer.module.css";
import axios from "axios";

import { styled } from "@mui/material/styles";
import { Box, Typography, FormControl, InputLabel, Select, MenuItem, Button} from "@mui/material";
import Paper from "@mui/material/Paper";
import {getLogs, fetchLogs} from "../api";
import LogWindow from "./logWindow";


import CircularProgress from '@mui/material/CircularProgress';


const Item = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.mode === "dark" ? "#1A2027" : "#fff",
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: "center",
  color: theme.palette.text.secondary,
}));


const Designer = () => {
  const deviceListData = ["RZ G2L ID:100", "RZ G2L ID:101"]
  const[deviceList, setDeviceList] = useState(deviceListData)
  const[selectedDevice, setSelectedDevice] = useState('')
  const[loading, setLoading] = useState(false);
  const[showLogs, setShowLogs] = useState(false);
  const[logsData, setLogsData] = useState([])
  // <div className={styles.Designer}>
  //   Designer Component

  useEffect(() =>{
  setDeviceList(deviceListData)
  }, [])


  const updateHandleChange = (event) =>{
    setSelectedDevice(event.target.value)
  }

  const fetchLogs = async(selectedDevice) =>{
    const response = await getLogs(selectedDevice)
    const res = await axios.get("http://localhost:8000/lambda/logs"); 
    // console.log("New", res)
    // console.log("Repsonse", response)
    setLogsData(response)
    console.log("logsData", logsData)
  }

  const handleUpdate =() =>{
    setLoading(true)
    setShowLogs(false)

    setTimeout(() => {
    setLoading(false);
    setShowLogs(true)
    fetchLogs(selectedDevice)
  }, 3000)
  // console.log()
    // setShowLogs(showLogs)
    console.log("selecteddevice", selectedDevice)
    
  }
  return(
    <Box><Typography variant="h5" sx={{mb:5}}>Device Logs Viewer</Typography>
      <FormControl sx={{minWidth: 200}} varaint ="outlined">
                      <InputLabel id ="device-select-label">
                        Select Device
                      </InputLabel>
                      <Select
                      labelId="device-select-label"
                      id="device-select"
                      value={selectedDevice}
                      label="Select Sevice"
                      onChange={(event) => updateHandleChange(event)}
                      >
                        {deviceList.map((x) =>(
                          <MenuItem  key = {x} value={x}>{x}</MenuItem>
                        ))}
                      </Select>
                        <Button
                          variant="contained"
                          color="primary"
                          onClick={() => handleUpdate()}
                          // disabled={!selectedFirmware} // Enable only if firmware is selected
                      sx = {{mt:2}}>
                                      Show Logs
                                    </Button>
                                   
                    </FormControl>
                  
                   <LogWindow
                   showLogs = {showLogs}
                   loading = {loading}
                   logsData = {logsData}
                   /> 
                   {/* <CircularProgress/> */}

    </Box>
  //</div>,
)};



export default Designer;
