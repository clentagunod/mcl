import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { DEFAULT_SETTINGS, mergeSettings, validateSettings, type AppSettings } from '../config/settings';
import { promissoryIdPageError } from '../lib/printables';

const paths = {
  identifiers: ['Configurations', 'identifierPolicy'],
  consolidationMetrics: ['Configurations', 'consolidationMetrics'],
  accounting: ['Configurations', 'accountingPolicy'],
  general: ['Configurations', 'general'], index: ['Printables', 'indexTemplate'],
  promissory: ['Printables', 'promissoryTemplate'], studio: ['Printables', 'studio'],
  summary: ['Printables', 'summaryTemplate'],
  payments: ['Configurations', 'paymentPolicy'],
  trash: ['Configurations', 'trashPolicy'],
  schedule: ['Configurations', 'loanSchedule'],
} as const;

export function subscribeSettings(onData: (settings: AppSettings) => void, onError: (error: unknown) => void) {
  const raw: Record<string, unknown> = {};
  const ready = new Set<string>();
  const failed = new Set<string>();
  const stops = ['Configurations', 'Printables'].map((component) => onSnapshot(
    collection(db, 'settings', component, 'elements'),
    { includeMetadataChanges: true },
    (snapshot) => {
      // Local feature-switch writes arrive before the server commits the policy.
      // Do not start dependent subscriptions or enable writes from that preview.
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      for (const [key, [group, name]] of Object.entries(paths)) {
        if (group === component) raw[key] = snapshot.docs.find((d) => d.id === name)?.data();
      }
      ready.add(component);
      if (ready.size === 2 && failed.size === 0) {
        try { onData(mergeSettings(raw)); } catch (error) { onError(error); }
      }
    },
    (error) => { failed.add(component); onError(error); },
  ));
  return () => stops.forEach((stop) => stop());
}

export async function saveSettings(settings: AppSettings, uid: string, expected: AppSettings): Promise<void> {
  const error = validateSettings(settings) || promissoryIdPageError(settings.promissory, settings.studio.promissory);
  if (error) throw new Error(error);
  await runTransaction(db, async (transaction) => {
    const keys = Object.keys(paths) as (keyof typeof paths)[];
    const references = keys.map((key) => doc(db, 'settings', paths[key][0], 'elements', paths[key][1]));
    const snapshots = await Promise.all(references.map((ref) => transaction.get(ref)));
    const actual = mergeSettings(Object.fromEntries(keys.map((key, i) => [key, snapshots[i].data()])));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Settings changed in another session. Reload saved settings before saving.');
    keys.forEach((key, i) => transaction.set(references[i], { ...settings[key], updatedAt: serverTimestamp(), updatedBy: uid }));
  });
}

/** Create only missing documents; never replace settings from another session. */
export async function initializeSettings(uid: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const keys = Object.keys(paths) as (keyof typeof paths)[];
    const references = keys.map((key) => doc(db, 'settings', paths[key][0], 'elements', paths[key][1]));
    const snapshots = await Promise.all(references.map((ref) => transaction.get(ref)));
    keys.forEach((key, i) => {
      if (!snapshots[i].exists()) transaction.set(references[i], { ...DEFAULT_SETTINGS[key], updatedAt: serverTimestamp(), updatedBy: uid });
    });
  });
}
