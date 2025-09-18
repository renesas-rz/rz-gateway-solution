import React, { createContext, useContext, useState, useEffect } from 'react';
import { getInstanceIP, getHealth, getStationListforAdmin } from './components/api';

const BaseURLContext = createContext();

export const useBaseURL = () => useContext(BaseURLContext);

export const BaseURLProvider = ({ children }) => {
  const [baseURL, setBaseURL] = useState('');

  const [health, setHealth] = useState('unknown')
  const [statusData, setStatusData] = useState(null);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        // Step 1: Load config.json and get the baseURL
        const configRes = await fetch('/config.json');
        const config = await configRes.json();
        const baseURL = config.OCPP_SERVER_IP;
        setBaseURL(baseURL);

        // Step 2: Fetch station list using baseURL
        if (baseURL) {
          const { data: stationData, error: stationError } = await getStationListforAdmin(baseURL);
          if (stationError) {
            console.error("Station fetch error:", stationError);
            return;
          }


          // Step 3: Fetch status for a specific CP
          const fetchStatus = async () => {
            try {
              const res = await fetch(`${baseURL}/status/${stationData[0].id}`);

              if (!res.ok) {
                setStatusData(null)
                return;
              }
              const data = await res.json();
              // setChargerStatus(statusData.status);
              setStatusData(data.status)
              // setButtonActvie(statusData.status)
              // console.log(`${selectedStation.id} is ${statusData.status}`);
            } catch (error) {
              setStatusData(null)
              return
            }
          };
          await fetchStatus();


          const interval = setInterval(fetchStatus, 10000)

          return () => clearInterval(interval);
        }

      } catch (err) {
        console.log("Error during fetch:", err);
      }
    };

    fetchAllData();
  }, []);


  return (
    <BaseURLContext.Provider value={{ baseURL, statusData }}>
      {children}
    </BaseURLContext.Provider>
  );
}