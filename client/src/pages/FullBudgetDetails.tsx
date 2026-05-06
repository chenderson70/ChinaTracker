import { getCostProjectionLabel } from '../utils/exerciseTemplates';
import { useApp } from '../components/AppLayout';
import { Pm27UnitProjectionTables } from './Pm27CostProjections';
import { ReportsPage } from './Reports';

export default function FullBudgetDetails() {
  const { exercise } = useApp();
  const reportTitle = exercise?.name
    ? `${exercise.name} Full Budget Details`
    : `${getCostProjectionLabel(exercise?.exerciseTemplate)} Full Budget Details`;

  return (
    <ReportsPage
      title={reportTitle}
      showBudgetDetails={false}
      showGrandTotals={false}
      showQuickPlanningSummary={false}
      showQuarterlyBudgetAllocation={false}
      showFullBudgetBreakdown={false}
      showTravelConfiguration={false}
      extraSections={<Pm27UnitProjectionTables />}
    />
  );
}
