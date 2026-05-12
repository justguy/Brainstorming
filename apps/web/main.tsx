// IMPORTANT: chrome-shim must be installed BEFORE any src/ imports.
import { installChromeShim } from './chrome-shim';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import './brainstorm.css';

installChromeShim();

async function bootstrap(): Promise<void> {
  const { default: App } = await import('./App');
  const container = document.getElementById('root');
  if (!container) throw new Error('Root element #root not found');

  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
