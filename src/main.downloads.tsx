import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DesktopDownloads } from './platform/web/DesktopDownloads'
import './platform/web/desktopDownloads.css'

createRoot(document.getElementById('desktop-downloads')!).render(
  <StrictMode><DesktopDownloads /></StrictMode>,
)
