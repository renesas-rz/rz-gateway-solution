import React, { createContext, useContext, useState, useEffect } from 'react';
import { getInstanceIP } from './components/api';

const BaseURLContext = createContext();

export const useBaseURL = () => useContext(BaseURLContext);

export const BaseURLProvider = ({ children }) => {
    const [baseURL, setBaseURL] = useState('');
    useEffect(() => {
        fetch('/config.json')
            .then(res => res.json())
            .then(config => {
                console.log("Base API URL:", config.OTA_SERVER_IP);
                setBaseURL(config.OTA_SERVER_IP)
            })
            .catch((err) => {
                console.log("Error", err)
            });

    }, []);

    return (
        <BaseURLContext.Provider value={{baseURL}}>
            {children}
        </BaseURLContext.Provider>
    );
};