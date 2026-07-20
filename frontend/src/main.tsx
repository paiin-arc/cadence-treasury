import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import './index.css'
import App from './App.tsx'

const browserGlobal = globalThis as typeof globalThis & { Buffer?: typeof Buffer }
browserGlobal.Buffer ??= Buffer

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
