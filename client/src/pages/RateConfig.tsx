import { useState } from 'react';
import { Card, Table, InputNumber, Button, Typography, Row, Col, Divider, Space, message, Spin } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { useApp } from '../components/AppLayout';
import type { RankCpdRate, PerDiemRate } from '../types';

export default function RateConfig() {
  const { exerciseId } = useApp();
  const queryClient = useQueryClient();

  // Fetch rates & config
  const { data: cpdRates = [], isLoading: cpdLoading } = useQuery({ queryKey: ['cpdRates'], queryFn: api.getCpdRates });
  const { data: perDiemRates = [], isLoading: pdLoading } = useQuery({ queryKey: ['perDiemRates'], queryFn: api.getPerDiemRates });
  const { data: config = {}, isLoading: cfgLoading } = useQuery({ queryKey: ['appConfig'], queryFn: api.getAppConfig });

  // Local editable state
  const [cpdEdits, setCpdEdits] = useState<Record<string, number>>({});
  const [pdEdits, setPdEdits] = useState<Record<string, { lodging?: number; mie?: number }>>({});
  const [cfgEdits, setCfgEdits] = useState<Record<string, string>>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cpdRates'] });
    queryClient.invalidateQueries({ queryKey: ['perDiemRates'] });
    queryClient.invalidateQueries({ queryKey: ['appConfig'] });
    if (exerciseId) queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
  };

  const saveCpdMut = useMutation({
    mutationFn: () => {
      const rates = cpdRates.map((r: RankCpdRate) => ({
        rankCode: r.rankCode,
        costPerDay: cpdEdits[r.rankCode] ?? r.costPerDay,
      }));
      return api.updateCpdRates(rates);
    },
    onSuccess: () => { invalidate(); setCpdEdits({}); message.success('CPD rates saved'); },
  });

  const savePdMut = useMutation({
    mutationFn: () => {
      const rates = perDiemRates.map((r: PerDiemRate) => ({
        location: r.location,
        lodgingRate: pdEdits[r.location]?.lodging ?? r.lodgingRate,
        mieRate: pdEdits[r.location]?.mie ?? r.mieRate,
      }));
      return api.updatePerDiemRates(rates);
    },
    onSuccess: () => { invalidate(); setPdEdits({}); message.success('Per diem rates saved'); },
  });

  const saveCfgMut = useMutation({
    mutationFn: () => api.updateAppConfig({ ...config, ...cfgEdits }),
    onSuccess: () => { invalidate(); setCfgEdits({}); message.success('Config saved'); },
  });

  if (cpdLoading || pdLoading || cfgLoading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const cpdColumns = [
    { title: 'Rank', dataIndex: 'rankCode', width: 100 },
    {
      title: 'Cost Per Day ($)',
      dataIndex: 'costPerDay',
      render: (val: number, row: RankCpdRate) => (
        <InputNumber
          min={0}
          step={0.01}
          value={cpdEdits[row.rankCode] ?? val}
          onChange={(v) => setCpdEdits({ ...cpdEdits, [row.rankCode]: v || 0 })}
          style={{ width: 120 }}
        />
      ),
    },
  ];

  const pdColumns = [
    { title: 'Location', dataIndex: 'location', width: 140 },
    {
      title: 'Lodging ($/night)',
      dataIndex: 'lodgingRate',
      render: (val: number, row: PerDiemRate) => (
        <InputNumber
          min={0}
          step={0.01}
          value={pdEdits[row.location]?.lodging ?? val}
          onChange={(v) => setPdEdits({ ...pdEdits, [row.location]: { ...pdEdits[row.location], lodging: v || 0 } })}
          style={{ width: 120 }}
        />
      ),
    },
    {
      title: 'M&IE ($/day)',
      dataIndex: 'mieRate',
      render: (val: number, row: PerDiemRate) => (
        <InputNumber
          min={0}
          step={0.01}
          value={pdEdits[row.location]?.mie ?? val}
          onChange={(v) => setPdEdits({ ...pdEdits, [row.location]: { ...pdEdits[row.location], mie: v || 0 } })}
          style={{ width: 120 }}
        />
      ),
    },
  ];

  const cfgVal = (key: string) => parseFloat(cfgEdits[key] ?? config[key] ?? '0');

  return (
    <div>
      <Typography.Title level={4}>Rate Configuration</Typography.Title>

      {/* CPD Rates */}
      <Card
        title="Composite Pay & Allowance (CPD) Rates"
        extra={<Button icon={<SaveOutlined />} type="primary" onClick={() => saveCpdMut.mutate()} loading={saveCpdMut.isPending}>Save</Button>}
        style={{ marginBottom: 24 }}
      >
        <Table
          size="small"
          pagination={false}
          dataSource={cpdRates.map((r: RankCpdRate) => ({ ...r, key: r.id }))}
          columns={cpdColumns}
          scroll={{ y: 400 }}
        />
      </Card>

      {/* Per Diem Rates */}
      <Card
        title="Per Diem Rates"
        extra={<Button icon={<SaveOutlined />} type="primary" onClick={() => savePdMut.mutate()} loading={savePdMut.isPending}>Save</Button>}
        style={{ marginBottom: 24 }}
      >
        <Table
          size="small"
          pagination={false}
          dataSource={perDiemRates.map((r: PerDiemRate) => ({ ...r, key: r.id }))}
          columns={pdColumns}
        />
      </Card>

      {/* App Config: Meals & billeting */}
      <Card
        title="Meal Rates & Billeting"
        extra={<Button icon={<SaveOutlined />} type="primary" onClick={() => saveCfgMut.mutate()} loading={saveCfgMut.isPending}>Save</Button>}
      >
        <Row gutter={24}>
          <Col span={6}>
            <Typography.Text type="secondary">Breakfast ($/day)</Typography.Text>
            <InputNumber
              min={0}
              step={0.01}
              value={cfgVal('BREAKFAST_COST')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, BREAKFAST_COST: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <Typography.Text type="secondary">Lunch/MRE ($/day)</Typography.Text>
            <InputNumber
              min={0}
              step={0.01}
              value={cfgVal('LUNCH_MRE_COST')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, LUNCH_MRE_COST: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <Typography.Text type="secondary">Dinner ($/day)</Typography.Text>
            <InputNumber
              min={0}
              step={0.01}
              value={cfgVal('DINNER_COST')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, DINNER_COST: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <Typography.Text type="secondary">Player Billeting ($/night)</Typography.Text>
            <InputNumber
              min={0}
              step={0.01}
              value={cfgVal('PLAYER_BILLETING_NIGHT')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, PLAYER_BILLETING_NIGHT: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
        <Divider />
        <Row gutter={24}>
          <Col span={6}>
            <Typography.Text type="secondary">Default Airfare ($)</Typography.Text>
            <InputNumber
              min={0}
              step={1}
              value={cfgVal('DEFAULT_AIRFARE')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, DEFAULT_AIRFARE: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6}>
            <Typography.Text type="secondary">Rental Car Rate ($/day)</Typography.Text>
            <InputNumber
              min={0}
              step={1}
              value={cfgVal('RENTAL_CAR_DAILY_RATE')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, RENTAL_CAR_DAILY_RATE: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>
    </div>
  );
}
