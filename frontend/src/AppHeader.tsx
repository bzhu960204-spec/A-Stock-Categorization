interface AppHeaderProps {
  onGoHome?: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export function AppHeader({ onGoHome, darkMode, onToggleDarkMode }: Readonly<AppHeaderProps>) {
  return (
    <header className="glass-header">
      <div className="header-left">
        {onGoHome && (
          <button type="button" className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
        )}
        <h1 className="app-title">Stock Info</h1>
      </div>
      <div className="header-right">
        <button type="button" className="icon-btn" onClick={onToggleDarkMode}>
          {darkMode ? 'LITE' : 'TERM'}
        </button>
      </div>
    </header>
  );
}
