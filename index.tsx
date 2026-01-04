import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Removida a extensão .tsx para evitar avisos do Vite
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Não foi possível encontrar o elemento root para montar a aplicação");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);