import { Card } from 'antd';
import { DollarOutlined } from '@ant-design/icons';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

type BudgetHeroSummaryProps = {
  grandTotal: number;
  a7BudgetPlanningTotal: number;
  overallExerciseTotalLabel: string;
  a7PlanningTotalLabel: string;
};

export default function BudgetHeroSummary({
  grandTotal,
  a7BudgetPlanningTotal,
  overallExerciseTotalLabel,
  a7PlanningTotalLabel,
}: BudgetHeroSummaryProps) {
  return (
    <div className="ct-dashboard-hero-shell ct-stagger">
      <Card size="small" className="ct-stat-card ct-stat-purple ct-dashboard-hero-card">
        <div className="ct-dashboard-hero-content">
          <div className="ct-dashboard-hero-main">
            <div className="ct-dashboard-hero-main-copy">
              <div className="ct-stat-label ct-dashboard-hero-label">Grand Total - {overallExerciseTotalLabel}</div>
              <div className="ct-dashboard-hero-value">{fmt(grandTotal)}</div>
            </div>
          </div>

          <div className="ct-dashboard-hero-divider" aria-hidden="true">
            <div className="ct-dashboard-hero-icon">
              <DollarOutlined />
            </div>
            <div className="ct-dashboard-hero-divider-line" />
          </div>

          <div className="ct-dashboard-hero-support">
            <div className="ct-stat-label">{a7PlanningTotalLabel}</div>
            <div className="ct-dashboard-hero-support-value">{fmt(a7BudgetPlanningTotal)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
