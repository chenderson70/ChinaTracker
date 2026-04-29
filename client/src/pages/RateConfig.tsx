import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Table, InputNumber, Button, Typography, Row, Col, Divider, Space, message, Spin, Modal, Input, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { useApp } from '../components/AppLayout';
import type { RankCpdRate, PerDiemRate } from '../types';
import { sortUiPerDiemRateRows } from '../utils/perDiemDefaults';

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
  const cpdAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cfgAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPdAutosave = () => {
    if (pdAutoSaveTimer.current) {
      clearTimeout(pdAutoSaveTimer.current);
      pdAutoSaveTimer.current = null;
    }
  };

  const syncPerDiemRates = (rates: PerDiemRate[]) => {
    queryClient.setQueryData(['perDiemRates'], rates);
    if (exerciseId) queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cpdRates'] });
    queryClient.invalidateQueries({ queryKey: ['perDiemRates'] });
    queryClient.invalidateQueries({ queryKey: ['appConfig'] });
    if (exerciseId) queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
  };

  const saveCpdMut = useMutation({
    mutationFn: (submittedEdits: Record<string, number>) => {
      const rates = cpdRates.map((r: RankCpdRate) => ({
        rankCode: r.rankCode,
        costPerDay: submittedEdits[r.rankCode] ?? r.costPerDay,
      }));
      return api.updateCpdRates(rates);
    },
    onSuccess: (_data, submittedEdits) => {
      invalidate();
      setCpdEdits((current) => {
        const next = { ...current };
        Object.entries(submittedEdits).forEach(([key, value]) => {
          if (next[key] === value) {
            delete next[key];
          }
        });
        return next;
      });
    },
  });

  const savePdMut = useMutation({
    scope: { id: 'per-diem-rates' },
    mutationFn: (submittedEdits: Record<string, { lodging?: number; mie?: number }>) => {
      const currentRates = queryClient.getQueryData<PerDiemRate[]>(['perDiemRates']) ?? perDiemRates;
      const rates = currentRates
        .filter((r: PerDiemRate) => submittedEdits[r.id])
        .map((r: PerDiemRate) => ({
          location: r.location,
          lodgingRate: submittedEdits[r.id]?.lodging ?? r.lodgingRate,
          mieRate: submittedEdits[r.id]?.mie ?? r.mieRate,
        }));
      return api.upsertPerDiemRates(rates);
    },
    onSuccess: (data, submittedEdits) => {
      syncPerDiemRates(data);
      setPdEdits((current) => {
        const next = { ...current };
        Object.entries(submittedEdits).forEach(([key, value]) => {
          const currentValue = next[key];
          if (currentValue?.lodging === value?.lodging && currentValue?.mie === value?.mie) {
            delete next[key];
          }
        });
        return next;
      });
    },
  });

  const addPdMut = useMutation({
    scope: { id: 'per-diem-rates' },
    mutationFn: (data: { location: string; lodging: number; mie: number }) =>
      api.addPerDiemRate(data.location, data.lodging, data.mie),
    onSuccess: (data) => {
      syncPerDiemRates(data);
      message.success('Location added');
    },
  });

  const deletePdMut = useMutation({
    scope: { id: 'per-diem-rates' },
    mutationFn: (id: string) => api.deletePerDiemRate(id),
    onMutate: (id) => {
      clearPdAutosave();
      setPdEdits((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    onSuccess: (data) => {
      syncPerDiemRates(data);
      message.success('Location removed');
    },
  });

  const [addLocOpen, setAddLocOpen] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', lodging: 0, mie: 0 });

  const saveCfgMut = useMutation({
    mutationFn: (submittedEdits: Record<string, string>) => api.updateAppConfig({ ...config, ...submittedEdits }),
    onSuccess: (_data, submittedEdits) => {
      invalidate();
      setCfgEdits((current) => {
        const next = { ...current };
        Object.entries(submittedEdits).forEach(([key, value]) => {
          if (next[key] === value) {
            delete next[key];
          }
        });
        return next;
      });
    },
  });

  useEffect(() => {
    if (Object.keys(cpdEdits).length === 0 || saveCpdMut.isPending) return;
    if (cpdAutoSaveTimer.current) clearTimeout(cpdAutoSaveTimer.current);
    cpdAutoSaveTimer.current = setTimeout(() => {
      saveCpdMut.mutate({ ...cpdEdits });
    }, 700);
    return () => {
      if (cpdAutoSaveTimer.current) clearTimeout(cpdAutoSaveTimer.current);
    };
  }, [cpdEdits, saveCpdMut.isPending]);

  useEffect(() => {
    if (Object.keys(pdEdits).length === 0 || savePdMut.isPending) return;
    if (pdAutoSaveTimer.current) clearTimeout(pdAutoSaveTimer.current);
    pdAutoSaveTimer.current = setTimeout(() => {
      savePdMut.mutate({ ...pdEdits });
    }, 700);
    return () => {
      if (pdAutoSaveTimer.current) clearTimeout(pdAutoSaveTimer.current);
    };
  }, [pdEdits, savePdMut.isPending]);

  useEffect(() => {
    if (Object.keys(cfgEdits).length === 0 || saveCfgMut.isPending) return;
    if (cfgAutoSaveTimer.current) clearTimeout(cfgAutoSaveTimer.current);
    cfgAutoSaveTimer.current = setTimeout(() => {
      saveCfgMut.mutate({ ...cfgEdits });
    }, 700);
    return () => {
      if (cfgAutoSaveTimer.current) clearTimeout(cfgAutoSaveTimer.current);
    };
  }, [cfgEdits, saveCfgMut.isPending]);

  const sortedPerDiemRates = useMemo(
    () => sortUiPerDiemRateRows(perDiemRates),
    [perDiemRates],
  );

  if (cpdLoading || pdLoading || cfgLoading) return <div className="ct-loading"><Spin size="large" /></div>;

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
    { title: 'Location', dataIndex: 'location', width: 160 },
    {
      title: 'Lodging ($/night)',
      dataIndex: 'lodgingRate',
      render: (val: number, row: PerDiemRate) => (
        <InputNumber
          min={0}
          step={0.01}
          value={pdEdits[row.id]?.lodging ?? val}
          onChange={(v) => setPdEdits({ ...pdEdits, [row.id]: { ...pdEdits[row.id], lodging: v || 0 } })}
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
          value={pdEdits[row.id]?.mie ?? val}
          onChange={(v) => setPdEdits({ ...pdEdits, [row.id]: { ...pdEdits[row.id], mie: v || 0 } })}
          style={{ width: 120 }}
        />
      ),
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, row: PerDiemRate) => (
        <Popconfirm title="Delete this location?" onConfirm={() => deletePdMut.mutate(row.id)}>
          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      ),
    },
  ];

  const cfgVal = (key: string) => parseFloat(cfgEdits[key] ?? config[key] ?? '0');

  return (
    <div>
      <Typography.Title level={4} className="ct-page-title">Rate Configuration</Typography.Title>

      {/* CPD Rates */}
      <Card
        title="Composite Pay & Allowance (CPD) Rates"
        className="ct-config-card"
        extra={<Typography.Text type="secondary">{saveCpdMut.isPending ? 'Autosaving...' : 'Changes auto-save'}</Typography.Text>}
      >
        <div className="ct-table">
          <Table
            size="small"
            pagination={false}
            dataSource={cpdRates.map((r: RankCpdRate) => ({ ...r, key: r.id }))}
            columns={cpdColumns}
            scroll={{ y: 400 }}
          />
        </div>
      </Card>

      {/* Per Diem Rates */}
      <Card
        title="Per Diem Rates (Planning & Support Only)"
        className="ct-config-card"
        extra={
          <Space wrap size={10}>
            <Button icon={<PlusOutlined />} onClick={() => setAddLocOpen(true)}>Add Location</Button>
            <Button
              href="https://www.travel.dod.mil/Travel-Transportation-Rates/Per-Diem/Per-Diem-Rate-Lookup/"
              target="_blank"
              rel="noreferrer"
              style={{
                fontWeight: 700,
                background: '#fff7e6',
                borderColor: '#ffd591',
                color: '#ad4e00',
                boxShadow: '0 0 0 2px rgba(250, 173, 20, 0.12)',
              }}
            >
              DoD Lookup
            </Button>
            <Typography.Text type="secondary">{savePdMut.isPending ? 'Autosaving...' : 'Changes auto-save'}</Typography.Text>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
          <Typography.Text type="secondary">
            These location-based rates apply only to planning and support/white cell calculations. Player calculations use the player-specific per diem and billeting settings below.
          </Typography.Text>
          <Typography.Text type="secondary">
            Use the highlighted <strong>DoD Lookup</strong> link above to find lodging and M&amp;IE for a location, then add it manually with <strong>Add Location</strong>.
          </Typography.Text>
          <Typography.Text type="secondary">
            If no location-specific M&amp;IE is listed, use the standard DoD M&amp;IE rate of $68.
          </Typography.Text>
        </Space>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
          Default Locations
        </Typography.Title>
        <div className="ct-table">
          <Table
            size="small"
            pagination={false}
            dataSource={sortedPerDiemRates.map((r: PerDiemRate) => ({ ...r, key: r.id }))}
            columns={pdColumns}
          />
        </div>
      </Card>

      {/* Add Location modal */}
      <Modal
        title="Add Per Diem Location"
        open={addLocOpen}
        onOk={() => {
          if (!newLoc.name.trim()) { message.warning('Enter a location name'); return; }
          addPdMut.mutate({ location: newLoc.name.trim().toUpperCase().replace(/\s+/g, '_'), lodging: newLoc.lodging, mie: newLoc.mie });
          setAddLocOpen(false);
          setNewLoc({ name: '', lodging: 0, mie: 0 });
        }}
        onCancel={() => setAddLocOpen(false)}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <div className="ct-field-stack" style={{ gap: 6 }}>
            <Typography.Text type="secondary" style={{ display: 'block', minHeight: 0, lineHeight: 1.2, marginBottom: 0 }}>
              Location Name
            </Typography.Text>
            <Input placeholder="e.g., Fort Hood" value={newLoc.name} onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })} />
          </div>
          <div className="ct-field-stack" style={{ gap: 6 }}>
            <Typography.Text type="secondary" style={{ display: 'block', minHeight: 0, lineHeight: 1.2, marginBottom: 0 }}>
              Lodging Rate ($/night)
            </Typography.Text>
            <InputNumber min={0} step={0.01} value={newLoc.lodging} onChange={(v) => setNewLoc({ ...newLoc, lodging: v || 0 })} style={{ width: '100%' }} />
          </div>
          <div className="ct-field-stack" style={{ gap: 6 }}>
            <Typography.Text type="secondary" style={{ display: 'block', minHeight: 0, lineHeight: 1.2, marginBottom: 0 }}>
              M&IE Rate ($/day)
            </Typography.Text>
            <InputNumber min={0} step={0.01} value={newLoc.mie} onChange={(v) => setNewLoc({ ...newLoc, mie: v || 0 })} style={{ width: '100%' }} />
          </div>
        </Space>
      </Modal>

      {/* App Config: Meals & billeting */}
      <Card
        title="Meal Rates & Billeting - Players ONLY"
        className="ct-config-card ct-config-card-compact"
        extra={<Typography.Text type="secondary">{saveCfgMut.isPending ? 'Autosaving...' : 'Changes auto-save'}</Typography.Text>}
      >
        <Row gutter={24}>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Breakfast ($/day, A rations)</Typography.Text>
            <InputNumber
              min={0}
              step={0.01}
              value={cfgVal('BREAKFAST_COST')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, BREAKFAST_COST: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Lunch/MRE ($/day)</Typography.Text>
            <InputNumber
              min={0}
              step={0.01}
              value={cfgVal('LUNCH_MRE_COST')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, LUNCH_MRE_COST: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Dinner ($/day, A rations)</Typography.Text>
            <InputNumber
              min={0}
              step={0.01}
              value={cfgVal('DINNER_COST')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, DINNER_COST: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Player Billeting ($/night)</Typography.Text>
            <InputNumber
              min={0}
              step={0.01}
              value={cfgVal('PLAYER_BILLETING_NIGHT')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, PLAYER_BILLETING_NIGHT: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
        <Row gutter={24} style={{ marginTop: 18 }}>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Player Per Diem (M&amp;IE) ($/day)</Typography.Text>
            <InputNumber
              min={0}
              step={0.01}
              value={cfgVal('PLAYER_PER_DIEM_PER_DAY') || cfgVal('FIELD_CONDITIONS_PER_DIEM')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, PLAYER_PER_DIEM_PER_DAY: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      <Card
        title="Travel Rates Config"
        className="ct-config-card ct-config-card-compact"
        extra={<Typography.Text type="secondary">{saveCfgMut.isPending ? 'Autosaving...' : 'Changes auto-save'}</Typography.Text>}
      >
        <Row gutter={24}>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Default Airfare ($)</Typography.Text>
            <InputNumber
              min={0}
              step={1}
              value={cfgVal('DEFAULT_AIRFARE')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, DEFAULT_AIRFARE: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Default Rental Car Rate ($/day)</Typography.Text>
            <InputNumber
              min={0}
              step={1}
              value={cfgVal('DEFAULT_RENTAL_CAR_DAILY')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, DEFAULT_RENTAL_CAR_DAILY: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>
    </div>
  );
}
