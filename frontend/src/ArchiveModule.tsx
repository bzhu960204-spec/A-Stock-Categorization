import { useState } from 'react';
import { useDarkMode } from './useDarkMode';
import App from './App';
import ResearchModule from './ResearchModule';
import IdeaModule from './IdeaModule';
import './App.css';

interface ArchiveModuleProps {
  onGoHome: () => void;
}

type Kind = 'stock' | 'report' | 'idea';

const KINDS: Array<{ id: Kind; icon: string; label: string; labelEn: string; description: string }> = [
  { id: 'stock', icon: '📈', label: '个股', labelEn: 'STOCK INFO', description: '查看、恢复或彻底删除已归档的个股' },
  { id: 'report', icon: '📋', label: '研报', labelEn: 'SECTOR RESEARCH', description: '查看、恢复或彻底删除已归档的行业研报' },
  { id: 'idea', icon: '💡', label: '赚钱 Idea', labelEn: 'IDEA VAULT', description: '查看、恢复或彻底删除已归档的赚钱 Idea' },
];

export default function ArchiveModule({ onGoHome }: ArchiveModuleProps) {
  const [darkMode, setDarkMode] = useDarkMode();
  const [selected, setSelected] = useState<Kind | null>(null);

  const backToSelector = () => setSelected(null);

  if (selected === 'stock') {
    return <App onGoHome={backToSelector} forceArchived />;
  }
  if (selected === 'report') {
    return <ResearchModule onGoHome={backToSelector} forceArchived />;
  }
  if (selected === 'idea') {
    return <IdeaModule onGoHome={backToSelector} forceArchived />;
  }

  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <button className="icon-btn" onClick={onGoHome} title="返回主页">⌂</button>
          <h1 className="app-title">Archive Center</h1>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? 'LITE' : 'TERM'}
          </button>
        </div>
      </header>

      <main className="home-main">
        <div className="home-nav">
          <div className="home-nav-group">
            <div className="home-nav-group-header">
              <span className="home-nav-group-label-en">ARCHIVE</span>
              <span className="home-nav-group-label">📦 归档中心 · 选择要查看的类型</span>
              <div className="home-nav-group-line" />
            </div>
            <div className="home-nav-rows">
              {KINDS.map(k => (
                <button
                  key={k.id}
                  className="home-nav-row"
                  onClick={() => setSelected(k.id)}
                >
                  <span className="home-nav-icon">{k.icon}</span>
                  <span className="home-nav-label">{k.label}</span>
                  <span className="home-nav-label-en">{k.labelEn}</span>
                  <span className="home-nav-desc">{k.description}</span>
                  <span className="home-nav-arrow">→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
