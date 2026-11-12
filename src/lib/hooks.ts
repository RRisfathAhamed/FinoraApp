import { useEffect, useState, useSyncExternalStore } from 'react';
import { store } from './store';
import type { AppState } from './types';

export function useApp(): AppState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/* ------------------------------------------------------------ hash router */

export function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, '');
  return raw || '/home';
}

/**
 * In-app route memory. Android Back and edge swipes must never leave the app:
 * they walk back through screens the user actually visited, then land on Home.
 */
const historyStack: string[] = [];

export function navigate(to: string, replace = false) {
  const target = to.startsWith('#') ? to : `#${to.startsWith('/') ? to : `/${to}`}`;
  const current = currentPath();
  if (current === target.slice(1)) return;
  if (!replace) {
    if (historyStack[historyStack.length - 1] !== current) historyStack.push(current);
    if (historyStack.length > 80) historyStack.shift();
  }
  if (replace) {
    window.history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function canGoBack(): boolean {
  return historyStack.length > 0;
}

export function goBack(fallback = '/home') {
  const previous = historyStack.pop();
  if (previous && previous !== currentPath()) {
    navigate(previous, true);
    return;
  }
  navigate(fallback, true);
}

export function useRoute(): { path: string; segments: string[]; query: URLSearchParams } {
  const [path, setPath] = useState(currentPath());
  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const [pathname, search = ''] = path.split('?');
  return {
    path,
    segments: pathname.split('/').filter(Boolean),
    query: new URLSearchParams(search),
  };
}

/** Preserve scroll for tab roots so switching tabs does not reset position. */
const scrollPositions = new Map<string, number>();

export function useScrollMemory(key: string) {
  useEffect(() => {
    const previous = scrollPositions.get(key) ?? 0;
    window.scrollTo({ top: previous, behavior: 'auto' });
    return () => {
      scrollPositions.set(key, window.scrollY);
    };
  }, [key]);
}

/* ------------------------------------------------------------------ theme */

export function useResolvedTheme(): 'light' | 'dark' {
  const { settings } = useApp();
  const [system, setSystem] = useState<'light' | 'dark'>(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (event: MediaQueryListEvent) => setSystem(event.matches ? 'dark' : 'light');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return settings.theme === 'system' ? system : settings.theme;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
