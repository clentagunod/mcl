import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { useData } from '../context/DataContext';
import { fullClientName } from '../lib/printables';
import './printables-home.css';

export default function PrintablesPage() {
  const [params] = useSearchParams();
  const { clients } = useData();
  const clientId = params.get('client');
  const client = clients.find(item => item.id === clientId);
  const destination = `/print-studio${clientId ? `?client=${encodeURIComponent(clientId)}` : ''}`;
  return <>
    <PageHeader title="Printables" description="Prepare client documents in a dedicated printing workspace." />
    <section className="printables-intro card" aria-labelledby="printables-intro-title">
      <span className="printables-intro-icon"><Icon name="print" size={30} /></span>
      <div className="printables-intro-copy"><span className="printables-eyebrow">Your document workspace</span>
        <h2 id="printables-intro-title">Keep printing open. Keep your work moving.</h2>
        <p>Print Studio opens in a separate tab, giving your documents room to work. You can continue managing clients, recording collections and navigating this website while your printing workspace stays open.</p>
        {client && <p className="printables-client">Ready to prepare documents for <strong>{fullClientName(client)}</strong>.</p>}
        <Link className="btn btn-primary printables-launch" to={destination} target="_blank" rel="noopener noreferrer">Go to another page for printing<Icon name="arrow-up-right" size={18} /></Link>
        <p className="printables-launch-hint">Opens Print Studio in a new tab using your current sign-in.</p>
      </div>
    </section>

  </>;
}
