import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { SessionGate } from './accounts/SessionGate'

const baseUrl = import.meta.env.BASE_URL
const routerBaseName = baseUrl === '/' ? '/' : baseUrl.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={routerBaseName}>
      <SessionGate><App /></SessionGate>
    </BrowserRouter>
  </StrictMode>,
)
