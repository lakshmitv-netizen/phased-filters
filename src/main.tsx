// Must run before any store or iframe reads localStorage: wipes session-scoped
// working data so every full page load starts from the OOTB defaults.
import './data/sessionReset'
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@salesforce-ux/design-system/assets/styles/salesforce-lightning-design-system.css'
import './styles/variables.css'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)





