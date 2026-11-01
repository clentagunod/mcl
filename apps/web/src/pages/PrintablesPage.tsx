import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/StateMessage';

export default function PrintablesPage() {
  return (
    <>
      <PageHeader title="Printables" description="Promissory Note and Index Card (automatic printing)." />
      <section className="card">
        <EmptyState>Coming soon. This section is intentionally left blank for now.</EmptyState>
      </section>
    </>
  );
}
