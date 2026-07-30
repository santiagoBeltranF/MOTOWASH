import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './assets/css/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-right" toastOptions={{
        duration: 4000,
        style: { borderRadius: '10px', fontSize: '14px', fontFamily: 'DM Sans, sans-serif' },
        success: { iconTheme: { primary: '#2563EB', secondary: '#fff' } }
      }} />
    </BrowserRouter>
  </React.StrictMode>
)
