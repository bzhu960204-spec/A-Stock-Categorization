import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import Root from './Root.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import { AppProviders } from './app/AppProviders.tsx'
import { installChunkReloadHandler } from './app/chunkReload.ts'

// The old module switcher persisted the active module here; the URL does that now.
localStorage.removeItem('activeModule')
installChunkReloadHandler()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <Root />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
)
