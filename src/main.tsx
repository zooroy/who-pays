import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base.css'
import App from './App.tsx'

// Dev-only gallery of tokens and shared components (task 4.1 / 4.3).
const Preview = import.meta.env.DEV ? lazy(() => import('./dev/Preview.tsx')) : null
const showPreview = Preview && window.location.pathname === '/__preview'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {showPreview ? (
      <Suspense>
        <Preview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
