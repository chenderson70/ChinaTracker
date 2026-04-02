import { Card, Col, Row, Table } from 'antd';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { TeamOutlined, UserOutlined, DollarOutlined, RocketOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useApp } from './AppLayout';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function BudgetOverviewSection() {
  const { exercise, budget } = useApp();

  if (!exercise || !budget) return null;

  const unitData = Object.values(budget.units)
    .sort((left, right) => compareUnitCodes(left.unitCode, right.unitCode))
    .map((u) => ({
      key: u.unitCode,
      unitCode: u.unitCode,
      totalPax: u.totalPax,
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

  const omPlanningTravelTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.planningOm.travel || 0) + (unit.planningOm.perDiem || 0), 0);

  const omSupportExecutionTravelTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.whiteCellOm.travel || 0) + (unit.whiteCellOm.perDiem || 0), 0);

  const omTravelTotal = omPlanningTravelTotal + omSupportExecutionTravelTotal;

  const unitOmBreakdownTotal =
    omWrmTotal +
    omContractsTotal +
    omGpcPurchasesTotal +
    omTravelTotal;

  const rpaMilPayTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.planningRpa.milPay || 0) + (unit.whiteCellRpa.milPay || 0) + (unit.playerRpa.milPay || 0), 0);

  const rpaRationsTotal = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerRpa.meals || 0), 0);

  const totalPlayers = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerRpa.paxCount || 0) + (unit.playerOm.paxCount || 0), 0);

  const totalWhiteCell = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.whiteCellRpa.paxCount || 0) + (unit.whiteCellOm.paxCount || 0), 0);

  const totalLongTermA7Planners = (exercise.unitBudgets || [])
    .flatMap((unitBudget) => unitBudget.personnelGroups || [])
    .filter((group) => group.role === 'PLANNING')
    .flatMap((group) => group.personnelEntries || [])
    .reduce((sum, entry) => sum + (entry.longTermA7Planner ? (entry.count || 0) : 0), 0);

  const columns = [
    {
      title: 'Unit',
      dataIndex: 'unitCode',
      key: 'unitCode',
      width: 140,
      align: 'center' as const,
      render: (value: string) => <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{getUnitDisplayLabel(value)}</span>,
    },
    { title: 'Total PAX', dataIndex: 'totalPax', key: 'totalPax', width: 120, align: 'center' as const },
    {
      title: 'RPA',
      dataIndex: 'rpa',
      key: 'rpa',
      width: 190,
      align: 'center' as const,
      render: (value: number) => <span style={{ color: '#1677ff' }}>{fmt(value)}</span>,
    },
    {
      title: 'O&M',
      dataIndex: 'om',
      key: 'om',
      width: 190,
      align: 'center' as const,
      render: (value: number) => <span style={{ color: '#52c41a' }}>{fmt(value)}</span>,
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 190,
      align: 'center' as const,
      render: (value: number) => <strong>{fmt(value)}</strong>,
    },
  ];

  const statCards = [
    { label: 'Grand Total', value: fmt(budget.grandTotal), color: '#1a1a2e', accent: 'ct-stat-purple', icon: <DollarOutlined /> },
    { label: 'Total RPA', value: fmt(budget.totalRpa), color: '#1677ff', accent: 'ct-stat-blue', icon: <RocketOutlined /> },
    { label: 'Total O&M', value: fmt(budget.totalOm), color: '#52c41a', accent: 'ct-stat-green', icon: <SafetyCertificateOutlined /> },
  ];

  const detailCards = [
    { label: 'Total PAX', value: budget.totalPax.toString(), icon: <TeamOutlined />, color: '#722ed1', accent: 'ct-stat-purple' },
    { label: 'Planners (Only long tour A7/ Unit of Action personnel)', value: totalLongTermA7Planners.toString(), icon: <UserOutlined /> },
    { label: 'Players', value: totalPlayers.toString(), icon: <UserOutlined /> },
    { label: 'White Cell', value: totalWhiteCell.toString(), icon: <UserOutlined /> },
  ];

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }} className="ct-stagger">
        {statCards.map((s) => (
          <Col xs={24} sm={8} key={s.label}>
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
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 28 }} className="ct-stagger">
        {detailCards.map((s) => (
          <Col xs={12} sm={6} key={s.label}>
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
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="Unit Budget Summary" className="ct-section-card" style={{ marginBottom: 28 }}>
        <div className="ct-table" style={{ maxWidth: 860, margin: '0 auto' }}>
          <Table
            dataSource={unitData}
            columns={columns}
            pagination={false}
            size="small"
            tableLayout="fixed"
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} align="center"><strong>Total</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center"><strong>{budget.totalPax}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="center"><strong style={{ color: '#1677ff' }}>{fmt(budget.totalRpa)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="center"><strong style={{ color: '#52c41a' }}>{fmt(budget.totalOm - budget.exerciseOmTotal)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="center"><strong>{fmt(unitData.reduce((sum, unit) => sum + unit.total, 0))}</strong></Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>
      </Card>

      <Row gutter={[20, 20]} style={{ marginBottom: 28 }}>
        <Col xs={24} md={12}>
          <Card title="Unit Cost Comparison" className="ct-section-card ct-chart-card">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={barData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#596577', fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} tick={{ fill: '#596577', fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number) => fmt(value)}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e8ecf1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Legend wrapperStyle={{ paddingTop: 12 }} />
                <Bar dataKey="RPA" fill="#1677ff" radius={[6, 6, 0, 0]} />
                <Bar dataKey="O&M" fill="#52c41a" radius={[6, 6, 0, 0]} />
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
    </>
  );
}
