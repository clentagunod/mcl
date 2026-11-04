import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { AuthContext } from '../../src/context/AuthContext';
import { AccountsContent } from '../../src/pages/collectors/CollectorsPage';
import type { UserProfile } from '../../src/types';
import '../../src/index.css';

// Synthetic profiles only; no Firebase subscriptions or real accounts.
const accounts: UserProfile[] = [
  { uid: 'current-admin', role: 'admin', fullName: 'Current Admin', email: 'current@example.com', phone: '', active: true, createdAt: null },
  { uid: 'other-admin', role: 'admin', fullName: 'Other Admin', email: 'other@example.com', phone: '', active: true, createdAt: null },
  { uid: 'collector', role: 'collector', fullName: 'Collector One', email: 'collector@example.com', phone: '09170000000', active: true, createdAt: null },
  { uid: 'developer', role: 'developer', fullName: 'Hidden Developer', email: 'developer@example.com', phone: '', active: true, createdAt: null },
];
const error = new URLSearchParams(location.search).has('error') ? 'Account list unavailable.' : null;
const currentAccount = new URLSearchParams(location.search).get('actor') === 'developer' ? accounts[3] : accounts[0];
if (new URLSearchParams(location.search).has('many')) {
  for (let index = 0; index < 27; index += 1) accounts.push({
    uid: `team-${index}`, role: index % 2 === 0 ? 'collector' : 'admin',
    fullName: `Team member ${String(index + 1).padStart(2, '0')}`, email: `team${index + 1}@example.com`,
    phone: '', active: index % 4 !== 0, createdAt: null,
  });
}

function Fixture() {
  const [currentAccounts, setCurrentAccounts] = useState(accounts);
  useEffect(() => {
    const update = (event: Event) => setCurrentAccounts(accounts.slice(0, (event as CustomEvent<number>).detail));
    window.addEventListener('fixture:account-count', update);
    return () => window.removeEventListener('fixture:account-count', update);
  }, []);
  return <AccountsContent accounts={currentAccounts} loading={false} error={error} />;
}

createRoot(document.getElementById('root')!).render(
  <AuthContext.Provider value={{
    user: { uid: currentAccount.uid, email: currentAccount.email } as User,
    profile: currentAccount, status: 'signedIn', accessError: null,
    signIn: async () => {}, signOut: async () => {},
  }}>
    <div className="content">
      <Fixture />
    </div>
  </AuthContext.Provider>,
);
