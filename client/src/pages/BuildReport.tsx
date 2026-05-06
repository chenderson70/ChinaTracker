import { Button, Card, Checkbox, Empty, Space, Typography } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import BudgetOverviewSection from '../components/BudgetOverviewSection';
import { useApp } from '../components/AppLayout';
import { getCostProjectionLabel } from '../utils/exerciseTemplates';
import Balance from './Balance';
import Comparison from './Comparison';
import { A7RpaFundingSummary, Pm27UnitProjectionTables } from './Pm27CostProjections';
import { ReportsPage } from './Reports';
import { SustainmentWorkspace } from './Sustainment';
import UtcReport from './UtcReport';

type BuildReportKey =
  | 'cost-projections'
  | 'full-budget-details'
  | 'utc-report'
  | 'sustainment'
  | 'balance'
  | 'comparison';

type BuildReportOption = {
  key: BuildReportKey;
  label: string;
  content: ReactNode;
};

const DEFAULT_REPORT_KEYS: BuildReportKey[] = [
  'cost-projections',
  'full-budget-details',
  'utc-report',
  'sustainment',
  'balance',
];

function BuildReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ct-build-report-section">
      <Typography.Title level={4} className="ct-build-report-section-title">
        {title}
      </Typography.Title>
      {children}
    </section>
  );
}

export default function BuildReport() {
  const { exercise } = useApp();
  const [selectedReportKeys, setSelectedReportKeys] = useState<BuildReportKey[]>(DEFAULT_REPORT_KEYS);
  const costProjectionLabel = exercise?.name
    ? `${exercise.name} Cost Projections`
    : getCostProjectionLabel(exercise?.exerciseTemplate);

  const reportOptions = useMemo<BuildReportOption[]>(() => [
    {
      key: 'cost-projections',
      label: costProjectionLabel,
      content: (
        <>
          <BudgetOverviewSection />
          <A7RpaFundingSummary />
        </>
      ),
    },
    {
      key: 'full-budget-details',
      label: 'Full Budget Details',
      content: <Pm27UnitProjectionTables />,
    },
    {
      key: 'utc-report',
      label: 'UTC Report',
      content: <UtcReport showHeader={false} />,
    },
    {
      key: 'sustainment',
      label: 'Exercise Sustainment',
      content: <SustainmentWorkspace />,
    },
    {
      key: 'balance',
      label: 'Balance',
      content: <Balance showHeader={false} />,
    },
    {
      key: 'comparison',
      label: 'Comparison',
      content: <Comparison showHeader={false} />,
    },
  ], [costProjectionLabel]);

  const selectedReports = reportOptions.filter((option) => selectedReportKeys.includes(option.key));
  const checkboxOptions = reportOptions.map((option) => ({
    label: option.label,
    value: option.key,
  }));

  const builderControls = (
    <Card
      title="Report Sections"
      className="ct-section-card ct-screen-only ct-build-report-controls"
      style={{ marginBottom: 24 }}
      extra={(
        <Space>
          <Button size="small" onClick={() => setSelectedReportKeys(reportOptions.map((option) => option.key))}>
            Select All
          </Button>
          <Button size="small" onClick={() => setSelectedReportKeys([])}>
            Clear
          </Button>
        </Space>
      )}
    >
      <Checkbox.Group
        options={checkboxOptions}
        value={selectedReportKeys}
        onChange={(values) => setSelectedReportKeys(values as BuildReportKey[])}
      />
    </Card>
  );

  const reportTitle = exercise?.name
    ? `${exercise.name} Build a Report`
    : 'Build a Report';

  return (
    <ReportsPage
      title={reportTitle}
      showBudgetDetails={false}
      showGrandTotals={false}
      showQuickPlanningSummary={false}
      showQuarterlyBudgetAllocation={false}
      showFullBudgetBreakdown={false}
      showTravelConfiguration={false}
      showExcelExport={false}
      beforeBudgetBreakdownSection={builderControls}
      extraSections={(
        selectedReports.length > 0 ? (
          selectedReports.map((option) => (
            <BuildReportSection key={option.key} title={option.label}>
              {option.content}
            </BuildReportSection>
          ))
        ) : (
          <Card className="ct-section-card">
            <Empty description="Select at least one report section." />
          </Card>
        )
      )}
    />
  );
}
