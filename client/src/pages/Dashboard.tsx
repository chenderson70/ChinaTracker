import { Card, Row, Col, Table, Typography, Spin, Button, Space, message } from 'antd';
import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid,
  LabelList,
} from 'recharts';
import {
  DollarOutlined, TeamOutlined, RocketOutlined, SafetyCertificateOutlined,
  UserOutlined, FilePdfOutlined,
} from '@ant-design/icons';
import { useApp } from '../components/AppLayout';
import { renderCostBarLabel } from '../components/charts/CostBarLabel';
import * as api from '../services/api';
import { exportElementToPdf } from '../services/pdf';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';
import { formatFundingPaxBreakdown, getDisplayedPax, getPlanningEventPaxExclusions, getSupportOmPaxExclusions } from '../utils/paxDisplay';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtDelta = (n: number) => (n < 0 ? `-${fmt(Math.abs(n))}` : fmt(n));
const dangerColor = '#ff4d4f';
const applyPlusUp = (n: number) => Number(n || 0) * 1.1;

export default function Dashboard() {
  const { exercise, budget } = useApp();
  const { data: appConfig = {} } = useQuery({ queryKey: ['appConfig'], queryFn: api.getAppConfig });
  const exportRef = useRef<HTMLDivElement>(null);

  if (!exercise || !budget) return <div className="ct-loading"><Spin size="large" /></div>;

  const siteVisitPaxExclusions = getPlanningEventPaxExclusions(exercise);
  const supportOmPaxExclusions = getSupportOmPaxExclusions(exercise);
  const displayTotalPax = getDisplayedPax(budget.totalPax, siteVisitPaxExclusions.totalExcludedPax);
  const supportOmExclusionEntries = Object.entries(supportOmPaxExclusions.excludedByUnit).filter(([, count]) => count > 0);
  const supportOmExclusionNote = supportOmExclusionEntries.length === 1
    ? `Includes ${supportOmExclusionEntries[0][1]} ${getUnitDisplayLabel(supportOmExclusionEntries[0][0])} Support O&M excluded from Total PAX`
    : supportOmPaxExclusions.totalExcludedPax > 0
      ? `Includes ${supportOmPaxExclusions.totalExcludedPax} Support O&M excluded from Total PAX`
      : '';

  const unitData = Object.values(budget.units)
    .sort((left, right) => compareUnitCodes(left.unitCode, right.unitCode))
    .map((u) => ({
      key: u.unitCode,
      unitCode: u.unitCode,
      totalPax: getDisplayedPax(u.totalPax, siteVisitPaxExclusions.excludedByUnit[String(u.unitCode || '').toUpperCase()] || 0),
      rpa: u.unitTotalRpa,
      om: u.unitTotalOm,
      total: u.unitTotal,
    }));

  const barData = unitData.map((u) => ({ name: getUnitDisplayLabel(u.unitCode), RPA: u.rpa, 'O&M': u.om }));

  const allExecutionOmLines = (exercise.unitBudgets || [])
    .flatMap((u) => u.executionCostLines || [])
    .filter((line) => line.fundingType === 'OM');

  const omWrmTotal = allExecutionOmLines
    .filter((line) => {
      const category = String(line.category || '').toUpperCase();
      return category === 'WRM' || category === 'UFR';
    })
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

  const unitOmBreakdownTotal =
    omWrmTotal +
    omContractsTotal +
    omGpcPurchasesTotal +
    omBilletingTotal +
    omTravelTotal;

  const rpaMilPayTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.planningRpa.milPay || 0) + (unit.whiteCellRpa.milPay || 0) + (unit.playerRpa.milPay || 0), 0);

  const rpaRationsTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerRpa.meals || 0), 0);

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
    { title: 'Unit', dataIndex: 'unitCode', key: 'unitCode', width: 80,
      render: (v: string) => <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{getUnitDisplayLabel(v)}</span> },
    { title: 'Total PAX', dataIndex: 'totalPax', key: 'totalPax', width: 100 },
    { title: 'RPA', dataIndex: 'rpa', key: 'rpa', render: (v: number) => <span style={{ color: '#1677ff' }}>{fmt(v)}</span> },
    { title: 'O&M', dataIndex: 'om', key: 'om', render: (v: number) => <span style={{ color: '#52c41a' }}>{fmt(v)}</span> },
    { title: 'Total', dataIndex: 'total', key: 'total', render: (v: number) => <strong>{fmt(v)}</strong> },
  ];

  const targetRpa = Number(appConfig.BUDGET_TARGET_RPA || 0);
  const targetOm = Number(appConfig.BUDGET_TARGET_OM || 0);
  const totalBudget = Number(exercise.totalBudget || 0);
  const totalBudgetLeft = totalBudget - budget.grandTotal;
  const rpaRemainingBudget = targetRpa - budget.totalRpa;
  const omRemainingBudget = targetOm - budget.totalOm;
  const totalBudgetLeftColor = totalBudgetLeft < 0 ? dangerColor : '#1a1a2e';
  const rpaRemainingBudgetColor = rpaRemainingBudget < 0 ? dangerColor : '#1677ff';
  const omRemainingBudgetColor = omRemainingBudget < 0 ? dangerColor : '#52c41a';

  const statCards = [
    { label: 'Grand Total', value: fmt(budget.grandTotal), color: '#1a1a2e', accent: 'ct-stat-purple', icon: <DollarOutlined /> },
    { label: 'Total RPA', value: fmt(budget.totalRpa), color: '#1677ff', accent: 'ct-stat-blue', icon: <RocketOutlined /> },
    { label: 'Total O&M', value: fmt(budget.totalOm), color: '#52c41a', accent: 'ct-stat-green', icon: <SafetyCertificateOutlined /> },
  ];
  const plusUpStatCards = [
    { label: 'Grand Total', badge: '10% Plus-Up', value: fmt(applyPlusUp(budget.grandTotal)), color: '#1a1a2e', accent: 'ct-stat-purple', icon: <DollarOutlined /> },
    { label: 'Total RPA', badge: '10% Plus-Up', value: fmt(applyPlusUp(budget.totalRpa)), color: '#1677ff', accent: 'ct-stat-blue', icon: <RocketOutlined /> },
    { label: 'Total O&M', badge: '10% Plus-Up', value: fmt(applyPlusUp(budget.totalOm)), color: '#52c41a', accent: 'ct-stat-green', icon: <SafetyCertificateOutlined /> },
  ];

  const detailCards = [
    { label: 'Total PAX', value: displayTotalPax.toString(), icon: <TeamOutlined />, color: '#722ed1', accent: 'ct-stat-purple' },
    {
      label: 'Planners (Only long tour A7/ Unit of Action personnel)',
      value: totalLongTermA7Planners.toString(),
      detail: formatFundingPaxBreakdown(longTermPlannerFundingBreakdown.rpa, longTermPlannerFundingBreakdown.om),
      icon: <UserOutlined />,
    },
    {
      label: 'Players',
      value: totalPlayers.toString(),
      detail: formatFundingPaxBreakdown(totalPlayersRpa, totalPlayersOm),
      icon: <UserOutlined />,
    },
    {
      label: 'White Cell & Exercise Support',
      value: totalWhiteCell.toString(),
      detail: formatFundingPaxBreakdown(totalWhiteCellRpa, totalWhiteCellOm),
      note: supportOmExclusionNote,
      icon: <UserOutlined />,
    },
  ];

  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    try {
      await exportElementToPdf(`${exercise.name} Dashboard`, exportRef.current);
    } catch (error: any) {
      message.error(error?.message || 'Unable to export dashboard to PDF');
    }
  };

  return (
    <div ref={exportRef}>
      <div className="ct-page-header">
        <Typography.Title level={4} className="ct-page-title">
            {exercise.name} — Dashboard
        </Typography.Title>
        <div className="ct-page-actions">
          <Space wrap>
            <Button icon={<FilePdfOutlined />} onClick={handleExportPdf}>
              Export to PDF
            </Button>
          </Space>
        </div>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={8}>
          <Card size="small" className="ct-stat-card" style={{ padding: '8px 0' }}>
            <div style={{ padding: '6px 12px', textAlign: 'center' }}>
              <div className="ct-stat-label">Total Budget Left</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: totalBudgetLeftColor, lineHeight: 1.2 }}>{fmtDelta(totalBudgetLeft)}</div>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card size="small" className="ct-stat-card" style={{ padding: '8px 0' }}>
            <div style={{ padding: '6px 12px', textAlign: 'center' }}>
              <div className="ct-stat-label" style={{ fontSize: 18, textDecoration: 'underline', textUnderlineOffset: 4 }}>
                RPA
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1677ff', lineHeight: 1.2 }}>
                Target {fmt(targetRpa)}
              </div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: '#596577', textDecoration: 'underline', textUnderlineOffset: 3 }}>Remaining Budget</div>
              <div style={{ marginTop: 2, fontSize: 20, fontWeight: 800, color: rpaRemainingBudgetColor, lineHeight: 1.2 }}>
                {fmtDelta(rpaRemainingBudget)}
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card size="small" className="ct-stat-card" style={{ padding: '8px 0' }}>
            <div style={{ padding: '6px 12px', textAlign: 'center' }}>
              <div className="ct-stat-label" style={{ fontSize: 18, textDecoration: 'underline', textUnderlineOffset: 4 }}>
                O&amp;M
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#52c41a', lineHeight: 1.2 }}>
                Target {fmt(targetOm)}
              </div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: '#596577', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Remaining Budget
              </div>
              <div style={{ marginTop: 2, fontSize: 20, fontWeight: 800, color: omRemainingBudgetColor, lineHeight: 1.2 }}>
                {fmtDelta(omRemainingBudget)}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Primary stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }} className="ct-stagger">
        {statCards.map((s) => (
          <Col xs={24} sm={8} key={s.label}>
            <Card size="small" className={`ct-stat-card ${s.accent}`} style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${s.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, color: s.color, flexShrink: 0,
                }}>
                  {s.icon}
                </div>
                <div>
                  <div className="ct-stat-label">{s.label}</div>
                  <div className="ct-stat-value" style={{ color: s.color }}>{s.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }} className="ct-stagger">
        {plusUpStatCards.map((s) => (
          <Col xs={24} sm={8} key={s.label}>
            <Card size="small" className={`ct-stat-card ct-stat-plusup-card ${s.accent}`} style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${s.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, color: s.color, flexShrink: 0,
                }}>
                  {s.icon}
                </div>
                <div>
                  <div className="ct-stat-label-row">
                    <div className="ct-stat-label">{s.label}</div>
                    <span className="ct-stat-plusup-chip">{s.badge}</span>
                  </div>
                  <div className="ct-stat-value" style={{ color: s.color }}>{s.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Detail stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 28 }} className="ct-stagger">
        {detailCards.map((s) => (
          <Col xs={12} sm={6} key={s.label}>
            <Card size="small" className={`ct-stat-card ${s.accent || ''}`} style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: s.color ? `${s.color}10` : '#f0f4f8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, color: s.color || '#596577', flexShrink: 0,
                }}>
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

      {/* Unit table */}
      <Card title="Unit Budget Summary" className="ct-section-card" style={{ marginBottom: 28 }}>
        <div className="ct-table">
          <Table dataSource={unitData} columns={columns} pagination={false} size="small"
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><strong>Total</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1}><strong>{displayTotalPax}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={2}><strong style={{ color: '#1677ff' }}>{fmt(budget.totalRpa)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={3}><strong style={{ color: '#52c41a' }}>{fmt(budget.totalOm - budget.exerciseOmTotal)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={4}><strong>{fmt(unitData.reduce((s, u) => s + u.total, 0))}</strong></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      </Card>

      {/* Charts */}
      <Row gutter={[20, 20]}>
        <Col xs={24} md={12}>
          <Card title="Unit Cost Comparison" className="ct-section-card ct-chart-card">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={barData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#596577', fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fill: '#596577', fontSize: 12 }} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
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
                <div className="ct-stat-label">UNIT O&amp;M</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#52c41a', lineHeight: 1.1, marginTop: 2 }}>
                  {fmt(unitOmBreakdownTotal)}
                </div>
                <div style={{ marginTop: 10, fontSize: 15, color: '#596577', lineHeight: 1.45 }}>
                  <div>WRM: {fmt(omWrmTotal)}</div>
                  <div>Contracts: {fmt(omContractsTotal)}</div>
                  <div>GPC Purchases: {fmt(omGpcPurchasesTotal)}</div>
                  {omBilletingTotal > 0 && <div>Billeting: {fmt(omBilletingTotal)}</div>}
                  <div>Travel: {fmt(omTravelTotal)}</div>
                </div>
              </div>

              <div style={{ borderLeft: '1px solid #d6dde8', paddingLeft: 20 }}>
                <div className="ct-stat-label">RPA</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#1677ff', lineHeight: 1.1, marginTop: 2 }}>
                  {fmt(budget.totalRpa)}
                </div>
                <div style={{ marginTop: 10, fontSize: 15, color: '#596577', lineHeight: 1.45 }}>
                  <div>RPA Mil Pay: {fmt(rpaMilPayTotal)}</div>
                  <div>RPA Travel: {fmt(budget.rpaTravel)}</div>
                  <div>Player Meals: {fmt(rpaRationsTotal)}</div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
