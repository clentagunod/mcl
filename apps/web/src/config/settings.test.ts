import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, validLayout, validateSettings, type PrintableKind } from './settings';
import { paperDimensions } from '../lib/printables';

describe('identifier reset policy', () => {
  it('keeps continuous numbering for new and existing workspaces by default', () => {
    expect(DEFAULT_SETTINGS.identifiers.resetWhenEmpty).toBe(false);
    expect(mergeSettings({}).identifiers).toEqual({ resetWhenEmpty: false });
  });
  it.each([false, true])('loads resetWhenEmpty=%s without unrelated fields', resetWhenEmpty => {
    expect(mergeSettings({ identifiers: { resetWhenEmpty, ignored: 1 } }).identifiers).toEqual({ resetWhenEmpty });
  });
  it('does not coerce malformed flags and refuses invalid settings writes', () => {
    expect(mergeSettings({ identifiers: { resetWhenEmpty: 'true' } }).identifiers.resetWhenEmpty).toBe(false);
    expect(validateSettings({ ...DEFAULT_SETTINGS, identifiers: { resetWhenEmpty: 'true' as unknown as boolean } })).toContain('reset numbering');
  });
});
import { DEFAULT_CONSOLIDATION_METRICS, OPTIONAL_CONSOLIDATION_METRICS, visibleConsolidationMetrics } from './consolidation-metrics';

describe('consolidation metric visibility', () => {
  const required = ['totalPayment', 'principal', 'payableAmount', 'contractedInterest'];
  it('defaults existing and new workspaces to the four required metrics', () => {
    expect(mergeSettings({}).consolidationMetrics).toEqual(DEFAULT_CONSOLIDATION_METRICS);
    expect(visibleConsolidationMetrics(mergeSettings({}).consolidationMetrics).map(([key]) => key)).toEqual(required);
  });
  it.each(OPTIONAL_CONSOLIDATION_METRICS)('enables $label independently without hiding required metrics', metric => {
    const settings = mergeSettings({ consolidationMetrics: { [metric.key]: true } });
    const visible = visibleConsolidationMetrics(settings.consolidationMetrics).map(([key]) => key);
    expect(visible).toHaveLength(5);
    expect(visible).toEqual(expect.arrayContaining([...required, metric.key]));
  });
  it('ignores unknown fields and cannot disable required metrics from stored data', () => {
    const settings = mergeSettings({ consolidationMetrics: { totalPayment: false, principal: false, payableAmount: false, contractedInterest: false, balance: true, unrelated: true } });
    expect(Object.keys(settings.consolidationMetrics)).toHaveLength(6);
    expect(visibleConsolidationMetrics(settings.consolidationMetrics).map(([key]) => key)).toEqual(expect.arrayContaining(required));
  });
  it('does not coerce malformed values or accept incomplete settings for saving', () => {
    expect(mergeSettings({ consolidationMetrics: { balance: 'true', interestCollected: 1 } }).consolidationMetrics).toEqual(DEFAULT_CONSOLIDATION_METRICS);
    expect(validateSettings({ ...DEFAULT_SETTINGS, consolidationMetrics: { ...DEFAULT_CONSOLIDATION_METRICS, balance: 'true' as unknown as boolean } })).toContain('optional consolidation metric');
  });
});

describe('accounting settings', () => {
  it('keeps expenses disabled and principal-first allocation for existing workspaces', () => {
    expect(mergeSettings({}).accounting).toEqual({ expensesEnabled: false, paymentAllocation: 'principalFirst' });
  });
  it('preserves saved options and discards unknown fields', () => {
    expect(mergeSettings({ accounting: { expensesEnabled: true, paymentAllocation: 'proportional', ignored: true } }).accounting)
      .toEqual({ expensesEnabled: true, paymentAllocation: 'proportional' });
  });
  it('rejects unsupported allocation methods and invalid expense switches', () => {
    expect(() => mergeSettings({ accounting: { paymentAllocation: 'unknown' } })).toThrow('invalid values');
    expect(validateSettings({ ...DEFAULT_SETTINGS, accounting: { paymentAllocation: 'principalFirst', expensesEnabled: 'true' as unknown as boolean } })).toContain('enable expenses');
    expect(mergeSettings({ accounting: { expensesEnabled: 'true' } }).accounting.expensesEnabled).toBe(false);
  });
});

describe('loan schedule settings', () => {
  it('counts Sundays by default for new and preexisting workspaces', () => {
    expect(DEFAULT_SETTINGS.schedule.skipSundays).toBe(false);
    expect(mergeSettings({}).schedule.skipSundays).toBe(false);
    expect(mergeSettings({ general: { businessName: 'Existing workspace' } }).schedule.skipSundays).toBe(false);
  });

  it.each([false, true])('loads saved skipSundays=%s and discards unknown fields', skipSundays => {
    expect(mergeSettings({ schedule: { skipSundays, ignored: true } }).schedule).toEqual({ skipSundays });
  });

  it.each(['false', 1, null, undefined])('does not coerce an invalid stored Sunday policy %s', skipSundays => {
    expect(mergeSettings({ schedule: { skipSundays } }).schedule.skipSundays).toBe(false);
    const invalid = structuredClone(DEFAULT_SETTINGS);
    Object.assign(invalid.schedule, { skipSundays });
    expect(validateSettings(invalid)).toContain('skip Sundays');
  });
});

describe('A4 print defaults and saved paper choices', () => {
  const kinds: PrintableKind[] = ['index', 'promissory', 'summary'];
  it.each(kinds)('defaults %s to physical A4 dimensions', kind => {
    const layout = mergeSettings({}).studio[kind];
    expect(layout.paper).toBe('a4');
    expect(layout.paperDefaultVersion).toBe(2);
    expect(paperDimensions(layout, kind)).toEqual(kind === 'promissory' ? { width: 210, height: 297 } : { width: 297, height: 210 });
  });

  it.each(['index', 'promissory'] as const)('migrates only the exact legacy %s template default', kind => {
    const { paperDefaultVersion: _version, ...layout } = DEFAULT_SETTINGS.studio[kind];
    expect(mergeSettings({ studio: { [kind]: { ...layout, paper: 'template' } } }).studio[kind].paper).toBe('a4');
    const customized = mergeSettings({ studio: { [kind]: { ...layout, paper: 'template', marginMm: layout.marginMm + 1 } } }).studio[kind];
    expect(customized).toMatchObject({ paper: 'template', marginMm: layout.marginMm + 1, paperDefaultVersion: 2 });
    const intentional = { ...customized, marginMm: layout.marginMm };
    expect(mergeSettings({ studio: { [kind]: intentional } }).studio[kind]).toEqual(intentional);
  });

  it.each(kinds)('preserves explicit paper selections and custom dimensions for %s', kind => {
    for (const paper of ['letter', 'legal', 'custom', 'template'] as const) {
      const saved = { ...DEFAULT_SETTINGS.studio[kind], paper, widthMm: 190, heightMm: 260, orientation: 'portrait' as const, marginMm: 8, fontSize: 10 };
      expect(mergeSettings({ studio: { [kind]: saved } }).studio[kind]).toEqual(saved);
    }
  });

  it('preserves an intentional new template selection matching the old default', () => {
    const saved = { ...DEFAULT_SETTINGS.studio.index, paper: 'template' as const };
    const merged = mergeSettings({ studio: { index: saved } });
    expect(merged.studio.index).toEqual(saved);
    expect(paperDimensions(merged.studio.index, 'index')).toEqual({ width: 238, height: 122 });
  });

  it('rejects malformed paper migration markers', () => {
    expect(validLayout({ ...DEFAULT_SETTINGS.studio.index, paperDefaultVersion: 3 } as unknown as typeof DEFAULT_SETTINGS.studio.index)).toBe(false);
  });
});

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
