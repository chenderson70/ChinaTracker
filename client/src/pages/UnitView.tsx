import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AutoComplete,
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
import type { PersonnelGroup, UnitBudget, FundingType, UnitCalc, GroupCalc, PerDiemRate } from '../types';
import { getUnitDisplayLabel } from '../utils/unitLabels';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const formatNumberInput = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return '';
  const stringValue = String(value).replace(/,/g, '');
  const [integerPart, decimalPart] = stringValue.split('.');
  const sign = integerPart.startsWith('-') ? '-' : '';
  const digits = integerPart.replace('-', '');
  const formattedInteger = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalPart !== undefined
    ? `${sign}${formattedInteger}.${decimalPart}`
    : `${sign}${formattedInteger}`;
};
const parseNumberInput = (value: string | undefined) => {
  const cleanedValue = (value || '').replace(/,/g, '').trim();
  return cleanedValue ? Number(cleanedValue) : 0;
};

const parseA7OverallEquipmentCost = (notes: string | null | undefined): number | null => {
  if (!notes) return null;
  const match = notes.match(/^A7_WRM_OVERALL:([0-9]+(?:\.[0-9]+)?)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const RANKS = [
  'CIV','AB','AMN','A1C','SRA','SSGT','TSGT','MSGT','SMSGT','CMSGT',
  '2LT','1LT','CAPT','MAJ','LTCOL','COL','BG','MG',
];
const PLANNING_NOTE_OPTIONS = [
  { value: 'Planning' },
  { value: 'Site Visit' },
  { value: 'Planning Conference' },
];
const DAYS_PER_MONTH = 30;

function monthsToDutyDays(months: number): number {
  return Math.max(1, Math.round(months * DAYS_PER_MONTH));
}

function dutyDaysToMonths(dutyDays: number): number {
  return Number((dutyDays / DAYS_PER_MONTH).toFixed(2));
}

function PlanningNoteInput({
  value,
  onSave,
}: {
  value: string | null | undefined;
  onSave: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(String(value || ''));

  useEffect(() => {
    setDraft(String(value || ''));
  }, [value]);

  const commit = () => {
    const nextValue = draft.trim();
    const currentValue = String(value || '').trim();
    if (nextValue === currentValue) return;
    onSave(nextValue || null);
  };

  return (
    <AutoComplete
      size="small"
      value={draft}
      options={PLANNING_NOTE_OPTIONS}
      style={{ width: '100%' }}
      placeholder="Select or type a note"
      filterOption={(inputValue, option) =>
        String(option?.value || '').toLowerCase().includes(inputValue.toLowerCase())
      }
      onChange={setDraft}
      onSelect={(nextValue) => {
        setDraft(nextValue);
        onSave(nextValue.trim() || null);
      }}
    >
      <Input
        size="small"
        onBlur={commit}
        onPressEnter={commit}
      />
    </AutoComplete>
  );
}

export default function UnitView() {
  const { unitCode } = useParams<{ unitCode: string }>();
  const { exercise, budget, exerciseId } = useApp();
  const queryClient = useQueryClient();
  const { data: perDiemRates = [] } = useQuery({
    queryKey: ['perDiemRates'],
    queryFn: api.getPerDiemRates,
  });
  const perDiemLocations = useMemo(() => Array.from(
    new Set(
      perDiemRates
        .map((r) => r.location)
        .filter((location): location is string => typeof location === 'string' && location.trim().length > 0),
    ),
  ), [perDiemRates]);
  const perDiemByLocation = useMemo(() => {
    return perDiemRates.reduce<Record<string, { lodging: number; mie: number }>>((acc, rate: PerDiemRate) => {
      if (rate.location) {
        acc[rate.location] = { lodging: rate.lodgingRate || 0, mie: rate.mieRate || 0 };
      }
      return acc;
    }, {});
  }, [perDiemRates]);
  const [entryModal, setEntryModal] = useState<{ groupId: string } | null>(null);
  const [entryModalNoteDraft, setEntryModalNoteDraft] = useState('');
  const [entryModalTravelOnlyDraft, setEntryModalTravelOnlyDraft] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [execModal, setExecModal] = useState(false);
  const [wrmCost, setWrmCost] = useState(0);
  const [gpcPurchasesCost, setGpcPurchasesCost] = useState(0);
  const [entryForm] = Form.useForm();
  const [contractForm] = Form.useForm();
  const [execForm] = Form.useForm();
  const wrmAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWrmAutoSaving = useRef(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
    queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
  };

  const refreshExerciseAndBudget = async () => {
    await queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
    await queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
    await queryClient.refetchQueries({ queryKey: ['exercise', exerciseId], type: 'active' });
    await queryClient.refetchQueries({ queryKey: ['budget', exerciseId], type: 'active' });
  };

  const updateGroupMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updatePersonnelGroup(id, data),
    onSuccess: refreshExerciseAndBudget,
  });

  const addEntryMut = useMutation({
    mutationFn: ({ groupId, data }: { groupId: string; data: any }) => api.addPersonnelEntry(groupId, data),
    onSuccess: async () => {
      await refreshExerciseAndBudget();
      setEntryModal(null);
      setEntryModalNoteDraft('');
      setEntryModalTravelOnlyDraft(false);
      entryForm.resetFields();
    },
  });

  const deleteEntryMut = useMutation({
    mutationFn: (id: string) => api.deletePersonnelEntry(id),
    onSuccess: refreshExerciseAndBudget,
  });

  const updateEntryMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updatePersonnelEntry(id, data),
    onSuccess: refreshExerciseAndBudget,
  });

  const addExecMut = useMutation({
    mutationFn: ({ unitId, data }: { unitId: string; data: any }) => api.addExecutionCost(unitId, data),
    onSuccess: () => { invalidate(); setExecModal(false); execForm.resetFields(); },
  });

  const deleteExecMut = useMutation({
    mutationFn: (id: string) => api.deleteExecutionCost(id),
    onSuccess: invalidate,
  });

  const updateExecMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateExecutionCost(id, data),
    onSuccess: invalidate,
  });

  const ub = exercise?.unitBudgets?.find((u: UnitBudget) => u.unitCode === unitCode);
  const unitCalc = unitCode ? budget?.units?.[unitCode] : undefined;
  const emptyCalcGroup: GroupCalc = { paxCount: 0, dutyDays: 0, milPay: 0, perDiem: 0, meals: 0, travel: 0, billeting: 0, subtotal: 0 };
  const unitCalcSafe: UnitCalc = unitCalc || {
    unitCode: unitCode || '',
    totalPax: 0,
    planningRpa: { ...emptyCalcGroup },
    planningOm: { ...emptyCalcGroup },
    whiteCellRpa: { ...emptyCalcGroup },
    whiteCellOm: { ...emptyCalcGroup },
    playerRpa: { ...emptyCalcGroup },
    playerOm: { ...emptyCalcGroup },
    executionRpa: 0,
    executionOm: 0,
    unitTotalRpa: 0,
    unitTotalOm: 0,
    unitTotal: 0,
  };

  const personnelGroups = ub?.personnelGroups || [];
  const executionCostLines = ub?.executionCostLines || [];
  const entryModalGroup = entryModal ? personnelGroups.find((group) => group.id === entryModal.groupId) : null;
  const entryModalIsPlanning = entryModalGroup?.role === 'PLANNING';
  const entryModalAllowsTravelOnly = entryModalGroup?.fundingType === 'RPA'
    && (entryModalGroup?.role === 'PLANNING' || entryModalGroup?.role === 'SUPPORT');

  const findGroup = (role: string, ft: FundingType) =>
    personnelGroups.find((g: PersonnelGroup) => g.role === role && g.fundingType === ft);

  const hasRole = (role: string) =>
    personnelGroups.some((group) => group.role === role);

  const isSgAeCabUnit = ['SG', 'AE', 'CAB'].includes(String(unitCode || '').toUpperCase());
  const isA7Unit = String(unitCode || '').toUpperCase() === 'A7';
  const wrmLines = executionCostLines.filter((line) => {
    const category = String(line.category || '').toUpperCase();
    return line.fundingType === 'OM' && (category === 'WRM' || category === 'UFR');
  });
  const titleContractLines = executionCostLines.filter(
    (line) => line.fundingType === 'OM' && String(line.category || '').toUpperCase() === 'TITLE_CONTRACTS',
  );
  const gpcPurchaseLines = executionCostLines.filter(
    (line) => line.fundingType === 'OM' && String(line.category || '').toUpperCase() === 'GPC_PURCHASES',
  );
  const wrmLine = wrmLines[0];
  const gpcPurchaseLine = gpcPurchaseLines[0];
  const persistedOverallEquipmentCost = parseA7OverallEquipmentCost(wrmLine?.notes)
    ?? (String(wrmLine?.category || '').toUpperCase() === 'UFR' ? (wrmLine?.amount || 0) * 10 : (wrmLine?.amount || 0));
  const persistedGpcPurchasesCost = gpcPurchaseLine?.amount || 0;

  useEffect(() => {
    const overallFromNotes = parseA7OverallEquipmentCost(wrmLine?.notes);
    if (overallFromNotes !== null) {
      setWrmCost(overallFromNotes);
      return;
    }

    if (!wrmLine) {
      setWrmCost(0);
      return;
    }

    const category = String(wrmLine.category || '').toUpperCase();
    setWrmCost(category === 'UFR' ? (wrmLine.amount || 0) * 10 : (wrmLine.amount || 0));
  }, [wrmLine?.id, wrmLine?.amount, wrmLine?.category, wrmLine?.notes]);

  useEffect(() => {
    setGpcPurchasesCost(gpcPurchaseLine?.amount || 0);
  }, [gpcPurchaseLine?.id, gpcPurchaseLine?.amount]);

  useEffect(() => {
    if (!entryModal) return;

    entryForm.setFieldsValue({
      rankCode: undefined,
      count: 1,
      dutyDays: exercise?.defaultDutyDays ?? 1,
      months: undefined,
      location: entryModalGroup?.location || perDiemLocations[0] || 'GULFPORT',
      isLocal: entryModalGroup?.isLocal ?? false,
    });
    setEntryModalNoteDraft('');
    setEntryModalTravelOnlyDraft(false);
  }, [entryModal, entryForm, entryModalGroup?.isLocal, entryModalGroup?.location, exercise?.defaultDutyDays, perDiemLocations]);

  const roleSections = ['PLANNING', 'PLAYER', 'WHITE_CELL', 'SUPPORT'].filter((role) => hasRole(role));

  const roleLabels: Record<string, string> = {
    PLAYER: 'Player',
    WHITE_CELL: 'White Cell',
    PLANNING: 'Planning',
    SUPPORT: 'Support-Execution',
  };

  const getRoleLabel = (role: string) => {
    if (isSgAeCabUnit && role === 'PLAYER') return 'Player - Execution';
    if (isSgAeCabUnit && role === 'WHITE_CELL') return 'White Cell - Execution';
    return roleLabels[role] || role;
  };

  const getCalc = (role: string, ft: FundingType): GroupCalc => {
    if (role === 'PLANNING') {
      return ft === 'RPA'
        ? (unitCalcSafe.planningRpa || unitCalcSafe.playerRpa)
        : (unitCalcSafe.planningOm || unitCalcSafe.playerOm);
    }
    if (role === 'PLAYER') {
      return ft === 'RPA' ? unitCalcSafe.playerRpa : unitCalcSafe.playerOm;
    }
    if (role === 'SUPPORT') {
      return ft === 'RPA' ? unitCalcSafe.whiteCellRpa : unitCalcSafe.whiteCellOm;
    }
    return ft === 'RPA' ? unitCalcSafe.whiteCellRpa : unitCalcSafe.whiteCellOm;
  };

  function PersonnelPanel({ role, ft }: { role: string; ft: FundingType }) {
    const group = findGroup(role, ft);
    const calc = getCalc(role, ft) || { paxCount: 0, dutyDays: 0, milPay: 0, perDiem: 0, meals: 0, travel: 0, billeting: 0, subtotal: 0 };
    if (!group) return null;
    const isPlayer = role === 'PLAYER';
    const isPlanning = role === 'PLANNING';
    const isPlayerRpa = isPlayer && ft === 'RPA';
    const isPlayerOm = isPlayer && ft === 'OM';
    const showTravelOnly = ft === 'RPA' && (role === 'PLANNING' || role === 'SUPPORT');
    const fundingNote = role === 'PLANNING'
      ? (ft === 'RPA'
          ? '(Exercise planning, planning meetings, site visits)'
          : '(Planning meetings, site visits)')
      : role === 'SUPPORT'
        ? '(ADVON, REARVON, exercise execution)'
        : '';
    const totalEntryPax = group.personnelEntries.reduce((sum, entry) => sum + entry.count, 0);
    const nonPlayerTravelEntries = !isPlayer
      ? (group.personnelEntries.length > 0
        ? group.personnelEntries
        : [{
            count: group.paxCount || 0,
            dutyDays: group.dutyDays ?? exercise?.defaultDutyDays ?? 1,
            location: group.location || 'GULFPORT',
            isLocal: group.isLocal,
          }])
      : [];
    const unitCount = exercise?.unitBudgets?.length || 1;
    const defaultTravel = exercise?.travelConfig || {
      airfarePerPerson: 400,
      rentalCarDailyRate: 50,
      rentalCarCount: 0,
      rentalCarDays: 0,
    };
    const airfarePerPerson = group.airfarePerPerson ?? defaultTravel.airfarePerPerson;
    const rentalDaily = group.rentalCarDaily ?? defaultTravel.rentalCarDailyRate;
    const hasGroupRental = (group.rentalCarCount || 0) > 0 || (group.rentalCarDays || 0) > 0 || group.rentalCarDaily != null;
    const sharedRentalCost = ((defaultTravel.rentalCarCount || 0) * (defaultTravel.rentalCarDailyRate || 0) * (defaultTravel.rentalCarDays || 0)) / unitCount;
    const configuredRentalCost = (group.rentalCarCount || 0) * rentalDaily * (group.rentalCarDays || 0);
    const nonPlayerTravelBreakout = nonPlayerTravelEntries.reduce(
      (acc, entry) => {
        const entryCount = entry.count || 0;
        const entryDays = entry.dutyDays || group.dutyDays || exercise?.defaultDutyDays || 1;
        const entryLoc = entry.location || group.location || 'GULFPORT';
        const entryIsLocal = !!(entry.isLocal ?? group.isLocal);
        if (entryIsLocal) {
          return acc;
        }
        const rates = perDiemByLocation[entryLoc] || { lodging: 0, mie: 0 };
        acc.perDiem += entryCount * rates.mie * entryDays;
        acc.lodging += entryCount * rates.lodging * entryDays;
        acc.airfare += entryCount * airfarePerPerson;
        acc.hasNonLocal = true;
        return acc;
      },
      { perDiem: 0, lodging: 0, airfare: 0, rental: 0, hasNonLocal: false },
    );
    if ((role === 'WHITE_CELL' || role === 'SUPPORT') && ft === 'RPA' && nonPlayerTravelBreakout.hasNonLocal && nonPlayerTravelBreakout.airfare > 0) {
      nonPlayerTravelBreakout.rental = hasGroupRental ? configuredRentalCost : sharedRentalCost;
    }
    const nonPlayerTravelTotal =
      nonPlayerTravelBreakout.perDiem +
      nonPlayerTravelBreakout.lodging +
      nonPlayerTravelBreakout.airfare +
      nonPlayerTravelBreakout.rental;
    const nonPlayerSummary =
      ft === 'OM'
        ? `Travel Pay Total: ${fmt(nonPlayerTravelTotal)} (Per diem: ${fmt(nonPlayerTravelBreakout.perDiem)}, Lodging: ${fmt(nonPlayerTravelBreakout.lodging)}, Airfare: ${fmt(nonPlayerTravelBreakout.airfare)}, Rental: ${fmt(nonPlayerTravelBreakout.rental)}) \u2022 Total: ${fmt(nonPlayerTravelTotal)}`
        : `Mil Pay: ${fmt(calc.milPay)} \u2022 Travel Pay Total: ${fmt(nonPlayerTravelTotal)} (Per diem: ${fmt(nonPlayerTravelBreakout.perDiem)}, Lodging: ${fmt(nonPlayerTravelBreakout.lodging)}, Airfare: ${fmt(nonPlayerTravelBreakout.airfare)}, Rental: ${fmt(nonPlayerTravelBreakout.rental)}) \u2022 Total: ${fmt(calc.milPay + nonPlayerTravelTotal)}`;

    return (
      <Card
        title={
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className={ft === 'RPA' ? 'ct-badge-rpa' : 'ct-badge-om'}>{ft === 'OM' ? 'O&M' : ft}</span>
            {fundingNote ? (
              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{fundingNote}</span>
            ) : null}
          </span>
        }
        size="small"
        className="ct-personnel-card"
        extra={<Space><strong>PAX: {group.paxCount || totalEntryPax}</strong><span style={{ fontSize: 16, fontWeight: 700, color: ft === 'RPA' ? '#1677ff' : '#52c41a' }}>{fmt(calc.subtotal)}</span></Space>}
      >
        <Row gutter={16} style={{ marginBottom: 12 }}>
          {!isPlayerRpa && (
            <Col span={6} className="ct-field-stack">
              <Typography.Text type="secondary" className="ct-field-label">Airfare/POV ($/person)</Typography.Text>
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
              <Col span={4} className="ct-field-stack">
                <Typography.Text type="secondary" className="ct-field-label">Rental Cars (#)</Typography.Text>
                <InputNumber
                  min={0}
                  value={group.rentalCarCount || 0}
                  style={{ width: '100%' }}
                  onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { rentalCarCount: v || 0 } })}
                />
              </Col>
              <Col span={4} className="ct-field-stack">
                <Typography.Text type="secondary" className="ct-field-label">Rental Rate ($/day)</Typography.Text>
                <InputNumber
                  min={0}
                  value={group.rentalCarDaily ?? 50}
                  style={{ width: '100%' }}
                  onChange={(v) => updateGroupMut.mutate({ id: group.id, data: { rentalCarDaily: v || 0 } })}
                />
              </Col>
              <Col span={4} className="ct-field-stack">
                <Typography.Text type="secondary" className="ct-field-label">Rental Days</Typography.Text>
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
            ? <>
                {`Mil Pay: ${fmt(calc.milPay)} • Travel Pay: ${fmt(calc.travel)} • Per Diem (M&IE): ${fmt(calc.perDiem)} • `}
                <span style={{ color: 'var(--ct-success)' }}>{`Billeting: ${fmt(calc.billeting)}`}</span>
                {` • Meals: ${fmt(calc.meals)} • Total: ${fmt(calc.subtotal)}`}
              </>
              : isPlayerOm
              ? <>
                  {`Travel Pay: ${fmt(calc.travel)} • Per Diem (M&IE): ${fmt(calc.perDiem)} • `}
                  <span style={{ color: 'var(--ct-success)' }}>{`Billeting: ${fmt(calc.billeting)}`}</span>
                  {` • Total: ${fmt(calc.subtotal)}`}
                </>
                : nonPlayerSummary}
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
              ...(isPlanning ? [{
                title: 'Months',
                dataIndex: 'dutyDays',
                width: 100,
                render: (value: number | null, row: { id: string }) => (
                  <InputNumber
                    size="small"
                    min={0}
                    step={0.25}
                    precision={2}
                    value={dutyDaysToMonths(value ?? exercise!.defaultDutyDays)}
                    style={{ width: '100%' }}
                    onChange={(v) => {
                      if (v === null) return;
                      updateEntryMut.mutate({ id: row.id, data: { dutyDays: monthsToDutyDays(v) } });
                    }}
                  />
                ),
              }] : []),
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
              ...(isPlanning ? [{
                title: 'Note',
                dataIndex: 'note',
                width: 180,
                render: (value: string | null, row: { id: string }) => (
                  <PlanningNoteInput
                    value={value}
                    onSave={(nextValue) => {
                      updateEntryMut.mutate({ id: row.id, data: { note: nextValue } });
                    }}
                  />
                ),
              }] : []),
              ...(showTravelOnly ? [{
                title: 'Travel Only',
                dataIndex: 'travelOnly',
                width: 120,
                render: (value: boolean, row: { id: string }) => (
                  <Switch
                    className="ct-travel-only-switch"
                    size="small"
                    checked={!!value}
                    checkedChildren="travel only"
                    unCheckedChildren=""
                    onChange={(nextValue) => updateEntryMut.mutate({ id: row.id, data: { travelOnly: nextValue } })}
                  />
                ),
              }] : []),
              {
                title: 'Local / Not local',
                dataIndex: 'isLocal',
                width: 100,
                render: (value, row) => (
                  <Switch
                    className="ct-locality-switch"
                    size="small"
                    checked={!!value}
                    checkedChildren="Local"
                    unCheckedChildren="Not local"
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
    { title: 'Funding', dataIndex: 'fundingType', width: 80, render: (value: string) => value === 'OM' ? 'O&M' : value },
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

  const planningOm = unitCalcSafe.planningOm || { travel: 0, billeting: 0, perDiem: 0 };
  const whiteCellOm = unitCalcSafe.whiteCellOm || { travel: 0, billeting: 0, perDiem: 0 };
  const playerOm = unitCalcSafe.playerOm || { travel: 0, billeting: 0, perDiem: 0 };
  const omWrmTotal = wrmLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const omContractsTotal = titleContractLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const omGpcPurchasesTotal = gpcPurchaseLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const sgAeCabPlayerBilletingTotal = ['AE', 'CAB', 'SG'].reduce((sum, code) => {
    const calc = budget?.units?.[code];
    return sum + (calc?.playerOm?.billeting || 0);
  }, 0);
  const userContractLines = titleContractLines
    .filter((line) => String(line.notes || '').trim().toLowerCase() !== 'player billeting')
    .sort((a, b) => {
      const left = String(a.notes || '').toLowerCase();
      const right = String(b.notes || '').toLowerCase();
      if (left < right) return -1;
      if (left > right) return 1;
      return String(a.id).localeCompare(String(b.id));
    });
  const contractLinesForDisplay = [
    {
      id: '__derived_player_billeting__',
      key: '__derived_player_billeting__',
      notes: 'Player Billeting',
      amount: sgAeCabPlayerBilletingTotal,
      isDerived: true,
    },
    ...userContractLines.map((line) => ({ ...line, key: line.id, isDerived: false })),
  ];
  const contractsDisplayTotal = sgAeCabPlayerBilletingTotal + userContractLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const omPlanningTravelTotal = (planningOm.travel || 0) + (planningOm.perDiem || 0);
  const omSupportExecutionTravelTotal = (whiteCellOm.travel || 0) + (whiteCellOm.perDiem || 0);
  const ufrCost = Math.round(((Number(wrmCost) || 0) * 0.1) * 100) / 100;

  const saveWrmCost = useCallback(async () => {
    if (!ub) return;
    const overallEquipmentCost = Number(wrmCost) || 0;
    const amount = Math.round((overallEquipmentCost * 0.1) * 100) / 100;
    const notes = `A7_WRM_OVERALL:${overallEquipmentCost}`;

    if (wrmLine) {
      await updateExecMut.mutateAsync({
        id: wrmLine.id,
        data: { fundingType: 'OM', category: 'UFR', amount, notes },
      });
    } else {
      await addExecMut.mutateAsync({
        unitId: ub.id,
        data: { fundingType: 'OM', category: 'UFR', amount, notes },
      });
    }

    if (wrmLines.length > 1) {
      await Promise.all(wrmLines.slice(1).map((line) => api.deleteExecutionCost(line.id)));
      invalidate();
    }

    if (gpcPurchaseLine) {
      await updateExecMut.mutateAsync({
        id: gpcPurchaseLine.id,
        data: {
          fundingType: 'OM',
          category: 'GPC_PURCHASES',
          amount: Number(gpcPurchasesCost) || 0,
          notes: 'GPC Purchases O&M Cost',
        },
      });
    } else {
      await addExecMut.mutateAsync({
        unitId: ub.id,
        data: {
          fundingType: 'OM',
          category: 'GPC_PURCHASES',
          amount: Number(gpcPurchasesCost) || 0,
          notes: 'GPC Purchases O&M Cost',
        },
      });
    }

    if (gpcPurchaseLines.length > 1) {
      await Promise.all(gpcPurchaseLines.slice(1).map((line) => api.deleteExecutionCost(line.id)));
      invalidate();
    }
  }, [
    wrmCost,
    wrmLine,
    addExecMut,
    updateExecMut,
    ub?.id,
    wrmLines,
    gpcPurchaseLine,
    gpcPurchasesCost,
    gpcPurchaseLines,
    invalidate,
  ]);

  useEffect(() => {
    if (!isA7Unit) return;

    const currentWrm = Number(wrmCost) || 0;
    const currentGpc = Number(gpcPurchasesCost) || 0;

    const hasChanges =
      Math.abs(currentWrm - persistedOverallEquipmentCost) > 0.001 ||
      Math.abs(currentGpc - persistedGpcPurchasesCost) > 0.001;

    if (!hasChanges || isWrmAutoSaving.current) return;

    if (wrmAutoSaveTimer.current) {
      clearTimeout(wrmAutoSaveTimer.current);
    }

    wrmAutoSaveTimer.current = setTimeout(async () => {
      if (isWrmAutoSaving.current) return;
      isWrmAutoSaving.current = true;
      try {
        await saveWrmCost();
      } finally {
        isWrmAutoSaving.current = false;
      }
    }, 700);

    return () => {
      if (wrmAutoSaveTimer.current) {
        clearTimeout(wrmAutoSaveTimer.current);
        wrmAutoSaveTimer.current = null;
      }
    };
  }, [
    isA7Unit,
    wrmCost,
    gpcPurchasesCost,
    persistedOverallEquipmentCost,
    persistedGpcPurchasesCost,
    saveWrmCost,
  ]);

  if (!exercise || !budget || !unitCode) return <div className="ct-loading"><Spin size="large" /></div>;
  if (!ub || !unitCalc) return <Typography.Text>Unit not found</Typography.Text>;

  return (
    <div>
      <Typography.Title level={4} className="ct-page-title">{getUnitDisplayLabel(unitCode)} — Unit Budget</Typography.Title>

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
              <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                {isSgAeCabUnit ? (
                  <>
                    <div>Planning Travel (AGRs and Civ): {fmt(omPlanningTravelTotal)}</div>
                    <div>Support - Execution Travel (AGRs and Civ): {fmt(omSupportExecutionTravelTotal)}</div>
                  </>
                ) : (
                  <>
                    <div>WRM: {fmt(omWrmTotal)}</div>
                    <div>Contracts: {fmt(omContractsTotal)}</div>
                    <div>GPC Purchases: {fmt(omGpcPurchasesTotal)}</div>
                    <div>Planning Travel: {fmt(omPlanningTravelTotal)}</div>
                    <div>Support - Execution Travel: {fmt(omSupportExecutionTravelTotal)}</div>
                  </>
                )}
              </div>
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

      {isA7Unit && (
        <>
          <Card
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span>WRM (War Reserve Material)</span>
                <span className="ct-badge-om">O&M</span>
              </span>
            }
            className="ct-section-card"
            style={{ marginBottom: 12 }}
          >
            <Row gutter={16}>
              <Col xs={24} md={12} className="ct-field-stack">
                <Typography.Text type="secondary" className="ct-field-label">
                  Overall Equipment Cost
                </Typography.Text>
                <InputNumber
                  min={0}
                  value={wrmCost}
                  onChange={(value) => setWrmCost(value || 0)}
                  style={{ width: '100%' }}
                  prefix="$"
                  formatter={formatNumberInput}
                  parser={parseNumberInput}
                />
              </Col>
              <Col xs={24} md={12} className="ct-field-stack">
                <Typography.Text type="secondary" className="ct-field-label">
                  UFR Cost (10% to O&amp;M)
                </Typography.Text>
                <InputNumber
                  min={0}
                  value={ufrCost}
                  style={{ width: '100%' }}
                  prefix="$"
                  formatter={formatNumberInput}
                  readOnly
                />
              </Col>
            </Row>
          </Card>

          <Card
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span>Contracts</span>
                <span className="ct-badge-om">O&M</span>
                <span style={{ fontSize: 12, color: '#52c41a', fontWeight: 700 }}>Total: {fmt(contractsDisplayTotal)}</span>
              </span>
            }
            className="ct-section-card"
            style={{ marginBottom: 16 }}
            extra={
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => setContractModalOpen(true)}>
                Add Contract Details
              </Button>
            }
          >
            <div className="ct-table">
              <Table
                size="small"
                pagination={false}
                dataSource={contractLinesForDisplay}
                locale={{ emptyText: 'No contract details yet' }}
                columns={[
                  {
                    title: 'Type',
                    dataIndex: 'notes',
                    render: (value: string | null) => value || '—',
                  },
                  {
                    title: 'Cost',
                    dataIndex: 'amount',
                    width: 140,
                    render: (value: number) => fmt(value || 0),
                  },
                  {
                    title: '',
                    width: 56,
                    render: (_: any, row: any) => (
                      row.isDerived
                        ? null
                        : (
                          <Popconfirm title="Remove?" onConfirm={() => deleteExecMut.mutate(row.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        )
                    ),
                  },
                ]}
              />
            </div>
          </Card>

          <Card
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span>GPC Purchases</span>
                <span className="ct-badge-om">O&M</span>
              </span>
            }
            className="ct-section-card"
            style={{ marginBottom: 16 }}
          >
            <Row gutter={16}>
              <Col xs={24} md={24} className="ct-field-stack">
                <Typography.Text type="secondary" className="ct-field-label">
                  GPC Purchases (O&amp;M)
                </Typography.Text>
                <InputNumber
                  min={0}
                  value={gpcPurchasesCost}
                  onChange={(value) => setGpcPurchasesCost(value || 0)}
                  style={{ width: '100%' }}
                  prefix="$"
                  formatter={formatNumberInput}
                  parser={parseNumberInput}
                />
              </Col>
            </Row>
          </Card>
        </>
      )}

      <Divider />

      {/* Personnel panels */}
      <Row gutter={16}>
        {roleSections.map((role) => (
          <Col xs={24} lg={12} key={role}>
            <Typography.Title level={5}>{getRoleLabel(role)}</Typography.Title>
            <PersonnelPanel role={role} ft="RPA" />
            <PersonnelPanel role={role} ft="OM" />
          </Col>
        ))}
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
            dataSource={executionCostLines.map((l) => ({ ...l, key: l.id }))}
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
          const calculatedDutyDays = entryModalIsPlanning && values.months !== undefined && values.months !== null
            ? monthsToDutyDays(values.months)
            : values.dutyDays;
          const payload = {
            rankCode: values.rankCode,
            count: values.count,
            dutyDays: calculatedDutyDays,
            location: values.location,
            note: entryModalIsPlanning ? (entryModalNoteDraft.trim() || null) : null,
            travelOnly: entryModalAllowsTravelOnly ? entryModalTravelOnlyDraft : false,
            isLocal: !!values.isLocal,
          };
          addEntryMut.mutate({ groupId: entryModal!.groupId, data: payload });
        }}
        onCancel={() => {
          setEntryModal(null);
          setEntryModalNoteDraft('');
          setEntryModalTravelOnlyDraft(false);
          entryForm.resetFields();
        }}
      >
        <Form form={entryForm} layout="vertical">
          <Form.Item name="rankCode" label="Rank" rules={[{ required: true }]}>
            <Select options={RANKS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="count" label="Count" initialValue={1} rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          {entryModalIsPlanning && (
            <Form.Item name="months" label="Months (optional, 30 days/month)">
              <InputNumber
                min={0}
                step={0.25}
                precision={2}
                style={{ width: '100%' }}
                onChange={(value) => {
                  if (value === null) return;
                  entryForm.setFieldValue('dutyDays', monthsToDutyDays(value));
                }}
              />
            </Form.Item>
          )}
          <Form.Item name="dutyDays" label="Duty Days" initialValue={exercise.defaultDutyDays} rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="location" label="Location" initialValue={perDiemLocations[0] || 'GULFPORT'} rules={[{ required: true }]}>
            <Select options={perDiemLocations.map((loc) => ({ value: loc, label: loc }))} />
          </Form.Item>
          {entryModalIsPlanning && (
            <Form.Item label="Note">
              <AutoComplete
                value={entryModalNoteDraft}
                options={PLANNING_NOTE_OPTIONS}
                style={{ width: '100%' }}
                placeholder="Select or type a note"
                filterOption={(inputValue, option) =>
                  String(option?.value || '').toLowerCase().includes(inputValue.toLowerCase())
                }
                onChange={setEntryModalNoteDraft}
                onSelect={setEntryModalNoteDraft}
              >
                <Input />
              </AutoComplete>
            </Form.Item>
          )}
          {entryModalAllowsTravelOnly && (
            <Form.Item label="Travel Only">
              <Switch
                className="ct-travel-only-switch"
                checked={entryModalTravelOnlyDraft}
                checkedChildren="travel only"
                unCheckedChildren=""
                onChange={setEntryModalTravelOnlyDraft}
              />
            </Form.Item>
          )}
          <Form.Item name="isLocal" label="Local / Not local" valuePropName="checked" initialValue={false}>
            <Switch className="ct-locality-switch" checkedChildren="Local" unCheckedChildren="Not local" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add Contract Details"
        open={contractModalOpen}
        onOk={async () => {
          const values = await contractForm.validateFields();
          await addExecMut.mutateAsync({
            unitId: ub.id,
            data: {
              fundingType: 'OM',
              category: 'TITLE_CONTRACTS',
              amount: Number(values.cost) || 0,
              notes: values.type,
            },
          });
          setContractModalOpen(false);
          contractForm.resetFields();
        }}
        onCancel={() => {
          setContractModalOpen(false);
          contractForm.resetFields();
        }}
      >
        <Form form={contractForm} layout="vertical">
          <Form.Item name="type" label="Type" rules={[{ required: true, message: 'Enter contract type' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="cost" label="Cost" rules={[{ required: true, message: 'Enter contract cost' }]}>
            <InputNumber min={0} style={{ width: '100%' }} prefix="$" />
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
            <Select options={[{ value: 'RPA', label: 'RPA' }, { value: 'OM', label: 'O&M' }]} />
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
