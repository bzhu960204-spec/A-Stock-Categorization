import type { Dispatch, SetStateAction } from 'react';

export interface BasicInfoDraft {
  name: string;
  code: string;
  market: string;
  recommender: string;
}

const STANDARD_MARKETS = ['CN', 'US', 'JP', 'KR', 'TW', 'HK'];

interface BasicInfoModalProps {
  open: boolean;
  draft: BasicInfoDraft;
  setDraft: Dispatch<SetStateAction<BasicInfoDraft>>;
  saving: boolean;
  onOverlayClose: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function BasicInfoModal({
  open, draft, setDraft, saving, onOverlayClose, onCancel, onSave,
}: BasicInfoModalProps) {
  if (!open) return null;
  const isStandard = STANDARD_MARKETS.includes(draft.market);
  return (
    <div className="modal-overlay" onClick={onOverlayClose}>
      <div className="glass-modal basic-info-modal" onClick={e => e.stopPropagation()}>
        <h2>基本信息</h2>
        <div className="form-group" style={{ marginTop: 16 }}>
          <label>公司名称</label>
          <input
            type="text"
            value={draft.name}
            onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
            placeholder="公司名称"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>股票代码</label>
          <input
            type="text"
            value={draft.code}
            onChange={e => setDraft(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
            placeholder="股票代码"
          />
        </div>
        <div className="form-group">
          <label>市场</label>
          <select
            className="basic-info-select"
            value={isStandard ? draft.market : 'OTHER'}
            onChange={e => {
              const val = e.target.value;
              setDraft(prev => ({ ...prev, market: val === 'OTHER' ? '' : val }));
            }}
          >
            <option value="CN">CN — A股</option>
            <option value="HK">HK — 港股</option>
            <option value="US">US — 美股</option>
            <option value="TW">TW — 台股</option>
            <option value="JP">JP — 日股</option>
            <option value="KR">KR — 韩股</option>
            <option value="OTHER">其它市场（手动输入）</option>
          </select>
          {!isStandard && (
            <input
              type="text"
              style={{ marginTop: 8 }}
              value={draft.market}
              onChange={e => setDraft(prev => ({ ...prev, market: e.target.value.toUpperCase() }))}
              placeholder="市场代码，如 SGX、LSE、NASDAQ"
              maxLength={10}
            />
          )}
        </div>
        <div className="form-group">
          <label>推荐人 <span className="basic-info-optional">可选</span></label>
          <input
            type="text"
            value={draft.recommender}
            onChange={e => setDraft(prev => ({ ...prev, recommender: e.target.value }))}
            placeholder="谁推荐了这只股票？"
          />
        </div>
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onCancel}>取消</button>
          <button
            className="confirm-btn"
            onClick={onSave}
            disabled={saving || !draft.name.trim() || !draft.code.trim() || !draft.market.trim()}
          >{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}
