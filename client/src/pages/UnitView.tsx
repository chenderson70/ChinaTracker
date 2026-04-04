import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import type { ExerciseDetail, PersonnelGroup, UnitBudget, FundingType, UnitCalc, GroupCalc, PerDiemRate } from '../types';
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
  { value: 'Initial Planning Conference' },
  { value: 'Mid Planning Conference' },
  { value: 'Final Planning Conference' },
];
const WHITE_CELL_TYPE_OPTIONS = [
  { value: 'White Cell' },
  { value: 'DTT (OC/T)' },
  { value: 'ECG' },
];
const DAYS_PER_MONTH = 30;

function monthsToDutyDays(months: number): number {
  return Math.max(1, Math.round(months * DAYS_PER_MONTH));
}

function dutyDaysToMonths(dutyDays: number): number {
  return Number((dutyDays / DAYS_PER_MONTH).toFixed(2));
}

function EntryAutoCompleteInput({
  value,
  options,
  placeholder,
  onSave,
}: {
  value: string | null | undefined;
  options: Array<{ value: string }>;
  placeholder: string;
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
      options={options}
      style={{ width: '100%' }}
      placeholder={placeholder}
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

function DraftNumberInput({
  value,
  onSave,
  size = 'small',
  style,
  min,
  step,
  precision,
  prefix,
  formatter,
  parser,
}: {
  value: number | null | undefined;
  onSave: (value: number) => void;
  size?: 'small' | 'middle' | 'large';
  style?: CSSProperties;
  min?: number;
  step?: number;
  precision?: number;
  prefix?: React.ReactNode;
  formatter?: (value: string | number | undefined) => string;
  parser?: (value: string | undefined) => number;
}) {
  const normalizedValue = value ?? 0;
  const [draft, setDraft] = useState<number | null>(normalizedValue);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(normalizedValue);
    }
  }, [normalizedValue, isEditing]);

  const commit = () => {
    const nextValue = draft ?? normalizedValue;
    setIsEditing(false);
    setDraft(nextValue);
    if (Math.abs(nextValue - normalizedValue) > 0.0001) {
      onSave(nextValue);
    }
  };

  return (
    <InputNumber
      size={size}
      min={min}
      step={step}
      precision={precision}
      prefix={prefix}
      formatter={formatter}
      parser={parser}
      value={draft}
      style={style}
      onFocus={() => setIsEditing(true)}
      onChange={(nextValue) => {
        setIsEditing(true);
        setDraft(typeof nextValue === 'number' ? nextValue : nextValue === null ? null : Number(nextValue));
      }}
      onBlur={commit}
      onPressEnter={commit}
    />
  );
}

function DraftTextInput({
  value,
  onSave,
  size = 'small',
  style,
  placeholder,
}: {
  value: string | null | undefined;
  onSave: (value: string | null) => void;
  size?: 'small' | 'middle' | 'large';
  style?: CSSProperties;
  placeholder?: string;
}) {
  const normalizedValue = String(value || '');
  const [draft, setDraft] = useState(normalizedValue);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(normalizedValue);
    }
  }, [normalizedValue, isEditing]);

  const commit = () => {
    const nextValue = draft.trim();
    const currentValue = normalizedValue.trim();
    setIsEditing(false);
    if (nextValue !== currentValue) {
      onSave(nextValue || null);
    }
  };

  return (
    <Input
      size={size}
      value={draft}
      style={style}
      placeholder={placeholder}
      onFocus={() => setIsEditing(true)}
      onChange={(event) => {
        setIsEditing(true);
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onPressEnter={commit}
    />
  );
}

export default function UnitView() {
  const { unitCode } = useParams<{ unitCode: string }>();
  const { exercise, budget, exerciseId } = useApp();
  const queryClient = useQueryClient();
  const { data: appConfig = {} } = useQuery({ queryKey: ['appConfig'], queryFn: api.getAppConfig });
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
  const defaultAirfare = Number(appConfig.DEFAULT_AIRFARE ?? 400);
  const defaultRentalCarDailyRate = Number(appConfig.DEFAULT_RENTAL_CAR_DAILY ?? 50);
  const [entryModal, setEntryModal] = useState<{ groupId: string } | null>(null);
  const [entryModalNoteDraft, setEntryModalNoteDraft] = useState('');
  const [entryModalTravelOnlyDraft, setEntryModalTravelOnlyDraft] = useState(false);
  const [entryModalLongTermA7PlannerDraft, setEntryModalLongTermA7PlannerDraft] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [gpcModalOpen, setGpcModalOpen] = useState(false);
  const [execModal, setExecModal] = useState(false);
  const [wrmCost, setWrmCost] = useState(0);
  const [entryForm] = Form.useForm();
  const [contractForm] = Form.useForm();
  const [gpcForm] = Form.useForm();
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

  const removeEntryFromExerciseCache = useCallback((current: ExerciseDetail | null | undefined, entryId: string) => {
    if (!current || !unitCode) return current;

    let exerciseChanged = false;
    const nextUnitBudgets = current.unitBudgets.map((unitBudget) => {
      if (unitBudget.unitCode !== unitCode) return unitBudget;

      let unitChanged = false;
      const nextGroups = unitBudget.personnelGroups.map((group) => {
        const nextEntries = group.personnelEntries.filter((entry) => entry.id !== entryId);
        if (nextEntries.length === group.personnelEntries.length) {
          return group;
        }

        unitChanged = true;
        return {
          ...group,
          personnelEntries: nextEntries,
          paxCount: nextEntries.reduce((sum, entry) => sum + entry.count, 0),
        };
      });

      if (!unitChanged) return unitBudget;
      exerciseChanged = true;
      return {
        ...unitBudget,
        personnelGroups: nextGroups,
      };
    });

    if (!exerciseChanged) return current;
    return {
      ...current,
      unitBudgets: nextUnitBudgets,
    };
  }, [unitCode]);

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
      setEntryModalLongTermA7PlannerDraft(false);
      entryForm.resetFields();
    },
  });

  const deleteEntryMut = useMutation({
    mutationFn: (id: string) => api.deletePersonnelEntry(id),
    onMutate: async (entryId: string) => {
      await queryClient.cancelQueries({ queryKey: ['exercise', exerciseId] });

      const previousExercise = queryClient.getQueryData<ExerciseDetail>(['exercise', exerciseId]);
      queryClient.setQueryData<ExerciseDetail | null>(['exercise', exerciseId], (current) =>
        removeEntryFromExerciseCache(current, entryId) ?? current,
      );

      return { previousExercise };
    },
    onSuccess: async () => {
      message.success('Entry removed');
      try {
        await refreshExerciseAndBudget();
      } catch {
        message.warning('Entry removed, but totals could not refresh automatically.');
      }
    },
    onError: (error: any, _entryId, context) => {
      if (context?.previousExercise !== undefined) {
        queryClient.setQueryData(['exercise', exerciseId], context.previousExercise);
      }
      message.error(error?.message || 'Failed to remove entry');
    },
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
    annualTourRpa: { ...emptyCalcGroup },
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
  const entryModalIsWhiteCell = entryModalGroup?.role === 'WHITE_CELL';
  const entryModalSupportsRentalCars = entryModalGroup?.role === 'WHITE_CELL' || entryModalGroup?.role === 'SUPPORT';
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
  const persistedOverallEquipmentCost = parseA7OverallEquipmentCost(wrmLine?.notes)
    ?? (String(wrmLine?.category || '').toUpperCase() === 'UFR' ? (wrmLine?.amount || 0) * 10 : (wrmLine?.amount || 0));

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
    if (!entryModal) return;

    entryForm.setFieldsValue({
      rankCode: undefined,
      count: 1,
      dutyDays: exercise?.defaultDutyDays ?? 1,
      rentalCarCount: 0,
      months: undefined,
      location: entryModalGroup?.location || perDiemLocations[0] || 'GULFPORT',
      isLocal: entryModalGroup?.isLocal ?? false,
    });
    setEntryModalNoteDraft('');
    setEntryModalTravelOnlyDraft(false);
    setEntryModalLongTermA7PlannerDraft(false);
  }, [entryModal, entryForm, entryModalGroup?.isLocal, entryModalGroup?.location, exercise?.defaultDutyDays, perDiemLocations]);

  const roleSections = ['PLANNING', 'PLAYER', 'ANNUAL_TOUR', 'WHITE_CELL', 'SUPPORT'].filter((role) => hasRole(role));

  const roleLabels: Record<string, string> = {
    PLAYER: 'Player',
    ANNUAL_TOUR: 'Player - Annual Tour',
    WHITE_CELL: 'Support Personnel - Execution',
    PLANNING: 'Planning',
    SUPPORT: 'Support-Execution',
  };

  const getRoleLabel = (role: string) => {
    if (isSgAeCabUnit && role === 'PLAYER') return 'Player - Execution (RPA)';
    if (isSgAeCabUnit && role === 'WHITE_CELL') return 'Support Personnel - Execution';
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
    if (role === 'ANNUAL_TOUR') {
      return ft === 'RPA' ? (unitCalcSafe.annualTourRpa || emptyCalcGroup) : emptyCalcGroup;
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
    const isAnnualTour = role === 'ANNUAL_TOUR';
    const isPlayerLike = isPlayer || isAnnualTour;
    const isPlanning = role === 'PLANNING';
    const isWhiteCell = role === 'WHITE_CELL';
    const supportsRentalCars = role === 'WHITE_CELL' || role === 'SUPPORT';
    const usesEntryLevelRental = supportsRentalCars;
    const isPlayerRpa = isPlayerLike && ft === 'RPA';
    const isPlayerOm = isPlayer && ft === 'OM';
    const showTravelOnly = ft === 'RPA' && (role === 'PLANNING' || role === 'SUPPORT');
    const fundingNote = role === 'PLANNING'
      ? (ft === 'RPA'
          ? '(Exercise planning, planning meetings, site visits)'
          : '(Planning meetings, site visits)')
      : role === 'ANNUAL_TOUR'
        ? '(Calculated using the same formula as RPA player costs)'
      : role === 'SUPPORT'
        ? '(ADVON, REARVON, exercise execution)'
        : '';
    const totalEntryPax = group.personnelEntries.reduce((sum, entry) => sum + entry.count, 0);
    const nonPlayerTravelEntries = !isPlayerLike
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
      airfarePerPerson: defaultAirfare,
      rentalCarDailyRate: defaultRentalCarDailyRate,
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
          if (usesEntryLevelRental) {
            acc.rental += (Number((entry as any).rentalCarCount || 0) || 0) * rentalDaily * entryDays;
          }
          return acc;
        }
        const rates = perDiemByLocation[entryLoc] || { lodging: 0, mie: 0 };
        acc.perDiem += entryCount * rates.mie * entryDays;
        acc.lodging += entryCount * rates.lodging * entryDays;
        acc.airfare += entryCount * airfarePerPerson;
        if (usesEntryLevelRental) {
          acc.rental += (Number((entry as any).rentalCarCount || 0) || 0) * rentalDaily * entryDays;
        }
        acc.hasNonLocal = true;
        return acc;
      },
      { perDiem: 0, lodging: 0, airfare: 0, rental: 0, hasNonLocal: false },
    );
    if (!usesEntryLevelRental && role === 'SUPPORT' && ft === 'RPA' && nonPlayerTravelBreakout.hasNonLocal && nonPlayerTravelBreakout.airfare > 0) {
      nonPlayerTravelBreakout.rental = hasGroupRental ? configuredRentalCost : sharedRentalCost;
    }
    const nonPlayerTravelTotal =
      nonPlayerTravelBreakout.perDiem +
      nonPlayerTravelBreakout.lodging +
      nonPlayerTravelBreakout.airfare +
      nonPlayerTravelBreakout.rental;
    const nonPlayerSummary =
      ft === 'OM'
        ? `Airfare: ${fmt(nonPlayerTravelBreakout.airfare)} \u2022 Per Diem: ${fmt(nonPlayerTravelBreakout.perDiem)} \u2022 Billeting: ${fmt(nonPlayerTravelBreakout.lodging)} \u2022 Rental Car: ${fmt(nonPlayerTravelBreakout.rental)} \u2022 Total: ${fmt(nonPlayerTravelTotal)}`
        : `Mil Pay: ${fmt(calc.milPay)} \u2022 Travel Pay Total: ${fmt(nonPlayerTravelTotal)} (Per diem: ${fmt(nonPlayerTravelBreakout.perDiem)}, Lodging: ${fmt(nonPlayerTravelBreakout.lodging)}, Airfare: ${fmt(nonPlayerTravelBreakout.airfare)}, Rental: ${fmt(nonPlayerTravelBreakout.rental)}) \u2022 Total: ${fmt(calc.milPay + nonPlayerTravelTotal)}`;
    const playerTravelBreakout = {
      perDiem: calc.perDiem || 0,
      billeting: calc.billeting || 0,
      airfare: calc.travel || 0,
      rental: 0,
    };
    const playerTravelTotal =
      playerTravelBreakout.perDiem +
      playerTravelBreakout.billeting +
      playerTravelBreakout.airfare +
      playerTravelBreakout.rental;
    const billetingHighlight = (
      <span className="ct-inline-om-highlight">Billeting (O&amp;M): {fmt(playerTravelBreakout.billeting)}</span>
    );
    const playerRpaSummary = (
      <>
        {`Mil Pay: ${fmt(calc.milPay)} \u2022 Travel Pay Total: ${fmt(playerTravelTotal)} (`}
        {`Per diem: ${fmt(playerTravelBreakout.perDiem)}, `}
        {billetingHighlight}
        {`, Airfare: ${fmt(playerTravelBreakout.airfare)}, Rental: ${fmt(playerTravelBreakout.rental)}) `}
        {`\u2022 Meals: ${fmt(calc.meals)} \u2022 Total: ${fmt(calc.subtotal)}`}
      </>
    );
    const playerOmSummary = (
      <>
        {`Airfare: ${fmt(playerTravelBreakout.airfare)} \u2022 Per Diem: ${fmt(playerTravelBreakout.perDiem)} \u2022 `}
        {billetingHighlight}
        {` \u2022 Total: ${fmt(calc.subtotal)}`}
      </>
    );

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
              <DraftNumberInput
                size="middle"
                min={0}
                value={group.airfarePerPerson ?? defaultTravel.airfarePerPerson}
                style={{ width: '100%' }}
                onSave={(nextValue) => updateGroupMut.mutate({ id: group.id, data: { airfarePerPerson: nextValue } })}
              />
            </Col>
          )}
          {(role === 'WHITE_CELL' || role === 'SUPPORT') && (
            <Col span={6} className="ct-field-stack">
              <Typography.Text type="secondary" className="ct-field-label">Rental Rate ($/day)</Typography.Text>
              <DraftNumberInput
                size="middle"
                min={0}
                value={group.rentalCarDaily ?? defaultTravel.rentalCarDailyRate}
                style={{ width: '100%' }}
                onSave={(nextValue) => updateGroupMut.mutate({ id: group.id, data: { rentalCarDaily: nextValue } })}
              />
            </Col>
          )}
        </Row>

        {/* Cost breakdown */}
        <Typography.Text style={{ color: '#1677ff', fontWeight: 600, display: 'block', marginBottom: 10 }}>
          {isPlayerRpa
            ? playerRpaSummary
              : isPlayerOm
              ? playerOmSummary
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
                title: 'PAX',
                dataIndex: 'count',
                width: 90,
                render: (value, row) => (
                  <DraftNumberInput
                    min={1}
                    value={value}
                    style={{ width: '100%' }}
                    onSave={(nextValue) => updateEntryMut.mutate({ id: row.id, data: { count: nextValue || 1 } })}
                  />
                ),
              },
              ...(isPlanning ? [{
                title: 'Months',
                dataIndex: 'dutyDays',
                width: 100,
                render: (value: number | null, row: { id: string }) => (
                  <DraftNumberInput
                    min={0}
                    step={0.25}
                    precision={2}
                    value={dutyDaysToMonths(value ?? exercise!.defaultDutyDays)}
                    style={{ width: '100%' }}
                    onSave={(nextValue) => {
                      updateEntryMut.mutate({ id: row.id, data: { dutyDays: monthsToDutyDays(nextValue) } });
                    }}
                  />
                ),
              }] : []),
              {
                title: 'Duty Days',
                dataIndex: 'dutyDays',
                width: 110,
                render: (value, row) => (
                  <DraftNumberInput
                    min={1}
                    value={value ?? exercise!.defaultDutyDays}
                    style={{ width: '100%' }}
                    onSave={(nextValue) => updateEntryMut.mutate({ id: row.id, data: { dutyDays: nextValue || 1 } })}
                  />
                ),
              },
              ...(supportsRentalCars ? [{
                title: 'Rental Car',
                dataIndex: 'rentalCarCount',
                width: 110,
                render: (value: number, row: { id: string }) => (
                  <DraftNumberInput
                    min={0}
                    precision={0}
                    value={value || 0}
                    style={{ width: '100%' }}
                    onSave={(nextValue) => updateEntryMut.mutate({ id: row.id, data: { rentalCarCount: nextValue || 0 } })}
                  />
                ),
              }] : []),
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
                  <EntryAutoCompleteInput
                    value={value}
                    options={PLANNING_NOTE_OPTIONS}
                    placeholder="Select or type a note"
                    onSave={(nextValue) => {
                      updateEntryMut.mutate({ id: row.id, data: { note: nextValue } });
                    }}
                  />
                ),
              }] : []),
              ...(isWhiteCell ? [{
                title: 'Type',
                dataIndex: 'note',
                width: 180,
                render: (value: string | null, row: { id: string }) => (
                  <EntryAutoCompleteInput
                    value={value}
                    options={WHITE_CELL_TYPE_OPTIONS}
                    placeholder="Select or type a type"
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
                    checkedChildren="Travel Only"
                    unCheckedChildren=""
                    onChange={(nextValue) => updateEntryMut.mutate({ id: row.id, data: { travelOnly: nextValue } })}
                  />
                ),
              }] : []),
              ...(isPlanning ? [{
                title: 'Long Tour A7 Planner',
                dataIndex: 'longTermA7Planner',
                width: 140,
                render: (value: boolean, row: { id: string }) => (
                  <Switch
                    className="ct-long-term-a7-planner-switch"
                    size="small"
                    checked={!!value}
                    checkedChildren="Yes"
                    unCheckedChildren=""
                    onChange={(nextValue) => updateEntryMut.mutate({ id: row.id, data: { longTermA7Planner: nextValue } })}
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
        row.isDerived ? null : (
          <Popconfirm title="Remove?" onConfirm={() => deleteExecMut.mutate(row.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )
      ),
    },
  ];

  const planningOm = unitCalcSafe.planningOm || { travel: 0, billeting: 0, perDiem: 0 };
  const whiteCellOm = unitCalcSafe.whiteCellOm || { travel: 0, billeting: 0, perDiem: 0 };
  const playerOm = unitCalcSafe.playerOm || { travel: 0, billeting: 0, perDiem: 0 };
  const omWrmTotal = wrmLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const omContractsTotal = titleContractLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const omGpcPurchasesTotal = gpcPurchaseLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const derivedPlayerMealsExecutionLine = (unitCalcSafe.playerRpa?.meals || 0) > 0
    ? {
        id: '__derived_player_meals__',
        key: '__derived_player_meals__',
        category: 'Player Meals',
        fundingType: 'RPA',
        amount: unitCalcSafe.playerRpa.meals || 0,
        notes: 'Auto-populated from Player - Execution (RPA) meals',
        isDerived: true,
      }
    : null;
  const executionCostLinesForDisplay = [
    ...(derivedPlayerMealsExecutionLine ? [derivedPlayerMealsExecutionLine] : []),
    ...executionCostLines.map((line) => ({ ...line, key: line.id, isDerived: false })),
  ];
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
  const gpcLinesForDisplay = gpcPurchaseLines
    .slice()
    .sort((a, b) => {
      const left = String(a.notes || '').toLowerCase();
      const right = String(b.notes || '').toLowerCase();
      if (left < right) return -1;
      if (left > right) return 1;
      return String(a.id).localeCompare(String(b.id));
    })
    .map((line) => ({
      ...line,
      key: line.id,
      isDerived: false,
      notes: String(line.notes || '').trim() || 'General GPC Purchase',
    }));
  const contractsDisplayTotal = sgAeCabPlayerBilletingTotal + userContractLines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const omBilletingTotal = (planningOm.billeting || 0) + (whiteCellOm.billeting || 0) + (playerOm.billeting || 0);
  const omPlanningTravelTotal = (planningOm.travel || 0) + (planningOm.perDiem || 0);
  const omSupportExecutionTravelTotal = (whiteCellOm.travel || 0) + (whiteCellOm.perDiem || 0);
  const omPlayerTravelTotal = (playerOm.travel || 0) + (playerOm.perDiem || 0);
  const omTravelTotal = omPlanningTravelTotal + omSupportExecutionTravelTotal + omPlayerTravelTotal;
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
  }, [
    wrmCost,
    wrmLine,
    addExecMut,
    updateExecMut,
    ub?.id,
    wrmLines,
    invalidate,
  ]);

  useEffect(() => {
    if (!isA7Unit) return;

    const currentWrm = Number(wrmCost) || 0;
    const hasChanges = Math.abs(currentWrm - persistedOverallEquipmentCost) > 0.001;

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
    persistedOverallEquipmentCost,
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
                    <div>Travel: {fmt(omTravelTotal)}</div>
                    {omBilletingTotal > 0 && <div>Billeting: {fmt(omBilletingTotal)}</div>}
                  </>
                ) : (
                  <>
                    <div>WRM (10%): {fmt(omWrmTotal)}</div>
                    <div>Contracts: {fmt(omContractsTotal)}</div>
                    <div>GPC Purchases: {fmt(omGpcPurchasesTotal)}</div>
                    {omBilletingTotal > 0 && <div>Billeting: {fmt(omBilletingTotal)}</div>}
                    <div>Travel: {fmt(omTravelTotal)}</div>
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
        <div className="ct-a7-om-section">
          <Card
            size="small"
            title={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span>WRM (War Reserve Material)</span>
                <span className="ct-badge-om">O&M</span>
              </span>
            }
            className="ct-section-card ct-a7-compact-card"
            style={{ marginBottom: 10 }}
          >
            <Row gutter={[12, 8]}>
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
                  WRM Cost to O&amp;M (10%)
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

          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} xl={12}>
              <Card
                size="small"
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span>Contracts</span>
                    <span className="ct-badge-om">O&M</span>
                    <span style={{ fontSize: 12, color: '#52c41a', fontWeight: 700 }}>Total: {fmt(contractsDisplayTotal)}</span>
                  </span>
                }
                className="ct-section-card ct-a7-compact-card"
                extra={
                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setContractModalOpen(true)}>
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
                        render: (value: string | null, row: any) => (
                          row.isDerived
                            ? (value || '-')
                            : (
                              <DraftTextInput
                                value={value}
                                placeholder="Contract type"
                                onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { notes: nextValue } })}
                              />
                            )
                        ),
                      },
                      {
                        title: 'Cost',
                        dataIndex: 'amount',
                        width: 140,
                        render: (value: number, row: any) => (
                          row.isDerived
                            ? fmt(value || 0)
                            : (
                              <DraftNumberInput
                                value={value || 0}
                                min={0}
                                style={{ width: '100%' }}
                                prefix="$"
                                formatter={formatNumberInput}
                                parser={parseNumberInput}
                                onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { amount: nextValue } })}
                              />
                            )
                        ),
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
            </Col>
            <Col xs={24} xl={12}>
              <Card
                size="small"
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span>GPC Purchases</span>
                    <span className="ct-badge-om">O&M</span>
                    <span style={{ fontSize: 12, color: '#52c41a', fontWeight: 700 }}>Total: {fmt(omGpcPurchasesTotal)}</span>
                  </span>
                }
                className="ct-section-card ct-a7-compact-card"
                extra={
                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setGpcModalOpen(true)}>
                    Add Details
                  </Button>
                }
              >
                <div className="ct-table">
                  <Table
                    size="small"
                    pagination={false}
                    dataSource={gpcLinesForDisplay}
                    locale={{ emptyText: 'No GPC purchase details yet' }}
                    columns={[
                      {
                        title: 'Type',
                        dataIndex: 'notes',
                        render: (value: string | null, row: any) => (
                          <DraftTextInput
                            value={value}
                            placeholder="GPC purchase type"
                            onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { notes: nextValue } })}
                          />
                        ),
                      },
                      {
                        title: 'Cost',
                        dataIndex: 'amount',
                        width: 140,
                        render: (value: number, row: any) => (
                          <DraftNumberInput
                            value={value || 0}
                            min={0}
                            style={{ width: '100%' }}
                            prefix="$"
                            formatter={formatNumberInput}
                            parser={parseNumberInput}
                            onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { amount: nextValue } })}
                          />
                        ),
                      },
                      {
                        title: '',
                        width: 56,
                        render: (_: any, row: any) => (
                          <Popconfirm title="Remove?" onConfirm={() => deleteExecMut.mutate(row.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        ),
                      },
                    ]}
                  />
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      <Divider />

      {/* Personnel panels */}
      <Row gutter={16}>
        {roleSections.map((role) => (
          <Col xs={24} lg={12} key={role}>
            <Typography.Title level={5}>{getRoleLabel(role)}</Typography.Title>
            <PersonnelPanel role={role} ft="RPA" />
            {role !== 'ANNUAL_TOUR' ? <PersonnelPanel role={role} ft="OM" /> : null}
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
            dataSource={executionCostLinesForDisplay}
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
            rentalCarCount: entryModalSupportsRentalCars ? (values.rentalCarCount || 0) : 0,
            location: values.location,
            note: (entryModalIsPlanning || entryModalIsWhiteCell) ? (entryModalNoteDraft.trim() || null) : null,
            travelOnly: entryModalAllowsTravelOnly ? entryModalTravelOnlyDraft : false,
            longTermA7Planner: entryModalIsPlanning ? entryModalLongTermA7PlannerDraft : false,
            isLocal: !!values.isLocal,
          };
          addEntryMut.mutate({ groupId: entryModal!.groupId, data: payload });
        }}
        onCancel={() => {
          setEntryModal(null);
          setEntryModalNoteDraft('');
          setEntryModalTravelOnlyDraft(false);
          setEntryModalLongTermA7PlannerDraft(false);
          entryForm.resetFields();
        }}
      >
        <Form form={entryForm} layout="vertical">
          <Form.Item name="rankCode" label="Rank" rules={[{ required: true }]}>
            <Select options={RANKS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="count" label="PAX" initialValue={1} rules={[{ required: true }]}>
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
          {entryModalSupportsRentalCars && (
            <Form.Item name="rentalCarCount" label="Rental Car" initialValue={0}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Form.Item name="location" label="Location" initialValue={perDiemLocations[0] || 'GULFPORT'} rules={[{ required: true }]}>
            <Select options={perDiemLocations.map((loc) => ({ value: loc, label: loc }))} />
          </Form.Item>
          {(entryModalIsPlanning || entryModalIsWhiteCell) && (
            <Form.Item label={entryModalIsWhiteCell ? 'Type' : 'Note'}>
              <AutoComplete
                value={entryModalNoteDraft}
                options={entryModalIsWhiteCell ? WHITE_CELL_TYPE_OPTIONS : PLANNING_NOTE_OPTIONS}
                style={{ width: '100%' }}
                placeholder={entryModalIsWhiteCell ? 'Select or type a type' : 'Select or type a note'}
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
                checkedChildren="Travel Only"
                unCheckedChildren=""
                onChange={setEntryModalTravelOnlyDraft}
              />
            </Form.Item>
          )}
          {entryModalIsPlanning && (
            <Form.Item label="Long Tour A7 Planner">
              <Switch
                className="ct-long-term-a7-planner-switch"
                checked={entryModalLongTermA7PlannerDraft}
                checkedChildren="Yes"
                unCheckedChildren=""
                onChange={setEntryModalLongTermA7PlannerDraft}
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

      <Modal
        title="Add GPC Purchase Details"
        open={gpcModalOpen}
        onOk={async () => {
          const values = await gpcForm.validateFields();
          await addExecMut.mutateAsync({
            unitId: ub.id,
            data: {
              fundingType: 'OM',
              category: 'GPC_PURCHASES',
              amount: Number(values.cost) || 0,
              notes: values.type?.trim() || null,
            },
          });
          setGpcModalOpen(false);
          gpcForm.resetFields();
        }}
        onCancel={() => {
          setGpcModalOpen(false);
          gpcForm.resetFields();
        }}
      >
        <Form form={gpcForm} layout="vertical">
          <Form.Item name="type" label="Type" rules={[{ required: true, message: 'Enter purchase type' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="cost" label="Cost" rules={[{ required: true, message: 'Enter purchase cost' }]}>
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

