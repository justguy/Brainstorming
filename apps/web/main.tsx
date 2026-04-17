// IMPORTANT: chrome-shim must be installed BEFORE any src/ imports.
// The import statement is hoisted by ESM, but installChromeShim() executes
// synchronously at module evaluation time via the top-level call below.
import { installChromeShim } from './chrome-shim';
installChromeShim();

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../../src/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
