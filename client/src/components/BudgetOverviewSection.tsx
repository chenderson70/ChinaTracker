import { Card, Col, Row, Table } from 'antd';
import type { ReactNode } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  LabelList,
} from 'recharts';
import { TeamOutlined, UserOutlined, DollarOutlined, RocketOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useApp } from './AppLayout';
import BudgetHeroSummary from './BudgetHeroSummary';
import ExpenseNarrativesSection from './ExpenseNarrativesSection';
import QuarterlyBudgetAllocationSection from './QuarterlyBudgetAllocationSection';
import { renderCostBarLabel } from './charts/CostBarLabel';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';
import { formatFundingPaxBreakdown, getDisplayedPax, getPlanningEventPaxExclusions } from '../utils/paxDisplay';
import {
  A7_RPA_OM_TOTAL_LABEL,
  ANNUAL_TOUR_MIL_PAY_LABEL,
  ANNUAL_TOUR_TRAVEL_PAY_LABEL,
  getA7RpaOmTotal,
  getAnnualTourBoxTotal,
  getAnnualTourMilPayTotal,
  getAnnualTourRpaMealsTotal,
  getAnnualTourTravelPayTotal,
  OVERALL_EXERCISE_TOTAL_LABEL,
} from '../utils/budgetSummary';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const applyPlusUp = (n: number) => Number(n || 0) * 1.1;

type DetailCard = {
  label: string;
  value: string;
  icon: ReactNode;
  color?: string;
  accent?: string;
  detail?: string;
  note?: string;
};

export default function BudgetOverviewSection() {
  const { exercise, budget } = useApp();

  if (!exercise || !budget) return null;

  const siteVisitPaxExclusions = getPlanningEventPaxExclusions(exercise);
  const displayTotalPax = getDisplayedPax(budget.totalPax, siteVisitPaxExclusions.totalExcludedPax);

  const unitData = Object.values(budget.units)
    .sort((left, right) => compareUnitCodes(left.unitCode, right.unitCode))
    .map((u) => ({
      key: u.unitCode,
      unitCode: u.unitCode,
      unitDisplayName: u.unitDisplayName ?? null,
      totalPax: getDisplayedPax(u.totalPax, siteVisitPaxExclusions.excludedByUnit[String(u.unitCode || '').toUpperCase()] || 0),
      rpa: u.unitTotalRpa,
      annualTour: (u.annualTourRpa?.milPay || 0) + (u.annualTourRpa?.travel || 0) + (u.annualTourRpa?.perDiem || 0),
      om: u.unitTotalOm,
      total: u.unitTotal,
    }));

  const barData = unitData.map((u) => ({ name: getUnitDisplayLabel(u.unitCode, u.unitDisplayName), RPA: u.rpa, 'O&M': u.om }));

  const allExecutionOmLines = (exercise.unitBudgets || [])
    .flatMap((u) => u.executionCostLines || [])
    .filter((line) => line.fundingType === 'OM');
  const allExerciseOmLines = exercise.omCostLines || [];

  const getExerciseOmCategoryTotal = (category: string) => allExerciseOmLines
    .filter((line) => String(line.category || '').toUpperCase() === category)
    .reduce((sum, line) => sum + (line.amount || 0), 0);

  const executionOmWrmTotal = allExecutionOmLines
    .filter((line) => {
      const category = String(line.category || '').toUpperCase();
      return category === 'WRM' || category === 'UFR';
    })
    .reduce((sum, line) => sum + (line.amount || 0), 0);
  const omWrmTotal = executionOmWrmTotal + getExerciseOmCategoryTotal('WRM');

  const executionOmContractsTotal = allExecutionOmLines
    .filter((line) => String(line.category || '').toUpperCase() === 'TITLE_CONTRACTS')
    .reduce((sum, line) => sum + (line.amount || 0), 0);
  const omContractsTotal = executionOmContractsTotal + getExerciseOmCategoryTotal('CONTRACT');

  const executionOmGpcPurchasesTotal = allExecutionOmLines
    .filter((line) => String(line.category || '').toUpperCase() === 'GPC_PURCHASES')
    .reduce((sum, line) => sum + (line.amount || 0), 0);
  const omGpcPurchasesTotal = executionOmGpcPurchasesTotal + getExerciseOmCategoryTotal('GPC_PURCHASES');

  const personnelOmBilletingTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.planningOm.billeting || 0) + (unit.whiteCellOm.billeting || 0) + (unit.playerOm.billeting || 0), 0);
  const omBilletingTotal = personnelOmBilletingTotal + getExerciseOmCategoryTotal('BILLETING');

  const personnelOmTravelTotal = Object.values(budget.units)
    .reduce(
      (sum, unit) =>
        sum +
        (unit.planningOm.travel || 0) +
        (unit.planningOm.perDiem || 0) +
        (unit.whiteCellOm.travel || 0) +
        (unit.whiteCellOm.perDiem || 0) +
        (unit.playerOm.travel || 0) +
        (unit.playerOm.perDiem || 0),
      0,
    );
  const omTravelTotal = personnelOmTravelTotal + getExerciseOmCategoryTotal('TRANSPORTATION');

  const otherExecutionOmTotal = allExecutionOmLines
    .filter((line) => !['WRM', 'UFR', 'TITLE_CONTRACTS', 'GPC_PURCHASES'].includes(String(line.category || '').toUpperCase()))
    .reduce((sum, line) => sum + (line.amount || 0), 0);
  const otherExerciseOmTotal = allExerciseOmLines
    .filter((line) => !['WRM', 'CONTRACT', 'GPC_PURCHASES', 'BILLETING', 'TRANSPORTATION'].includes(String(line.category || '').toUpperCase()))
    .reduce((sum, line) => sum + (line.amount || 0), 0);
  const otherOmBreakdownTotal = otherExecutionOmTotal + otherExerciseOmTotal;
  const allOtherOmCostsTotal = Math.max(0, budget.totalOm - omTravelTotal);

  const unitOmBreakdownTotal =
    omWrmTotal +
    omContractsTotal +
    omGpcPurchasesTotal +
    omBilletingTotal +
    omTravelTotal +
    otherOmBreakdownTotal;

  const rpaMilPayTotal = Object.values(budget.units)
    .reduce(
      (sum, unit) =>
        sum +
        (unit.planningRpa.milPay || 0) +
        (unit.whiteCellRpa.milPay || 0) +
        (unit.playerRpa.milPay || 0),
      0,
    );
  const rpaPerDiemTotal = Object.values(budget.units)
    .reduce(
      (sum, unit) =>
        sum +
        (unit.planningRpa.perDiem || 0) +
        (unit.whiteCellRpa.perDiem || 0) +
        (unit.playerRpa.perDiem || 0),
      0,
    );
  const executionRpaTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.executionRpa || 0), 0);
  const rpaTravelAndPerDiemTotal = budget.rpaTravel + rpaPerDiemTotal + executionRpaTotal;

  const annualTourMealsTotal = getAnnualTourRpaMealsTotal(budget);
  const rpaRationsTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerRpa.meals || 0), 0) + annualTourMealsTotal;
  const annualTourMilPayTotal = getAnnualTourMilPayTotal(budget);
  const annualTourTravelPayTotal = getAnnualTourTravelPayTotal(budget);
  const annualTourBoxTotal = getAnnualTourBoxTotal(budget);
  const a7BudgetPlanningTotal = getA7RpaOmTotal(budget);
  const overallExerciseTotalLabel = OVERALL_EXERCISE_TOTAL_LABEL;
  const a7PlanningTotalLabel = A7_RPA_OM_TOTAL_LABEL;

  const totalPlayers = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerRpa.paxCount || 0) + (unit.playerOm.paxCount || 0), 0);
  const totalPlayersRpa = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerRpa.paxCount || 0), 0);
  const totalPlayersOm = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerOm.paxCount || 0), 0);

  const totalWhiteCell = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.whiteCellRpa.paxCount || 0) + (unit.whiteCellOm.paxCount || 0), 0);
  const totalWhiteCellRpa = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.whiteCellRpa.paxCount || 0), 0);
  const totalWhiteCellOm = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.whiteCellOm.paxCount || 0), 0);
  const totalAnnualTour = budget.totalAnnualTour || 0;

  const totalLongTermA7Planners = (exercise.unitBudgets || [])
    .flatMap((unitBudget) => unitBudget.personnelGroups || [])
    .filter((group) => group.role === 'PLANNING')
    .flatMap((group) => group.personnelEntries || [])
    .reduce((sum, entry) => sum + (entry.longTermA7Planner ? (entry.count || 0) : 0), 0);
  const longTermPlannerFundingBreakdown = (exercise.unitBudgets || [])
    .flatMap((unitBudget) => unitBudget.personnelGroups || [])
    .filter((group) => group.role === 'PLANNING')
    .reduce(
      (totals, group) => {
        const plannerCount = (group.personnelEntries || [])
          .reduce((sum, entry) => sum + (entry.longTermA7Planner ? Number(entry.count || 0) : 0), 0);
        if (String(group.fundingType || '').toUpperCase() === 'OM') {
          totals.om += plannerCount;
        } else {
          totals.rpa += plannerCount;
        }
        return totals;
      },
      { rpa: 0, om: 0 },
    );

  const columns = [
    {
      title: 'Unit',
      dataIndex: 'unitCode',
      key: 'unitCode',
      width: 140,
      align: 'center' as const,
      render: (_value: string, record: { unitCode: string; unitDisplayName?: string | null }) => (
        <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{getUnitDisplayLabel(record.unitCode, record.unitDisplayName)}</span>
      ),
    },
    { title: 'Total PAX', dataIndex: 'totalPax', key: 'totalPax', width: 120, align: 'center' as const },
    {
      title: 'RPA',
      dataIndex: 'rpa',
      key: 'rpa',
      width: 170,
      align: 'center' as const,
      render: (value: number) => <span style={{ color: '#1677ff' }}>{fmt(value)}</span>,
    },
    {
      title: 'Annual Tour',
      dataIndex: 'annualTour',
      key: 'annualTour',
      width: 170,
      align: 'center' as const,
      render: (value: number) => <span style={{ color: '#0958d9' }}>{fmt(value)}</span>,
    },
    {
      title: 'O&M',
      dataIndex: 'om',
      key: 'om',
      width: 170,
      align: 'center' as const,
      render: (value: number) => <span style={{ color: '#52c41a' }}>{fmt(value)}</span>,
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 170,
      align: 'center' as const,
      render: (value: number) => <strong>{fmt(value)}</strong>,
    },
  ];

  const statCards = [
    {
      label: 'Total RPA',
      value: fmt(budget.totalRpa),
      color: '#1677ff',
      accent: 'ct-stat-blue',
      icon: <RocketOutlined />,
      detailLines: [
        { label: 'RPA Mil Pay', value: fmt(rpaMilPayTotal) },
        { label: 'RPA Travel & Per Diem', value: fmt(rpaTravelAndPerDiemTotal) },
        { label: 'RPA Meals - Players', value: fmt(rpaRationsTotal) },
      ],
    },
    {
      label: 'Total O&M',
      value: fmt(budget.totalOm),
      color: '#52c41a',
      accent: 'ct-stat-green',
      icon: <SafetyCertificateOutlined />,
      detailLines: [
        { label: 'O&M Travel', value: fmt(omTravelTotal) },
        { label: 'All Other O&M Costs', value: fmt(allOtherOmCostsTotal) },
      ],
    },
    {
      label: 'Annual Tour',
      value: fmt(annualTourBoxTotal),
      color: '#0958d9',
      accent: 'ct-stat-blue',
      icon: <UserOutlined />,
      detailLines: [
        { label: ANNUAL_TOUR_MIL_PAY_LABEL, value: fmt(annualTourMilPayTotal) },
        { label: ANNUAL_TOUR_TRAVEL_PAY_LABEL, value: fmt(annualTourTravelPayTotal) },
      ],
    },
  ];
  const plusUpStatCards = [
    {
      label: 'Grand Total',
      badge: '10% Plus-Up',
      color: '#1a1a2e',
      accent: 'ct-stat-purple',
      icon: <DollarOutlined />,
      sections: [
        { label: overallExerciseTotalLabel, value: fmt(applyPlusUp(budget.grandTotal)) },
        { label: a7PlanningTotalLabel, value: fmt(applyPlusUp(a7BudgetPlanningTotal)) },
      ],
    },
    {
      label: 'Total RPA',
      badge: '10% Plus-Up',
      value: fmt(applyPlusUp(budget.totalRpa)),
      color: '#1677ff',
      accent: 'ct-stat-blue',
      icon: <RocketOutlined />,
      detailLines: [
        { label: 'RPA Mil Pay', value: fmt(applyPlusUp(rpaMilPayTotal)) },
        { label: 'RPA Travel & Per Diem', value: fmt(applyPlusUp(rpaTravelAndPerDiemTotal)) },
        { label: 'RPA Meals - Players', value: fmt(applyPlusUp(rpaRationsTotal)) },
      ],
    },
    {
      label: 'Total O&M',
      badge: '10% Plus-Up',
      value: fmt(applyPlusUp(budget.totalOm)),
      color: '#52c41a',
      accent: 'ct-stat-green',
      icon: <SafetyCertificateOutlined />,
      detailLines: [
        { label: 'O&M Travel', value: fmt(applyPlusUp(omTravelTotal)) },
        { label: 'All Other O&M Costs', value: fmt(applyPlusUp(allOtherOmCostsTotal)) },
      ],
    },
    {
      label: 'Annual Tour',
      badge: '10% Plus-Up',
      value: fmt(applyPlusUp(annualTourBoxTotal)),
      color: '#0958d9',
      accent: 'ct-stat-blue',
      icon: <UserOutlined />,
      detailLines: [
        { label: ANNUAL_TOUR_MIL_PAY_LABEL, value: fmt(applyPlusUp(annualTourMilPayTotal)) },
        { label: ANNUAL_TOUR_TRAVEL_PAY_LABEL, value: fmt(applyPlusUp(annualTourTravelPayTotal)) },
      ],
    },
  ];

  const detailCards: DetailCard[] = [
    { label: 'Total PAX', value: displayTotalPax.toString(), icon: <TeamOutlined />, color: '#722ed1', accent: 'ct-stat-purple' },
    {
      label: 'Planners (Only long tour A7/ Unit of Action personnel)',
      value: totalLongTermA7Planners.toString(),
      detail: formatFundingPaxBreakdown(longTermPlannerFundingBreakdown.rpa, longTermPlannerFundingBreakdown.om),
      icon: <UserOutlined />,
    },
    {
      label: 'Players - Annual Tour',
      value: totalAnnualTour.toString(),
      icon: <UserOutlined />,
    },
    {
      label: 'Players - RPA',
      value: totalPlayers.toString(),
      icon: <UserOutlined />,
    },
    {
      label: 'White Cell & Exercise Support',
      value: totalWhiteCell.toString(),
      detail: formatFundingPaxBreakdown(totalWhiteCellRpa, totalWhiteCellOm),
      icon: <UserOutlined />,
    },
  ];

  return (
    <>
      <BudgetHeroSummary
        grandTotal={budget.grandTotal}
        a7BudgetPlanningTotal={a7BudgetPlanningTotal}
        overallExerciseTotalLabel={overallExerciseTotalLabel}
        a7PlanningTotalLabel={a7PlanningTotalLabel}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }} className="ct-stagger ct-print-stat-row" justify="center">
        {statCards.map((s) => (
          <Col xs={24} sm={12} lg={8} key={s.label} className="ct-print-stat-col">
            <Card size="small" className={`ct-stat-card ${s.accent}`} style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: `${s.color}10`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    color: s.color,
                    flexShrink: 0,
                  }}
                >
                  {s.icon}
                </div>
                <div>
                  <div className="ct-stat-label">{s.label}</div>
                  <div className="ct-stat-value" style={{ color: s.color }}>{s.value}</div>
                  {s.detailLines ? (
                    <div className="ct-stat-breakdown">
                      {s.detailLines.map((detail) => (
                        <div key={detail.label} className="ct-stat-breakdown-line">
                          <span>{detail.label}</span>
                          <span>{detail.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }} className="ct-stagger ct-print-plusup-row">
        {plusUpStatCards.map((s) => (
          <Col xs={24} sm={12} xl={6} key={s.label} className="ct-print-no-break">
            <Card size="small" className={`ct-stat-card ct-stat-plusup-card ct-print-no-break ${s.accent}`} style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: `${s.color}10`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    color: s.color,
                    flexShrink: 0,
                  }}
                >
                  {s.icon}
                </div>
                <div>
                  <div className="ct-stat-label-row">
                    <div className="ct-stat-label">{s.label}</div>
                    <span className="ct-stat-plusup-chip">{s.badge}</span>
                  </div>
                  {s.sections ? (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {s.sections.map((section, index) => (
                        <div
                          key={section.label}
                          style={index === 0 ? undefined : { paddingTop: 8, borderTop: '1px solid #f0e2b2' }}
                        >
                          <div className="ct-stat-label" style={{ fontSize: 10 }}>{section.label}</div>
                          <div className="ct-stat-value" style={{ color: s.color, fontSize: 20 }}>{section.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="ct-stat-value" style={{ color: s.color }}>{s.value}</div>
                      {s.detailLines ? (
                        <div className="ct-stat-breakdown">
                          {s.detailLines.map((detail) => (
                            <div key={detail.label} className="ct-stat-breakdown-line">
                              <span>{detail.label}</span>
                              <span>{detail.value}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 28 }} className="ct-stagger ct-print-detail-row">
        {detailCards.map((s) => (
          <Col key={s.label} flex="1 1 0" style={{ minWidth: 220 }} className="ct-print-detail-col">
            <Card size="small" className={`ct-stat-card ${s.accent || ''}`} style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: s.color ? `${s.color}10` : '#f0f4f8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    color: s.color || '#596577',
                    flexShrink: 0,
                  }}
                >
                  {s.icon}
                </div>
                <div>
                  <div className="ct-stat-label">{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color || '#1a1a2e', lineHeight: 1.2 }}>{s.value}</div>
                  {s.detail ? <div className="ct-stat-subdetail">{s.detail}</div> : null}
                  {s.note ? <div className="ct-stat-note">{s.note}</div> : null}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <QuarterlyBudgetAllocationSection />

      <ExpenseNarrativesSection />

      <Card title="Unit Budget Summary" className="ct-section-card" style={{ marginBottom: 28 }}>
        <div className="ct-table" style={{ maxWidth: 1040, margin: '0 auto' }}>
          <Table
            dataSource={unitData}
            columns={columns}
            pagination={false}
            size="small"
            tableLayout="fixed"
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} align="center"><strong>Total</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center"><strong>{displayTotalPax}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="center"><strong style={{ color: '#1677ff' }}>{fmt(budget.totalRpa)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="center"><strong style={{ color: '#0958d9' }}>{fmt(annualTourBoxTotal)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="center"><strong style={{ color: '#52c41a' }}>{fmt(budget.totalOm - budget.exerciseOmTotal)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="center"><strong>{fmt(unitData.reduce((sum, unit) => sum + unit.total, 0))}</strong></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      </Card>

      <Row gutter={[20, 20]} style={{ marginBottom: 28 }}>
        <Col xs={24} md={12}>
          <Card title="Unit Cost Comparison" className="ct-section-card ct-chart-card">
            <ResponsiveContainer width="100%" height={320} className="ct-print-chart-container">
              <BarChart data={barData} barCategoryGap="25%" margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#596577', fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fill: '#596577', fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => fmt(value)}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e8ecf1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Legend wrapperStyle={{ paddingTop: 12 }} />
                <Bar dataKey="RPA" fill="#1677ff" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="RPA" content={renderCostBarLabel} />
                </Bar>
                <Bar dataKey="O&M" fill="#52c41a" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="O&M" content={renderCostBarLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" className="ct-stat-card ct-stat-green" style={{ minHeight: 320 }}>
            <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 28 }}>
              <div>
                <div className="ct-stat-label">O&amp;M</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#52c41a', lineHeight: 1.1, marginTop: 2 }}>
                  {fmt(unitOmBreakdownTotal)}
                </div>
                <div style={{ marginTop: 10, fontSize: 15, color: '#596577', lineHeight: 1.45 }}>
                  <div>WRM: {fmt(omWrmTotal)}</div>
                  <div>Contracts: {fmt(omContractsTotal)}</div>
                  <div>GPC Purchases: {fmt(omGpcPurchasesTotal)}</div>
                  {omBilletingTotal > 0 && <div>Billeting: {fmt(omBilletingTotal)}</div>}
                  <div>Travel: {fmt(omTravelTotal)}</div>
                  {otherOmBreakdownTotal > 0 && <div>All Other O&amp;M: {fmt(otherOmBreakdownTotal)}</div>}
                </div>
              </div>

              <div style={{ borderLeft: '1px solid #d6dde8', paddingLeft: 20 }}>
                <div className="ct-stat-label">RPA</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#1677ff', lineHeight: 1.1, marginTop: 2 }}>
                  {fmt(budget.totalRpa)}
                </div>
                <div style={{ marginTop: 10, fontSize: 15, color: '#596577', lineHeight: 1.45 }}>
                  <div>RPA Mil Pay: {fmt(rpaMilPayTotal)}</div>
                  <div>RPA Travel &amp; Per Diem: {fmt(rpaTravelAndPerDiemTotal)}</div>
                  <div>RPA Meals - Players: {fmt(rpaRationsTotal)}</div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </>
  );
}
