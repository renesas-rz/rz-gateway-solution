import React, { createContext, useContext, useState, useEffect } from 'react';
//import { getInstanceIP, getHealth } from './components/api';

const BaseURLContext = createContext();

export const useBaseURL = () => useContext(BaseURLContext);

export const BaseURLProvider = ({ children, value }) => {
  const [baseURL, setBaseURL] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const configRes = await fetch("/config.json");
        const config = await configRes.json();
        if (config.HA_SERVER_IP) {
          setBaseURL(config.HA_SERVER_IP);
        } else {
          console.error("config.json missing HA_SERVER_IP key");
        }
      } catch (error) {
        console.error("Error fetching config.json:", error);
      }
    };

    fetchData();
  }, []);

  const contextValue = value || { baseURL };

  return (
    <BaseURLContext.Provider value={contextValue}>
      {children}
    </BaseURLContext.Provider>
  );
};
