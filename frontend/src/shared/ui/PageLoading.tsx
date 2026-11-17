import styles from './PageLoading.module.css';

/** Suspense fallback shown while a lazily loaded module chunk is fetched. */
export function PageLoading() {
  return <div className={styles.wrap} role="status">加载中…</div>;
}
