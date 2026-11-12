import { useEffect, useState } from 'react';

/** Tiny toast bus used for action feedback across all screens. */
export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

let seq = 0;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function toast(message: string, kind: ToastKind = 'success', ms = 3000) {
  const item = { id: ++seq, message, kind };
  items = [...items, item];
  emit();
  window.setTimeout(() => {
    items = items.filter((i) => i.id !== item.id);
    emit();
  }, ms);
}

export function useToasts(): ToastItem[] {
  const [list, setList] = useState(items);
  useEffect(() => {
    const listener = () => setList(items);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return list;
}

export function dismissToast(id: number) {
  items = items.filter((i) => i.id !== id);
  emit();
}
