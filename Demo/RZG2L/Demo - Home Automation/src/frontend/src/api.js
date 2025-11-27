import axios from "axios";


export const getReadings = (baseURL) => {
  return axios.get(`${baseURL}/sensor-data?limit=10`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    }
  })
}

export const fanToggle = (useBaseURL, state) => {
  return axios.post(`${useBaseURL}/fan`, { state })
}

export const lightToggle = (useBaseURL, state) => {
  return axios.post(`${useBaseURL}/led`, { state })
}

export const shadow = async (baseURL) => {
  return await axios.get(`${baseURL}/shadow`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    }
  })
}

export const getStatus = async (baseURL) => {
  return await axios.get(`${baseURL}/device-status`, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    }
  })
}





