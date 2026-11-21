import { describe, expect, it } from 'vitest';
import { PRESET_COLORS } from '../../constants';
import { pickUnusedColor } from './useCategoryManager';

const cat = (id: number, color: string) => ({ id, name: `C${id}`, color });

describe('pickUnusedColor', () => {
  it('never picks a colour that is already used while free ones remain', () => {
    const used = PRESET_COLORS.slice(0, PRESET_COLORS.length - 1).map((c, i) => cat(i, c));
    for (const r of [0, 0.5, 0.999]) {
      expect(pickUnusedColor(used, () => r)).toBe(PRESET_COLORS[PRESET_COLORS.length - 1]);
    }
  });

  it('falls back to the full palette once every colour is used', () => {
    const used = PRESET_COLORS.map((c, i) => cat(i, c));
    expect(pickUnusedColor(used, () => 0)).toBe(PRESET_COLORS[0]);
  });
});
