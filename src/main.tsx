import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/big-shoulders-display/latin-700';
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/sofia-sans/latin-400';
import '@fontsource/sofia-sans/latin-500';
import '@fontsource/sofia-sans/latin-600';
import '@fontsource/sofia-sans/latin-700';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
