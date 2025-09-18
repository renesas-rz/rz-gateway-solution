import axios from "axios";
const devices = [
  { id: 1, name: 'RZ G2L ID:100', currentFirmware: '1.0.0', firmwareVersions: ['1.0.0', '1.2.0', '1.5.0', '2.0.0'], hasUpdate: true, isActive: true },
];
const dummylogs = [
  "2025-06-16 10:01:02 - Device started ,Although the rain was pouring down, and the wind was howling like a banshee, he continued his long, arduous trek up the mountain, determined to reach the summit before nightfall",
  "2025-06-16 10:01:05 - Connected to network",
  "2025-06-16 10:01:10 - Fetching data...",
  "2025-06-16 10:01:02 - Device started",
  "2025-06-16 10:01:05 - Connected to network",
  "2025-06-16 10:01:10 - Fetching data...",
  "2025-06-16 10:01:02 - Device started",
  "2025-06-16 10:01:05 - Connected to network",
  "2025-06-16 10:01:10 - Fetching data...",
  "2025-06-16 10:01:02 - Device started",
  "2025-06-16 10:01:05 - Connected to network",
  "2025-06-16 10:01:10 - Fetching data...",

];



export const deviceList = () => {
  return Promise.resolve(devices)
}


export const getInstanceIP = async () => {
  try {
    const response = await axios.get('/get_instance_ip')
    return response
  }
  catch (error) {
    console.log("Error", error)
  }
}



export const getVersions = async (baseURL) => {
  try {
    console.log("BaseURL--", baseURL)
    const response = await axios.get(`${baseURL}/bundles`)
    // const res = bundles
    return response.data;
  }
  catch (error) {
    console.log("Error", error)
  }
}
export const deviceFirmwareUpdate = async (baseURL, deviceId, selectedFirmware) => {
  console.log("FirmWareBaseURL", baseURL);
  console.log("SelectedFirmware", selectedFirmware);

  try {
    const firmwareKey = typeof selectedFirmware === 'object'
      ? Object.values(selectedFirmware)[0]
      : selectedFirmware;

    const response = await axios.post(`${baseURL}/install-bundle`, {
      bundle_key: firmwareKey
    });

    const rawBody = response.data?.body;
    const parsedBody = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;

    return {
      statusCode: 200,
      message: parsedBody.message,
    };
  } catch (error) {
    console.error("Error during install:", error);
    throw error;
  }
};

export const getLogs = (selectedDevice) => {
  return Promise.resolve(dummylogs)
}
