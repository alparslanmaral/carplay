import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootstrapApp } from './core/boot';
import './styles/tokens.css';
import './styles/base.css';
import './styles/chassis.css';
import './styles/components.css';
import './styles/home.css';
import './styles/dashboard.css';
import './styles/nowplaying.css';
import './styles/maps.css';

bootstrapApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
