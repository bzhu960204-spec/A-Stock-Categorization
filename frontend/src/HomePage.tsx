import { useEffect, useRef, useState } from 'react';
import type { ModuleId } from './Root';
import { getConfig, saveConfig } from './api';

interface Module {
  id: ModuleId;
  label: string;
  labelEn: string;
  description: string;
  icon: string;
}

const MODULES: Module[] = [
  {
    id: 'stocks',
    label: '个股信息',
    labelEn: 'STOCK INFO',
    description: '追踪个股基本情况、竞争分析、研究文档与操作时间轴',
    icon: '📈',
  },
  {
    id: 'research',
    label: '行业研报',
    labelEn: 'SECTOR RESEARCH',
    description: '按行业分类整理研究报告，支持 Markdown 富文本编辑',
    icon: '📋',
  },
  {
    id: 'calendar',
    label: '市场日历',
    labelEn: 'MARKET CALENDAR',
    description: '记录影响金融市场的重要事件，按月浏览与管理',
    icon: '🗓',
  },
];

interface HomePageProps {
  onSelectModule: (id: ModuleId) => void;
}

export default function HomePage({ onSelectModule }: HomePageProps) {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    if (!showSettings) return;
    getConfig().then(res => setApiKey(res.data.twelvedataApiKey ?? '')).catch(() => {});
  }, [showSettings]);

  // Close settings panel when clicking outside
  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSettings]);

  const handleSaveSettings = async () => {
    setApiKeySaving(true);
    setApiKeyError('');
    setApiKeySaved(false);
    try {
      await saveConfig({ twelvedataApiKey: apiKey.trim() });
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2500);
    } catch {
      setApiKeyError('保存失败，请检查后端是否运行');
    } finally {
      setApiKeySaving(false);
    }
  };

  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <h1 className="app-title">Stock Card</h1>
        </div>
        <div className="header-right">
          <button
            className={`icon-btn${showSettings ? ' active' : ''}`}
            title="设置"
            onClick={() => setShowSettings(v => !v)}
          >⚙</button>
          <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? 'LITE' : 'TERM'}
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="home-settings-panel" ref={settingsRef}>
          <div className="home-settings-title">API 配置</div>
          <div className="home-settings-row">
            <label className="home-settings-label">Twelve Data API Key</label>
            <div className="home-settings-input-row">
              <input
                className="home-settings-input"
                type="text"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setApiKeySaved(false); setApiKeyError(''); }}
                placeholder="输入你的 Twelve Data API Key"
                spellCheck={false}
              />
              <button
                className="confirm-btn"
                onClick={handleSaveSettings}
                disabled={apiKeySaving}
              >{apiKeySaving ? '保存中…' : '保存'}</button>
            </div>
            <span className="home-settings-hint">
              用于美股/港股/全球股票搜索。申请地址：
              <a href="https://twelvedata.com" target="_blank" rel="noreferrer">twelvedata.com</a>
            </span>
            {apiKeySaved && <span className="home-settings-ok">✓ 已保存</span>}
            {apiKeyError && <span className="home-settings-err">{apiKeyError}</span>}
          </div>
        </div>
      )}

      <main className="home-main">
        <div className="home-subtitle">选择模块</div>
        <div className="home-module-grid">
          {MODULES.map(mod => (
            <button
              key={mod.id}
              className="home-module-card"
              onClick={() => onSelectModule(mod.id)}
            >
              <span className="home-module-icon">{mod.icon}</span>
              <span className="home-module-label-en">{mod.labelEn}</span>
              <span className="home-module-label">{mod.label}</span>
              <span className="home-module-desc">{mod.description}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
