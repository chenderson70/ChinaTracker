import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Table, InputNumber, Button, Typography, Row, Col, Divider, Space, message, Spin, Modal, Input, Popconfirm, Select } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
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

function getMasterRateAliases(row: PerDiemMasterRecord): string[] {
  const destination = String(row.destination || '').trim().toUpperCase();
  const county = String(row.countyOrLocationDefined || '').trim().toUpperCase();
  const state = String(row.state || '').trim().toUpperCase();

  if (state === 'GA' && destination === 'MARIETTA' && county === 'COBB') {
    return ['DOBBINS ARB', 'DOBBINS ARB / MARIETTA NAS', 'MARIETTA NAS', 'NOSC ATLANTA'];
  }

  if (state === 'GA' && destination === 'WARNER ROBINS' && county === 'HOUSTON') {
    return ['ROBINS AFB', 'ROBINS AFB / WARNER ROBINS'];
  }

  if (state === 'GA' && destination === 'AUGUSTA' && county === 'RICHMOND') {
    return ['FORT EISENHOWER', 'FT EISENHOWER', 'FORT GORDON', 'FT GORDON', 'NOSC AUGUSTA'];
  }

  if (state === 'GA' && destination === 'SAVANNAH' && county === 'CHATHAM') {
    return ['HUNTER ARMY AIRFIELD', 'HUNTER AAF'];
  }

  if (state === 'GA' && destination === 'ATLANTA' && county === 'FULTON / DEKALB') {
    return ['NOSC ATLANTA'];
  }

  return [];
}

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
  const cpdAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cfgAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    mutationFn: (submittedEdits: Record<string, { lodging?: number; mie?: number }>) => {
      const rates = perDiemRates.map((r: PerDiemRate) => ({
        location: r.location,
        lodgingRate: submittedEdits[r.id]?.lodging ?? r.lodgingRate,
        mieRate: submittedEdits[r.id]?.mie ?? r.mieRate,
      }));
      return api.updatePerDiemRates(rates);
    },
    onSuccess: (_data, submittedEdits) => {
      invalidate();
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
        const aliases = getMasterRateAliases(row).map((alias) => alias.toLowerCase());
        const aliasMatch = aliases.some((alias) => matches(alias, q));

        if (pdSearchField === 'destination') return matches(destination, q) || aliasMatch;
        if (pdSearchField === 'state') return matches(stateCode, q) || matches(stateName, q);
        if (pdSearchField === 'county') return matches(county, q) || aliasMatch;

        return matches(destination, q) || matches(stateCode, q) || matches(stateName, q) || matches(county, q) || aliasMatch;
      });
  }, [masterRates, pdSearch, pdSearchField]);

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
      render: (val: string, row: PerDiemMasterRecord) => {
        const aliases = getMasterRateAliases(row);
        return (
          <div>
            <div>{val?.toUpperCase()}</div>
            {aliases.length > 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Alias: {aliases[0]}
              </Typography.Text>
            ) : null}
          </div>
        );
      },
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
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setAddLocOpen(true)}>Add Location</Button>
            <Typography.Text type="secondary">{savePdMut.isPending ? 'Autosaving...' : 'Changes auto-save'}</Typography.Text>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
          <Typography.Text type="secondary">Search FY2026 master per diem file and add a location/rate into system rates.</Typography.Text>
          <Typography.Text type="secondary">
            These location-based rates apply only to planning and support/white cell calculations. Player calculations use the player-specific per diem and billeting settings below.
          </Typography.Text>
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
        </Row>
      </Card>
    </div>
  );
}
