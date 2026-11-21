// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useFullscreen } from './useFullscreen';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const pressEscape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

describe('useFullscreen', () => {
  it('toggles and remembers the preference across mounts', () => {
    const first = renderHook(() => useFullscreen());
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1]());
    expect(first.result.current[0]).toBe(true);
    first.unmount();

    expect(renderHook(() => useFullscreen()).result.current[0]).toBe(true);
  });

  it('exits full-screen on Escape before any other Escape listener sees it', () => {
    localStorage.setItem('stock-card-doc-fullscreen', '1');
    const closeModal = vi.fn();
    window.addEventListener('keydown', closeModal);
    const { result } = renderHook(() => useFullscreen());

    act(() => { pressEscape(); });
    expect(result.current[0]).toBe(false);
    expect(closeModal).not.toHaveBeenCalled();

    act(() => { pressEscape(); });
    expect(closeModal).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', closeModal);
  });
});
