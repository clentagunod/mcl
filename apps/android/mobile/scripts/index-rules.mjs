import { initializeTestEnvironment, assertSucceeds, assertFails } from '../../../web/node_modules/@firebase/rules-unit-testing/dist/esm/index.esm.js';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, Timestamp } from '../../../web/node_modules/firebase/firestore/dist/index.mjs';
const env = await initializeTestEnvironment({projectId:'demo-mcl-index',firestore:{host:'127.0.0.1',port:8189}});
try {
 await env.withSecurityRulesDisabled(async context => {
  const db=context.firestore();
  for(const [path,data] of Object.entries({
   'users/collector':{role:'collector',active:true},
   'users/inactive':{role:'collector',active:false},
   'settings/Printables/elements/indexTemplate':{businessName:'MCL'},
   'settings/Printables/elements/studio':{index:{fontSize:11}},
   'settings/Printables/elements/promissoryTemplate':{payee:'Private'},
   'clients/client':{principal:1000,interest:0,loanTermDays:45},
   'payments/own':{clientId:'client',amount:100,paymentDate:'2026-11-01',collectorId:'collector',collectorName:'Test',createdAt:Timestamp.fromMillis(1)},
   'payments/other':{clientId:'client',amount:100,paymentDate:'2026-11-01',collectorId:'other',collectorName:'Other',createdAt:Timestamp.fromMillis(1)}
  })) await setDoc(doc(db,path),data);
 });
 const db=env.authenticatedContext('collector').firestore();
 await assertSucceeds(getDoc(doc(db,'settings/Printables/elements/indexTemplate')));
 await assertSucceeds(getDoc(doc(db,'settings/Printables/elements/studio')));
 await assertFails(getDocs(collection(db,'settings/Printables/elements')));
 await assertFails(getDoc(doc(db,'settings/Printables/elements/promissoryTemplate')));
 await assertFails(setDoc(doc(db,'settings/Printables/elements/indexTemplate'),{businessName:'Changed'}));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'settings/Printables/elements/indexTemplate')));
 await assertFails(getDoc(doc(env.authenticatedContext('inactive').firestore(),'settings/Printables/elements/studio')));
 await assertSucceeds(updateDoc(doc(db,'payments/own'),{amount:200,notes:'Corrected'}));
 await assertFails(updateDoc(doc(db,'payments/other'),{amount:200}));
 await assertFails(updateDoc(doc(db,'payments/own'),{collectorId:'other'}));
 console.log('PASS: template get permissions, write/list boundaries, owned receipt edits and metadata protection');
} finally {await env.cleanup();}
