import React from "react";
import Draggable from "react-draggable";
import Plot from "react-plotly.js";
class PointCloud extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      data: [
        {
          x: [1, 2, 3],
          y: [2, 6, 3],
          mode: "markers",
          type: "scatter",
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
        width:300,
        height:300,
        title: "Point Cloud",
        xaxis: {
          range: [-10, 10],
          type: "linear",
          title: "Wdith(m)",
          margin:10,
        },
        autosize: false,
        yaxis: {automargin: true},    
        plot_bgcolor: "black",
        paper_bgcolor: "#FFF3",
        yaxis: {
          range: [0, 20],
          type: "linear",
          title: "Range(m)",
        },
      },
    };
  }
  render() {
    return (
      <Draggable><div style={{ width: "100%", height: "100%" }}>
      <Plot 
        data={this.props.data}
        layout={this.state.layout}
        onInitialized={(figure) => this.setState(figure)}
        onUpdate={(figure) => this.setState(figure)}
      />
    </div></Draggable>
      
    );
  }
}
export default PointCloud;
