import type { CSSProperties } from 'react';
import type { QeStage } from '../../../api';
import { STAGE_INFO, stageInfo, stageCssColor } from './qeRadarUtils';
import styles from '../Liquidity.module.css';

interface Props {
  stage: QeStage;
}

export function StageLadder({ stage }: Props) {
  const info = stageInfo(stage.level);
  const announced = stage.announced;

  return (
    <section className={styles.panel}>
      <div className={styles.ladder} role="list" aria-label="放水阶梯 L0 到 L4">
        {STAGE_INFO.map(s => {
          const isAnnounced = announced?.level === s.level;
          return (
            <div key={s.level} role="listitem" className={styles.ladderStep} data-current={s.level === stage.level}
                 data-announced={isAnnounced} style={{ '--stage-color': stageCssColor(s.level) } as CSSProperties}
                 title={`${s.plain}\n典型时期：${s.periods}`}>
              <span className={styles.ladderLevel}>L{s.level}</span>
              <span className={styles.ladderName}>{s.name}</span>
              {s.level === stage.level && stage.since && <span className={styles.ladderSince}>自 {stage.since} 起</span>}
              {isAnnounced && <span className={styles.ladderTag}>已宣布，待执行</span>}
            </div>
          );
        })}
      </div>

      <p className={styles.ladderPlain}>
        <strong>L{stage.level} {info?.name ?? stage.name}</strong>：{info?.plain ?? ''}
      </p>
      {announced && (
        <p className={styles.ladderPlain}>
          {announced.docDate} 的文件《{announced.title}》已宣布 L{announced.level} 相关操作，但数据尚未确认。
        </p>
      )}
      {stage.triggers.length > 0 && (
        <ul className={styles.obsList}>
          {stage.triggers.map(t => <li key={t}>{t}</li>)}
        </ul>
      )}
    </section>
  );
}
