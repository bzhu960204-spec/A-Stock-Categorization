import { useRef } from 'react';
import { groupEntriesByDay } from './timelineUtils';
import { actionTypeLabelMap } from './constants';
import type { Stock, StockTimelineEntry } from './api';

interface TimelineModalProps {
  stock: Stock | null;
  loading: boolean;
  entries: StockTimelineEntry[];
  selectedDayKey: string | null;
  onSelectDay: (key: string | null) => void;
  onClose: () => void;
}

export function TimelineModal({
  stock, loading, entries, selectedDayKey, onSelectDay, onClose,
}: TimelineModalProps) {
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const tlDrag = useRef({ active: false, startX: 0, scrollLeft: 0 });

  if (!stock) return null;

  const groupedTimelineDays = groupEntriesByDay(entries);
  const selectedDayData = selectedDayKey
    ? (groupedTimelineDays.find(d => d.key === selectedDayKey) ?? null)
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal timeline-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="timeline-modal-header">
          <div className="timeline-modal-title">
            <span className="timeline-modal-code">{stock.code}</span>
            <span className="timeline-modal-name">{stock.name}</span>
            <span className="timeline-modal-badge">更新时间线</span>
          </div>
          <button className="profile-header-close" onClick={onClose}>×</button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="timeline-empty">时间线加载中...</div>
        ) : entries.length === 0 ? (
          <div className="timeline-empty">暂时还没有记录</div>
        ) : (
          <div className="timeline-body">
            {/* Horizontal scrollable track */}
            <div
              className="timeline-h-wrapper"
              ref={timelineTrackRef}
              onMouseDown={e => {
                const el = timelineTrackRef.current;
                if (!el) return;
                tlDrag.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft };
              }}
              onMouseMove={e => {
                if (!tlDrag.current.active) return;
                const el = timelineTrackRef.current;
                if (!el) return;
                e.preventDefault();
                el.scrollLeft = tlDrag.current.scrollLeft - (e.clientX - tlDrag.current.startX);
              }}
              onMouseUp={() => { tlDrag.current.active = false; }}
              onMouseLeave={() => { tlDrag.current.active = false; }}
            >
              <div className="timeline-h-track">
                <div className="timeline-h-line" />
                {groupedTimelineDays.map(({ key, entries: dayEntries }) => {
                  const parts = key.split('-');
                  const isActive = selectedDayKey === key;
                  return (
                    <div
                      key={key}
                      className={`timeline-h-node${isActive ? ' active' : ''}`}
                      onClick={e => {
                        e.stopPropagation();
                        onSelectDay(isActive ? null : key);
                      }}
                    >
                      <div className="timeline-h-dot" />
                      <div className="timeline-h-date">
                        <span className="timeline-h-month">{parts[1]}/{parts[2]}</span>
                        <span className="timeline-h-year">{parts[0]}</span>
                        <span className="timeline-h-count">{dayEntries.length} 项</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detail panel for selected day */}
            {selectedDayData ? (
              <div className="timeline-day-panel">
                <div className="timeline-day-panel-header">
                  <span className="timeline-day-panel-date">
                    {selectedDayData.key.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日')}
                  </span>
                  <span className="timeline-day-panel-count">{selectedDayData.entries.length} 项变动</span>
                </div>
                <div className="timeline-day-entries">
                  {selectedDayData.entries.map(item => (
                    <div key={item.id} className="timeline-day-entry">
                      <span className={`timeline-tag ${item.actionType.toLowerCase()}`}>
                        {actionTypeLabelMap[item.actionType] || item.actionType}
                      </span>
                      <time className="timeline-day-entry-time">
                        {new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </time>
                      <p className="timeline-day-entry-desc">{item.description || '更新了公司信息'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="timeline-day-hint">
                点击上方日期节点查看当天的详细变动
              </div>
            )}
          </div>
        )}

        <div className="modal-actions sticky-actions">
          <button className="cancel-btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
