import { Card, Row, Col, Table, Typography, Spin } from 'antd';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useApp } from '../components/AppLayout';

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];
const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function Dashboard() {
  const { exercise, budget } = useApp();

  if (!exercise || !budget) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

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
    { title: 'Unit', dataIndex: 'unitCode', key: 'unitCode', width: 80 },
    { title: 'RPA', dataIndex: 'rpa', key: 'rpa', render: fmt },
    { title: 'O&M', dataIndex: 'om', key: 'om', render: fmt },
    { title: 'Total', dataIndex: 'total', key: 'total', render: (v: number) => <strong>{fmt(v)}</strong> },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        {exercise.name} — Dashboard
      </Typography.Title>

      {/* Summary cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Typography.Text type="secondary">Grand Total</Typography.Text>
            <Typography.Title level={3} style={{ margin: 0 }}>{fmt(budget.grandTotal)}</Typography.Title>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Typography.Text type="secondary">Total RPA</Typography.Text>
            <Typography.Title level={3} style={{ margin: 0, color: '#1677ff' }}>{fmt(budget.totalRpa)}</Typography.Title>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Typography.Text type="secondary">Total O&M</Typography.Text>
            <Typography.Title level={3} style={{ margin: 0, color: '#52c41a' }}>{fmt(budget.totalOm)}</Typography.Title>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Typography.Text type="secondary">Total PAX</Typography.Text>
            <Typography.Title level={3} style={{ margin: 0 }}>{budget.totalPax}</Typography.Title>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Typography.Text type="secondary">Players</Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>{budget.totalPlayers}</Typography.Title>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Typography.Text type="secondary">White Cell</Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>{budget.totalWhiteCell}</Typography.Title>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Typography.Text type="secondary">RPA Travel</Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>{fmt(budget.rpaTravel)}</Typography.Title>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Typography.Text type="secondary">WRM</Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>{fmt(budget.wrm)}</Typography.Title>
          </Card>
        </Col>
      </Row>

      {/* Unit table */}
      <Card title="Unit Budget Summary" style={{ marginBottom: 24 }}>
        <Table dataSource={unitData} columns={columns} pagination={false} size="small"
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><strong>Total</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={1}><strong>{fmt(budget.totalRpa)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={2}><strong>{fmt(budget.totalOm - budget.exerciseOmTotal)}</strong></Table.Summary.Cell>
              <Table.Summary.Cell index={3}><strong>{fmt(unitData.reduce((s, u) => s + u.total, 0))}</strong></Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>

      {/* Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="Unit Cost Comparison">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="RPA" fill="#1677ff" />
                <Bar dataKey="O&M" fill="#52c41a" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Exercise O&M Breakdown">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={omPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {omPieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
