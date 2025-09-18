import Plot from "react-plotly.js";
import ProgressBar from "./progressBar";
import {
  Box,
  Typography
} from "@mui/material";

export default function MetricPlot({ timestamps, energyKWh, showPlot, chargeStatus, loading }) {
  return (
    <Box>
      {loading && <ProgressBar />}
      {showPlot && (timestamps.length === 0 && energyKWh.length === 0 ? (

        <Typography variant="h1">No data found!</Typography>)
        :
        (<Plot
          data={[
            {
              x: timestamps,
              y: energyKWh,
              type: 'scatter',
              mode: 'lines', // removes markers to improve performance for 1000+ points
              line: { color: 'green', width: 2 },
              name: '(kWh)',
            },
          ]}
          layout={{
            title: 'Energy Consumption',
            xaxis: { title: 'Timestamp', type: 'date', showgrid: false },
            yaxis: { title: 'Energy (kWh)', showgrid: true },
            margin: { t: 50, b: 40 },
            autosize: true,
            dragmode:false
          }}
          config={{
            responsive: true,
          }}
          style={{ width: '100%', height: '100%' }}
        />
        )
      )}

    </Box>
  )
}