import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { WebIndexCard } from '../src/WebIndexCard';
import { Modal } from '@web/components/Modal';
import { DEFAULT_SETTINGS } from '@web/config/settings';
import '@web/index.css';
import '../src/mobile.css';
const client = { id: 'fixture', firstName: 'Clent', middleName: '', lastName: 'Test', address: 'Test address', cellphone: '09123456789', clientNumber: 'mcl0004', transactionNumber: '00004', principal: 10000, interest: 1250, loanTermDays: 45 as const, approvalDate: '2026-10-01', dailyAmount: 250 };
function Fixture() {
 const [amount, setAmount] = useState(250);
 const [term, setTerm] = useState<45 | 50 | 58>(45);
 const settings = structuredClone(DEFAULT_SETTINGS);
 settings.index.businessName = 'MCL Fixture Lending';
 return <Modal title="Digital index card" onClose={() => {}} wide>
  <button onClick={() => setAmount(500)}>Simulate live payment</button>
  <button onClick={() => setTerm(58)}>58 day loan</button>
  <WebIndexCard client={{...client, loanTermDays: term}} settings={settings} date="2026-11-02" payments={[{id:'p',clientId:'fixture',amount,paymentDate:'2026-11-02',collectorId:'test',collectorName:'Test collector',createdAt:null}]} />
 </Modal>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
