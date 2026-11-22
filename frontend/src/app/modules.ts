/** Top-level modules; each one is served under `/<id>`. */
export type ModuleId =
  | 'stocks' | 'research' | 'calendar' | 'earnings-calendar' | 'techcycle'
  | 'ideas' | 'trades' | 'valuation' | 'liquidity' | 'market-valuation' | 'archive';

export const modulePath = (id: ModuleId) => `/${id}`;

/** Archive sub-views, served under `/archive/<kind>`. */
export type ArchiveKind = 'stocks' | 'reports' | 'ideas';

export const ARCHIVE_KINDS: readonly ArchiveKind[] = ['stocks', 'reports', 'ideas'];

export function isArchiveKind(value: string | undefined): value is ArchiveKind {
  return ARCHIVE_KINDS.includes(value as ArchiveKind);
}
