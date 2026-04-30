import { Card, Typography, Spin, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import {
  getAnnualTourRpaMealsTotal,
  getAnnualTourMilPayTotal,
  getAnnualTourTravelPayTotal,
} from '../utils/budgetSummary';
import { getUnitDisplayLabel, compareUnitCodes } from '../utils/unitLabels';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function Balance() {
  const { exercise, budget } = useApp();
  const { data: appConfig = {} } = useQuery({ queryKey: ['appConfig'], queryFn: api.getAppConfig });

  if (!exercise || !budget) return <div className="ct-loading"><Spin size="large" /></div>;

  const rpaBudgetTarget = Number(appConfig.BUDGET_TARGET_RPA || 0);
  const omBudgetTarget = Number(appConfig.BUDGET_TARGET_OM || 0);
  const overallBudget = rpaBudgetTarget + omBudgetTarget || Number(exercise.totalBudget || 0);

  // RPA spent breakdown
  const rpaMilPayTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.planningRpa.milPay || 0) + (unit.whiteCellRpa.milPay || 0) + (unit.playerRpa.milPay || 0), 0);
  const rpaPerDiemTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.planningRpa.perDiem || 0) + (unit.whiteCellRpa.perDiem || 0) + (unit.playerRpa.perDiem || 0), 0);
  const executionRpaTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.executionRpa || 0), 0);
  const rpaTravelAndPerDiemTotal = budget.rpaTravel + rpaPerDiemTotal + executionRpaTotal;
  const annualTourMealsTotal = getAnnualTourRpaMealsTotal(budget);
  const rpaRationsTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerRpa.meals || 0), 0) + annualTourMealsTotal;
  const annualTourMilPay = getAnnualTourMilPayTotal(budget);
  const annualTourTravel = getAnnualTourTravelPayTotal(budget);

  // O&M spent breakdown
  const allExecutionOmLines = (exercise.unitBudgets || [])
    .flatMap((u) => u.executionCostLines || [])
    .filter((line) => line.fundingType === 'OM');
  const omWrmTotal = allExecutionOmLines
    .filter((line) => { const c = String(line.category || '').toUpperCase(); return c === 'WRM' || c === 'UFR'; })
    .reduce((sum, line) => sum + (line.amount || 0), 0);
  const omContractsTotal = allExecutionOmLines
    .filter((line) => String(line.category || '').toUpperCase() === 'TITLE_CONTRACTS')
    .reduce((sum, line) => sum + (line.amount || 0), 0);
  const omGpcPurchasesTotal = allExecutionOmLines
    .filter((line) => String(line.category || '').toUpperCase() === 'GPC_PURCHASES')
    .reduce((sum, line) => sum + (line.amount || 0), 0);
  const omBilletingTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.planningOm.billeting || 0) + (unit.whiteCellOm.billeting || 0) + (unit.playerOm.billeting || 0), 0);
  const omTravelTotal = Object.values(budget.units)
    .reduce((sum, unit) =>
      sum +
      (unit.planningOm.travel || 0) + (unit.planningOm.perDiem || 0) +
      (unit.whiteCellOm.travel || 0) + (unit.whiteCellOm.perDiem || 0) +
      (unit.playerOm.travel || 0) + (unit.playerOm.perDiem || 0), 0);

  const rpaSpent = budget.totalRpa;
  const omSpent = budget.totalOm;
  const totalSpent = budget.grandTotal;

  const rpaRemaining = rpaBudgetTarget - rpaSpent;
  const omRemaining = omBudgetTarget - omSpent;
  const overallRemaining = overallBudget - totalSpent;

  const balanceColor = (remaining: number) => remaining >= 0 ? '#52c41a' : '#ff4d4f';
  const balanceTag = (remaining: number) =>
    remaining >= 0
      ? <Tag color="success">Under Budget</Tag>
      : <Tag color="error">Over Budget</Tag>;

  // Per-unit balance
  const unitData = Object.values(budget.units)
    .sort((a, b) => compareUnitCodes(a.unitCode, b.unitCode))
    .map((u) => ({
      key: u.unitCode,
      unit: getUnitDisplayLabel(u.unitCode),
      rpa: u.unitTotalRpa,
      om: u.unitTotalOm,
      total: u.unitTotal,
    }));

  const summaryColumns = [
    { title: 'Category', dataIndex: 'category', key: 'category', render: (v: string) => <strong>{v}</strong> },
    { title: 'Budget', dataIndex: 'budget', key: 'budget', render: (v: number) => fmt(v), align: 'right' as const },
    { title: 'Spent', dataIndex: 'spent', key: 'spent', render: (v: number) => fmt(v), align: 'right' as const },
    {
      title: 'Remaining', dataIndex: 'remaining', key: 'remaining', align: 'right' as const,
      render: (v: number) => <span style={{ color: balanceColor(v), fontWeight: 700 }}>{fmt(v)}</span>,
    },
    {
      title: 'Status', dataIndex: 'remaining', key: 'status',
      render: (v: number) => balanceTag(v),
    },
  ];

  const summaryData = [
    { key: 'rpa', category: 'RPA', budget: rpaBudgetTarget, spent: rpaSpent, remaining: rpaRemaining },
    { key: 'om', category: 'O&M', budget: omBudgetTarget, spent: omSpent, remaining: omRemaining },
    { key: 'overall', category: 'Overall', budget: overallBudget, spent: totalSpent, remaining: overallRemaining },
  ];

  const rpaBreakdownData = [
    { key: 'milpay', category: 'RPA Mil Pay', amount: rpaMilPayTotal },
    { key: 'travel', category: 'RPA Travel & Per Diem', amount: rpaTravelAndPerDiemTotal },
    { key: 'meals', category: 'RPA Meals - Players', amount: rpaRationsTotal },
    { key: 'at-milpay', category: 'Annual Tour Mil Pay', amount: annualTourMilPay },
    { key: 'at-travel', category: 'Annual Tour Travel', amount: annualTourTravel },
  ].filter((row) => row.amount > 0);

  const omBreakdownData = [
    { key: 'wrm', category: 'WRM', amount: omWrmTotal },
    { key: 'contracts', category: 'Contracts', amount: omContractsTotal },
    { key: 'gpc', category: 'GPC Purchases', amount: omGpcPurchasesTotal },
    { key: 'billeting', category: 'Billeting', amount: omBilletingTotal },
    { key: 'travel', category: 'Travel', amount: omTravelTotal },
  ].filter((row) => row.amount > 0);

  const breakdownColumns = [
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', render: (v: number) => fmt(v), align: 'right' as const },
  ];

  const unitColumns = [
    { title: 'Unit', dataIndex: 'unit', key: 'unit', render: (v: string) => <strong>{v}</strong> },
    { title: 'RPA', dataIndex: 'rpa', key: 'rpa', render: (v: number) => <span style={{ color: '#1677ff' }}>{fmt(v)}</span>, align: 'right' as const },
    { title: 'O&M', dataIndex: 'om', key: 'om', render: (v: number) => <span style={{ color: '#52c41a' }}>{fmt(v)}</span>, align: 'right' as const },
    { title: 'Total', dataIndex: 'total', key: 'total', render: (v: number) => <strong>{fmt(v)}</strong>, align: 'right' as const },
  ];

  return (
    <div>
      <div className="ct-page-header">
        <Typography.Title level={4} className="ct-page-title">Balance</Typography.Title>
      </div>

      <Card title="Budget Balance Summary" className="ct-section-card" style={{ marginBottom: 24 }}>
        <Table
          className="ct-table"
          dataSource={summaryData}
          columns={summaryColumns}
          pagination={false}
          size="small"
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><strong>Overall</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right"><strong>{fmt(overallBudget)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><strong>{fmt(totalSpent)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <strong style={{ color: balanceColor(overallRemaining) }}>{fmt(overallRemaining)}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4}>{balanceTag(overallRemaining)}</Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <Card title="RPA Spending Breakdown" className="ct-section-card">
          <Table
            className="ct-table"
            dataSource={rpaBreakdownData}
            columns={breakdownColumns}
            pagination={false}
            size="small"
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><strong>Total RPA Spent</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><strong style={{ color: '#1677ff' }}>{fmt(rpaSpent)}</strong></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Card>

        <Card title="O&M Spending Breakdown" className="ct-section-card">
          <Table
            className="ct-table"
            dataSource={omBreakdownData}
            columns={breakdownColumns}
            pagination={false}
            size="small"
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><strong>Total O&M Spent</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right"><strong style={{ color: '#52c41a' }}>{fmt(omSpent)}</strong></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Card>
      </div>

      <Card title="Spending by Unit" className="ct-section-card" style={{ marginBottom: 24 }}>
        <Table
          className="ct-table"
          dataSource={unitData}
          columns={unitColumns}
          pagination={false}
          size="small"
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><strong>Total</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right"><strong style={{ color: '#1677ff' }}>{fmt(rpaSpent)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><strong style={{ color: '#52c41a' }}>{fmt(omSpent)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right"><strong>{fmt(totalSpent)}</strong></Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>
    </div>
  );
}
