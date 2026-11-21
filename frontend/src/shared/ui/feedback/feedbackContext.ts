import { createContext } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

/** Resolves to true when the user confirms, false on cancel / Esc / backdrop click. */
export type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

export const ToastContext = createContext<ToastApi | null>(null);
export const ConfirmContext = createContext<ConfirmFn | null>(null);
