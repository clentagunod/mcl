import { DEFAULT_CONSOLIDATION_METRICS, OPTIONAL_CONSOLIDATION_METRICS, type ConsolidationMetricVisibility } from './consolidation-metrics';

export type PrintableKind = 'index' | 'promissory' | 'summary';
export type TrashRetentionDays = 0 | 3 | 7 | 30;
export type PaymentAllocation = 'principalFirst' | 'proportional';
export interface PrintLayout {
  paper: 'template' | 'a4' | 'letter' | 'legal' | 'custom';
  /** Marks paper choices made after the A4 default migration, including Template size. */
  paperDefaultVersion?: 2;
  orientation: 'portrait' | 'landscape';
  widthMm: number;
  heightMm: number;
  marginMm: number;
  fontSize: number;
}

export interface AppSettings {
  identifiers: { resetWhenEmpty: boolean };
  consolidationMetrics: ConsolidationMetricVisibility;
  accounting: {
    paymentAllocation: PaymentAllocation;
    expensesEnabled: boolean;
  };
  trash: { autoDeleteDays: TrashRetentionDays };
  schedule: {
    /** Exclude Sundays from loan-day counting when enabled; holidays are always excluded. */
    skipSundays: boolean;
  };
  general: {
    businessName: string;
    clientIdPrefix: string;
    clientIdDigits: number;
    defaultPaymentNote: string;
    recentPaymentsLimit: number;
    dueClientsLimit: number;
  };
  payments: {
    /** Collector receipts must individually meet dailyAmount when enabled. */
    enforceDailyMinimum: boolean;
  };
  index: {
    businessName: string;
    branch: string;
    mobile: string;
    amountBasis: 'principal' | 'total';
    headingColor: string;
    cellColor: string;
  };
  promissory: {
    payee: string;
    interestStatement: string;
    executionPlace: string;
  };
  studio: Record<PrintableKind, PrintLayout>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  identifiers: { resetWhenEmpty: false },
  consolidationMetrics: { ...DEFAULT_CONSOLIDATION_METRICS },
  accounting: { paymentAllocation: 'principalFirst', expensesEnabled: false },
  trash: { autoDeleteDays: 0 },
  schedule: { skipSundays: false },
  payments: { enforceDailyMinimum: false },
  general: {
    businessName: 'MCL Dashboard', clientIdPrefix: 'mcl', clientIdDigits: 4,
    defaultPaymentNote: 'Daily Payment', recentPaymentsLimit: 15, dueClientsLimit: 10,
  },
  index: {
    businessName: 'MCL Lending', branch: 'San Miguel, Tagum City', mobile: '09758143163',
    amountBasis: 'total', headingColor: '#f5efa5', cellColor: '#a1bfcd',
  },
  promissory: {
    payee: 'CRISTOPHER A. LASARTE',
    interestStatement: 'PHP 150.00 per thousand and PHP 20.00 service charge per thousand',
    executionPlace: 'Compostela, Davao de Oro, and Philippines',
  },
  studio: {
    // Standard paper uses its physical dimensions in paperDimensions. Keep the
    // original workbook dimensions for an explicitly selected Template size.
    index: { paper: 'a4', paperDefaultVersion: 2, orientation: 'landscape', widthMm: 238, heightMm: 122, marginMm: 2, fontSize: 11 },
    promissory: { paper: 'a4', paperDefaultVersion: 2, orientation: 'portrait', widthMm: 210, heightMm: 297, marginMm: 12.7, fontSize: 12 },
    summary: { paper: 'a4', paperDefaultVersion: 2, orientation: 'landscape', widthMm: 297, heightMm: 210, marginMm: 10, fontSize: 9 },
  },
};

/** Match only untouched historical template defaults, never customized layouts. */
const LEGACY_TEMPLATE_DEFAULTS: Partial<Record<PrintableKind, PrintLayout>> = {
  index: { paper: 'template', orientation: 'landscape', widthMm: 238, heightMm: 122, marginMm: 2, fontSize: 11 },
  promissory: { paper: 'template', orientation: 'portrait', widthMm: 210, heightMm: 297, marginMm: 12.7, fontSize: 12 },
};

export function validLayout(layout: PrintLayout): boolean {
  return ['template', 'a4', 'letter', 'legal', 'custom'].includes(layout.paper)
    && (layout.paperDefaultVersion === undefined || layout.paperDefaultVersion === 2)
    && ['portrait', 'landscape'].includes(layout.orientation)
    && [layout.widthMm, layout.heightMm].every((n) => Number.isFinite(n) && n >= 70 && n <= 600)
    && Number.isFinite(layout.marginMm) && layout.marginMm >= 0 && layout.marginMm <= 30
    && Number.isFinite(layout.fontSize) && Number.isInteger(layout.fontSize * 2) && layout.fontSize >= 6 && layout.fontSize <= 18;
}

export function validateSettings(settings: AppSettings): string | null {
  const { general, index, promissory, studio } = settings;
  if (typeof settings.identifiers?.resetWhenEmpty !== 'boolean') return 'Choose whether to reset numbering after all clients are permanently deleted.';
  if (!settings.consolidationMetrics || OPTIONAL_CONSOLIDATION_METRICS.some(metric => typeof settings.consolidationMetrics[metric.key] !== 'boolean')) return 'Choose whether to show each optional consolidation metric.';
  if (!['principalFirst', 'proportional'].includes(settings.accounting.paymentAllocation)) return 'Choose a valid payment allocation method.';
  if (typeof settings.accounting.expensesEnabled !== 'boolean') return 'Choose whether to enable expenses.';
  if (![0, 3, 7, 30].includes(settings.trash.autoDeleteDays)) return 'Choose 3, 7 or 30 days, or do not automatically delete Trash.';
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/.test(general.clientIdPrefix)) return 'Client ID prefix must start with a letter and contain up to 20 letters, numbers, underscores or hyphens.';
  if (!Number.isInteger(general.clientIdDigits) || general.clientIdDigits < 1 || general.clientIdDigits > 10) return 'Client ID digits must be between 1 and 10.';
  if (![general.recentPaymentsLimit, general.dueClientsLimit].every((n) => Number.isInteger(n) && n >= 1 && n <= 100)) return 'Dashboard limits must be between 1 and 100.';
  if (typeof settings.payments.enforceDailyMinimum !== 'boolean') return 'Choose whether to enforce the collector daily minimum.';
  if (typeof settings.schedule.skipSundays !== 'boolean') return 'Choose whether to skip Sundays when counting loan days.';
  if ([general.businessName, general.defaultPaymentNote, index.businessName, index.branch, index.mobile, promissory.payee, promissory.executionPlace, promissory.interestStatement].some((s) => !s.trim() || s.length > 1500)) return 'Complete all text settings (maximum 1,500 characters per field).';
  if (![index.headingColor, index.cellColor].every((s) => /^#[\da-f]{6}$/i.test(s))) return 'Choose valid template colors.';
  if (!['principal', 'total'].includes(index.amountBasis)) return 'Choose the index amount basis.';
  if (!Object.values(studio).every(validLayout)) return 'Check paper dimensions, margins and font sizes.';
  return null;
}

/** Accept only known, correctly typed fields from shared Firestore documents. */
export function mergeSettings(raw: Record<string, unknown>): AppSettings {
  const result = structuredClone(DEFAULT_SETTINGS);
  for (const key of ['identifiers', 'consolidationMetrics', 'accounting', 'general', 'payments', 'trash', 'schedule', 'index', 'promissory', 'studio'] as const) {
    const source = raw[key];
    if (!source || typeof source !== 'object') continue;
    if (key === 'studio') {
      for (const kind of ['index', 'promissory', 'summary'] as const) {
        const saved = (source as Partial<AppSettings['studio']>)[kind];
        const layout = { ...result.studio[kind], ...saved };
        if (validLayout(layout)) {
          const legacy = LEGACY_TEMPLATE_DEFAULTS[kind];
          if (saved?.paperDefaultVersion === undefined && legacy
            && (Object.keys(legacy) as (keyof PrintLayout)[]).every(field => layout[field] === legacy[field])) layout.paper = 'a4';
          // Persisting this marker makes future explicit template selections
          // stable, even if they exactly match the former defaults.
          result.studio[kind] = { ...layout, paperDefaultVersion: 2 };
        }
      }
    } else {
      const target = result[key] as unknown as Record<string, unknown>;
      for (const field of Object.keys(target)) {
        const value = (source as Record<string, unknown>)[field];
        if (typeof value === typeof target[field]) target[field] = value;
      }
    }
  }
  if (validateSettings(result)) throw new Error('Saved settings contain invalid values. An administrator must correct the settings documents.');
  return result;
}
