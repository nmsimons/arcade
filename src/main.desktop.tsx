import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { configurePlatform } from './platform/runtime.ts'
import { desktopPlatform } from './platform/desktop/index.ts'

configurePlatform(desktopPlatform(window.arcadeDesktop))

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
)
