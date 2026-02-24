import { useMemo, useState } from 'react';
import { Card, Table, InputNumber, Button, Typography, Row, Col, Divider, Space, message, Spin, Modal, Input, Popconfirm, Select } from 'antd';
import { SaveOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';
import { useApp } from '../components/AppLayout';
import type { RankCpdRate, PerDiemRate, PerDiemMasterRecord } from '../types';

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

type MasterSearchField = 'all' | 'destination' | 'state' | 'county';

export default function RateConfig() {
  const { exerciseId } = useApp();
  const queryClient = useQueryClient();

  // Fetch rates & config
  const { data: cpdRates = [], isLoading: cpdLoading } = useQuery({ queryKey: ['cpdRates'], queryFn: api.getCpdRates });
  const { data: perDiemRates = [], isLoading: pdLoading } = useQuery({ queryKey: ['perDiemRates'], queryFn: api.getPerDiemRates });
  const { data: masterRates = [], isLoading: masterLoading } = useQuery({ queryKey: ['perDiemMasterRates'], queryFn: api.getPerDiemMasterRates });
  const { data: config = {}, isLoading: cfgLoading } = useQuery({ queryKey: ['appConfig'], queryFn: api.getAppConfig });

  // Local editable state
  const [cpdEdits, setCpdEdits] = useState<Record<string, number>>({});
  const [pdEdits, setPdEdits] = useState<Record<string, { lodging?: number; mie?: number }>>({});
  const [cfgEdits, setCfgEdits] = useState<Record<string, string>>({});
  const [pdSearch, setPdSearch] = useState('');
  const [pdSearchField, setPdSearchField] = useState<MasterSearchField>('all');

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
        lodgingRate: pdEdits[r.id]?.lodging ?? r.lodgingRate,
        mieRate: pdEdits[r.id]?.mie ?? r.mieRate,
      }));
      return api.updatePerDiemRates(rates);
    },
    onSuccess: () => { invalidate(); setPdEdits({}); message.success('Per diem rates saved'); },
  });

  const addPdMut = useMutation({
    mutationFn: (data: { location: string; lodging: number; mie: number }) =>
      api.addPerDiemRate(data.location, data.lodging, data.mie),
    onSuccess: () => { invalidate(); message.success('Location added'); },
  });

  const deletePdMut = useMutation({
    mutationFn: (id: string) => api.deletePerDiemRate(id),
    onSuccess: () => { invalidate(); message.success('Location removed'); },
  });

  const importMasterRateMut = useMutation({
    mutationFn: (row: PerDiemMasterRecord) =>
      api.addOrUpdatePerDiemRate(
        row.destination,
        row.fy26LodgingRate,
        row.fy26Mie,
      ),
    onSuccess: () => { invalidate(); message.success('Rate added to system locations'); },
  });

  const [addLocOpen, setAddLocOpen] = useState(false);
  const [newLoc, setNewLoc] = useState({ name: '', lodging: 0, mie: 0 });

  const filteredMasterRates = useMemo(() => {
    const safeLower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
    const safeUpper = (value: unknown) => (typeof value === 'string' ? value.toUpperCase() : '');
    const stateFullName = (stateCode: unknown) => STATE_NAMES[safeUpper(stateCode).trim()] ?? '';
    const matches = (value: string, q: string) => value.includes(q);

    const q = pdSearch.trim().toLowerCase();
    if (!q) return masterRates;

    return masterRates
      .filter((row) => {
        const destination = safeLower(row.destination);
        const stateCode = safeLower(row.state).trim();
        const stateName = safeLower(stateFullName(row.state));
        const county = safeLower(row.countyOrLocationDefined);

        if (pdSearchField === 'destination') return matches(destination, q);
        if (pdSearchField === 'state') return matches(stateCode, q) || matches(stateName, q);
        if (pdSearchField === 'county') return matches(county, q);

        return matches(destination, q) || matches(stateCode, q) || matches(stateName, q) || matches(county, q);
      });
  }, [masterRates, pdSearch, pdSearchField]);

  const saveCfgMut = useMutation({
    mutationFn: () => api.updateAppConfig({ ...config, ...cfgEdits }),
    onSuccess: () => { invalidate(); setCfgEdits({}); message.success('Config saved'); },
  });

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

  const masterPdColumns = [
    {
      title: 'Destination',
      dataIndex: 'destination',
      width: 180,
      render: (val: string) => val?.toUpperCase(),
    },
    {
      title: 'State',
      dataIndex: 'state',
      width: 90,
      render: (val: string) => {
        const stateCode = typeof val === 'string' ? val.trim().toUpperCase() : '';
        const stateName = STATE_NAMES[stateCode];
        return stateName ? `${stateName} (${stateCode})` : stateCode;
      },
    },
    {
      title: 'Lodging ($/night)',
      dataIndex: 'fy26LodgingRate',
      width: 140,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: 'M&IE ($/day)',
      dataIndex: 'fy26Mie',
      width: 120,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: '',
      width: 120,
      render: (_: unknown, row: PerDiemMasterRecord) => (
        <Button
          size="small"
          onClick={() => importMasterRateMut.mutate(row)}
          loading={importMasterRateMut.isPending}
        >
          Use Rate
        </Button>
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
        extra={<Button icon={<SaveOutlined />} type="primary" onClick={() => saveCpdMut.mutate()} loading={saveCpdMut.isPending}>Save</Button>}
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
        title="Per Diem Rates"
        className="ct-config-card"
        extra={
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setAddLocOpen(true)}>Add Location</Button>
            <Button icon={<SaveOutlined />} type="primary" onClick={() => savePdMut.mutate()} loading={savePdMut.isPending}>Save</Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
          <Typography.Text type="secondary">Search FY2026 master per diem file and add a location/rate into system rates.</Typography.Text>
          <Space.Compact style={{ width: '100%' }}>
            <Select<MasterSearchField>
              value={pdSearchField}
              onChange={setPdSearchField}
              style={{ width: 220 }}
              options={[
                { value: 'all', label: 'All Columns' },
                { value: 'destination', label: 'Destination' },
                { value: 'state', label: 'State (Code/Name)' },
                { value: 'county', label: 'County / Location' },
              ]}
            />
            <Input
              allowClear
              placeholder={pdSearchField === 'state' ? 'Search state code or full state name (e.g., CO or Colorado)...' : 'Search per selected column...'}
              value={pdSearch}
              onChange={(e) => setPdSearch(e.target.value)}
            />
          </Space.Compact>
        </Space>
        <div className="ct-table" style={{ marginBottom: 12 }}>
          <Table
            size="small"
            loading={masterLoading}
            pagination={{ pageSize: 8 }}
            dataSource={filteredMasterRates.map((r, idx) => ({
              ...r,
              key: `${r.id ?? 'NA'}-${r.state ?? 'NA'}-${r.destination ?? 'NA'}-${r.seasonBegin ?? 'NA'}-${r.seasonEnd ?? 'NA'}-${r.fy26LodgingRate}-${r.fy26Mie}-${idx}`,
            }))}
            rowKey="key"
            columns={masterPdColumns}
          />
        </div>
        <div className="ct-table">
          <Table
            size="small"
            pagination={false}
            dataSource={perDiemRates.map((r: PerDiemRate) => ({ ...r, key: r.id }))}
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
        <Space direction="vertical" style={{ width: '100%' }}>
          <div className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Location Name</Typography.Text>
            <Input placeholder="e.g., Fort Hood" value={newLoc.name} onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })} />
          </div>
          <div className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Lodging Rate ($/night)</Typography.Text>
            <InputNumber min={0} step={0.01} value={newLoc.lodging} onChange={(v) => setNewLoc({ ...newLoc, lodging: v || 0 })} style={{ width: '100%' }} />
          </div>
          <div className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">M&IE Rate ($/day)</Typography.Text>
            <InputNumber min={0} step={0.01} value={newLoc.mie} onChange={(v) => setNewLoc({ ...newLoc, mie: v || 0 })} style={{ width: '100%' }} />
          </div>
        </Space>
      </Modal>

      {/* App Config: Meals & billeting */}
      <Card
        title="Meal Rates & Billeting - Players ONLY"
        className="ct-config-card"
        extra={<Button icon={<SaveOutlined />} type="primary" onClick={() => saveCfgMut.mutate()} loading={saveCfgMut.isPending}>Save</Button>}
      >
        <Row gutter={24}>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">Breakfast ($/day)</Typography.Text>
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
            <Typography.Text type="secondary" className="ct-field-label">Dinner ($/day)</Typography.Text>
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
        <Row gutter={24} style={{ marginTop: 12 }}>
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
        <Divider />
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
            <Typography.Text type="secondary" className="ct-field-label">Rental Car Rate ($/day)</Typography.Text>
            <InputNumber
              min={0}
              step={1}
              value={cfgVal('DEFAULT_RENTAL_CAR_DAILY')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, DEFAULT_RENTAL_CAR_DAILY: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">RPA Budget Target ($)</Typography.Text>
            <InputNumber
              min={0}
              step={1000}
              value={cfgVal('BUDGET_TARGET_RPA')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, BUDGET_TARGET_RPA: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={6} className="ct-field-stack">
            <Typography.Text type="secondary" className="ct-field-label">O&amp;M Budget Target ($)</Typography.Text>
            <InputNumber
              min={0}
              step={1000}
              value={cfgVal('BUDGET_TARGET_OM')}
              onChange={(v) => setCfgEdits({ ...cfgEdits, BUDGET_TARGET_OM: String(v || 0) })}
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>
    </div>
  );
}
