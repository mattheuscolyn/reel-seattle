import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import V2App from './V2App.jsx';
import './v2.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <V2App />
  </StrictMode>,
);
