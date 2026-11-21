interface FullscreenToggleProps {
  fullscreen: boolean;
  onToggle: () => void;
  className?: string;
}

export function FullscreenToggle({ fullscreen, onToggle, className = 'icon-btn' }: Readonly<FullscreenToggleProps>) {
  return (
    <button
      type="button"
      className={className}
      onClick={onToggle}
      title={fullscreen ? '退出全屏 (Esc)' : '全屏阅读'}
    >
      {fullscreen ? '⤡ 退出全屏' : '⤢ 全屏'}
    </button>
  );
}
