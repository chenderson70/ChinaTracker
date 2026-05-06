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
  DatePicker,
  Spin,
  Popconfirm,
  message,
  Tooltip,
} from 'antd';
import { PlusOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useApp } from '../components/AppLayout';
import InlineDateInput from '../components/InlineDateInput';
import * as api from '../services/api';
import type {
  ExerciseDetail,
  PersonnelEntry,
  PersonnelGroup,
  UnitBudget,
  FundingType,
  UnitCalc,
  GroupCalc,
  PerDiemRate,
  PlanningConferenceDates,
} from '../types';
import { getUnitDisplayLabel } from '../utils/unitLabels';
import { getRpaMealsResponsibilityByUnit } from '../utils/budgetSummary';
import { calculateInclusiveDateRangeDays, normalizeDateString } from '../utils/dateRanges';
import { sortUiPerDiemLocations } from '../utils/perDiemDefaults';
import {
  buildUtcTemplateEntries,
  getUtcDisplayTitle,
  getUtcPackageCount,
  getUtcPackageCountFromNote,
  getUtcTemplateByCode,
  getUtcTemplatesForUnit,
  getUtcTemplateLabel,
} from '../utils/utcTemplates';
import {
  calculateLongTourLeaveAccrual,
  formatLongTourLeaveDays,
  type LongTourLeaveAccrual,
} from '../utils/longTourLeave';
import {
  getPlanningConferenceDutyDays,
  getPlanningConferenceRangeForNote,
} from '../utils/planningConferenceDates';

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
const FALLBACK_DAYS_PER_MONTH = 30;
const PERSONNEL_ENTRY_ORDER_STEP = 1024;

function normalizePositiveMonths(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Number(value);
}

function getCalendarDurationFromMonths(startDate: Dayjs, months: number): { dutyDays: number; endDate: Dayjs } {
  const normalizedMonths = normalizePositiveMonths(months) ?? 0;
  const wholeMonths = Math.floor(normalizedMonths);
  const fractionalMonths = normalizedMonths - wholeMonths;

  let exclusiveEndDate = startDate.add(wholeMonths, 'month');
  if (fractionalMonths > 0) {
    const fractionalMonthDays = Math.max(0, Math.round(exclusiveEndDate.daysInMonth() * fractionalMonths));
    exclusiveEndDate = exclusiveEndDate.add(fractionalMonthDays, 'day');
  }

  if (!exclusiveEndDate.isAfter(startDate)) {
    exclusiveEndDate = startDate.add(1, 'day');
  }

  const endDate = exclusiveEndDate.subtract(1, 'day');
  return {
    dutyDays: endDate.diff(startDate, 'day') + 1,
    endDate,
  };
}

function monthsToDutyDays(months: number, startDate?: Dayjs | null): number {
  if (startDate && startDate.isValid()) {
    return getCalendarDurationFromMonths(startDate, months).dutyDays;
  }

  return Math.max(1, Math.round(months * FALLBACK_DAYS_PER_MONTH));
}

function getMonthsFromDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  fallbackDutyDays: number,
): number {
  const normalizedStartDate = normalizeDateString(startDate);
  const normalizedEndDate = normalizeDateString(endDate);

  if (!normalizedStartDate || !normalizedEndDate) {
    return Number((fallbackDutyDays / FALLBACK_DAYS_PER_MONTH).toFixed(2));
  }

  const start = dayjs(normalizedStartDate);
  const inclusiveEnd = dayjs(normalizedEndDate);
  if (!start.isValid() || !inclusiveEnd.isValid() || inclusiveEnd.isBefore(start)) {
    return Number((fallbackDutyDays / FALLBACK_DAYS_PER_MONTH).toFixed(2));
  }

  const exclusiveEnd = inclusiveEnd.add(1, 'day');
  let wholeMonths = 0;
  let cursor = start;

  while (cursor.add(1, 'month').isSame(exclusiveEnd) || cursor.add(1, 'month').isBefore(exclusiveEnd)) {
    cursor = cursor.add(1, 'month');
    wholeMonths += 1;
  }

  const remainingDays = Math.max(0, exclusiveEnd.diff(cursor, 'day'));
  const fractionalMonths = cursor.daysInMonth() > 0 ? remainingDays / cursor.daysInMonth() : 0;

  return Number((wholeMonths + fractionalMonths).toFixed(2));
}

function getInclusiveEndDate(startDate: Dayjs, dutyDays: number): Dayjs {
  return startDate.add(Math.max(0, dutyDays - 1), 'day');
}

function normalizePositiveDutyDays(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.max(1, Math.round(value));
}

function getLongTourLeaveFieldValue(accrual: LongTourLeaveAccrual): number | null {
  return accrual.accruedLeaveDays > 0 ? accrual.accruedLeaveDays : null;
}

function getPersonnelEntryOrderDays(entry: Pick<PersonnelEntry, 'startDate' | 'endDate' | 'dutyDays'>): number | null {
  return calculateInclusiveDateRangeDays(entry.startDate, entry.endDate)
    ?? normalizePositiveDutyDays(entry.dutyDays);
}

function getPersonnelEntryPayableDutyDays(
  entry: Pick<PersonnelEntry, 'startDate' | 'endDate' | 'dutyDays' | 'longTourLeaveDays'>,
): number | null {
  const orderDays = getPersonnelEntryOrderDays(entry);
  if (!orderDays) return null;

  const calculatedLeaveDays = calculateLongTourLeaveAccrual(entry.startDate, entry.endDate, orderDays).accruedLeaveDays;
  const persistedLeaveDays = Math.max(0, Number(entry.longTourLeaveDays || 0));
  const leaveDays = Math.max(persistedLeaveDays, calculatedLeaveDays);
  return orderDays + leaveDays;
}

function getLongTourLeaveAccrualForEntry(
  entry: Pick<PersonnelEntry, 'startDate' | 'endDate' | 'dutyDays' | 'longTourLeaveDays'>,
): LongTourLeaveAccrual {
  const calculated = calculateLongTourLeaveAccrual(entry.startDate, entry.endDate, entry.dutyDays);
  const persistedLeaveDays = Math.max(0, Number(entry.longTourLeaveDays || 0));
  const accruedLeaveDays = Math.max(persistedLeaveDays, calculated.accruedLeaveDays);

  if (accruedLeaveDays > 0 && accruedLeaveDays !== calculated.accruedLeaveDays) {
    const orderDays = calculated.orderDays ?? normalizePositiveDutyDays(entry.dutyDays);
    return {
      orderDays,
      accruedLeaveDays,
      payableDutyDays: orderDays ? orderDays + accruedLeaveDays : null,
      applies: true,
    };
  }

  return calculated;
}

function resolveDurationDutyDays(
  months: number | null | undefined,
  dutyDays: number | null | undefined,
  startDate?: Dayjs | null,
): number | null {
  if (months !== null && months !== undefined && Number.isFinite(months) && months > 0) {
    return monthsToDutyDays(months, startDate);
  }

  return normalizePositiveDutyDays(dutyDays);
}

function getDateRangeFromDuration(
  startDate: Dayjs | null | undefined,
  months: number | null | undefined,
  dutyDays: number | null | undefined,
): [Dayjs, Dayjs] | null {
  if (!startDate || !startDate.isValid()) {
    return null;
  }

  const normalizedMonths = normalizePositiveMonths(months);
  if (normalizedMonths) {
    const { endDate } = getCalendarDurationFromMonths(startDate, normalizedMonths);
    return [startDate, endDate];
  }

  const resolvedDutyDays = resolveDurationDutyDays(months, dutyDays, startDate);
  if (!resolvedDutyDays) {
    return null;
  }

  return [startDate, getInclusiveEndDate(startDate, resolvedDutyDays)];
}

function buildPersonnelEntryMonthsPatch(
  entry: Pick<PersonnelEntry, 'startDate'>,
  months: number,
) {
  const normalizedStartDate = normalizeDateString(entry.startDate);
  if (!normalizedStartDate) {
    const dutyDays = monthsToDutyDays(months);
    const leaveAccrual = calculateLongTourLeaveAccrual(null, null, dutyDays);
    return {
      dutyDays,
      longTourLeaveDays: getLongTourLeaveFieldValue(leaveAccrual),
    };
  }

  const startDate = dayjs(normalizedStartDate);
  if (!startDate.isValid()) {
    const dutyDays = monthsToDutyDays(months);
    const leaveAccrual = calculateLongTourLeaveAccrual(null, null, dutyDays);
    return {
      dutyDays,
      longTourLeaveDays: getLongTourLeaveFieldValue(leaveAccrual),
    };
  }

  const { dutyDays, endDate } = getCalendarDurationFromMonths(startDate, months);
  const formattedEndDate = endDate.format('YYYY-MM-DD');
  const leaveAccrual = calculateLongTourLeaveAccrual(normalizedStartDate, formattedEndDate, dutyDays);

  return {
    dutyDays,
    endDate: formattedEndDate,
    longTourLeaveDays: getLongTourLeaveFieldValue(leaveAccrual),
  };
}

type OrderedPersonnelEntry = PersonnelEntry & {
  _effectiveRowOrder: number;
};

type DisplayPersonnelEntry = OrderedPersonnelEntry & {
  _sourceEntries?: OrderedPersonnelEntry[];
};

function getOrderedPersonnelEntries(entries: PersonnelEntry[]): OrderedPersonnelEntry[] {
  return entries
    .map((entry, index) => {
      const explicitRowOrder = Number(entry.rowOrder || 0);
      const effectiveRowOrder = Number.isFinite(explicitRowOrder) && explicitRowOrder > 0
        ? explicitRowOrder
        : (index + 1) * PERSONNEL_ENTRY_ORDER_STEP;

      return {
        ...entry,
        _effectiveRowOrder: effectiveRowOrder,
      };
    })
    .sort((left, right) => {
      if (left._effectiveRowOrder !== right._effectiveRowOrder) {
        return left._effectiveRowOrder - right._effectiveRowOrder;
      }
      return String(left.id || '').localeCompare(String(right.id || ''));
    });
}

function getNextPersonnelEntryRowOrder(entries: PersonnelEntry[]): number {
  const orderedEntries = getOrderedPersonnelEntries(entries);
  const lastEntry = orderedEntries[orderedEntries.length - 1];
  return lastEntry ? lastEntry._effectiveRowOrder + PERSONNEL_ENTRY_ORDER_STEP : PERSONNEL_ENTRY_ORDER_STEP;
}

function normalizeUtcPackageCount(value: number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
}

function normalizeUtcCode(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

function buildUtcNote(code: string, packageCount: number, rowIndex: number): string {
  const baseNote = `UTC ${code}`;
  return rowIndex === 0 && packageCount > 1 ? `${baseNote} x${packageCount}` : baseNote;
}

function getUtcAggregateKey(entry: OrderedPersonnelEntry): string {
  return JSON.stringify([
    normalizeUtcCode(entry.utcCode),
    entry.rankCode,
    normalizeDateString(entry.startDate),
    normalizeDateString(entry.endDate),
    entry.dutyDays ?? null,
    entry.longTourLeaveDays ?? null,
    entry.rentalCarCount || 0,
    entry.location || '',
    !!entry.isLocal,
    !!entry.travelOnly,
    !!entry.longTermA7Planner,
  ]);
}

function getDisplayPersonnelEntries(entries: PersonnelEntry[]): DisplayPersonnelEntry[] {
  const orderedEntries = getOrderedPersonnelEntries(entries);
  const utcAggregateRows = new Map<string, DisplayPersonnelEntry>();
  const displayEntries: DisplayPersonnelEntry[] = [];

  for (const entry of orderedEntries) {
    const code = normalizeUtcCode(entry.utcCode);
    if (!code) {
      displayEntries.push(entry);
      continue;
    }

    const key = getUtcAggregateKey(entry);
    const existingRow = utcAggregateRows.get(key);
    if (!existingRow) {
      const nextRow: DisplayPersonnelEntry = {
        ...entry,
        _sourceEntries: [entry],
      };
      utcAggregateRows.set(key, nextRow);
      displayEntries.push(nextRow);
      continue;
    }

    existingRow.count += Number(entry.count || 0);
    existingRow._sourceEntries = [...(existingRow._sourceEntries || []), entry];
  }

  return displayEntries;
}

type UtcPackageSummary = {
  code: string;
  title: string;
  entries: PersonnelEntry[];
  packageCount: number;
  pax: number;
  paxPerPackage: number;
};

function getUtcPackageSummaries(entries: PersonnelEntry[]): UtcPackageSummary[] {
  const byCode = new Map<string, PersonnelEntry[]>();
  for (const entry of entries) {
    const code = normalizeUtcCode(entry.utcCode);
    if (!code) continue;
    byCode.set(code, [...(byCode.get(code) || []), entry]);
  }

  return Array.from(byCode.entries())
    .map(([code, utcEntries]) => {
      const pax = utcEntries.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
      const notePackageCount = utcEntries.reduce(
        (sum, entry) => sum + getUtcPackageCountFromNote(entry.note),
        0,
      );
      const packageCount = getUtcPackageCount(code, pax, notePackageCount);
      return {
        code,
        title: getUtcDisplayTitle(code, utcEntries.find((entry) => entry.utcTitle)?.utcTitle || ''),
        entries: getOrderedPersonnelEntries(utcEntries),
        packageCount,
        pax,
        paxPerPackage: packageCount > 0 ? Math.max(1, Math.round(pax / packageCount)) : pax,
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));
}

function getDuplicatedPersonnelEntryRowOrder(entries: PersonnelEntry[], sourceEntryId: string): number {
  const orderedEntries = getOrderedPersonnelEntries(entries);
  const sourceIndex = orderedEntries.findIndex((entry) => entry.id === sourceEntryId);
  if (sourceIndex === -1) {
    return getNextPersonnelEntryRowOrder(entries);
  }

  const sourceEntry = orderedEntries[sourceIndex];
  const nextEntry = orderedEntries[sourceIndex + 1];
  if (!nextEntry) {
    return sourceEntry._effectiveRowOrder + PERSONNEL_ENTRY_ORDER_STEP;
  }

  return sourceEntry._effectiveRowOrder + ((nextEntry._effectiveRowOrder - sourceEntry._effectiveRowOrder) / 2);
}

function getDateRangePayload(value: [Dayjs | null, Dayjs | null] | null | undefined) {
  const start = value?.[0] ?? null;
  const end = value?.[1] ?? null;

  return {
    startDate: start ? start.format('YYYY-MM-DD') : null,
    endDate: end ? end.format('YYYY-MM-DD') : null,
  };
}

function getExerciseDateDefaults(
  exercise: Pick<ExerciseDetail, 'startDate' | 'endDate' | 'defaultDutyDays'> | null | undefined,
): {
  startDate: string | null;
  endDate: string | null;
  dutyDays: number;
  dateRange: [Dayjs, Dayjs] | null;
} {
  const normalizedStartDate = normalizeDateString(exercise?.startDate);
  const normalizedEndDate = normalizeDateString(exercise?.endDate);
  const exerciseDutyDays = calculateInclusiveDateRangeDays(normalizedStartDate, normalizedEndDate)
    ?? Math.max(1, Number(exercise?.defaultDutyDays || 1));

  if (!normalizedStartDate || !normalizedEndDate) {
    return {
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      dutyDays: exerciseDutyDays,
      dateRange: null,
    };
  }

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    dutyDays: exerciseDutyDays,
    dateRange: [dayjs(normalizedStartDate), dayjs(normalizedEndDate)],
  };
}

function buildPlayerExecutionEntryDefaults(
  entry: PersonnelEntry,
  exerciseDefaults: ReturnType<typeof getExerciseDateDefaults>,
): PersonnelEntry {
  const normalizedStartDate = normalizeDateString(entry.startDate);
  const normalizedEndDate = normalizeDateString(entry.endDate);
  const hasExplicitDateRange = !!normalizedStartDate || !!normalizedEndDate;

  if (hasExplicitDateRange || !exerciseDefaults.startDate || !exerciseDefaults.endDate) {
    return entry;
  }

  return {
    ...entry,
    startDate: exerciseDefaults.startDate,
    endDate: exerciseDefaults.endDate,
    dutyDays: exerciseDefaults.dutyDays,
    longTourLeaveDays: getLongTourLeaveFieldValue(
      calculateLongTourLeaveAccrual(exerciseDefaults.startDate, exerciseDefaults.endDate, exerciseDefaults.dutyDays),
    ),
  };
}

function buildPersonnelEntryDatePatch(
  entry: Pick<PersonnelEntry, 'startDate' | 'endDate' | 'dutyDays' | 'longTourLeaveDays'>,
  field: 'startDate' | 'endDate',
  value: string | null,
) {
  const nextStartDate = field === 'startDate' ? value : (entry.startDate ?? null);
  const normalizedOrderDays = getPersonnelEntryOrderDays(entry);
  const normalizedStartDate = normalizeDateString(nextStartDate);
  const nextEndDate = field === 'startDate' && normalizedStartDate && normalizedOrderDays
    ? dayjs(normalizedStartDate).add(normalizedOrderDays - 1, 'day').format('YYYY-MM-DD')
    : field === 'endDate'
      ? value
      : (entry.endDate ?? null);
  const leaveAccrual = calculateLongTourLeaveAccrual(nextStartDate, nextEndDate, normalizedOrderDays);
  const nextDutyDays = leaveAccrual.orderDays ?? calculateInclusiveDateRangeDays(nextStartDate, nextEndDate);

  return {
    [field]: value,
    ...(field === 'startDate' && normalizedStartDate && normalizedOrderDays ? { endDate: nextEndDate } : {}),
    ...(nextDutyDays ? { dutyDays: nextDutyDays } : {}),
    longTourLeaveDays: getLongTourLeaveFieldValue(leaveAccrual),
  };
}

function buildPlanningConferenceEntryPatch(
  note: string | null | undefined,
  planningConferenceDates: PlanningConferenceDates | null | undefined,
) {
  const normalizedNote = String(note || '').trim();
  const nextData: Record<string, string | number | null> = {
    note: normalizedNote || null,
  };
  const range = getPlanningConferenceRangeForNote(planningConferenceDates, normalizedNote);
  if (!range) {
    return nextData;
  }

  nextData.startDate = range.startDate;
  nextData.endDate = range.endDate;
  const dutyDays = getPlanningConferenceDutyDays(range);
  if (dutyDays) {
    nextData.dutyDays = dutyDays;
  }
  const leaveAccrual = calculateLongTourLeaveAccrual(range.startDate, range.endDate, dutyDays);
  nextData.longTourLeaveDays = getLongTourLeaveFieldValue(leaveAccrual);

  return nextData;
}

function getPersonnelEntryNoteOptions(role: string | undefined) {
  if (role === 'PLANNING') return PLANNING_NOTE_OPTIONS;
  if (role === 'WHITE_CELL') return WHITE_CELL_TYPE_OPTIONS;
  return [];
}

function getPersonnelEntryNoteLabel(role: string | undefined) {
  return role === 'WHITE_CELL' ? 'Type' : 'Note';
}

function getPersonnelEntryNotePlaceholder(role: string | undefined) {
  if (role === 'PLANNING') return 'Select or type a note';
  if (role === 'WHITE_CELL') return 'Select or type a type';
  return 'Enter a note';
}

function buildPersonnelEntryNotePatch(
  role: string | undefined,
  note: string | null | undefined,
  planningConferenceDates: PlanningConferenceDates | null | undefined,
) {
  if (role === 'PLANNING') {
    return buildPlanningConferenceEntryPatch(note, planningConferenceDates);
  }

  return {
    note: String(note || '').trim() || null,
  };
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

  const commit = (nextDraft = draft) => {
    const nextValue = nextDraft.trim();
    const currentValue = String(value || '').trim();
    if (nextValue === currentValue) return;
    onSave(nextValue || null);
  };

  return (
    <AutoComplete
      size="small"
      value={draft}
      options={options.map((option) => ({ value: option.value, label: option.value }))}
      style={{ width: '100%' }}
      placeholder={placeholder}
      allowClear
      defaultActiveFirstOption={false}
      filterOption={(inputValue, option) =>
        String(option?.value || '').toLowerCase().includes(inputValue.toLowerCase())
      }
      onChange={(nextValue) => {
        setDraft(nextValue);
      }}
      onSelect={(nextValue) => {
        setDraft(nextValue);
        commit(nextValue);
      }}
      onBlur={() => commit()}
      onClear={() => {
        setDraft('');
        if (String(value || '').trim()) {
          onSave(null);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commit();
      }}
    />
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
  const { exercise, budget, exerciseId, pushUndoSnapshot } = useApp();
  const queryClient = useQueryClient();
  const { data: appConfig = {} } = useQuery({ queryKey: ['appConfig'], queryFn: api.getAppConfig });
  const { data: perDiemRates = [] } = useQuery({
    queryKey: ['perDiemRates'],
    queryFn: api.getPerDiemRates,
  });
  const perDiemLocations = useMemo(
    () => sortUiPerDiemLocations(perDiemRates.map((r) => r.location)),
    [perDiemRates],
  );
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
  const exerciseDateDefaults = useMemo(
    () => getExerciseDateDefaults(exercise),
    [exercise?.defaultDutyDays, exercise?.endDate, exercise?.startDate],
  );
  const availableUtcTemplates = useMemo(
    () => getUtcTemplatesForUnit(unitCode),
    [unitCode],
  );
  const [entryModal, setEntryModal] = useState<{ groupId: string } | null>(null);
  const [utcModal, setUtcModal] = useState<{ groupId: string } | null>(null);
  const [entryModalNoteDraft, setEntryModalNoteDraft] = useState('');
  const [entryModalTravelOnlyDraft, setEntryModalTravelOnlyDraft] = useState(false);
  const [entryModalLongTermA7PlannerDraft, setEntryModalLongTermA7PlannerDraft] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [gpcModalOpen, setGpcModalOpen] = useState(false);
  const [execModal, setExecModal] = useState(false);
  const [wrmCost, setWrmCost] = useState(0);
  const [entryForm] = Form.useForm();
  const [utcForm] = Form.useForm();
  const [contractForm] = Form.useForm();
  const [gpcForm] = Form.useForm();
  const [execForm] = Form.useForm();
  const entryModalDateRange = Form.useWatch('dateRange', entryForm) as [Dayjs | null, Dayjs | null] | null | undefined;
  const entryModalDutyDaysValue = Form.useWatch('dutyDays', entryForm) as number | null | undefined;
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

  const clearGroupMut = useMutation({
    mutationFn: async (groupId: string) => {
      await pushUndoSnapshot('Clear Section');
      return api.clearPersonnelGroup(groupId);
    },
    onSuccess: async () => {
      message.success('Section cleared');
      await refreshExerciseAndBudget();
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to clear section');
    },
  });

  const clearUnitMut = useMutation({
    mutationFn: async (unitId: string) => {
      if (wrmAutoSaveTimer.current) {
        clearTimeout(wrmAutoSaveTimer.current);
        wrmAutoSaveTimer.current = null;
      }

      while (isWrmAutoSaving.current) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await pushUndoSnapshot('Clear Unit');
      return api.clearUnitBudget(unitId);
    },
    onSuccess: async () => {
      setEntryModal(null);
      setEntryModalNoteDraft('');
      setEntryModalTravelOnlyDraft(false);
      setEntryModalLongTermA7PlannerDraft(false);
      setContractModalOpen(false);
      setGpcModalOpen(false);
      setExecModal(false);
      setWrmCost(0);
      entryForm.resetFields();
      contractForm.resetFields();
      gpcForm.resetFields();
      execForm.resetFields();
      message.success('Unit data cleared');
      await refreshExerciseAndBudget();
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to clear unit data');
    },
  });

  const addEntryMut = useMutation({
    mutationFn: async ({ groupId, data }: { groupId: string; data: any }) => {
      await pushUndoSnapshot('Add Personnel Entry');
      return api.addPersonnelEntry(groupId, data);
    },
    onSuccess: async () => {
      await refreshExerciseAndBudget();
      setEntryModal(null);
      setEntryModalNoteDraft('');
      setEntryModalTravelOnlyDraft(false);
      setEntryModalLongTermA7PlannerDraft(false);
      entryForm.resetFields();
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to add entry');
    },
  });

  const addUtcMut = useMutation({
    mutationFn: async ({
      groupId,
      utcCode,
      paxOverride,
      packageCount,
    }: {
      groupId: string;
      utcCode: string;
      paxOverride?: number | null;
      packageCount?: number | null;
    }) => {
      const group = personnelGroups.find((item) => item.id === groupId);
      const template = availableUtcTemplates.find((item) => item.code === utcCode);
      if (!group || !template) throw new Error('Select a valid UTC package for this unit');

      await pushUndoSnapshot('Add UTC Package');

      const usesExerciseDates = group.role === 'PLAYER' || group.role === 'ANNUAL_TOUR';
      const submittedDateRange = usesExerciseDates ? exerciseDateDefaults.dateRange : null;
      const { startDate, endDate } = getDateRangePayload(submittedDateRange);
      const dateRangeDutyDays = calculateInclusiveDateRangeDays(startDate, endDate);
      const defaultDutyDays = dateRangeDutyDays ?? (exercise?.defaultDutyDays ?? 1);
      const leaveAccrual = calculateLongTourLeaveAccrual(startDate, endDate, defaultDutyDays);
      const baseRowOrder = getNextPersonnelEntryRowOrder(group.personnelEntries || []);
      const entries = buildUtcTemplateEntries(template, paxOverride);
      const utcPackageCount = normalizeUtcPackageCount(packageCount);
      const utcBaseNote = `UTC ${template.code}`;

      for (const [index, entry] of entries.entries()) {
        await api.addPersonnelEntry(groupId, {
          rankCode: entry.rankCode,
          count: entry.count * utcPackageCount,
          rowOrder: baseRowOrder + (index * PERSONNEL_ENTRY_ORDER_STEP),
          dutyDays: leaveAccrual.orderDays ?? defaultDutyDays,
          startDate,
          endDate,
          longTourLeaveDays: getLongTourLeaveFieldValue(leaveAccrual),
          rentalCarCount: 0,
          location: group.location || perDiemLocations[0] || 'FORT_HUNTER_LIGGETT',
          isLocal: !!group.isLocal,
          note: index === 0 && utcPackageCount > 1 ? `${utcBaseNote} x${utcPackageCount}` : utcBaseNote,
          utcCode: template.code,
          utcTitle: template.title,
          travelOnly: false,
          longTermA7Planner: false,
        });
      }

      return { template, packageCount: utcPackageCount };
    },
    onSuccess: async ({ template, packageCount }) => {
      message.success(packageCount > 1 ? `${packageCount} ${template.code} packages added` : `${template.code} added`);
      setUtcModal(null);
      utcForm.resetFields();
      await refreshExerciseAndBudget();
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to add UTC');
    },
  });

  const duplicateEntryMut = useMutation({
    mutationFn: async ({ groupId, data }: { groupId: string; data: any }) => {
      await pushUndoSnapshot('Duplicate Personnel Entry');
      return api.addPersonnelEntry(groupId, data);
    },
    onSuccess: async () => {
      message.success('Entry duplicated');
      await refreshExerciseAndBudget();
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to duplicate entry');
    },
  });

  const deleteEntryMut = useMutation({
    mutationFn: (id: string) => api.deletePersonnelEntry(id),
    onMutate: async (entryId: string) => {
      await pushUndoSnapshot('Remove Personnel Entry');
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

  const updateUtcPackageMut = useMutation({
    mutationFn: async ({
      groupId,
      utcCode,
      packageCount,
    }: {
      groupId: string;
      utcCode: string;
      packageCount: number;
    }) => {
      const code = normalizeUtcCode(utcCode);
      const group = personnelGroups.find((item) => item.id === groupId);
      if (!group || !code) throw new Error('Select a valid UTC package');

      const summary = getUtcPackageSummaries(group.personnelEntries || []).find((item) => item.code === code);
      if (!summary || summary.entries.length === 0) throw new Error(`${code} is not in this section`);

      const nextPackageCount = normalizeUtcPackageCount(packageCount);
      if (nextPackageCount === summary.packageCount) {
        return { code, packageCount: nextPackageCount };
      }

      await pushUndoSnapshot('Update UTC Package Quantity');

      const template = getUtcTemplateByCode(code);
      const firstEntry = summary.entries[0];
      const utcTitle = template?.title || firstEntry.utcTitle || summary.title;
      const paxPerPackage = summary.paxPerPackage || template?.defaultPax || summary.pax || 1;
      const packageEntries = template
        ? buildUtcTemplateEntries(template, paxPerPackage)
        : (() => {
            const rankTotals = new Map<string, number>();
            for (const entry of summary.entries) {
              rankTotals.set(entry.rankCode, (rankTotals.get(entry.rankCode) || 0) + Number(entry.count || 0));
            }
            const inferredEntries = Array.from(rankTotals.entries()).map(([rankCode, count]) => ({
              rankCode,
              count: Math.max(1, Math.round(count / Math.max(1, summary.packageCount))),
            }));
            return inferredEntries.length > 0 ? inferredEntries : [{ rankCode: firstEntry.rankCode || 'TSGT', count: paxPerPackage }];
          })();

      const targetEntries = packageEntries.map((entry, index) => ({
        rankCode: entry.rankCode,
        count: Math.max(1, Math.round(entry.count * nextPackageCount)),
        note: buildUtcNote(code, nextPackageCount, index),
      }));
      const nextRowOrder = getNextPersonnelEntryRowOrder(group.personnelEntries || []);

      for (const [index, targetEntry] of targetEntries.entries()) {
        const existingEntry = summary.entries[index];
        const data = {
          rankCode: targetEntry.rankCode,
          count: targetEntry.count,
          note: targetEntry.note,
          utcCode: code,
          utcTitle,
        };

        if (existingEntry) {
          await api.updatePersonnelEntry(existingEntry.id, data);
        } else {
          await api.addPersonnelEntry(groupId, {
            ...data,
            rowOrder: nextRowOrder + ((index - summary.entries.length) * PERSONNEL_ENTRY_ORDER_STEP),
            dutyDays: firstEntry.dutyDays,
            startDate: firstEntry.startDate,
            endDate: firstEntry.endDate,
            longTourLeaveDays: firstEntry.longTourLeaveDays,
            rentalCarCount: firstEntry.rentalCarCount || 0,
            location: firstEntry.location ?? group.location ?? null,
            isLocal: !!firstEntry.isLocal,
            travelOnly: !!firstEntry.travelOnly,
            longTermA7Planner: !!firstEntry.longTermA7Planner,
          });
        }
      }

      for (const extraEntry of summary.entries.slice(targetEntries.length)) {
        await api.deletePersonnelEntry(extraEntry.id);
      }

      return { code, packageCount: nextPackageCount };
    },
    onSuccess: async ({ code, packageCount }) => {
      message.success(`${code} set to ${packageCount} package${packageCount === 1 ? '' : 's'}`);
      await refreshExerciseAndBudget();
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to update UTC package');
    },
  });

  const deleteUtcPackageMut = useMutation({
    mutationFn: async ({ groupId, utcCode }: { groupId: string; utcCode: string }) => {
      const code = normalizeUtcCode(utcCode);
      const group = personnelGroups.find((item) => item.id === groupId);
      if (!group || !code) throw new Error('Select a valid UTC package');

      const entries = (group.personnelEntries || []).filter((entry) => normalizeUtcCode(entry.utcCode) === code);
      if (entries.length === 0) throw new Error(`${code} is not in this section`);

      await pushUndoSnapshot('Remove UTC Package');
      for (const entry of entries) {
        await api.deletePersonnelEntry(entry.id);
      }

      return { code };
    },
    onSuccess: async ({ code }) => {
      message.success(`${code} removed`);
      await refreshExerciseAndBudget();
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to remove UTC package');
    },
  });

  const updateEntrySetMut = useMutation({
    mutationFn: async ({
      ids,
      data,
      snapshotLabel = 'Update Personnel Entries',
    }: {
      ids: string[];
      data: any;
      snapshotLabel?: string;
    }) => {
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      if (uniqueIds.length === 0) throw new Error('Select a valid personnel row');

      await pushUndoSnapshot(snapshotLabel);
      for (const id of uniqueIds) {
        await api.updatePersonnelEntry(id, data);
      }

      return uniqueIds.length;
    },
    onSuccess: refreshExerciseAndBudget,
    onError: (error: any) => {
      message.error(error?.message || 'Failed to update personnel rows');
    },
  });

  const replaceEntryAggregateMut = useMutation({
    mutationFn: async ({
      keepId,
      removeIds,
      data,
    }: {
      keepId: string;
      removeIds: string[];
      data: any;
    }) => {
      if (!keepId) throw new Error('Select a valid personnel row');

      await pushUndoSnapshot('Update Personnel Entry');
      await api.updatePersonnelEntry(keepId, data);
      for (const id of Array.from(new Set(removeIds.filter((item) => item && item !== keepId)))) {
        await api.deletePersonnelEntry(id);
      }
    },
    onSuccess: refreshExerciseAndBudget,
    onError: (error: any) => {
      message.error(error?.message || 'Failed to update personnel row');
    },
  });

  const deleteEntrySetMut = useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      if (uniqueIds.length === 0) throw new Error('Select a valid personnel row');

      await pushUndoSnapshot('Remove Personnel Entries');
      for (const id of uniqueIds) {
        await api.deletePersonnelEntry(id);
      }

      return uniqueIds.length;
    },
    onSuccess: async (count) => {
      message.success(count > 1 ? 'Rows removed' : 'Entry removed');
      await refreshExerciseAndBudget();
    },
    onError: (error: any) => {
      message.error(error?.message || 'Failed to remove entries');
    },
  });

  const updateEntryMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await pushUndoSnapshot('Update Personnel Entry');
      return api.updatePersonnelEntry(id, data);
    },
    onSuccess: refreshExerciseAndBudget,
  });

  const addExecMut = useMutation({
    mutationFn: async ({ unitId, data }: { unitId: string; data: any }) => {
      await pushUndoSnapshot('Add Execution Cost');
      return api.addExecutionCost(unitId, data);
    },
    onSuccess: () => { invalidate(); setExecModal(false); execForm.resetFields(); },
  });

  const deleteExecMut = useMutation({
    mutationFn: async (id: string) => {
      await pushUndoSnapshot('Remove Execution Cost');
      return api.deleteExecutionCost(id);
    },
    onSuccess: invalidate,
  });

  const updateExecMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await pushUndoSnapshot('Update Execution Cost');
      return api.updateExecutionCost(id, data);
    },
    onSuccess: invalidate,
  });

  const ub = exercise?.unitBudgets?.find((u: UnitBudget) => u.unitCode === unitCode);
  const unitCalc = unitCode ? budget?.units?.[unitCode] : undefined;
  const emptyCalcGroup: GroupCalc = { paxCount: 0, dutyDays: 0, milPay: 0, perDiem: 0, meals: 0, travel: 0, billeting: 0, subtotal: 0 };
  const unitCalcSafe: UnitCalc = unitCalc || {
    unitCode: unitCode || '',
    unitDisplayName: ub?.unitDisplayName ?? null,
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
  const entryModalIsPlayerExecution = entryModalGroup?.role === 'PLAYER';
  const entryModalUsesExerciseDates =
    entryModalGroup?.role === 'PLAYER' || entryModalGroup?.role === 'ANNUAL_TOUR';
  const entryModalSupportsRentalCars =
    entryModalGroup?.role === 'PLANNING' || entryModalGroup?.role === 'WHITE_CELL' || entryModalGroup?.role === 'SUPPORT';
  const entryModalAllowsTravelOnly = entryModalGroup?.fundingType === 'RPA'
    && (entryModalGroup?.role === 'PLANNING' || entryModalGroup?.role === 'SUPPORT');
  const entryModalLeavePreview = useMemo(() => {
    const { startDate, endDate } = getDateRangePayload(entryModalDateRange);
    return calculateLongTourLeaveAccrual(startDate, endDate, entryModalDutyDaysValue);
  }, [entryModalDateRange, entryModalDutyDaysValue]);
  const entryModalNoteLabel = getPersonnelEntryNoteLabel(entryModalGroup?.role);
  const entryModalNoteOptions = getPersonnelEntryNoteOptions(entryModalGroup?.role);
  const entryModalNotePlaceholder = getPersonnelEntryNotePlaceholder(entryModalGroup?.role);
  const insertExerciseDatesIntoEntryModal = useCallback(() => {
    if (!exerciseDateDefaults.dateRange) return;

    entryForm.setFieldsValue({
      dateRange: exerciseDateDefaults.dateRange,
      dutyDays: exerciseDateDefaults.dutyDays,
      ...(entryModalIsPlanning
        ? {
            months: getMonthsFromDateRange(
              exerciseDateDefaults.startDate,
              exerciseDateDefaults.endDate,
              exerciseDateDefaults.dutyDays,
            ),
          }
        : {}),
    });
  }, [
    entryForm,
    entryModalIsPlanning,
    exerciseDateDefaults.dateRange,
    exerciseDateDefaults.dutyDays,
    exerciseDateDefaults.endDate,
    exerciseDateDefaults.startDate,
  ]);
  const handleEntryModalPlanningNoteChange = useCallback((nextValue: string) => {
    setEntryModalNoteDraft(nextValue);

    if (!entryModalIsPlanning) return;
    const range = getPlanningConferenceRangeForNote(exercise?.planningConferenceDates, nextValue);
    if (!range) return;

    const dutyDays = getPlanningConferenceDutyDays(range);
    entryForm.setFieldsValue({
      months: undefined,
      dateRange: [dayjs(range.startDate), dayjs(range.endDate)],
      dutyDays: dutyDays ?? undefined,
    });
  }, [entryForm, entryModalIsPlanning, exercise?.planningConferenceDates]);

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
      dateRange: entryModalUsesExerciseDates ? exerciseDateDefaults.dateRange : null,
      dutyDays: entryModalUsesExerciseDates ? exerciseDateDefaults.dutyDays : (exercise?.defaultDutyDays ?? 1),
      rentalCarCount: 0,
      months: undefined,
      location: entryModalGroup?.location || perDiemLocations[0] || 'FORT_HUNTER_LIGGETT',
      isLocal: entryModalGroup?.isLocal ?? false,
    });
    setEntryModalNoteDraft('');
    setEntryModalTravelOnlyDraft(false);
    setEntryModalLongTermA7PlannerDraft(false);
  }, [
    entryForm,
    entryModal,
    entryModalGroup?.isLocal,
    entryModalGroup?.location,
    entryModalUsesExerciseDates,
    exercise?.defaultDutyDays,
    exerciseDateDefaults.dateRange,
    exerciseDateDefaults.dutyDays,
    perDiemLocations,
  ]);

  const roleSections = ['PLANNING', 'PLAYER', 'ANNUAL_TOUR', 'WHITE_CELL', 'SUPPORT'].filter((role) => hasRole(role));

  const roleLabels: Record<string, string> = {
    PLAYER: 'Player',
    ANNUAL_TOUR: 'Players - Annual Tour',
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
    const usesExerciseDateDefaults = role === 'PLAYER';
    const isPlanning = role === 'PLANNING';
    const isWhiteCell = role === 'WHITE_CELL';
    const supportsRentalCars = role === 'PLANNING' || role === 'WHITE_CELL' || role === 'SUPPORT';
    const usesEntryLevelRental = supportsRentalCars;
    const noteLabel = getPersonnelEntryNoteLabel(role);
    const noteOptions = getPersonnelEntryNoteOptions(role);
    const notePlaceholder = getPersonnelEntryNotePlaceholder(role);
    const isPlayerRpa = isPlayerLike && ft === 'RPA';
    const isPlayerOm = isPlayer && ft === 'OM';
    const showTravelOnly = ft === 'RPA' && (role === 'PLANNING' || role === 'SUPPORT');
    const fundingBadgeLabel = isAnnualTour && ft === 'RPA' ? 'AT' : (ft === 'OM' ? 'O&M' : ft);
    const fundingBadgeClass = isAnnualTour && ft === 'RPA' ? 'ct-badge-at' : (ft === 'RPA' ? 'ct-badge-rpa' : 'ct-badge-om');
    const subtotalColor = isAnnualTour && ft === 'RPA' ? '#0958d9' : (ft === 'RPA' ? '#1677ff' : '#52c41a');
    const isClearingGroup = clearGroupMut.isPending && clearGroupMut.variables === group.id;
    const hasSectionData =
      group.personnelEntries.length > 0 ||
      (group.paxCount || 0) > 0 ||
      group.dutyDays !== null ||
      group.isLocal ||
      group.isLongTour ||
      (group.rentalCarCount || 0) > 0 ||
      (group.rentalCarDays || 0) > 0 ||
      group.avgCpdOverride !== null;
    const fundingNote = role === 'PLANNING'
      ? (ft === 'RPA'
          ? '(Exercise planning, planning meetings, site visits)'
          : '(Planning meetings, site visits)')
      : role === 'ANNUAL_TOUR'
        ? '(AT box totals Mil Pay + Travel Pay; meals are separate and billeting rolls to O&M)'
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
            location: group.location || 'FORT_HUNTER_LIGGETT',
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
    const airfarePerPerson = defaultTravel.airfarePerPerson;
    const rentalDaily = defaultTravel.rentalCarDailyRate;
    const hasGroupRental = (group.rentalCarCount || 0) > 0 || (group.rentalCarDays || 0) > 0;
    const sharedRentalCost = ((defaultTravel.rentalCarCount || 0) * (defaultTravel.rentalCarDailyRate || 0) * (defaultTravel.rentalCarDays || 0)) / unitCount;
    const configuredRentalCost = (group.rentalCarCount || 0) * rentalDaily * (group.rentalCarDays || 0);
    const nonPlayerTravelBreakout = nonPlayerTravelEntries.reduce(
      (acc, entry) => {
        const entryCount = entry.count || 0;
        const entryDays = entry.dutyDays || group.dutyDays || exercise?.defaultDutyDays || 1;
        const entryLoc = entry.location || group.location || 'FORT_HUNTER_LIGGETT';
        const entryIsLocal = !!(entry.isLocal ?? group.isLocal);
        const entryRentalCarCount = Number((entry as any).rentalCarCount || 0) || 0;
        if (entryIsLocal) {
          if (usesEntryLevelRental) {
            acc.rental += entryRentalCarCount * rentalDaily * entryDays;
          }
          return acc;
        }
        const rates = perDiemByLocation[entryLoc] || { lodging: 0, mie: 0 };
        acc.perDiem += entryCount * rates.mie * entryDays;
        acc.lodging += entryCount * rates.lodging * entryDays;
        acc.airfare += entryCount * airfarePerPerson;
        if (usesEntryLevelRental) {
          acc.rental += entryRentalCarCount * rentalDaily * entryDays;
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
    const annualTourRpaSummary = (
      <>
        {`Mil Pay: ${fmt(calc.milPay)} \u2022 AT Travel Pay: ${fmt((calc.perDiem || 0) + (calc.travel || 0))} \u2022 Meals: ${fmt(calc.meals)} \u2022 `}
        {billetingHighlight}
        {` \u2022 AT Total: ${fmt(calc.subtotal)}`}
      </>
    );
    const playerOmSummary = (
      <>
        {`Airfare: ${fmt(playerTravelBreakout.airfare)} \u2022 Per Diem: ${fmt(playerTravelBreakout.perDiem)} \u2022 `}
        {billetingHighlight}
        {` \u2022 Total: ${fmt(calc.subtotal)}`}
      </>
    );
    const personnelEntriesForDisplay = group.personnelEntries.map((entry) => (
      usesExerciseDateDefaults
        ? buildPlayerExecutionEntryDefaults(entry, exerciseDateDefaults)
        : entry
    ));
    const orderedPersonnelEntriesForDisplay = getOrderedPersonnelEntries(personnelEntriesForDisplay);
    const displayPersonnelEntriesForTable = getDisplayPersonnelEntries(personnelEntriesForDisplay);
    const utcPackageSummaries = getUtcPackageSummaries(group.personnelEntries || []);
    const getDisplaySourceEntries = (row: DisplayPersonnelEntry) =>
      row._sourceEntries && row._sourceEntries.length > 0 ? row._sourceEntries : [row];
    const getDisplaySourceIds = (row: DisplayPersonnelEntry) =>
      getDisplaySourceEntries(row).map((entry) => entry.id);
    const updateDisplayEntry = (row: DisplayPersonnelEntry, data: any, snapshotLabel?: string) => {
      const sourceIds = getDisplaySourceIds(row);
      if (sourceIds.length > 1) {
        updateEntrySetMut.mutate({ ids: sourceIds, data, snapshotLabel });
        return;
      }

      updateEntryMut.mutate({ id: row.id, data });
    };
    const updateDisplayEntryCount = (row: DisplayPersonnelEntry, count: number) => {
      const sourceEntries = getDisplaySourceEntries(row);
      const nextCount = count || 1;
      if (sourceEntries.length > 1) {
        replaceEntryAggregateMut.mutate({
          keepId: sourceEntries[0].id,
          removeIds: sourceEntries.slice(1).map((entry) => entry.id),
          data: { count: nextCount },
        });
        return;
      }

      updateEntryMut.mutate({ id: row.id, data: { count: nextCount } });
    };
    const deleteDisplayEntry = (row: DisplayPersonnelEntry) => {
      const sourceIds = getDisplaySourceIds(row);
      if (sourceIds.length > 1) {
        deleteEntrySetMut.mutate({ ids: sourceIds });
        return;
      }

      deleteEntryMut.mutate(row.id);
    };

    return (
      <Card
        title={
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className={fundingBadgeClass}>{fundingBadgeLabel}</span>
            {fundingNote ? (
              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>{fundingNote}</span>
            ) : null}
          </span>
        }
        size="small"
        className="ct-personnel-card"
        extra={
          <Space wrap size={10}>
            <Popconfirm
              title="Clear this section?"
              description="This removes all rows and resets the section-specific settings."
              okText="Clear Section"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={() => clearGroupMut.mutate(group.id)}
            >
              <Button size="small" danger type="text" disabled={!hasSectionData} loading={isClearingGroup}>
                Clear All Data
              </Button>
            </Popconfirm>
            <strong>PAX: {group.paxCount || totalEntryPax}</strong>
            <span style={{ fontSize: 16, fontWeight: 700, color: subtotalColor }}>{fmt(calc.subtotal)}</span>
          </Space>
        }
      >
        {/* Cost breakdown */}
        <Typography.Text style={{ color: '#1677ff', fontWeight: 600, display: 'block', marginBottom: 10 }}>
          {isPlayerRpa
            ? (isAnnualTour ? annualTourRpaSummary : playerRpaSummary)
              : isPlayerOm
              ? playerOmSummary
                : nonPlayerSummary}
        </Typography.Text>

        {utcPackageSummaries.length > 0 ? (
          <div className="ct-utc-package-manager" aria-label="UTC package controls">
            <div className="ct-utc-package-manager-header">
              <Typography.Text strong>UTC Packages</Typography.Text>
            </div>
            <div className="ct-utc-package-manager-grid">
              {utcPackageSummaries.map((summary) => (
                <div className="ct-utc-package-control" key={`${group.id}-${summary.code}`}>
                  <Tooltip title={summary.title || summary.code}>
                    <span className="ct-badge-rpa">{summary.code}</span>
                  </Tooltip>
                  <div className="ct-utc-package-control-main">
                    <Typography.Text className="ct-utc-package-control-title">{summary.title}</Typography.Text>
                    <Typography.Text type="secondary" className="ct-utc-package-control-meta">
                      {summary.pax.toLocaleString('en-US')} PAX
                    </Typography.Text>
                  </div>
                  <div className="ct-utc-package-quantity">
                    <Typography.Text type="secondary" className="ct-utc-package-quantity-label">
                      Packages
                    </Typography.Text>
                    <DraftNumberInput
                      min={1}
                      precision={0}
                      value={summary.packageCount}
                      style={{ width: 78 }}
                      onSave={(nextValue) => updateUtcPackageMut.mutate({
                        groupId: group.id,
                        utcCode: summary.code,
                        packageCount: nextValue,
                      })}
                    />
                  </div>
                  <Popconfirm
                    title={`Remove ${summary.code}?`}
                    description={`This removes all ${summary.code} personnel rows from this section.`}
                    okText="Remove UTC"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => deleteUtcPackageMut.mutate({ groupId: group.id, utcCode: summary.code })}
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      loading={deleteUtcPackageMut.isPending}
                      disabled={updateUtcPackageMut.isPending}
                      aria-label={`Remove ${summary.code}`}
                    />
                  </Popconfirm>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Rank-level detail */}
        {group.personnelEntries.length > 0 && (
          <Table
            size="small"
            pagination={false}
            scroll={{ x: 'max-content' }}
            dataSource={displayPersonnelEntriesForTable.map((entry) => ({
              ...entry,
              key: getDisplaySourceIds(entry).join('|'),
            }))}
            columns={[
              {
                title: 'Rank',
                dataIndex: 'rankCode',
                width: 110,
                render: (value: string, row: DisplayPersonnelEntry) => (
                  <Select
                    size="small"
                    value={value}
                    style={{ width: '100%' }}
                    options={RANKS.map((r) => ({ value: r, label: r }))}
                    onChange={(v) => updateDisplayEntry(row, { rankCode: v })}
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
                    onSave={(nextValue) => updateDisplayEntryCount(row as DisplayPersonnelEntry, nextValue)}
                  />
                ),
              },
              {
                title: 'UTC',
                dataIndex: 'utcCode',
                width: 130,
                render: (value: string | null, row: PersonnelEntry) => (
                  value ? (
                    <Tooltip title={row.utcTitle || value}>
                      <span className="ct-badge-rpa">{value}</span>
                    </Tooltip>
                  ) : (
                    <Typography.Text type="secondary">-</Typography.Text>
                  )
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
                    value={getMonthsFromDateRange(
                      (row as PersonnelEntry).startDate,
                      (row as PersonnelEntry).endDate,
                      value ?? exercise!.defaultDutyDays,
                    )}
                    style={{ width: '100%' }}
                    onSave={(nextValue) => {
                      updateDisplayEntry(
                        row as DisplayPersonnelEntry,
                        buildPersonnelEntryMonthsPatch(row as PersonnelEntry, nextValue),
                      );
                    }}
                  />
                ),
              }] : []),
              {
                title: 'Start',
                dataIndex: 'startDate',
                width: 140,
                render: (value: string | null, row: any) => (
                  <InlineDateInput
                    value={value}
                    style={{ width: '100%' }}
                    onSave={(nextValue) => updateDisplayEntry(
                      row as DisplayPersonnelEntry,
                      buildPersonnelEntryDatePatch(row as PersonnelEntry, 'startDate', nextValue),
                    )}
                  />
                ),
              },
              {
                title: 'End',
                dataIndex: 'endDate',
                width: 140,
                render: (value: string | null, row: any) => (
                  <InlineDateInput
                    value={value}
                    style={{ width: '100%' }}
                    onSave={(nextValue) => updateDisplayEntry(
                      row as DisplayPersonnelEntry,
                      buildPersonnelEntryDatePatch(row as PersonnelEntry, 'endDate', nextValue),
                    )}
                  />
                ),
              },
              {
                title: 'Order Days',
                dataIndex: 'dutyDays',
                width: 110,
                render: (value, row) => (
                  <DraftNumberInput
                    min={1}
                    value={getPersonnelEntryOrderDays(row as PersonnelEntry) ?? value ?? exercise!.defaultDutyDays}
                    style={{ width: '100%' }}
                    onSave={(nextValue) => {
                      const normalizedOrderDays = normalizePositiveDutyDays(nextValue) ?? 1;
                      const normalizedStartDate = normalizeDateString((row as PersonnelEntry).startDate);
                      const nextEndDate = normalizedStartDate
                        ? dayjs(normalizedStartDate).add(normalizedOrderDays - 1, 'day').format('YYYY-MM-DD')
                        : ((row as PersonnelEntry).endDate ?? null);
                      const leaveAccrual = calculateLongTourLeaveAccrual(normalizedStartDate, nextEndDate, normalizedOrderDays);
                      updateDisplayEntry(
                        row as DisplayPersonnelEntry,
                        {
                          dutyDays: leaveAccrual.orderDays ?? normalizedOrderDays,
                          ...(normalizedStartDate
                            ? { endDate: nextEndDate }
                            : {}),
                          longTourLeaveDays: getLongTourLeaveFieldValue(leaveAccrual),
                        },
                      );
                    }}
                  />
                ),
              },
              {
                title: 'Leave',
                dataIndex: 'longTourLeaveDays',
                width: 120,
                render: (_value, row) => {
                  const leaveAccrual = getLongTourLeaveAccrualForEntry(row as PersonnelEntry);
                  if (!leaveAccrual.applies) {
                    return <Typography.Text type="secondary">-</Typography.Text>;
                  }

                  return (
                    <Tooltip
                      title={`${formatLongTourLeaveDays(leaveAccrual.accruedLeaveDays)} accrued from ${leaveAccrual.orderDays || 0} order days`}
                    >
                      <Typography.Text type="success">
                        +{formatLongTourLeaveDays(leaveAccrual.accruedLeaveDays)}
                      </Typography.Text>
                    </Tooltip>
                  );
                },
              },
              {
                title: 'Pay Days',
                dataIndex: 'longTourLeaveDays',
                width: 100,
                render: (_value, row) => {
                  const leaveAccrual = getLongTourLeaveAccrualForEntry(row as PersonnelEntry);
                  const payableDutyDays = leaveAccrual.payableDutyDays
                    ?? getPersonnelEntryPayableDutyDays(row as PersonnelEntry)
                    ?? Number((row as PersonnelEntry).dutyDays ?? exercise!.defaultDutyDays);
                  return Number.isInteger(payableDutyDays) ? payableDutyDays : payableDutyDays.toFixed(1);
                },
              },
              ...(supportsRentalCars ? [{
                title: 'Rental Car',
                dataIndex: 'rentalCarCount',
                width: 110,
                render: (value: number, row: DisplayPersonnelEntry) => (
                  <DraftNumberInput
                    min={0}
                    precision={0}
                    value={value || 0}
                    style={{ width: '100%' }}
                    onSave={(nextValue) => updateDisplayEntry(row, { rentalCarCount: nextValue || 0 })}
                  />
                ),
              }] : []),
              {
                title: 'Location',
                dataIndex: 'location',
                width: 160,
                render: (value: string | null, row: DisplayPersonnelEntry) => (
                  <Select
                    size="small"
                    value={value || 'FORT_HUNTER_LIGGETT'}
                    style={{ width: '100%' }}
                    options={perDiemLocations.map((loc) => ({ value: loc, label: loc }))}
                    onChange={(v) => updateDisplayEntry(row, { location: v })}
                  />
                ),
              },
              {
                title: noteLabel,
                dataIndex: 'note',
                width: 180,
                render: (value: string | null, row: DisplayPersonnelEntry) => (
                  <EntryAutoCompleteInput
                    value={value}
                    options={noteOptions}
                    placeholder={notePlaceholder}
                    onSave={(nextValue) => {
                      updateDisplayEntry(
                        row,
                        buildPersonnelEntryNotePatch(role, nextValue, exercise?.planningConferenceDates),
                      );
                    }}
                  />
                ),
              },
              ...(showTravelOnly ? [{
                title: 'Travel Only',
                dataIndex: 'travelOnly',
                width: 120,
                render: (value: boolean, row: DisplayPersonnelEntry) => (
                  <Switch
                    className="ct-travel-only-switch"
                    size="small"
                    checked={!!value}
                    checkedChildren="Travel Only"
                    unCheckedChildren=""
                    onChange={(nextValue) => updateDisplayEntry(row, { travelOnly: nextValue })}
                  />
                ),
              }] : []),
              ...(isPlanning ? [{
                title: 'Long Tour A7 Planner',
                dataIndex: 'longTermA7Planner',
                width: 140,
                render: (value: boolean, row: DisplayPersonnelEntry) => (
                  <Switch
                    className="ct-long-term-a7-planner-switch"
                    size="small"
                    checked={!!value}
                    checkedChildren="Yes"
                    unCheckedChildren=""
                    onChange={(nextValue) => updateDisplayEntry(row, { longTermA7Planner: nextValue })}
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
                    onChange={(v) => updateDisplayEntry(row as DisplayPersonnelEntry, { isLocal: v })}
                  />
                ),
              },
              {
                title: '',
                width: 90,
                render: (_: unknown, row: DisplayPersonnelEntry) => (
                  <Space size={6}>
                    <Tooltip title="Duplicate row">
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => {
                          duplicateEntryMut.mutate({
                            groupId: group.id,
                            data: {
                              rankCode: row.rankCode,
                              count: row.count,
                              rowOrder: getDuplicatedPersonnelEntryRowOrder(orderedPersonnelEntriesForDisplay, row.id),
                              dutyDays: row.dutyDays ?? exercise?.defaultDutyDays ?? 1,
                              startDate: row.startDate ?? null,
                              endDate: row.endDate ?? null,
                              longTourLeaveDays: row.longTourLeaveDays ?? null,
                              rentalCarCount: row.rentalCarCount || 0,
                              location: row.location ?? group.location ?? null,
                              isLocal: !!row.isLocal,
                              note: row.note ?? null,
                              utcCode: row.utcCode ?? null,
                              utcTitle: row.utcTitle ?? null,
                              travelOnly: !!row.travelOnly,
                              longTermA7Planner: !!row.longTermA7Planner,
                            },
                          });
                        }}
                      />
                    </Tooltip>
                    <Popconfirm title="Remove?" onConfirm={() => deleteDisplayEntry(row)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
        <Space wrap style={{ marginTop: 8 }}>
          <Button
            size="small"
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setEntryModal({ groupId: group.id })}
          >
            Add Details
          </Button>
          {availableUtcTemplates.length > 0 ? (
            <Button
              size="small"
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => {
                setUtcModal({ groupId: group.id });
                utcForm.resetFields();
              }}
            >
              Add UTC
            </Button>
          ) : null}
        </Space>
      </Card>
    );
  }

  const execColumns = [
    { title: 'Category', dataIndex: 'category' },
    { title: 'Funding', dataIndex: 'fundingType', width: 80, render: (value: string) => value === 'OM' ? 'O&M' : value },
    {
      title: 'Start',
      dataIndex: 'startDate',
      width: 140,
      render: (value: string | null, row: any) => (
        row.isDerived ? (
          <Typography.Text type="secondary">Auto</Typography.Text>
        ) : (
          <InlineDateInput
            value={value}
            style={{ width: '100%' }}
            onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { startDate: nextValue } })}
          />
        )
      ),
    },
    {
      title: 'End',
      dataIndex: 'endDate',
      width: 140,
      render: (value: string | null, row: any) => (
        row.isDerived ? (
          <Typography.Text type="secondary">Auto</Typography.Text>
        ) : (
          <InlineDateInput
            value={value}
            style={{ width: '100%' }}
            onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { endDate: nextValue } })}
          />
        )
      ),
    },
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
  const rpaMealsResponsibilityByUnit = budget ? getRpaMealsResponsibilityByUnit(budget) : {};
  const currentUnitRpaMealsResponsibility = rpaMealsResponsibilityByUnit[String(unitCode || '').toUpperCase()]?.total || 0;
  const derivedPlayerMealsExecutionLine = currentUnitRpaMealsResponsibility > 0
    ? {
        id: '__derived_player_meals__',
        key: '__derived_player_meals__',
        category: 'RPA Meals - Players',
        fundingType: 'RPA',
        amount: currentUnitRpaMealsResponsibility,
        notes: 'Auto-populated from exercise-wide RPA meal responsibility',
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
  const contractLinesForDisplay = userContractLines.map((line) => ({ ...line, key: line.id, isDerived: false }));
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
  const hasAnyUnitPageData =
    executionCostLines.length > 0 ||
    personnelGroups.some((group) => {
      const normalizedLocation = String(group.location || '').trim().toUpperCase();
      return (
        group.personnelEntries.length > 0 ||
        (group.paxCount || 0) > 0 ||
        group.dutyDays !== null ||
        (normalizedLocation.length > 0 && normalizedLocation !== 'FORT_HUNTER_LIGGETT') ||
        group.isLocal ||
        group.isLongTour ||
        (group.rentalCarCount || 0) > 0 ||
        (group.rentalCarDays || 0) > 0 ||
        group.avgCpdOverride !== null
      );
    }) ||
    (isA7Unit && Math.abs((Number(wrmCost) || 0) - persistedOverallEquipmentCost) > 0.001);

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
      <div className="ct-page-header">
        <Typography.Title level={4} className="ct-page-title">{getUnitDisplayLabel(unitCode, ub?.unitDisplayName)} — Unit Budget</Typography.Title>
        <div className="ct-screen-only ct-unit-clear-banner">
          <div className="ct-unit-clear-banner-copy">
            <Typography.Text className="ct-unit-clear-banner-title">
              Need to start fresh for this unit?
            </Typography.Text>
            <Typography.Text type="secondary">
              Clear all entered data on this page without removing the unit itself.
            </Typography.Text>
          </div>
          <Popconfirm
            title="Clear all data for this unit?"
            description="This removes the entered rows, execution costs, and unit-specific settings on this page."
            okText="Clear All Data"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
            onConfirm={() => clearUnitMut.mutate(ub.id)}
          >
            <Button danger disabled={!hasAnyUnitPageData} loading={clearUnitMut.isPending}>
              Clear All Data
            </Button>
          </Popconfirm>
        </div>
      </div>

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
                {sgAeCabPlayerBilletingTotal > 0 && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid rgba(82, 196, 26, 0.18)',
                      background: 'rgba(82, 196, 26, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <span style={{ color: '#1f2937', fontWeight: 600 }}>Player Billeting (auto)</span>
                    <span style={{ color: '#52c41a', fontWeight: 700 }}>{fmt(sgAeCabPlayerBilletingTotal)}</span>
                  </div>
                )}
                <div className="ct-table">
                  <Table
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    dataSource={contractLinesForDisplay}
                    locale={{ emptyText: 'No contract details yet' }}
                    columns={[
                      {
                        title: 'Type',
                        dataIndex: 'notes',
                        render: (value: string | null, row: any) => (
                          <DraftTextInput
                            value={value}
                            placeholder="Contract type"
                            onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { notes: nextValue } })}
                          />
                        ),
                      },
                      {
                        title: 'Start',
                        dataIndex: 'startDate',
                        width: 140,
                        render: (value: string | null, row: any) => (
                          <InlineDateInput
                            value={value}
                            style={{ width: '100%' }}
                            onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { startDate: nextValue } })}
                          />
                        ),
                      },
                      {
                        title: 'End',
                        dataIndex: 'endDate',
                        width: 140,
                        render: (value: string | null, row: any) => (
                          <InlineDateInput
                            value={value}
                            style={{ width: '100%' }}
                            onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { endDate: nextValue } })}
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
                    scroll={{ x: 'max-content' }}
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
                        title: 'Start',
                        dataIndex: 'startDate',
                        width: 140,
                        render: (value: string | null, row: any) => (
                          <InlineDateInput
                            value={value}
                            style={{ width: '100%' }}
                            onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { startDate: nextValue } })}
                          />
                        ),
                      },
                      {
                        title: 'End',
                        dataIndex: 'endDate',
                        width: 140,
                        render: (value: string | null, row: any) => (
                          <InlineDateInput
                            value={value}
                            style={{ width: '100%' }}
                            onSave={(nextValue) => updateExecMut.mutate({ id: row.id, data: { endDate: nextValue } })}
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
      <Row gutter={[16, 16]}>
        {roleSections.map((role) => (
          <Col xs={24} xl={12} key={role}>
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
            scroll={{ x: 'max-content' }}
            dataSource={executionCostLinesForDisplay}
            columns={execColumns}
            locale={{ emptyText: 'No execution cost lines yet' }}
          />
        </div>
      </Card>

      <Modal
        title="Add UTC Package"
        open={!!utcModal}
        confirmLoading={addUtcMut.isPending}
        okText="Add UTC"
        onOk={async () => {
          try {
            const values = await utcForm.validateFields();
            addUtcMut.mutate({
              groupId: utcModal!.groupId,
              utcCode: values.utcCode,
              paxOverride: values.paxOverride,
              packageCount: values.packageCount,
            });
          } catch (error: any) {
            if (Array.isArray(error?.errorFields) && error.errorFields.length > 0) {
              message.warning('Select a UTC, package quantity, and PAX before saving.');
            }
          }
        }}
        onCancel={() => {
          setUtcModal(null);
          utcForm.resetFields();
        }}
        width={640}
      >
        <Form form={utcForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="utcCode" label="UTC" rules={[{ required: true, message: 'Select a UTC' }]}>
            <Select
              showSearch
              placeholder="Select a UTC package"
              options={availableUtcTemplates.map((template) => ({
                value: template.code,
                label: getUtcTemplateLabel(template),
              }))}
              optionFilterProp="label"
              onChange={(code) => {
                const template = availableUtcTemplates.find((item) => item.code === code);
                utcForm.setFieldValue('paxOverride', template?.defaultPax ?? undefined);
                utcForm.setFieldValue('packageCount', utcForm.getFieldValue('packageCount') || 1);
              }}
            />
          </Form.Item>
          <Form.Item
            name="packageCount"
            label="UTC Packages"
            initialValue={1}
            rules={[{ required: true, message: 'Enter the number of UTC packages' }]}
            extra="Use this when you need multiple copies of the same UTC package, such as 3 FFQDE packages."
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="paxOverride"
            label="PAX Per Package"
            rules={[{ required: true, message: 'Enter the PAX for each UTC package' }]}
            extra="PAX totals were seeded from the provided MISCAP PDFs where OCR found an authorized total. Review-needed UTC packages require manual PAX per package."
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Typography.Text type="secondary">
            AE UTC packages are available in the AE unit. All other UTC packages are available in the SG unit.
            Created rows are tagged with the UTC code for cost and ROI reporting.
          </Typography.Text>
        </Form>
      </Modal>

      {/* Add rank entry modal */}
      <Modal
        title="Add Detail"
        open={!!entryModal}
        confirmLoading={addEntryMut.isPending}
        onOk={async () => {
          try {
            const values = await entryForm.validateFields();
            const submittedDateRange = values.dateRange ?? (
              entryModalUsesExerciseDates ? exerciseDateDefaults.dateRange : null
            );
            const { startDate, endDate } = getDateRangePayload(submittedDateRange);
            const dateRangeDutyDays = calculateInclusiveDateRangeDays(startDate, endDate);
            const calculatedDutyDays = entryModalIsPlanning && values.months !== undefined && values.months !== null
              ? resolveDurationDutyDays(values.months, values.dutyDays, submittedDateRange?.[0] ?? null)
              : values.dutyDays;
            const orderDutyDays = dateRangeDutyDays ?? calculatedDutyDays;
            const leaveAccrual = calculateLongTourLeaveAccrual(startDate, endDate, orderDutyDays);
            const payload = {
              rankCode: values.rankCode,
              count: values.count,
              rowOrder: getNextPersonnelEntryRowOrder(entryModalGroup?.personnelEntries || []),
              dutyDays: leaveAccrual.orderDays ?? orderDutyDays,
              startDate,
              endDate,
              longTourLeaveDays: getLongTourLeaveFieldValue(leaveAccrual),
              rentalCarCount: entryModalSupportsRentalCars
                ? (values.rentalCarCount || 0)
                : 0,
              location: values.location,
              note: entryModalNoteDraft.trim() || null,
              travelOnly: entryModalAllowsTravelOnly ? entryModalTravelOnlyDraft : false,
              longTermA7Planner: entryModalIsPlanning ? entryModalLongTermA7PlannerDraft : false,
              isLocal: !!values.isLocal,
            };
            await addEntryMut.mutateAsync({ groupId: entryModal!.groupId, data: payload });
          } catch (error: any) {
            const errorFields = Array.isArray(error?.errorFields) ? error.errorFields : [];
            if (errorFields.length > 0) {
              entryForm.scrollToField(errorFields[0].name, { block: 'center' });
              message.warning('Please complete the required fields before saving.');
              return;
            }

            if (!String(error?.message || '').trim()) {
              message.error('Failed to add entry');
            }
          }
        }}
        onCancel={() => {
          setEntryModal(null);
          setEntryModalNoteDraft('');
          setEntryModalTravelOnlyDraft(false);
          setEntryModalLongTermA7PlannerDraft(false);
          entryForm.resetFields();
        }}
      >
        <Form form={entryForm} layout="vertical" scrollToFirstError>
          <Form.Item name="rankCode" label="Rank" rules={[{ required: true }]}>
            <Select placeholder="Select a rank" options={RANKS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item name="count" label="PAX" initialValue={1} rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          {entryModalIsPlanning && (
          <Form.Item name="months" label="Months (optional, calendar months from start date)">
              <InputNumber
                min={0}
                step={0.25}
                precision={2}
                style={{ width: '100%' }}
                onChange={(value) => {
                  const currentDateRange = entryForm.getFieldValue('dateRange') as [Dayjs | null, Dayjs | null] | null | undefined;
                  const nextDutyDays = resolveDurationDutyDays(value, null, currentDateRange?.[0] ?? null);
                  entryForm.setFieldValue('dutyDays', nextDutyDays ?? undefined);

                  const nextDateRange = getDateRangeFromDuration(currentDateRange?.[0] ?? null, value, nextDutyDays);
                  if (nextDateRange) {
                    entryForm.setFieldValue('dateRange', nextDateRange);
                  }
                }}
              />
            </Form.Item>
          )}
          <Form.Item
            name="dateRange"
            label={(
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                <span>Date Range (optional)</span>
                <Button
                  type="link"
                  size="small"
                  style={{ paddingInline: 0 }}
                  disabled={!exerciseDateDefaults.dateRange}
                  onClick={insertExerciseDatesIntoEntryModal}
                >
                  Insert Exercise Dates
                </Button>
              </div>
            )}
          >
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              onCalendarChange={(dates, _dateStrings, info) => {
                if (!dates?.[0] || info?.range !== 'start') return;

                const months = entryForm.getFieldValue('months') as number | null | undefined;
                const dutyDays = entryForm.getFieldValue('dutyDays') as number | null | undefined;
                const nextDateRange = getDateRangeFromDuration(dates[0], months, dutyDays);
                if (!nextDateRange) return;

                entryForm.setFieldValue('dateRange', nextDateRange);
                entryForm.setFieldValue('dutyDays', resolveDurationDutyDays(months, dutyDays, dates[0]));
              }}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  entryForm.setFieldValue('dutyDays', dates[1].diff(dates[0], 'day') + 1);
                  return;
                }

                if (!dates?.[0]) return;
                const months = entryForm.getFieldValue('months') as number | null | undefined;
                const dutyDays = entryForm.getFieldValue('dutyDays') as number | null | undefined;
                const nextDateRange = getDateRangeFromDuration(dates[0], months, dutyDays);
                if (!nextDateRange) return;

                entryForm.setFieldValue('dateRange', nextDateRange);
                entryForm.setFieldValue('dutyDays', resolveDurationDutyDays(months, dutyDays, dates[0]));
              }}
            />
          </Form.Item>
          <Form.Item name="dutyDays" label="Order Days" initialValue={exercise.defaultDutyDays} rules={[{ required: true }]}>
            <InputNumber
              min={1}
              style={{ width: '100%' }}
              onChange={(value) => {
                const currentDateRange = entryForm.getFieldValue('dateRange') as [Dayjs | null, Dayjs | null] | null | undefined;
                const months = entryForm.getFieldValue('months') as number | null | undefined;
                const nextDateRange = getDateRangeFromDuration(currentDateRange?.[0] ?? null, months, value);
                if (nextDateRange) {
                  entryForm.setFieldValue('dateRange', nextDateRange);
                }
              }}
            />
          </Form.Item>
          {entryModalLeavePreview.applies && entryModalLeavePreview.payableDutyDays ? (
            <Typography.Text type="success" style={{ display: 'block', marginBottom: 16 }}>
              Long tour leave: +{formatLongTourLeaveDays(entryModalLeavePreview.accruedLeaveDays)} accrued;{' '}
              {formatLongTourLeaveDays(entryModalLeavePreview.payableDutyDays)} total pay days.
            </Typography.Text>
          ) : null}
          {entryModalSupportsRentalCars && (
            <Form.Item name="rentalCarCount" label="Rental Car" initialValue={0}>
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Form.Item name="location" label="Location" initialValue={perDiemLocations[0] || 'FORT_HUNTER_LIGGETT'} rules={[{ required: true }]}>
            <Select options={perDiemLocations.map((loc) => ({ value: loc, label: loc }))} />
          </Form.Item>
          <Form.Item label={entryModalNoteLabel}>
            <AutoComplete
              value={entryModalNoteDraft}
              options={entryModalNoteOptions.map((option) => ({ value: option.value, label: option.value }))}
              style={{ width: '100%' }}
              placeholder={entryModalNotePlaceholder}
              allowClear
              defaultActiveFirstOption={false}
              filterOption={(inputValue, option) =>
                String(option?.value || '').toLowerCase().includes(inputValue.toLowerCase())
              }
              onChange={entryModalIsPlanning ? handleEntryModalPlanningNoteChange : setEntryModalNoteDraft}
              onSelect={entryModalIsPlanning ? handleEntryModalPlanningNoteChange : setEntryModalNoteDraft}
              onClear={() => setEntryModalNoteDraft('')}
            />
          </Form.Item>
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
          const { startDate, endDate } = getDateRangePayload(values.dateRange);
          await addExecMut.mutateAsync({
            unitId: ub.id,
            data: {
              fundingType: 'OM',
              category: 'TITLE_CONTRACTS',
              amount: Number(values.cost) || 0,
              startDate,
              endDate,
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
          <Form.Item
            name="dateRange"
            label={(
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                <span>Date Range (optional)</span>
                <Button
                  type="link"
                  size="small"
                  style={{ paddingInline: 0 }}
                  disabled={!exerciseDateDefaults.dateRange}
                  onClick={() => contractForm.setFieldValue('dateRange', exerciseDateDefaults.dateRange)}
                >
                  Insert Execution Dates
                </Button>
              </div>
            )}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
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
          const { startDate, endDate } = getDateRangePayload(values.dateRange);
          await addExecMut.mutateAsync({
            unitId: ub.id,
            data: {
              fundingType: 'OM',
              category: 'GPC_PURCHASES',
              amount: Number(values.cost) || 0,
              startDate,
              endDate,
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
          <Form.Item
            name="dateRange"
            label={(
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                <span>Date Range (optional)</span>
                <Button
                  type="link"
                  size="small"
                  style={{ paddingInline: 0 }}
                  disabled={!exerciseDateDefaults.dateRange}
                  onClick={() => gpcForm.setFieldValue('dateRange', exerciseDateDefaults.dateRange)}
                >
                  Insert Execution Dates
                </Button>
              </div>
            )}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
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
          execForm.validateFields().then((values) => {
            const { startDate, endDate } = getDateRangePayload(values.dateRange);
            addExecMut.mutate({
              unitId: ub.id,
              data: {
                category: values.category,
                fundingType: values.fundingType,
                amount: values.amount,
                startDate,
                endDate,
                notes: values.notes,
              },
            });
          })
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
          <Form.Item
            name="dateRange"
            label={(
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                <span>Date Range (optional)</span>
                <Button
                  type="link"
                  size="small"
                  style={{ paddingInline: 0 }}
                  disabled={!exerciseDateDefaults.dateRange}
                  onClick={() => execForm.setFieldValue('dateRange', exerciseDateDefaults.dateRange)}
                >
                  Insert Execution Dates
                </Button>
              </div>
            )}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
