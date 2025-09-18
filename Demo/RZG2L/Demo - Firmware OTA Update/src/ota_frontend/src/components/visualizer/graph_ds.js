import React from "react";
import Draggable from "react-draggable";
import Plot from "react-plotly.js";
class Graph extends React.Component {
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
      layout: { width: 400, height: 300, title: "FFT Plot" }, xaplot_bgcolor: "black",
      paper_bgcolor: "#FFF3",
      xaxis: {
        backgroundcolor: "rgba(0, 0, 0,0)",
        title: "range(m)",
       
      },
      margin: {
        t: 60,
        l:40,
        r:20,
        b:40,
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
export default Graph;
