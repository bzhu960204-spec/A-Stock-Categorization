// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FeedbackProvider } from './FeedbackProvider';
import { useConfirm, useToast } from './useFeedback';
import type { ConfirmFn, ToastApi } from './feedbackContext';

let confirmFn: ConfirmFn;
let toastApi: ToastApi;

function Capture({ onReady }: { onReady: (c: ConfirmFn, t: ToastApi) => void }) {
  const c = useConfirm();
  const t = useToast();
  useEffect(() => onReady(c, t), [c, t, onReady]);
  return null;
}

function setup() {
  render(<FeedbackProvider><Capture onReady={(c, t) => { confirmFn = c; toastApi = t; }} /></FeedbackProvider>);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('confirm', () => {
  it('resolves true when the confirm button is clicked', async () => {
    setup();
    let result: Promise<boolean>;
    act(() => { result = confirmFn({ message: '删除？', confirmText: '删除', danger: true }); });
    expect(screen.getByRole('alertdialog').textContent).toContain('删除？');
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await expect(result!).resolves.toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('resolves false on Esc without letting the key reach other window listeners', async () => {
    setup();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    let result: Promise<boolean>;
    act(() => { result = confirmFn('放弃修改？'); });
    fireEvent.keyDown(window, { key: 'Escape' });
    await expect(result!).resolves.toBe(false);
    expect(outer).not.toHaveBeenCalled();
    window.removeEventListener('keydown', outer);
  });

  it('cancels the previous dialog when a new one is requested', async () => {
    setup();
    let first: Promise<boolean>;
    act(() => { first = confirmFn('first'); });
    act(() => { void confirmFn('second'); });
    await expect(first!).resolves.toBe(false);
    expect(screen.getByRole('alertdialog').textContent).toContain('second');
  });
});

describe('toast', () => {
  it('shows a message and auto-dismisses it', () => {
    vi.useFakeTimers();
    setup();
    act(() => toastApi.success('已保存'));
    expect(screen.getByRole('status').textContent).toBe('已保存');
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders errors with role=alert and dismisses on click', () => {
    setup();
    act(() => toastApi.error('删除失败'));
    const el = screen.getByRole('alert');
    fireEvent.click(el);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
