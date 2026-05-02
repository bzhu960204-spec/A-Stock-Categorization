import { useEffect, useState } from 'react';
import type { ModuleId } from './Root';

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
];

interface HomePageProps {
  onSelectModule: (id: ModuleId) => void;
}

export default function HomePage({ onSelectModule }: HomePageProps) {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  return (
    <div className="app-container">
      <header className="glass-header">
        <div className="header-left">
          <h1 className="app-title">Stock Card</h1>
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? 'LITE' : 'TERM'}
          </button>
        </div>
      </header>

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
