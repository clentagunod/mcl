import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url));
const { initializeTestEnvironment, assertFails, assertSucceeds } = requireWeb('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where,
  runTransaction, writeBatch, serverTimestamp } = requireWeb('firebase/firestore');
let environment;
const as = uid => environment.authenticatedContext(uid).firestore();
const cycle = value => value == null || value === '' ? 'initial' : value;
const client = { firstName:'Juan',middleName:'',lastName:'Borrower',address:'Tagum',
  cellphone:'09171234567',clientNumber:'c',transactionNumber:'00001',principal:100,
  interest:0,dailyAmount:1,loanTermDays:45,approvalDate:'2026-01-01' };
const payment = (amount, uid='collector', loanId='initial') => ({
  clientId:'c',loanId,amount,paymentDate:'2026-01-02',notes:'cash',
  collectorId:uid,collectorName:uid==='admin'?'Admin':'Collector',createdAt:serverTimestamp()
});
const samePayload = (left,right) => {
  for(const key of ['clientId','amount','paymentDate','collectorId','collectorName','notes'])
    assert.equal(left[key],right[key],'reserved receipt '+key+' changed');
  assert.equal(cycle(left.loanId),cycle(right.loanId));
};
before(async()=>{
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '',/^(127\.0\.0\.1|localhost):[0-9]+$/);
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment=await initializeTestEnvironment({projectId:'demo-mcl-receipts-v1',
    firestore:{host,port:Number(port),rules:await readFile(new URL('./firestore.rules',import.meta.url),'utf8')}});
});
beforeEach(async()=>{
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await Promise.all([
      setDoc(doc(db,'users/admin'),{role:'admin',fullName:'Admin',active:true}),
      setDoc(doc(db,'users/collector'),{role:'collector',fullName:'Collector',active:true}),
      setDoc(doc(db,'users/other'),{role:'collector',fullName:'Other',active:true}),
      setDoc(doc(db,'clients/c'),client),
      setDoc(doc(db,'settings/Configurations/elements/paymentPolicy'),{enforceDailyMinimum:false}),
      setDoc(doc(db,'payments/previous'),{...payment(25),createdAt:new Date('2026-01-02T00:00:00Z')})
    ]);
  });
});
after(async()=>environment?.cleanup());
const trustedSet=(path,data)=>environment.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),path),data));

async function acknowledge(tx,db,id,fields) {
  const old=await tx.get(doc(db,'payments',id));
  const removed=await tx.get(doc(db,'receiptDeletions',id));
  assert.ok(!old.exists() || !removed.exists());
  if(!old.exists()&&!removed.exists())return false;
  samePayload(old.exists()?old.data():removed.data().payment,fields);
  return true;
}
// Mirrors native receipt recovery, server history review, and final transaction.
// This deliberately does not claim cross-ID overpayment serialization.
async function submit(id,amount,uid='collector') {
  const db=as(uid), fields=payment(amount,uid);
  if(await runTransaction(db,async tx=>{
    await tx.get(doc(db,'users',uid));
    return acknowledge(tx,db,id,fields);
  }))return;
  const reviewed=(await getDoc(doc(db,'clients/c'))).data();
  const history=await getDocs(query(collection(db,'payments'),where('clientId','==','c')));
  const paid=history.docs.filter(row=>cycle(row.data().loanId)===cycle(reviewed.activeLoanId))
    .reduce((sum,row)=>sum+Math.round(row.data().amount*100),0);
  assert.ok(amount>0 && Math.round(amount*100)<=Math.round(reviewed.principal*100)+Math.round(reviewed.interest*100)-paid,'outstanding balance');
  return runTransaction(db,async tx=>{
    const actor=(await tx.get(doc(db,'users',uid))).data();
    assert.equal(actor.active,true);
    if(await acknowledge(tx,db,id,fields))return;
    const current=(await tx.get(doc(db,'clients/c'))).data();
    assert.deepEqual(current,reviewed);
    assert.equal(cycle(current.activeLoanId),fields.loanId);
    await tx.get(doc(db,'settings/Configurations/elements/paymentPolicy'));
    tx.set(doc(db,'payments',id),fields);
  });
}
async function remove(id) {
  const db=as('admin');
  return runTransaction(db,async tx=>{
    await tx.get(doc(db,'users/admin'));
    const ref=doc(db,'payments',id), marker=doc(db,'receiptDeletions',id);
    const removed=await tx.get(marker), old=await tx.get(ref);
    if(!old.exists()){assert.ok(removed.exists());return;}
    assert.equal(removed.exists(),false);
    await tx.get(doc(db,'clients/c'));
    tx.set(marker,{clientId:'c',payment:old.data(),deletedBy:'admin',deletedAt:serverTimestamp()});
    tx.delete(ref);
  });
}

test('existing loan accepts payment without any control or balance setup',async()=>{
  await assertSucceeds(submit('new',50));
  const rows=await getDocs(collection(as('admin'),'payments'));
  assert.equal(rows.size,2);
  assert.equal(rows.docs.reduce((sum,row)=>sum+row.data().amount,0),75);
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    assert.equal((await getDocs(collection(db,'loanBalances'))).size,0);
    assert.equal((await getDoc(doc(db,'settings/receiptControl/current/config'))).exists(),false);
  });
});
test('old disabled control and inconsistent balance cannot block the direct workflow',async()=>{
  await trustedSet('settings/receiptControl/current/config',{enabled:false,mode:'ledger-v1'});
  await trustedSet('loanBalances/c',{loanId:'wrong',paidCents:999999});
  await assertSucceeds(submit('no-migration',25));
});
test('same-ID retry records one receipt',async()=>{
  await submit('retry',25);await submit('retry',25);
  assert.equal((await getDocs(collection(as('admin'),'payments'))).size,2);
  await assert.rejects(submit('retry',30));
});
test('simultaneous same-ID submissions recover to one receipt',async()=>{
  const results=await Promise.allSettled([submit('same',25),submit('same',25)]);
  assert.ok(results.some(row=>row.status==='fulfilled'));
  await submit('same',25);
  assert.equal((await getDocs(collection(as('admin'),'payments'))).size,2);
});
test('known outstanding balance still rejects an excessive payment in the app flow',async()=>{
  await assert.rejects(submit('too-much',76),/outstanding balance/);
  await assertSucceeds(submit('settlement',75));
});
test('delete retry and original-ID retry cannot resurrect a corrected receipt',async()=>{
  await submit('correct-me',25);
  await remove('correct-me');await remove('correct-me');
  await submit('correct-me',25);
  assert.equal((await getDoc(doc(as('admin'),'payments/correct-me'))).exists(),false);
  await submit('replacement',25);
});
test('collectors can inspect only their own deletion marker or an absent marker',async()=>{
  await assertSucceeds(getDoc(doc(as('collector'),'receiptDeletions/absent')));
  await submit('mine',25);await remove('mine');
  await assertSucceeds(getDoc(doc(as('collector'),'receiptDeletions/mine')));
  await assertFails(getDoc(doc(as('other'),'receiptDeletions/mine')));
  await assertFails(getDocs(collection(as('collector'),'receiptDeletions')));
});
test('receipt amount, dates, collector attribution and timestamps remain protected',async()=>{
  let index=0;
  for(const change of [{amount:0},{amount:-1},{amount:0.001},{paymentDate:'2099-01-01'},
    {paymentDate:'2026-02-30'},{paymentDate:'2025-12-31'},
    {collectorId:'other'},{collectorName:'Other'},{createdAt:new Date(0)},{notes:'x'.repeat(1501)}]) {
    await assertFails(setDoc(doc(as('collector'),'payments/invalid-'+(++index)),{...payment(1),...change}));
  }
  await assertSucceeds(setDoc(doc(as('collector'),'payments/valid'),payment(1)));
});
test('inactive and missing profiles cannot submit receipts',async()=>{
  await trustedSet('users/collector',{role:'collector',active:false});
  await assertFails(submit('inactive',1));
  await assertFails(setDoc(doc(as('missing'),'payments/missing'),payment(1,'missing')));
});
test('collector minimum remains enforced while admins may record smaller amounts',async()=>{
  await trustedSet('settings/Configurations/elements/paymentPolicy',{enforceDailyMinimum:true});
  await assertFails(submit('small',0.5));
  await assertSucceeds(submit('admin-small',0.5,'admin'));
});
test('new clients and financial edits require no auxiliary balance',async()=>{
  await assertSucceeds(setDoc(doc(as('admin'),'clients/new'),{...client,clientNumber:'new'}));
  await assertSucceeds(updateDoc(doc(as('admin'),'clients/c'),{principal:150,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(as('collector'),'clients/c'),{principal:150}));
});
test('trash and restore preserve existing client data without auxiliary setup',async()=>{
  const db=as('admin'), old=(await getDoc(doc(db,'clients/c'))).data();
  const trash=writeBatch(db);
  trash.set(doc(db,'clientTrash/c'),{client:old,trashId:'trash-1',deletedAt:serverTimestamp(),
    deletedBy:'admin',deletedByName:'Admin',status:'trashed'});
  trash.delete(doc(db,'clients/c'));await assertSucceeds(trash.commit());
  const restore=writeBatch(db);
  restore.set(doc(db,'clients/c'),{...old,updatedAt:serverTimestamp()});
  restore.delete(doc(db,'clientTrash/c'));await assertSucceeds(restore.commit());
});
test('settled loan renews atomically without a control or ledger',async()=>{
  await submit('settled',75);
  const db=as('admin');
  const previousLoan={...client,id:'c',activeLoanId:'initial',renewalCount:0,originalTransactionNumber:'00001'};
  const next={...client,principal:200,approvalDate:'2026-01-03',transactionNumber:'00002',
    activeLoanId:'00002',renewalCount:1,originalTransactionNumber:'00001'};
  const batch=writeBatch(db);
  batch.set(doc(db,'clients/c/renewals/00002'),{
    sequence:1,previousLoan,newLoan:{...next,id:'c'},totalPaid:100,
    paidOn:'2026-01-02',dueDate:'2026-03-01',newDueDate:'2026-03-10',
    approvedBy:'admin',approvedByName:'Admin',notes:'',createdAt:serverTimestamp()
  });
  batch.update(doc(db,'clients/c'),{principal:200,approvalDate:'2026-01-03',transactionNumber:'00002',
    activeLoanId:'00002',renewalCount:1,originalTransactionNumber:'00001',updatedAt:serverTimestamp()});
  await assertSucceeds(batch.commit());
  await assertFails(setDoc(doc(as('collector'),'payments/stale-cycle'),payment(1)));
});
test('legacy blank and null cycles accept native initial-cycle receipts',async()=>{
  for(const value of ['',null]) {
    await trustedSet('clients/c',{...client,activeLoanId:value});
    await assertSucceeds(setDoc(doc(as('collector'),'payments/legacy-'+String(value)),payment(1)));
  }
});
