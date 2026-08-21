import { useEffect, useRef, useState } from 'react';
import { useDarkMode } from './useDarkMode';
import type { ModuleId } from './Root';
import { getConfig, saveConfig } from './api';

interface Module {
  id: ModuleId;
  label: string;
  labelEn: string;
  description: string;
  icon: string;
}

interface ModuleGroup {
  groupLabel: string;
  groupLabelEn: string;
  modules: Module[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    groupLabel: '研究工具',
    groupLabelEn: 'RESEARCH',
    modules: [
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
        description: '按行业分类整理研究报告，支持富文本编辑',
        icon: '📋',
      },
      {
        id: 'techcycle',
        label: '技术周期',
        labelEn: 'TECH CYCLE',
        description: '记录不同技术与板块的发展周期与趋势时间线',
        icon: '⏱',
      },
    ],
  },
  {
    groupLabel: '记录工具',
    groupLabelEn: 'JOURNAL',
    modules: [
      {
        id: 'ideas',
        label: '赚钱 Idea',
        labelEn: 'IDEA VAULT',
        description: '记录赚钱想法与投资逻辑，支持分类、加星与全文搜索',
        icon: '💡',
      },
      {
        id: 'trades',
        label: '交易记录',
        labelEn: 'TRADE LOG',
        description: '记录成功失败的交易与经验，错过的机会，用于复盘总结',
        icon: '📒',
      },
      {
        id: 'valuation',
        label: '估值比较',
        labelEn: 'VALUATION',
        description: '记录不同公司各时间节点的估值快照（PE/PS/NTM/毛利率等），横向对比分析',
        icon: '📊',
      },
    ],
  },
  {
    groupLabel: '时间线',
    groupLabelEn: 'TIMELINE',
    modules: [
      {
        id: 'calendar',
        label: '市场日历',
        labelEn: 'MARKET CALENDAR',
        description: '记录影响金融市场的重要事件，按月浏览与管理',
        icon: '🗓',
      },
    ],
  },
  {
    groupLabel: '系统',
    groupLabelEn: 'SYSTEM',
    modules: [
      {
        id: 'archive',
        label: '归档中心',
        labelEn: 'ARCHIVE',
        description: '集中查看与管理各模块的归档内容，随时恢复或彻底删除',
        icon: '📦',
      },
    ],
  },
];

interface HomePageProps {
  onSelectModule: (id: ModuleId) => void;
}

export default function HomePage({ onSelectModule }: HomePageProps) {
  const [darkMode, setDarkMode] = useDarkMode();
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showSettings) return;
    getConfig().then(res => {
      setApiKey(res.data.twelvedataApiKey ?? '');
    }).catch(() => {});
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
            </div>
            <span className="home-settings-hint">
              用于美股/港股/全球股票搜索。申请地址：
              <a href="https://twelvedata.com" target="_blank" rel="noreferrer">twelvedata.com</a>
            </span>
          </div>
          <div className="home-settings-row">
            <button
              className="confirm-btn"
              onClick={handleSaveSettings}
              disabled={apiKeySaving}
            >{apiKeySaving ? '保存中…' : '保存全部'}</button>
            {apiKeySaved && <span className="home-settings-ok">✓ 已保存</span>}
            {apiKeyError && <span className="home-settings-err">{apiKeyError}</span>}
          </div>
        </div>
      )}

      <main className="home-main">
        <div className="home-nav">
          {MODULE_GROUPS.map(group => (
            <div key={group.groupLabelEn} className="home-nav-group">
              <div className="home-nav-group-header">
                <span className="home-nav-group-label-en">{group.groupLabelEn}</span>
                <span className="home-nav-group-label">{group.groupLabel}</span>
                <div className="home-nav-group-line" />
              </div>
              <div className="home-nav-rows">
                {group.modules.map(mod => (
                  <button
                    key={mod.id}
                    className="home-nav-row"
                    onClick={() => onSelectModule(mod.id)}
                  >
                    <span className="home-nav-icon">{mod.icon}</span>
                    <span className="home-nav-label">{mod.label}</span>
                    <span className="home-nav-label-en">{mod.labelEn}</span>
                    <span className="home-nav-desc">{mod.description}</span>
                    <span className="home-nav-arrow">→</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
