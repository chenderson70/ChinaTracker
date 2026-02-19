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
  Statistic,
  message,
  Popconfirm,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import type { PersonnelGroup, UnitBudget, FundingType, UnitCalc, GroupCalc } from '../types';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const RANKS = [
  'E-1','E-2','E-3','E-4','E-5','E-6','E-7','E-8','E-9',
  'W-1','W-2','W-3','W-4','W-5',
  'O-1','O-2','O-3','O-4','O-5','O-6','O-7','O-8','O-9','O-10',
];

export default function UnitView() {
  const { unitCode } = useParams<{ unitCode: string }>();
  const { exercise, budget, exerciseId, refetchBudget, refetchExercise } = useApp();
  const queryClient = useQueryClient();
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

  const addExecMut = useMutation({
    mutationFn: ({ unitId, data }: { unitId: string; data: any }) => api.addExecutionCost(unitId, data),
    onSuccess: () => { invalidate(); setExecModal(false); execForm.resetFields(); },
  });

  const deleteExecMut = useMutation({
    mutationFn: (id: string) => api.deleteExecutionCost(id),
    onSuccess: invalidate,
  });

  if (!exercise || !budget || !unitCode) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const ub = exercise.unitBudgets.find((u: UnitBudget) => u.unitCode === unitCode);
  const unitCalc = budget.units[unitCode];
  if (!ub || !unitCalc) return <Typography.Text>Unit not found</Typography.Text>;

  const findGroup = (role: string, ft: FundingType) =>
    ub.personnelGroups.find((g: PersonnelGroup) => g.role === role && g.fundingType === ft);

  const isA7 = unitCode === 'A7';
  const roles = isA7 ? ['PLANNING', 'SUPPORT'] : ['PLAYER', 'WHITE_CELL'];
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

    return (
      <Card
        title={`${roleLabels[role]} — ${ft}`}
        size="small"
        style={{ marginBottom: 16 }}
        extra={<Typography.Text strong>{fmt(calc.subtotal)}</Typography.Text>}
      >
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Typography.Text type="secondary">PAX Count</Typography.Text>
            <InputNumber
              min={0}
              value={group.paxCount}
              style={{ width: '100%' }}
              onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { paxCount: v || 0 } })}
            />
          </Col>
          <Col span={6}>
            <Typography.Text type="secondary">Duty Days</Typography.Text>
            <InputNumber
              min={1}
              value={group.dutyDays || exercise!.defaultDutyDays}
              style={{ width: '100%' }}
              onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { dutyDays: v } })}
            />
          </Col>
          <Col span={6}>
            <Typography.Text type="secondary">Location</Typography.Text>
            <Select
              value={group.location || 'GULFPORT'}
              style={{ width: '100%' }}
              onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { location: v } })}
              options={[
                { value: 'GULFPORT', label: 'Gulfport' },
                { value: 'CAMP_SHELBY', label: 'Camp Shelby' },
              ]}
            />
          </Col>
          <Col span={6}>
            <Typography.Text type="secondary">Long Tour</Typography.Text>
            <br />
            <Switch
              checked={group.isLongTour}
              onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { isLongTour: v } })}
            />
          </Col>
        </Row>

        {/* Cost breakdown */}
        <Row gutter={16} style={{ marginBottom: 12 }}>
          {calc.milPay > 0 && <Col><Statistic title="Mil Pay" value={fmt(calc.milPay)} valueStyle={{ fontSize: 14 }} /></Col>}
          {calc.perDiem > 0 && <Col><Statistic title="Per Diem" value={fmt(calc.perDiem)} valueStyle={{ fontSize: 14 }} /></Col>}
          {calc.meals > 0 && <Col><Statistic title="Meals" value={fmt(calc.meals)} valueStyle={{ fontSize: 14 }} /></Col>}
          {calc.travel > 0 && <Col><Statistic title="Travel" value={fmt(calc.travel)} valueStyle={{ fontSize: 14 }} /></Col>}
          {calc.billeting > 0 && <Col><Statistic title="Billeting" value={fmt(calc.billeting)} valueStyle={{ fontSize: 14 }} /></Col>}
        </Row>

        {/* Rank-level detail */}
        {group.personnelEntries.length > 0 && (
          <Table
            size="small"
            pagination={false}
            dataSource={group.personnelEntries.map((e) => ({ ...e, key: e.id }))}
            columns={[
              { title: 'Rank', dataIndex: 'rankCode', width: 100 },
              { title: 'Count', dataIndex: 'count', width: 80 },
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
          Add Rank Detail
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
      <Typography.Title level={4}>{unitCode} — Unit Budget</Typography.Title>

      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col><Statistic title="Unit RPA" value={fmt(unitCalc.unitTotalRpa)} valueStyle={{ color: '#1677ff' }} /></Col>
        <Col><Statistic title="Unit O&M" value={fmt(unitCalc.unitTotalOm)} valueStyle={{ color: '#52c41a' }} /></Col>
        <Col><Statistic title="Unit Total" value={fmt(unitCalc.unitTotal)} /></Col>
      </Row>

      <Divider />

      {/* Personnel panels */}
      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Typography.Title level={5}>{roleLabels[roles[0]]} ({isA7 ? 'A7 Planning' : 'Players'})</Typography.Title>
          <PersonnelPanel role={roles[0]} ft="RPA" />
          <PersonnelPanel role={roles[0]} ft="OM" />
        </Col>
        <Col xs={24} lg={12}>
          <Typography.Title level={5}>{roleLabels[roles[1]]} ({isA7 ? 'A7 Support' : 'White Cell'})</Typography.Title>
          <PersonnelPanel role={roles[1]} ft="RPA" />
          <PersonnelPanel role={roles[1]} ft="OM" />
        </Col>
      </Row>

      <Divider />

      {/* Execution cost lines */}
      <Card
        title="Execution Cost Lines"
        extra={<Button icon={<PlusOutlined />} onClick={() => setExecModal(true)}>Add Cost</Button>}
      >
        <Table
          size="small"
          pagination={false}
          dataSource={ub.executionCostLines.map((l) => ({ ...l, key: l.id }))}
          columns={execColumns}
          locale={{ emptyText: 'No execution cost lines yet' }}
        />
      </Card>

      {/* Add rank entry modal */}
      <Modal
        title="Add Rank Detail"
        open={!!entryModal}
        onOk={() =>
          entryForm.validateFields().then((v) =>
            addEntryMut.mutate({ groupId: entryModal!.groupId, data: v })
          )
        }
        onCancel={() => setEntryModal(null)}
      >
        <Form form={entryForm} layout="vertical">
          <Form.Item name="rankCode" label="Rank" rules={[{ required: true }]}>
            <Select options={RANKS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="count" label="Count" initialValue={1} rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
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
