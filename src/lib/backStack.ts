/**
 * Android hardware Back must dismiss the topmost overlay first. Sheets and
 * full-screen forms register their close callback here while they are open,
 * and the native Back handler asks this stack before touching navigation.
 */
type CloseHandler = () => void;

const closers: CloseHandler[] = [];

export function registerBackCloser(close: CloseHandler): () => void {
  closers.push(close);
  return () => {
    const index = closers.lastIndexOf(close);
    if (index >= 0) closers.splice(index, 1);
  };
}

export function closeTopOverlay(): boolean {
  const close = closers[closers.length - 1];
  if (!close) return false;
  closers.pop();
  try {
    close();
  } catch {
    // A stale overlay must never stop Back from working.
  }
  return true;
}

export function hasOpenOverlay(): boolean {
  return closers.length > 0;
}
