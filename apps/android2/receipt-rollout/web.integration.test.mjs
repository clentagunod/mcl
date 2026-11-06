import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const requireWeb=createRequire(new URL('../../web/package.json',import.meta.url));
const requireHere=createRequire(import.meta.url);
const {initializeTestEnvironment}=requireWeb('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,getDocs,collection,runTransaction,serverTimestamp}=requireWeb('firebase/firestore');
let environment, db, services;
const client={firstName:'Test',middleName:'',lastName:'Borrower',address:'Tagum',cellphone:'09171234567',
  clientNumber:'c',transactionNumber:'00001',principal:100,interest:0,dailyAmount:3,loanTermDays:45,
  approvalDate:'2026-01-01',createdAt:new Date('2026-01-01'),updatedAt:new Date('2026-01-01')};
const input=amount=>({clientId:'c',loanId:'initial',amount,paymentDate:'2026-01-02',collectorId:'admin',collectorName:'Admin',notes:'cash'});
before(async()=>{
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'An isolated emulator is required.');
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment=await initializeTestEnvironment({projectId:'demo-mcl-receipts-v1',firestore:{host,port:Number(port),
    rules:await readFile(new URL('./firestore.rules',import.meta.url),'utf8')}});
  db=environment.authenticatedContext('admin').firestore();
  globalThis.__receiptTestDb=db;
  globalThis.__receiptTestAuth={currentUser:{uid:'admin'}};
  services=requireHere('./.tmp/web-services.cjs');
});
beforeEach(async()=>{
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context=>{
    const trusted=context.firestore();
    await Promise.all([
      setDoc(doc(trusted,'users/admin'),{role:'admin',active:true,fullName:'Admin'}),
      setDoc(doc(trusted,'settings/receiptControl/current/config'),{enabled:true,mode:'ledger-v1'}),
      setDoc(doc(trusted,'clients/c'),client),
      setDoc(doc(trusted,'settings/Configurations/elements/counters'),{clientSequence:0,transactionSequence:1}),
      setDoc(doc(trusted,'settings/Configurations/elements/paymentPolicy'),{enforceDailyMinimum:false}),
      setDoc(doc(trusted,'loanBalances/c'),{loanId:'initial',paidCents:0,revision:0,operation:'open',receiptId:'',updatedAt:new Date('2026-01-01')}),
    ]);
  });
});
after(async()=>{await environment?.cleanup();delete globalThis.__receiptTestDb;delete globalThis.__receiptTestAuth;});
const balance=async()=> (await getDoc(doc(db,'loanBalances/c'))).data();
const currentClient=async()=>services.clientFromDoc(await getDoc(doc(db,'clients/c')));
const currentPayment=async id=>services.paymentFromDoc(await getDoc(doc(db,'payments',id)));
const fields=c=>({firstName:c.firstName,middleName:c.middleName,lastName:c.lastName,address:c.address,cellphone:c.cellphone,
  principal:c.principal,interest:c.interest,dailyAmount:c.dailyAmount,loanTermDays:c.loanTermDays,approvalDate:c.approvalDate});

test('actual web writers serialize distinct IDs against the same outstanding balance',async()=>{
  const outcomes=await Promise.allSettled([services.addPayment(input(75),'race-a'),services.addPayment(input(75),'race-b')]);
  assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);
  assert.equal((await balance()).paidCents,7500);
  assert.equal((await getDocs(collection(db,'payments'))).size,1);
});

test('web and android2 collector transaction share authorization and the same loan balance',async()=>{
  const androidDb=environment.authenticatedContext('collector').firestore();
  await environment.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),'users/collector'),{
    role:'collector',active:true,fullName:'Collector',
  }));
  const submitAndroid=()=>runTransaction(androidDb,async tx=>{
    // Mirror FirestoreMutations.submit, including every rules-protected read.
    const actor=await tx.get(doc(androidDb,'users/collector'));
    const ref=doc(androidDb,'payments/android-receipt');
    const old=await tx.get(ref);
    const deletion=await tx.get(doc(androidDb,'receiptDeletions/android-receipt'));
    assert.equal(old.exists(),false);assert.equal(deletion.exists(),false);
    const source=await tx.get(doc(androidDb,'clients/c'));
    const control=await tx.get(doc(androidDb,'settings/receiptControl/current/config'));
    assert.equal(control.data().enabled,true);assert.equal(control.data().mode,'ledger-v1');
    const ledgerRef=doc(androidDb,'loanBalances/c');
    const before=(await tx.get(ledgerRef)).data();
    await tx.get(doc(androidDb,'settings/Configurations/elements/paymentPolicy'));
    const paidCents=before.paidCents+7500;
    assert.ok(paidCents<=Math.round((source.data().principal+source.data().interest)*100));
    tx.set(ref,{...input(75),collectorId:'collector',collectorName:actor.data().fullName,createdAt:serverTimestamp()});
    tx.set(ledgerRef,{loanId:before.loanId,paidCents,revision:before.revision+1,
      operation:'create',receiptId:'android-receipt',updatedAt:serverTimestamp()});
  });
  await submitAndroid();
  assert.equal((await balance()).paidCents,7500);
  const androidPayment=(await getDoc(doc(db,'payments/android-receipt'))).data();
  assert.equal(androidPayment.collectorId,'collector');
  await assert.rejects(services.addPayment(input(75),'web-overpayment'));
  await services.addPayment(input(25),'web-settlement');
  assert.equal((await balance()).paidCents,10000);
  assert.equal((await getDocs(collection(db,'payments'))).size,2);
});
test('actual create/delete retries and correction do not duplicate deltas or resurrect an ID',async()=>{
  const outcomes=await Promise.allSettled([services.addPayment(input(75),'same'),services.addPayment(input(75),'same')]);
  assert.ok(outcomes.some(result=>result.status==='fulfilled'));
  await services.addPayment(input(75),'same');
  const expected=await currentPayment('same');
  await services.deletePayment('same',expected);
  await services.deletePayment('same',expected);
  await services.addPayment(input(75),'same');
  assert.equal((await getDoc(doc(db,'payments/same'))).exists(),false);
  assert.equal((await balance()).paidCents,0);
  await services.addPayment(input(25),'corrected');
  assert.equal((await balance()).paidCents,2500);
  assert.equal((await balance()).revision,3);
});
test('actual borrower allocation opens its ledger in the same transaction',async()=>{
  await services.addClient({...fields(client),principal:200,interest:20});
  const clients=await getDocs(collection(db,'clients'));
  const added=clients.docs.find(d=>d.id!=='c');
  assert.ok(added);
  const opened=(await getDoc(doc(db,'loanBalances',added.id))).data();
  assert.equal(opened.paidCents,0);assert.equal(opened.loanId,'initial');assert.equal(opened.revision,0);
});
test('actual financial edit preserves paid cents and rejects lowering total below paid',async()=>{
  await services.addPayment(input(75),'paid');
  let current=await currentClient();
  await assert.rejects(services.updateClient('c',{...fields(current),principal:50},current));
  assert.equal((await balance()).paidCents,7500);
  current=await currentClient();
  await services.updateClient('c',{...fields(current),principal:150},current);
  assert.equal((await balance()).paidCents,7500);
  assert.equal((await balance()).operation,'adjust');
});
test('actual renewal and correction race cannot both commit',async()=>{
  await services.addPayment(input(100),'settlement');
  const source=await currentClient(), payment=await currentPayment('settlement');
  const outcomes=await Promise.allSettled([
    services.renewClient(source,{principal:200,interest:0,dailyAmount:5,loanTermDays:45,approvalDate:'2026-01-03'},'renew'),
    services.deletePayment('settlement',payment),
  ]);
  assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);
  const next=await currentClient(), ledger=await balance();
  assert.equal(ledger.loanId,next.activeLoanId||'initial');assert.equal(ledger.paidCents,0);
});
test('actual trash and restore preserve the shared balance',async()=>{
  await services.addPayment(input(75),'archived-payment');
  await services.mutateTrashEntry('trash',{id:'c'},'trash-op');
  assert.equal((await getDoc(doc(db,'clients/c'))).exists(),false);
  assert.equal((await balance()).paidCents,7500);
  await services.mutateTrashEntry('restore',{id:'c',trashId:'trash-op'},'restore-op');
  assert.equal((await getDoc(doc(db,'clients/c'))).exists(),true);
  assert.equal((await balance()).paidCents,7500);
});
test('paused service rejects a new receipt but permits acknowledgement of a committed ID',async()=>{
  await services.addPayment(input(75),'committed');
  await environment.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),'settings/receiptControl/current/config'),{enabled:false,mode:'ledger-v1'}));
  await services.addPayment(input(75),'committed');
  await assert.rejects(services.addPayment(input(25),'paused'));
  assert.equal((await balance()).paidCents,7500);
});
