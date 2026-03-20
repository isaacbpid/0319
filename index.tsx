
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log("index.tsx executing...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Root element not found!");
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'padding:20px;color:red;font-family:sans-serif;background:white;';
  errorDiv.innerHTML = '<h1>Mount Error</h1><p>Could not find root element to mount to.</p>';
  document.body.appendChild(errorDiv);
  throw new Error("Could not find root element to mount to");
}

console.log("Root element found, mounting React app...");
try {
  const root = ReactDOM.createRoot(rootElement);
  console.log("ReactDOM.createRoot successful, rendering App...");
  root.render(<App />);
  console.log("React app render call complete.");
} catch (error) {
  console.error("Error during ReactDOM.createRoot or root.render:", error);
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'padding:20px;color:red;font-family:sans-serif;background:white;';
  errorDiv.innerHTML = '<h1>Render Error</h1><p>' + (error instanceof Error ? error.message : String(error)) + '</p>';
  document.body.appendChild(errorDiv);
}
