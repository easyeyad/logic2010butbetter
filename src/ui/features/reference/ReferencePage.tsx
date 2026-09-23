import { PageHeader } from '../../app/PageHeader';
import { RulesPanel } from './RulesPanel';

export default function ReferencePage() {
  return (
    <div className="page">
      <PageHeader
        title="Reference"
        description="Every rule you can use in a derivation — its form, an example, what it requires and the mistakes students make most."
      />
      <RulesPanel />
    </div>
  );
}
