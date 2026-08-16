import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { MarkdownEditor } from './MarkdownEditor';
import { IndustryChainModal } from './IndustryChainModal';
import { useEscapeKey } from './useEscapeKey';
import { updateStock, type Stock } from './api';

interface ProfileModalProps {
  stock: Stock;
  onClose: () => void;
  onSaved: (updated: Stock) => void;
}

type ProfileDraft = {
  notes: string;
  business: string;
  customers: string;
  competitors: string;
  strengths: string;
  structuralWeaknesses: string;
  future: string;
  founderCeoHolding: string;
  industryPosition: string;
};

function draftFromStock(stock: Stock): ProfileDraft {
  return {
    notes: stock.notes || '',
    business: stock.business || '',
    customers: stock.customers || '',
    competitors: stock.competitors || '',
    strengths: stock.strengths || stock.strengthsWeaknessesLegacy || '',
    structuralWeaknesses: stock.structuralWeaknesses || '',
    future: stock.future || '',
    founderCeoHolding: stock.founderCeoHolding || '',
    industryPosition: stock.industryPosition || '',
  };
}

export function ProfileModal({ stock, onClose, onSaved }: ProfileModalProps) {
  const [profileMode, setProfileMode] = useState<'read' | 'edit'>('read');
  const [profileActiveSection, setProfileActiveSection] = useState('business');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonImportText, setJsonImportText] = useState('');
  const [jsonImportError, setJsonImportError] = useState('');
  const [showIndustryChainModal, setShowIndustryChainModal] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => draftFromStock(stock));

  // Reset editor state whenever a different stock is opened.
  useEffect(() => {
    setProfileMode('read');
    setProfileActiveSection('business');
    setShowJsonImport(false);
    setJsonImportText('');
    setJsonImportError('');
    setProfileDraft(draftFromStock(stock));
  }, [stock]);

  // Escape: close JSON overlay first, else close the modal (read mode only). Inactive while the
  // nested industry-chain modal is open (it handles its own Escape).
  useEscapeKey(() => {
    if (showJsonImport) { setShowJsonImport(false); return; }
    if (profileMode === 'read') onClose();
  }, !showIndustryChainModal);

  const profileSections = [
    { key: 'business',            title: '业务',           placeholder: '记录公司主营业务、业务结构、业务变化...',               value: profileDraft.business },
    { key: 'customers',           title: '客户',           placeholder: '记录核心客户、集中度、议价能力...',                     value: profileDraft.customers },
    { key: 'industryPosition',    title: '行业地位',       placeholder: '记录公司在行业中的排名、各业务市占率、竞争格局地位...', value: profileDraft.industryPosition },
    { key: 'competitors',         title: '竞争对手',       placeholder: '记录主要竞争对手、市场格局...',                         value: profileDraft.competitors },
    { key: 'strengths',           title: '竞争优势',       placeholder: '记录护城河、成本优势、渠道能力、品牌与生态壁垒...',     value: profileDraft.strengths },
    { key: 'structuralWeaknesses',title: '结构性弱点',     placeholder: '记录商业模式或行业位置中的长期弱点、脆弱点...',         value: profileDraft.structuralWeaknesses },
    { key: 'founderCeoHolding',   title: '创始人/CEO持股', placeholder: '记录创始人/CEO 控制权与持股结构...',                    value: profileDraft.founderCeoHolding },
    { key: 'future',              title: '面向未来',       placeholder: '记录公司顺应未来变化在做什么，例如 AI、出海、技术路线...', value: profileDraft.future },
    { key: 'notes',               title: '补充备注',       placeholder: '其它补充信息...',                                      value: profileDraft.notes },
  ];

  const applyJsonToProfileDraft = () => {
    try {
      const parsed = JSON.parse(jsonImportText || '{}');
      const source = parsed?.companyProfile && typeof parsed.companyProfile === 'object'
        ? parsed.companyProfile
        : parsed;

      const formatImportedText = (value: string) =>
        value
          .replace(/([;；。])\s*/g, '$1\n\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

      const pick = (...keys: string[]) => {
        for (const key of keys) {
          const value = source?.[key];
          if (typeof value === 'string') return formatImportedText(value);
        }
        return '';
      };

      setProfileDraft(prev => ({
        ...prev,
        business: pick('business', '业务') || prev.business,
        customers: pick('customers', '客户') || prev.customers,
        competitors: pick('competitors', '竞争对手') || prev.competitors,
        industryPosition: pick('industryPosition', '行业地位') || prev.industryPosition,
        strengths: pick('strengths', '竞争优势') || prev.strengths,
        structuralWeaknesses: pick('structuralWeaknesses', '结构性弱点') || prev.structuralWeaknesses,
        future: pick('future', '面向未来') || prev.future,
        founderCeoHolding: pick('founderCeoHolding', '创始人CEO及持股') || prev.founderCeoHolding,
        notes: pick('notes', '补充备注', '备注') || prev.notes,
      }));

      setJsonImportError('');
      setShowJsonImport(false);
      setJsonImportText('');
    } catch {
      setJsonImportError('JSON 解析失败，请检查格式。');
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await updateStock(stock.id, {
        code: stock.code,
        name: stock.name,
        market: stock.market,
        ...profileDraft,
      });
      onSaved(res.data);
      setProfileMode('read');
      setProfileDraft(draftFromStock(res.data));
    } catch (e) {
      console.error('Failed to save company profile', e);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelEdit = () => {
    setProfileMode('read');
    setProfileDraft(draftFromStock(stock));
  };

  return (
    <div className="modal-overlay" onClick={() => {
      if (profileMode === 'edit') return;
      onClose();
    }}>
      <div className="glass-modal profile-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="profile-header">
          <div className="profile-header-left">
            <span className="profile-header-code">{stock.code}</span>
            <span className="profile-header-name">{stock.name}</span>
            <span className={`market-badge market-badge-${(stock.market || 'CN').toLowerCase()}`}>{stock.market || 'CN'}</span>
            <span className="profile-header-tag">公司档案</span>
          </div>
          <div className="profile-header-right">
            {profileMode === 'read' ? (
              <button className="profile-header-btn" onClick={() => setProfileMode('edit')}>编辑</button>
            ) : (
              <>
                <button
                  className="profile-header-btn secondary"
                  onClick={() => { setShowJsonImport(true); setJsonImportError(''); }}
                >JSON 导入</button>
                <button
                  className="profile-header-btn"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                >{savingProfile ? '保存中...' : '保存'}</button>
                <button className="profile-header-btn ghost" onClick={handleCancelEdit}>取消</button>
              </>
            )}
            <button
              className="profile-header-close"
              onClick={onClose}
            >×</button>
          </div>
        </div>

        {/* Two-panel body */}
        <div className="profile-body">

          {/* Section nav */}
          <nav className="profile-nav">
            {profileSections.map(section => {
              const filled = !!section.value?.trim();
              return (
                <button
                  key={section.key}
                  className={`profile-nav-item ${profileActiveSection === section.key ? 'active' : ''}`}
                  onClick={() => setProfileActiveSection(section.key)}
                >
                  <span className={`profile-nav-dot ${filled ? 'filled' : ''}`} />
                  <span className="profile-nav-label">{section.title}</span>
                </button>
              );
            })}
          </nav>

          {/* Content area */}
          <div className="profile-content">
            {profileSections.map(section => {
              if (section.key !== profileActiveSection) return null;
              return (
                <div key={section.key} className="profile-section-view">
                  <div className="profile-section-heading">
                    <h3>{section.title}</h3>
                    <div className="profile-section-heading-actions">
                      {section.key === 'business' && profileMode === 'read' && (
                        <button
                          className="profile-section-chain-btn"
                          onClick={() => setShowIndustryChainModal(true)}
                        >产业链</button>
                      )}
                      {profileMode === 'read' && (
                        <button
                          className="profile-section-edit-btn"
                          onClick={() => setProfileMode('edit')}
                        >编辑</button>
                      )}
                    </div>
                  </div>

                  {profileMode === 'read' ? (
                    <div className="profile-section-read">
                      {section.value?.trim() ? (
                        <div className="doc-markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} urlTransform={url => url}>{section.value}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="profile-section-empty">
                          <span className="profile-empty-icon">○</span>
                          <span>暂无内容，点击「编辑」填写</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <MarkdownEditor
                      value={profileDraft[section.key as keyof ProfileDraft]}
                      onChange={val => setProfileDraft(prev => ({ ...prev, [section.key]: val }))}
                      placeholder={section.placeholder}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* JSON Import overlay */}
      {showJsonImport && profileMode === 'edit' && (
        <div className="modal-overlay json-import-modal-overlay" onClick={() => setShowJsonImport(false)}>
          <div className="glass-modal json-import-modal" onClick={e => e.stopPropagation()}>
            <h2>JSON 导入</h2>
            <div className="json-import-panel">
              <label className="json-import-label">粘贴 JSON 后导入</label>
              <textarea
                className="json-import-textarea"
                value={jsonImportText}
                onChange={e => setJsonImportText(e.target.value)}
                placeholder='例如: {"business":"...","customers":"...","competitors":"...","strengths":"...","structuralWeaknesses":"...","future":"...","founderCeoHolding":"...","notes":"..."}'
              />
              {jsonImportError && <p className="json-import-error">{jsonImportError}</p>}
              <div className="json-import-actions">
                <button className="cancel-btn" onClick={() => setShowJsonImport(false)}>取消</button>
                <button className="confirm-btn" onClick={applyJsonToProfileDraft}>导入并覆盖对应字段</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Industry Chain Modal */}
      <IndustryChainModal
        stock={stock}
        open={showIndustryChainModal}
        onClose={() => setShowIndustryChainModal(false)}
      />
    </div>
  );
}
