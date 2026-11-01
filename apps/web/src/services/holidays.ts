import { collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Holiday } from '../types';
import { holidayFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';

const holidaysCollection = collection(db, 'holidays');

export const subscribeHolidays: Subscribe<Holiday> = (onData, onError) =>
  subscribeToQuery(holidaysCollection, holidayFromDoc, onData, onError);

/** The date is the document id, so the same day can never be added twice. */
export async function saveHoliday(holiday: Holiday): Promise<void> {
  await setDoc(doc(holidaysCollection, holiday.date), {
    date: holiday.date,
    name: holiday.name,
    createdAt: serverTimestamp(),
  });
}

export async function deleteHoliday(date: string): Promise<void> {
  await deleteDoc(doc(holidaysCollection, date));
}
