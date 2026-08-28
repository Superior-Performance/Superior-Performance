import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1A1E22',
              color: '#F5F7F8',
              border: '1px solid #2A3036',
              borderRadius: '12px',
              fontWeight: 500,
            },
            success: { iconTheme: { primary: '#2E9E63', secondary: '#F5F7F8' } },
            error:   { iconTheme: { primary: '#D9534F', secondary: '#F5F7F8' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
