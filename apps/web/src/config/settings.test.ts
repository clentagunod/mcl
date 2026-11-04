import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, validateSettings } from './settings';

describe('Trash retention settings', () => {
  it('keeps automatic deletion off for existing settings documents', () => {
    expect(mergeSettings({ general: { businessName: 'Existing workspace' } }).trash.autoDeleteDays).toBe(0);
  });

  it.each([0, 3, 7, 30])('loads the saved %s day option', autoDeleteDays => {
    expect(mergeSettings({ trash: { autoDeleteDays, ignored: true } }).trash).toEqual({ autoDeleteDays });
  });

  it.each([-1, 1, 7.5, 31, NaN])('rejects unsupported retention %s', autoDeleteDays => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings.trash, { autoDeleteDays });
    expect(validateSettings(settings)).toContain('Choose 3, 7 or 30 days');
    expect(() => mergeSettings({ trash: { autoDeleteDays } })).toThrow('invalid values');
  });
});
