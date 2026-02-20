import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  InputNumber,
  Select,
  Switch,
  Typography,
  Table,
  Button,
  Form,
  Modal,
  Input,
  Space,
  Divider,
  Spin,
  Popconfirm,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import type { PersonnelGroup, UnitBudget, FundingType, UnitCalc, GroupCalc } from '../types';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const RANKS = [
  'AB','AMN','A1C','SRA','SSGT','TSGT','MSGT','SMSGT','CMSGT',
  '2LT','1LT','CAPT','MAJ','LTCOL','COL','BG','MG',
];

export default function UnitView() {
  const { unitCode } = useParams<{ unitCode: string }>();
  const { exercise, budget, exerciseId } = useApp();
  const queryClient = useQueryClient();
  const { data: perDiemLocations = ['GULFPORT', 'CAMP_SHELBY'] } = useQuery({
    queryKey: ['perDiemRates'],
    queryFn: api.getPerDiemRates,
    select: (rates) => Array.from(
      new Set(
        rates
          .map((r) => r.location)
          .filter((location): location is string => typeof location === 'string' && location.trim().length > 0),
      ),
    ),
  });
  const [entryModal, setEntryModal] = useState<{ groupId: string } | null>(null);
  const [execModal, setExecModal] = useState(false);
  const [entryForm] = Form.useForm();
  const [execForm] = Form.useForm();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
    queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
  };

  const updateGroupMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updatePersonnelGroup(id, data),
    onSuccess: invalidate,
  });

  const addEntryMut = useMutation({
    mutationFn: ({ groupId, data }: { groupId: string; data: any }) => api.addPersonnelEntry(groupId, data),
    onSuccess: () => { invalidate(); setEntryModal(null); entryForm.resetFields(); },
  });

  const deleteEntryMut = useMutation({
    mutationFn: (id: string) => api.deletePersonnelEntry(id),
    onSuccess: invalidate,
  });

  const updateEntryMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updatePersonnelEntry(id, data),
    onSuccess: invalidate,
  });

  const addExecMut = useMutation({
    mutationFn: ({ unitId, data }: { unitId: string; data: any }) => api.addExecutionCost(unitId, data),
    onSuccess: () => { invalidate(); setExecModal(false); execForm.resetFields(); },
  });

  const deleteExecMut = useMutation({
    mutationFn: (id: string) => api.deleteExecutionCost(id),
    onSuccess: invalidate,
  });

  if (!exercise || !budget || !unitCode) return <div className="ct-loading"><Spin size="large" /></div>;

  const ub = exercise.unitBudgets.find((u: UnitBudget) => u.unitCode === unitCode);
  const unitCalc = budget.units[unitCode];
  if (!ub || !unitCalc) return <Typography.Text>Unit not found</Typography.Text>;

  const findGroup = (role: string, ft: FundingType) =>
    ub.personnelGroups.find((g: PersonnelGroup) => g.role === role && g.fundingType === ft);

  const hasPlanningSupport = ub.personnelGroups.some((group) => group.role === 'PLANNING' || group.role === 'SUPPORT');
  const roles = hasPlanningSupport ? ['PLANNING', 'SUPPORT'] : ['PLAYER', 'WHITE_CELL'];
  const roleLabels: Record<string, string> = {
    PLAYER: 'Player',
    WHITE_CELL: 'White Cell',
    PLANNING: 'Planning',
    SUPPORT: 'Support',
  };

  const getCalc = (role: string, ft: FundingType): GroupCalc => {
    if (role === 'PLAYER' || role === 'PLANNING') {
      return ft === 'RPA' ? unitCalc.playerRpa : unitCalc.playerOm;
    }
    return ft === 'RPA' ? unitCalc.whiteCellRpa : unitCalc.whiteCellOm;
  };

  function PersonnelPanel({ role, ft }: { role: string; ft: FundingType }) {
    const group = findGroup(role, ft);
    const calc = getCalc(role, ft);
    if (!group) return null;
    const isPlayerLike = role === 'PLAYER' || role === 'PLANNING';
    const isPlayerRpa = isPlayerLike && ft === 'RPA';
    const isPlayerOm = isPlayerLike && ft === 'OM';

    const totalEntryPax = group.personnelEntries.reduce((sum, entry) => sum + entry.count, 0);

    return (
      <Card
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {roleLabels[role]}
            <span className={ft === 'RPA' ? 'ct-badge-rpa' : 'ct-badge-om'}>{ft}</span>
          </span>
        }
        size="small"
        className="ct-personnel-card"
        extra={<Space><strong>PAX: {group.paxCount || totalEntryPax}</strong><span style={{ fontSize: 16, fontWeight: 700, color: ft === 'RPA' ? '#1677ff' : '#52c41a' }}>{fmt(calc.subtotal)}</span></Space>}
      >
        <Row gutter={16} style={{ marginBottom: 12 }}>
          {!isPlayerRpa && (
            <Col span={6}>
              <Typography.Text type="secondary">Airfare/POV ($/person)</Typography.Text>
              <InputNumber
                min={0}
                value={group.airfarePerPerson ?? 400}
                style={{ width: '100%' }}
                onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { airfarePerPerson: v || 0 } })}
              />
            </Col>
          )}
          {(role === 'WHITE_CELL' || role === 'SUPPORT') && (
            <>
              <Col span={4}>
                <Typography.Text type="secondary">Rental Cars (#)</Typography.Text>
                <InputNumber
                  min={0}
                  value={group.rentalCarCount || 0}
                  style={{ width: '100%' }}
                  onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { rentalCarCount: v || 0 } })}
                />
              </Col>
              <Col span={4}>
                <Typography.Text type="secondary">Rental Rate ($/day)</Typography.Text>
                <InputNumber
                  min={0}
                  value={group.rentalCarDaily ?? 50}
                  style={{ width: '100%' }}
                  onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { rentalCarDaily: v || 0 } })}
                />
              </Col>
              <Col span={4}>
                <Typography.Text type="secondary">Rental Days</Typography.Text>
                <InputNumber
                  min={0}
                  value={group.rentalCarDays || 0}
                  style={{ width: '100%' }}
                  onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { rentalCarDays: v || 0 } })}
                />
              </Col>
            </>
          )}
        </Row>

        {/* Cost breakdown */}
        <Typography.Text style={{ color: '#1677ff', fontWeight: 600, display: 'block', marginBottom: 10 }}>
          {isPlayerRpa
            ? `Mil Pay: ${fmt(calc.milPay)} • Meals: ${fmt(calc.meals)} • Total: ${fmt(calc.subtotal)}`
            : isPlayerOm
              ? `Travel Pay: ${fmt(calc.travel)} • Per Diem: ${fmt(calc.perDiem)} • Billeting: ${fmt(calc.billeting)} • Total: ${fmt(calc.subtotal)}`
              : `Mil Pay: ${fmt(calc.milPay)} • Travel Pay: ${fmt(calc.travel)} • Per Diem: ${fmt(calc.perDiem)} • Meals: ${fmt(calc.meals)} • Billeting: ${fmt(calc.billeting)} • Total: ${fmt(calc.subtotal)}`}
        </Typography.Text>

        {/* Rank-level detail */}
        {group.personnelEntries.length > 0 && (
          <Table
            size="small"
            pagination={false}
            dataSource={group.personnelEntries.map((e) => ({ ...e, key: e.id }))}
            columns={[
              {
                title: 'Rank',
                dataIndex: 'rankCode',
                width: 110,
                render: (value, row) => (
                  <Select
                    size="small"
                    value={value}
                    style={{ width: '100%' }}
                    options={RANKS.map((r) => ({ value: r, label: r }))}
                    onChange={(v) => updateEntryMut.mutate({ id: row.id, data: { rankCode: v } })}
                  />
                ),
              },
              {
                title: 'Count',
                dataIndex: 'count',
                width: 90,
                render: (value, row) => (
                  <InputNumber
                    size="small"
                    min={1}
                    value={value}
                    style={{ width: '100%' }}
                    onChange={(v) => updateEntryMut.mutate({ id: row.id, data: { count: v || 1 } })}
                  />
                ),
              },
              {
                title: 'Duty Days',
                dataIndex: 'dutyDays',
                width: 110,
                render: (value, row) => (
                  <InputNumber
                    size="small"
                    min={1}
                    value={value ?? exercise!.defaultDutyDays}
                    style={{ width: '100%' }}
                    onChange={(v) => updateEntryMut.mutate({ id: row.id, data: { dutyDays: v || 1 } })}
                  />
                ),
              },
              {
                title: 'Location',
                dataIndex: 'location',
                width: 160,
                render: (value, row) => (
                  <Select
                    size="small"
                    value={value || 'GULFPORT'}
                    style={{ width: '100%' }}
                    options={perDiemLocations.map((loc) => ({ value: loc, label: loc }))}
                    onChange={(v) => updateEntryMut.mutate({ id: row.id, data: { location: v } })}
                  />
                ),
              },
              {
                title: 'No Travel',
                dataIndex: 'isLocal',
                width: 100,
                render: (value, row) => (
                  <Switch
                    size="small"
                    checked={!!value}
                    onChange={(v) => updateEntryMut.mutate({ id: row.id, data: { isLocal: v } })}
                  />
                ),
              },
              {
                title: '',
                width: 50,
                render: (_, row) => (
                  <Popconfirm title="Remove?" onConfirm={() => deleteEntryMut.mutate(row.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                ),
              },
            ]}
          />
        )}
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          style={{ marginTop: 8 }}
          onClick={() => setEntryModal({ groupId: group.id })}
        >
          + Add Details
        </Button>
      </Card>
    );
  }

  const execColumns = [
    { title: 'Category', dataIndex: 'category' },
    { title: 'Funding', dataIndex: 'fundingType', width: 80 },
    { title: 'Amount', dataIndex: 'amount', render: (v: number) => fmt(v) },
    { title: 'Notes', dataIndex: 'notes' },
    {
      title: '',
      width: 50,
      render: (_: any, row: any) => (
        <Popconfirm title="Remove?" onConfirm={() => deleteExecMut.mutate(row.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} className="ct-page-title">{unitCode} — Unit Budget</Typography.Title>

      {/* Summary */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }} className="ct-stagger">
        <Col xs={8}>
          <Card size="small" className="ct-stat-card ct-stat-blue" style={{ padding: '4px 0' }}>
            <div style={{ padding: '4px 12px' }}>
              <div className="ct-stat-label">Unit RPA</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1677ff', lineHeight: 1.1 }}>{fmt(unitCalc.unitTotalRpa)}</div>
            </div>
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small" className="ct-stat-card ct-stat-green" style={{ padding: '4px 0' }}>
            <div style={{ padding: '4px 12px' }}>
              <div className="ct-stat-label">Unit O&M</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#52c41a', lineHeight: 1.1 }}>{fmt(unitCalc.unitTotalOm)}</div>
            </div>
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small" className="ct-stat-card ct-stat-purple" style={{ padding: '4px 0' }}>
            <div style={{ padding: '4px 12px' }}>
              <div className="ct-stat-label">Unit Total</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', lineHeight: 1.1 }}>{fmt(unitCalc.unitTotal)}</div>
            </div>
          </Card>
        </Col>
      </Row>

      <Divider />

      {/* Personnel panels */}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Typography.Title level={5}>{roleLabels[roles[0]]} ({hasPlanningSupport ? 'Planning Cell' : 'Players'})</Typography.Title>
          <PersonnelPanel role={roles[0]} ft="RPA" />
          <PersonnelPanel role={roles[0]} ft="OM" />
        </Col>
        <Col xs={24} lg={12}>
          <Typography.Title level={5}>{roleLabels[roles[1]]} ({hasPlanningSupport ? 'Support Cell' : 'White Cell'})</Typography.Title>
          <PersonnelPanel role={roles[1]} ft="RPA" />
          <PersonnelPanel role={roles[1]} ft="OM" />
        </Col>
      </Row>

      <Divider />

      {/* Execution cost lines */}
      <Card
        title="Execution Cost Lines"
        className="ct-section-card"
        extra={<Button icon={<PlusOutlined />} type="primary" onClick={() => setExecModal(true)}>Add Cost</Button>}
      >
        <div className="ct-table">
          <Table
            size="small"
            pagination={false}
            dataSource={ub.executionCostLines.map((l) => ({ ...l, key: l.id }))}
            columns={execColumns}
            locale={{ emptyText: 'No execution cost lines yet' }}
          />
        </div>
      </Card>

      {/* Add rank entry modal */}
      <Modal
        title="Add Detail"
        open={!!entryModal}
        onOk={async () => {
          const values = await entryForm.validateFields();
          const payload = {
            rankCode: values.rankCode,
            count: values.count,
            dutyDays: values.dutyDays,
            location: values.location,
            isLocal: !!values.isLocal,
          };
          addEntryMut.mutate({ groupId: entryModal!.groupId, data: payload });
        }}
        onCancel={() => setEntryModal(null)}
      >
        <Form form={entryForm} layout="vertical">
          <Form.Item name="rankCode" label="Rank" rules={[{ required: true }]}>
            <Select options={RANKS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="count" label="Count" initialValue={1} rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="dutyDays" label="Duty Days" initialValue={exercise.defaultDutyDays} rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="location" label="Location" initialValue={perDiemLocations[0] || 'GULFPORT'} rules={[{ required: true }]}>
            <Select options={perDiemLocations.map((loc) => ({ value: loc, label: loc }))} />
          </Form.Item>
          <Form.Item name="isLocal" label="No Travel Expenses" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add execution cost modal */}
      <Modal
        title="Add Execution Cost"
        open={execModal}
        onOk={() =>
          execForm.validateFields().then((v) =>
            addExecMut.mutate({ unitId: ub.id, data: v })
          )
        }
        onCancel={() => setExecModal(false)}
      >
        <Form form={execForm} layout="vertical">
          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="fundingType" label="Funding Type" rules={[{ required: true }]}>
            <Select options={[{ value: 'RPA' }, { value: 'OM' }]} />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} prefix="$" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
