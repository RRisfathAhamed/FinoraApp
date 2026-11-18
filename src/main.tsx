import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';
import { store } from './lib/store';

// The Android shell already insets the WebView below the status and gesture
// bars. Mark the document so CSS does not apply env(safe-area-inset-*) twice.
if (Capacitor.getPlatform() === 'android') {
  document.documentElement.classList.add('native-shell');
}

async function boot() {
  await store.hydrate();
  const root = document.getElementById('root');
  if (!root) throw new Error('Root element missing');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
