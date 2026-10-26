import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CrtScreen } from './CrtScreen';
import './style.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><CrtScreen/><div className="crt-screen"><App /></div></React.StrictMode>);
