import { Card, Row, Col, Table, Typography, Spin } from 'antd';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid,
} from 'recharts';
import {
  DollarOutlined, TeamOutlined, RocketOutlined, SafetyCertificateOutlined,
  UserOutlined, ApartmentOutlined, CarOutlined, ToolOutlined,
} from '@ant-design/icons';
import { useApp } from '../components/AppLayout';

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function Dashboard() {
  const { exercise, budget } = useApp();

  if (!exercise || !budget) return <div className="ct-loading"><Spin size="large" /></div>;

  const unitData = Object.values(budget.units).map((u) => ({
    key: u.unitCode,
    unitCode: u.unitCode,
    rpa: u.unitTotalRpa,
    om: u.unitTotalOm,
    total: u.unitTotal,
  }));

  const omPieData = Object.entries(budget.exerciseOmCosts).map(([name, value]) => ({ name, value }));
  if (omPieData.length === 0) omPieData.push({ name: 'No O&M', value: 0 });

  const barData = unitData.map((u) => ({ name: u.unitCode, RPA: u.rpa, 'O&M': u.om }));

  const columns = [
    { title: 'Unit', dataIndex: 'unitCode', key: 'unitCode', width: 80,
      render: (v: string) => <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{v}</span> },
    { title: 'RPA', dataIndex: 'rpa', key: 'rpa', render: (v: number) => <span style={{ color: '#1677ff' }}>{fmt(v)}</span> },
    { title: 'O&M', dataIndex: 'om', key: 'om', render: (v: number) => <span style={{ color: '#52c41a' }}>{fmt(v)}</span> },
    { title: 'Total', dataIndex: 'total', key: 'total', render: (v: number) => <strong>{fmt(v)}</strong> },
  ];

  const statCards = [
    { label: 'Grand Total', value: fmt(budget.grandTotal), color: '#1a1a2e', accent: 'ct-stat-purple', icon: <DollarOutlined /> },
    { label: 'Total RPA', value: fmt(budget.totalRpa), color: '#1677ff', accent: 'ct-stat-blue', icon: <RocketOutlined /> },
    { label: 'Total O&M', value: fmt(budget.totalOm), color: '#52c41a', accent: 'ct-stat-green', icon: <SafetyCertificateOutlined /> },
    { label: 'Total PAX', value: budget.totalPax.toString(), color: '#722ed1', accent: 'ct-stat-purple', icon: <TeamOutlined /> },
  ];

  const detailCards = [
    { label: 'Players', value: budget.totalPlayers.toString(), icon: <UserOutlined /> },
    { label: 'White Cell', value: budget.totalWhiteCell.toString(), icon: <ApartmentOutlined /> },
    { label: 'RPA Travel', value: fmt(budget.rpaTravel), icon: <CarOutlined /> },
    { label: 'WRM', value: fmt(budget.wrm), icon: <ToolOutlined /> },
  ];

  return (
    <div>
      <Typography.Title level={4} className="ct-page-title">
        {exercise.name} — Dashboard
      </Typography.Title>

      {/* Primary stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }} className="ct-stagger">
        {statCards.map((s) => (
          <Col xs={12} sm={6} key={s.label}>
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

      {/* Detail stat cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 28 }} className="ct-stagger">
        {detailCards.map((s) => (
          <Col xs={12} sm={6} key={s.label}>
            <Card size="small" className="ct-stat-card" style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 8px' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, color: '#596577', flexShrink: 0,
                }}>
                  {s.icon}
                </div>
                <div>
                  <div className="ct-stat-label">{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2 }}>{s.value}</div>
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
                <Table.Summary.Cell index={1}><strong style={{ color: '#1677ff' }}>{fmt(budget.totalRpa)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={2}><strong style={{ color: '#52c41a' }}>{fmt(budget.totalOm - budget.exerciseOmTotal)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={3}><strong>{fmt(unitData.reduce((s, u) => s + u.total, 0))}</strong></Table.Summary.Cell>
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
                <Bar dataKey="RPA" fill="#1677ff" radius={[6, 6, 0, 0]} />
                <Bar dataKey="O&M" fill="#52c41a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Exercise O&M Breakdown" className="ct-section-card ct-chart-card">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={omPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={3}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#c5cdd8' }}
                >
                  {omPieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e8ecf1', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
