import axios from "axios";

// export const getInstanceIP =  async () => { 
//   try {
//     const response = await axios.get(`http://127.0.0.1:8001/get_instance_ip`)
//     return response
//   }
//   catch(error){
//     console.log("Error",error)
//   }
// }



export const getHealth = async (BASE_URL) => {
  try {
    const response = await axios.get(`${BASE_URL}/health`)
    return "Success"
  }
  catch (error) {
    console.log("Error", error)
  }
}

// export const setChargerAvailable = async (selectedStation, selectedCharger) => {

//   return {
//     data: {
//       id: 1,
//       station: selectedStation,
//       charger: selectedCharger,
//       message: `${selectedCharger} connected`
//     }
//   }
// }

export const setChargerAvailable = async (BASE_URL, value, selectedStation, connectorId) => {
  const res = await fetch(`${BASE_URL}/stations/${selectedStation}/availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: value ? "Operative" : "Inoperative", // "Inoperative" or "Operative"
      evse_id: 1,
      connector_id: 1,
    }),
  });

  const data = await res.json();

  return data
}

// export const resetCharger = async (selectedStation, selectedCharger) => {
//   return {
//     data: {
//       id: 1,
//       station: selectedStation,
//       charger: selectedCharger,
//       message: `${selectedCharger} resetted`
//     }
//   }
// }

export const resetChargerRate = async (BASE_URL, selectedStation, selectedCharger) => {

  const res = await fetch(`${BASE_URL}/stations/${selectedStation}/change_profile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      evse_id: 1,
      meter_rate_kw: selectedCharger,
    }),
  });
  const data = await res.json();
  //   alert("Reset: " + data.status);
  return data.status
}


export const getStationList = async (BASE_URL) => {
  try {
    // const response = await axios.get(`http://localhost:8001/stations`)
    const response = await axios.get(`${BASE_URL}/stations`)
    return response
  }
  catch (error) {
    console.log("Error", error)
    return []
  }
}

export const getStationListforAdmin = async (BASE_URL) => {
  try {
    // const response = await axios.get(`http://localhost:8001/stations/admin`)

    const response = await axios.get(`${BASE_URL}/stations/admin`)
    return { data: response.data, error: null }
  }
  catch (error) {
    console.log("Error", error)
    return []
  }
}

export const getMeterRate = async (BASE_URL, stationData) => {
  try {
    // const response = await axios.get(`http://localhost:8001/stations/${stationData}/get_meter_rate`)
    const response = await axios.get(`${BASE_URL}/stations/get_meter_rate`)
    return response.data

  }
  catch (error) {

  }
}



export const StartCharging = async (BASE_URL, station_id) => {

  try {
    // const response = await axios.post(`http://localhost:8001/stations/${station_id}/start`)
    const response = await axios.post(`${BASE_URL}/stations/${station_id}/start`)
    return response.data
  }
  catch (error) {
    console.log("Error", error)
  }
}


export const StopCharging = async (BASE_URL, station_id) => {

  try {
    //const response = await axios.post(`http://localhost:8001/stations/${station_id}/stop`)
    const response = await axios.post(`${BASE_URL}/stations/${station_id}/stop`)
    return response.data
  }
  catch (error) {

  }
}



export const showMeterReading = async (BASE_URL, station_id) => {
  try {
    // const response = await axios.get(`http://localhost:8001/stations/${station_id}/meter-history`)
    const response = await axios.get(`${BASE_URL}/stations/${station_id}/meter-history`)
    return response
  }
  catch (error) {

  }
}


export const fetchChargeUtilization = () => {
  return Promise.resolve({
    x: ["Charger A", "Charger B", "Charger C"],
    y: [80, 65, 70],
    type: "bar",
    marker: { color: "#3f51b5" },
  })
}

export const fecthEnergyUsage = () => {
  return Promise.resolve({
    x: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    y: [120, 150, 130, 170, 160],
    type: "scatter",
    mode: "lines+markers",
    marker: { color: "#f50057" },
  })
}


