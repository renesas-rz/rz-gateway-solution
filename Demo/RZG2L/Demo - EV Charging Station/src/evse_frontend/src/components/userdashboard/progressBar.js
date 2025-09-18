import * as React from 'react';
import { useState, useEffect } from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { Typography } from '@mui/material';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';

export default function ProgressBar() {
  const [showText, setShowText] = useState(false)
  useEffect(() =>{
    const timer = setTimeout(()=>{
        setShowText(true)
    }, 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Box display = 'flex'  justifyContent = 'center' alignItems = 'center' mt={4}>
      {/* <CircularProgress /> */}
    {showText && <Box><Typography varaint = "h1">The reading will be displayed here once Charging is stopped...</Typography>
    <LinearProgress/></Box>
    }
    </Box>
  );
}
