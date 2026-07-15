import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CockpitApp from './CockpitApp.jsx';
import './cockpit.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CockpitApp />
  </StrictMode>,
);
