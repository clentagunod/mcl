import { collection, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { UserProfile } from '../types';
import { userFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';

const usersCollection = collection(db, 'users');

export const subscribeCollectors: Subscribe<UserProfile> = (onData, onError) =>
  subscribeToQuery(
    query(usersCollection, where('role', '==', 'collector')),
    (snapshot) => userFromDoc(snapshot) as UserProfile,
    onData,
    onError,
  );
