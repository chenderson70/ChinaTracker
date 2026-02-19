import { useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, Typography, Popconfirm, Spin, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import type { OmCostLine, OmCategory } from '../types';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const OM_CATEGORIES: { value: OmCategory; label: string }[] = [
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'TRANSPORTATION', label: 'Transportation' },
  { value: 'BILLETING', label: 'Billeting' },
  { value: 'PORT_A_POTTY', label: 'Port-A-Potty' },
  { value: 'RENTALS_VSCOS', label: 'Rentals / VSCOs' },
  { value: 'CONSUMABLES', label: 'Consumables' },
  { value: 'WRM', label: 'WRM' },
  { value: 'OTHER', label: 'Other' },
];

export default function OmCostCenter() {
  const { exercise, budget, exerciseId } = useApp();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
    queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
  };

  const addMut = useMutation({
    mutationFn: (data: any) => api.addOmCost(exerciseId!, data),
    onSuccess: () => { invalidate(); setModalOpen(false); form.resetFields(); message.success('O&M cost line added'); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteOmCost(id),
    onSuccess: () => { invalidate(); message.success('Removed'); },
  });

  if (!exercise || !budget) return <div className="ct-loading"><Spin size="large" /></div>;

  const columns = [
    { title: 'Category', dataIndex: 'category', width: 160, render: (v: string) => OM_CATEGORIES.find((c) => c.value === v)?.label || v },
    { title: 'Label', dataIndex: 'label' },
    { title: 'Amount', dataIndex: 'amount', width: 140, render: (v: number) => fmt(v) },
    { title: 'Notes', dataIndex: 'notes' },
    {
      title: '',
      width: 50,
      render: (_: any, row: OmCostLine) => (
        <Popconfirm title="Delete this line?" onConfirm={() => deleteMut.mutate(row.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const data = exercise.omCostLines.map((l) => ({ ...l, key: l.id }));
  const total = data.reduce((s, l) => s + l.amount, 0);

  return (
    <div>
      <Typography.Title level={4} className="ct-page-title">Exercise-Level O&M Costs</Typography.Title>

      <Card
        className="ct-section-card"
        extra={<Button icon={<PlusOutlined />} type="primary" onClick={() => setModalOpen(true)}>Add O&M Cost</Button>}
      >
        <div className="ct-table">
          <Table
            size="small"
            columns={columns}
            dataSource={data}
            pagination={false}
            locale={{ emptyText: 'No exercise-level O&M costs yet' }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}><strong>Total Exercise O&M</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={1}><strong style={{ color: '#52c41a' }}>{fmt(total)}</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={2} />
              </Table.Summary.Row>
            )}
          />
        </div>
      </Card>

      <Modal
        title="Add O&M Cost Line"
        open={modalOpen}
        onOk={() => form.validateFields().then((v) => addMut.mutate(v))}
        confirmLoading={addMut.isPending}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Select options={OM_CATEGORIES} />
          </Form.Item>
          <Form.Item name="label" label="Label / Description" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amount" label="Amount ($)" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
