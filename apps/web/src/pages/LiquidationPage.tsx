import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/StateMessage';

export default function LiquidationPage() {
  return (
    <>
      <PageHeader title="Consolidation / Liquidation" description="Consolidation and liquidation status." />
      <section className="card">
        <EmptyState>Coming soon. This section is a placeholder for now.</EmptyState>
      </section>
    </>
  );
}
