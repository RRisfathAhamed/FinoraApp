import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { store } from './lib/store';

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
