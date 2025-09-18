import React from "react";
import Draggable from "react-draggable";
import Plot from "react-plotly.js";
import {Rnd} from 'react-rnd';
class RDMap extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      data: [
        {
          x: [1, 2, 3],
          y: [2, 6, 3],
          marker: { color: "red" },
        },
      ],
      layout: {
        margin: {
          t: 60,
          l:40,
          r:20,
          b:40,
        },
        marker_coloraxis:false,
        title: "Range-Velocity Heat Map",
        width : 300,
        height :300,
        plot_bgcolor: "black",
        paper_bgcolor: "#FFF3",
        xaxis: {
          backgroundcolor: "rgba(0, 0, 0,0)",
          title: "Velocity(m/s)",
          tickvals: [0, 55, 110],
          ticktext: ["6", "0", "-6"],
        },
        yaxis: {
          tickvals: [250, 500, 750, 1000],
          ticktext: ["5", "10", "15", "20"],
          title: "Range(m)",
        },
        annotations: [],
      },
    };
  }
  render() {
    return (
      <Draggable>
        <div style={{ width: "100%", height: "100%" }}>
        <Plot
          data={this.props.data}
          layout={this.state.layout}
          onInitialized={(figure) => this.setState(figure)}
          onUpdate={(figure) => this.setState(figure)}
        />
      </div>
      </Draggable>
        
     
      
      
    );
  }
}
export default RDMap;
