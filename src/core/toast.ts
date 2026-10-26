import { create } from 'zustand';

export type ToastTone = 'info' | 'bad' | 'ok';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  items: ToastItem[];
  push: (message: string, tone?: ToastTone, ms?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (message, tone = 'info', ms = 3500) => {
    const id = nextId++;
    set({ items: [...get().items.slice(-2), { id, message, tone }] });
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, tone: ToastTone = 'info', ms?: number) =>
  useToasts.getState().push(message, tone, ms);
