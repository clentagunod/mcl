import { initializeTestEnvironment, assertSucceeds, assertFails } from '../../../web/node_modules/@firebase/rules-unit-testing/dist/esm/index.esm.js';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from '../../../web/node_modules/firebase/firestore/dist/index.mjs';
const env=await initializeTestEnvironment({projectId:'demo-mcl-index',firestore:{host:'127.0.0.1',port:8189}});
try {
 await env.withSecurityRulesDisabled(async ctx => {
  for(const [path,data] of Object.entries({
   'users/collector':{role:'collector',active:true},
   'users/admin':{role:'admin'},
   'clients/c':{activeLoanId:'00002',renewalCount:1,principal:1000,interest:100,loanTermDays:45,dailyAmount:100,approvalDate:'2026-01-02'},
   'clients/legacy':{principal:1000,interest:100,loanTermDays:45,dailyAmount:100,approvalDate:'2026-01-01'},
   'settings/Configurations/elements/paymentPolicy':{enforceDailyMinimum:true},
   'payments/old':{clientId:'c',amount:1100,paymentDate:'2026-01-02',collectorId:'collector',collectorName:'Test',createdAt:Timestamp.fromMillis(1)},
  })) await setDoc(doc(ctx.firestore(),path),data);
 });
 const db=env.authenticatedContext('collector').firestore();
 const receipt={clientId:'c',amount:100,paymentDate:'2026-01-02',collectorId:'collector',collectorName:'Test',createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(db,'payments/untagged'),receipt));
 await assertFails(setDoc(doc(db,'payments/stale'),{...receipt,loanId:'initial'}));
 await assertSucceeds(setDoc(doc(db,'payments/current'),{...receipt,loanId:'00002'}));
 await assertFails(setDoc(doc(db,'payments/preapproval'),{...receipt,loanId:'00002',paymentDate:'2026-01-01'}));
 await assertFails(setDoc(doc(db,'payments/below'),{...receipt,loanId:'00002',amount:50}));
 await assertSucceeds(setDoc(doc(db,'payments/legacy'),{...receipt,clientId:'legacy'}));
 await assertSucceeds(setDoc(doc(db,'payments/explicit'),{...receipt,clientId:'legacy',loanId:'initial'}));
 await assertFails(updateDoc(doc(db,'payments/current'),{amount:200}));
 await assertFails(getDoc(doc(db,'clients/c/renewals/00002')));
 await assertFails(updateDoc(doc(db,'clients/c'),{activeLoanId:'00003'}));
 const admin=env.authenticatedContext('admin').firestore();
 await assertFails(updateDoc(doc(admin,'clients/c'),{activeLoanId:'00003'}));
 await assertFails(updateDoc(doc(admin,'payments/old'),{amount:50}));
 await assertFails(deleteDoc(doc(admin,'payments/old')));
 await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(),'settings/Configurations/elements/paymentPolicy'),{enforceDailyMinimum:false}));
 await assertSucceeds(setDoc(doc(db,'payments/partial'),{...receipt,loanId:'00002',amount:50}));
 console.log('PASS: renewal cycle writes, legacy compatibility, minimum toggle, immutable history, private renewal access');
} finally {await env.cleanup();}
