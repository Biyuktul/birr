import React from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './lib/store';
import App from './App';
import UpdateWatcher from './components/UpdateWatcher';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <UpdateWatcher />
      <App />
    </StoreProvider>
  </React.StrictMode>,
);
