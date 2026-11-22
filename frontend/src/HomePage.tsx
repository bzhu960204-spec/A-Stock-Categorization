import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemePicker } from './ThemePicker';
import type { ModuleId } from './app/modules';
import { getConfig, saveConfig, type AppConfig, type KeySource } from './api';
import { useQeUnreadCount } from './features/liquidity/liquidityQueries';

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
    groupLabel: '宏观监测',
    groupLabelEn: 'MACRO',
    modules: [
      {
        id: 'liquidity',
        label: '美元流动性监测',
        labelEn: 'LIQUIDITY MONITOR',
        description: '追踪 SOFR、IORB、准备金、逆回购、TGA 等美元流动性指标，生成趋势图与周报',
        icon: '💧',
      },
      {
        id: 'market-valuation',
        label: '美股估值监测',
        labelEn: 'MARKET VALUATION',
        description: '追踪 CAPE、巴菲特指标、股权风险溢价、远期 PE 与指数盈利能力，判断美股估值冷热',
        icon: '🌡️',
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
      {
        id: 'earnings-calendar',
        label: '财报日历',
        labelEn: 'EARNINGS CALENDAR',
        description: '拉取美股大盘股财报发布日程，按月浏览、板块筛选与记录笔记',
        icon: '📈',
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
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fredKey, setFredKey] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<AppConfig | null>(null);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');
  const settingsRef = useRef<HTMLDivElement>(null);
  // A failed request just means no badge.
  const unreadAlerts = useQeUnreadCount().data ?? 0;

  const loadConfig = useCallback(() => {
    getConfig().then(res => setApiKeyStatus(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    loadConfig();
  }, [showSettings, loadConfig]);

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

  // A key that is left out stays untouched; an empty value clears the key saved from the UI (falls back to .env).
  const persistApiKeys = async (payload: { twelvedataApiKey?: string; fredApiKey?: string }) => {
    setApiKeySaving(true);
    setApiKeyError('');
    setApiKeySaved(false);
    try {
      await saveConfig(payload);
      if (payload.twelvedataApiKey !== undefined) setApiKey('');
      if (payload.fredApiKey !== undefined) setFredKey('');
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2500);
      loadConfig();
    } catch {
      setApiKeyError('保存失败，请检查后端是否运行');
    } finally {
      setApiKeySaving(false);
    }
  };

  const handleSaveSettings = () => persistApiKeys({
    ...(apiKey.trim() ? { twelvedataApiKey: apiKey.trim() } : {}),
    ...(fredKey.trim() ? { fredApiKey: fredKey.trim() } : {}),
  });

  const keyStatusText = (configured: boolean | undefined, masked: string | undefined, source: KeySource | undefined) =>
    configured === undefined
      ? ''
      : configured
        ? `当前：${masked}（${source === 'DATABASE' ? '界面保存' : '.env / 环境变量'}）`
        : '当前：未配置';
  const apiKeyStatusText = keyStatusText(apiKeyStatus?.twelvedataApiKeyConfigured, apiKeyStatus?.twelvedataApiKeyMasked, apiKeyStatus?.twelvedataApiKeySource);
  const fredKeyStatusText = keyStatusText(apiKeyStatus?.fredApiKeyConfigured, apiKeyStatus?.fredApiKeyMasked, apiKeyStatus?.fredApiKeySource);

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
          <ThemePicker />
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
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setApiKeySaved(false); setApiKeyError(''); }}
                placeholder={apiKeyStatus?.twelvedataApiKeyConfigured ? '输入新 Key 以替换当前值' : '输入你的 Twelve Data API Key'}
                spellCheck={false}
              />
            </div>
            {apiKeyStatusText && <span className="home-settings-hint">{apiKeyStatusText}</span>}
            <span className="home-settings-hint">
              用于美股/港股/全球股票搜索。申请地址：
              <a href="https://twelvedata.com" target="_blank" rel="noreferrer">twelvedata.com</a>
            </span>
          </div>
          <div className="home-settings-row">
            <label className="home-settings-label">FRED API Key</label>
            <div className="home-settings-input-row">
              <input
                className="home-settings-input"
                type="password"
                autoComplete="off"
                value={fredKey}
                onChange={e => { setFredKey(e.target.value); setApiKeySaved(false); setApiKeyError(''); }}
                placeholder={apiKeyStatus?.fredApiKeyConfigured ? '输入新 Key 以替换当前值' : '输入你的 FRED API Key'}
                spellCheck={false}
              />
            </div>
            {fredKeyStatusText && <span className="home-settings-hint">{fredKeyStatusText}</span>}
            <span className="home-settings-hint">
              用于美元流动性监测（IORB、准备金、银行总资产等）与美股估值监测（GDP、实际利率等）。免费申请：
              <a href="https://fredaccount.stlouisfed.org/apikeys" target="_blank" rel="noreferrer">fredaccount.stlouisfed.org</a>
            </span>
          </div>
          <div className="home-settings-row">
            <button
              className="confirm-btn"
              onClick={handleSaveSettings}
              disabled={apiKeySaving || (!apiKey.trim() && !fredKey.trim())}
            >{apiKeySaving ? '保存中…' : '保存全部'}</button>
            {apiKeyStatus?.twelvedataApiKeySource === 'DATABASE' && (
              <button
                className="cancel-btn"
                onClick={() => persistApiKeys({ twelvedataApiKey: '' })}
                disabled={apiKeySaving}
                title="删除界面保存的 Key，改用 .env 中的配置"
              >清除 Twelve Data</button>
            )}
            {apiKeyStatus?.fredApiKeySource === 'DATABASE' && (
              <button
                className="cancel-btn"
                onClick={() => persistApiKeys({ fredApiKey: '' })}
                disabled={apiKeySaving}
                title="删除界面保存的 Key，改用 .env 中的配置"
              >清除 FRED</button>
            )}
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
                    <span className="home-nav-icon">
                      {mod.icon}
                      {mod.id === 'liquidity' && unreadAlerts > 0 && (
                        <span className="home-nav-badge" title={`${unreadAlerts} 条未读放水雷达提醒`}>
                          {unreadAlerts > 99 ? '99+' : unreadAlerts}
                        </span>
                      )}
                    </span>
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
