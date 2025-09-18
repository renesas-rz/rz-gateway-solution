import React from "react";



import { Box, Typography, Paper } from '@mui/material';

import CircularProgress from '@mui/material/CircularProgress';
const LogWindow = ({showLogs,loading, logsData}) => {

  return (
    <Box>
         {(loading || showLogs) && (
        <Paper
          elevation={3}
          sx={{
            mt: 2,
            height: 600,
            bgcolor: '#1e1e1e',
            borderRadius: 2,
            color: '#00ff00',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            overflowY: 'auto',
            p: 2,
            ...(loading && {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            })
          }}
        >
          {loading ? (
            <CircularProgress color="primary" />
          ) : (
            <Box width="100%">
              <Typography variant="subtitle2" sx={{ color: '#ffffff', mb: 1 }}>
                Device Logs
              </Typography>
              <Box component="pre" sx ={{wordBreak: 'break-word', whiteSpace: 'pre-wrap'}}>
                {logsData.join('\n')}
              </Box>
            </Box>
          )}
        </Paper>
      )}
      </Box>
  );
};

export default LogWindow;