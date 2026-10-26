import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'normal' | 'danger';
}

interface DialogState {
  current: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
}

export const useDialogs = create<DialogState>(() => ({ current: null }));

/** Promise-based confirmation. A second call while one is open cancels the first. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogs.getState().current?.resolve(false);
    useDialogs.setState({ current: { ...options, resolve } });
  });
}

export function resolveDialog(ok: boolean): void {
  const cur = useDialogs.getState().current;
  useDialogs.setState({ current: null });
  cur?.resolve(ok);
}
