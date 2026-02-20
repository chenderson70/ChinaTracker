import { Card, Typography, Button, Row, Col, Table, Descriptions, Divider, Space, Spin, InputNumber, Form, message } from 'antd';
import { FileExcelOutlined, PrinterOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import dayjs from 'dayjs';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function Reports() {
  const { exercise, budget, exerciseId } = useApp();
  const queryClient = useQueryClient();
  const [editTravel, setEditTravel] = useState(false);
  const [travelForm] = Form.useForm();

  const travelMut = useMutation({
    mutationFn: (data: any) => api.updateTravelConfig(exerciseId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
      setEditTravel(false);
      message.success('Travel config saved');
    },
  });

  const exerciseMut = useMutation({
    mutationFn: (data: any) => api.updateExercise(exerciseId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
      message.success('Exercise updated');
    },
  });

  if (!exercise || !budget) return <div className="ct-loading"><Spin size="large" /></div>;

  const handleExport = () => api.exportExcel(exerciseId!);
  const handlePrint = () => window.print();

  const unitData = Object.values(budget.units).map((u) => ({
    key: u.unitCode,
    unit: u.unitCode,
    wcRpa: u.whiteCellRpa.subtotal,
    wcOm: u.whiteCellOm.subtotal,
    playerRpa: u.playerRpa.subtotal,
    playerOm: u.playerOm.subtotal,
    execRpa: u.executionRpa,
    execOm: u.executionOm,
    totalRpa: u.unitTotalRpa,
    totalOm: u.unitTotalOm,
    total: u.unitTotal,
  }));

  const columns = [
    { title: 'Unit', dataIndex: 'unit', width: 60 },
    { title: 'WC RPA', dataIndex: 'wcRpa', render: fmt },
    { title: 'WC O&M', dataIndex: 'wcOm', render: fmt },
    { title: 'Player RPA', dataIndex: 'playerRpa', render: fmt },
    { title: 'Player O&M', dataIndex: 'playerOm', render: fmt },
    { title: 'Exec RPA', dataIndex: 'execRpa', render: fmt },
    { title: 'Exec O&M', dataIndex: 'execOm', render: fmt },
    { title: 'Total RPA', dataIndex: 'totalRpa', render: fmt },
    { title: 'Total O&M', dataIndex: 'totalOm', render: fmt },
    { title: 'Total', dataIndex: 'total', render: (v: number) => <strong>{fmt(v)}</strong> },
  ];

  const travel = exercise.travelConfig;
  const totalBudgetLeft = (exercise.totalBudget || 0) - budget.grandTotal;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Typography.Title level={4} className="ct-page-title" style={{ marginBottom: 0 }}>Reports & Export</Typography.Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<FileExcelOutlined />} type="primary" onClick={handleExport}>Export to Excel</Button>
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
          </Space>
        </Col>
      </Row>

      {/* Exercise info */}
      <Card title="Exercise Details" className="ct-section-card" style={{ marginBottom: 24 }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="Name">{exercise.name}</Descriptions.Item>
          <Descriptions.Item label="Start">{dayjs(exercise.startDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="End">{dayjs(exercise.endDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Total Budget ($)">
            <InputNumber
              size="small"
              min={0}
              value={exercise.totalBudget}
              onChange={(v) => v !== null && exerciseMut.mutate({ totalBudget: v })}
              style={{ width: 130 }}
            />
          </Descriptions.Item>
          <Descriptions.Item label="Duty Days">
            <InputNumber
              size="small"
              min={1}
              value={exercise.defaultDutyDays}
              onChange={(v) => v && exerciseMut.mutate({ defaultDutyDays: v })}
              style={{ width: 70 }}
            />
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Travel Config */}
      <Card
        title="Travel Configuration"
        className="ct-section-card"
        style={{ marginBottom: 24 }}
        extra={
          editTravel ? (
            <Button
              icon={<SaveOutlined />}
              type="primary"
              onClick={() =>
                travelForm.validateFields().then((v) => travelMut.mutate(v))
              }
            >
              Save
            </Button>
          ) : (
            <Button icon={<EditOutlined />} onClick={() => { setEditTravel(true); if (travel) travelForm.setFieldsValue(travel); }}>
              Edit
            </Button>
          )
        }
      >
        {editTravel ? (
          <Form form={travelForm} layout="inline" initialValues={travel || {}}>
            <Form.Item name="airfarePerPerson" label="Airfare ($/person)">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="rentalCarDailyRate" label="Rental Car ($/day)">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="rentalCarCount" label="# Cars">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="rentalCarDays" label="# Days">
              <InputNumber min={0} />
            </Form.Item>
          </Form>
        ) : (
          <Descriptions column={4} size="small">
            <Descriptions.Item label="Airfare">{fmt(travel?.airfarePerPerson || 400)}/person</Descriptions.Item>
            <Descriptions.Item label="Rental Cars">{travel?.rentalCarCount || 0} vehicles</Descriptions.Item>
            <Descriptions.Item label="Car Rate">{fmt(travel?.rentalCarDailyRate || 50)}/day</Descriptions.Item>
            <Descriptions.Item label="Car Days">{travel?.rentalCarDays || 0} days</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* Full budget table */}
      <Card title="Full Budget Breakdown" className="ct-section-card" style={{ marginBottom: 24 }}>
        <div className="ct-table">
          <Table size="small" pagination={false} dataSource={unitData} columns={columns} scroll={{ x: 1100 }} />
        </div>
      </Card>

      {/* Grand totals */}
      <Card title="Grand Totals" className="ct-section-card">
        <Descriptions column={3}>
          <Descriptions.Item label="Total Budget Left"><Typography.Text strong>{fmt(totalBudgetLeft)}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label="Total RPA"><Typography.Text strong style={{ color: '#1677ff' }}>{fmt(budget.totalRpa)}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label="Total O&M"><Typography.Text strong style={{ color: '#52c41a' }}>{fmt(budget.totalOm)}</Typography.Text></Descriptions.Item>
          <Descriptions.Item label="Grand Total"><Typography.Title level={4} style={{ margin: 0 }}>{fmt(budget.grandTotal)}</Typography.Title></Descriptions.Item>
          <Descriptions.Item label="RPA Travel">{fmt(budget.rpaTravel)}</Descriptions.Item>
          <Descriptions.Item label="Exercise O&M">{fmt(budget.exerciseOmTotal)}</Descriptions.Item>
          <Descriptions.Item label="WRM">{fmt(budget.wrm)}</Descriptions.Item>
          <Descriptions.Item label="Total PAX">{budget.totalPax}</Descriptions.Item>
          <Descriptions.Item label="Players">{budget.totalPlayers}</Descriptions.Item>
          <Descriptions.Item label="White Cell">{budget.totalWhiteCell}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
