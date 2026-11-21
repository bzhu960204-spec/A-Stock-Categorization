import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './Feedback.module.css';
import {
  ConfirmContext, ToastContext,
  type ConfirmFn, type ConfirmOptions, type ToastApi, type ToastKind,
} from './feedbackContext';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface PendingConfirm {
  options: ConfirmOptions;
}

const TOAST_DURATION_MS: Record<ToastKind, number> = { success: 3000, info: 3500, error: 6000 };
const MAX_TOASTS = 4;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, kind, message }].slice(-MAX_TOASTS));
    timers.current.set(id, setTimeout(() => dismiss(id), TOAST_DURATION_MS[kind]));
  }, [dismiss]);

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  const toast = useMemo<ToastApi>(() => ({
    success: message => show('success', message),
    error: message => show('error', message),
    info: message => show('info', message),
  }), [show]);

  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(options => new Promise<boolean>(resolve => {
    // Only one dialog at a time: a newer request cancels the older one.
    resolver.current?.(false);
    resolver.current = resolve;
    setPending({ options: typeof options === 'string' ? { message: options } : options });
  }), []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        {pending && <ConfirmDialog options={pending.options} onSettle={settle} />}
        <div className={styles.toastStack}>
          {toasts.map(t => (
            <div
              key={t.id}
              className={`${styles.toast} ${styles[t.kind]}`}
              role={t.kind === 'error' ? 'alert' : 'status'}
              onClick={() => dismiss(t.id)}
            >
              {t.message}
            </div>
          ))}
        </div>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

function ConfirmDialog({ options, onSettle }: { options: ConfirmOptions; onSettle: (ok: boolean) => void }) {
  const { title = '请确认', message, confirmText = '确定', cancelText = '取消', danger } = options;

  useEffect(() => {
    // Capture phase on window runs before the modules' own Esc handlers (useEscapeKey),
    // so Esc closes only this dialog and not the modal underneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onSettle(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onSettle]);

  return (
    <div className={styles.overlay} onClick={e => { e.stopPropagation(); onSettle(false); }}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className={styles.title}>{title}</h3>
        <p id="confirm-dialog-message" className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => onSettle(false)}>{cancelText}</button>
          <button
            type="button"
            className={`${styles.button} ${danger ? styles.danger : styles.primary}`}
            onClick={() => onSettle(true)}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
