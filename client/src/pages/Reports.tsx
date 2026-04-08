import { Card, Typography, Button, Row, Col, Table, Descriptions, Space, Spin, InputNumber, Form, message, Input } from 'antd';
import { FileExcelOutlined, PrinterOutlined, EditOutlined, SaveOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import dayjs from 'dayjs';
import { exportElementToPdf } from '../services/pdf';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';
import { getDisplayedPax, getPlanningEventPaxExclusions } from '../utils/paxDisplay';
import { ANNUAL_TOUR_BILLETING_LABEL, ANNUAL_TOUR_MEALS_LABEL, ANNUAL_TOUR_MIL_PAY_LABEL, ANNUAL_TOUR_TRAVEL_PAY_LABEL, getAnnualTourBilletingOmTotal, getAnnualTourRpaMealsTotal, getPlayerOmResponsibilityByUnit, getRpaCategoryTotals, getRpaMealsResponsibilityByUnit, getUnitRpaCategoryTotals } from '../utils/budgetSummary';
import type { BudgetResult, ExerciseDetail } from '../types';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const DAYS_PER_MONTH = 30;
type ReportAssumptions = [string, string, string, string];
type ReportLimfacs = [string, string, string];

const DEFAULT_REPORT_ASSUMPTIONS: ReportAssumptions = [
  'Location of exercise: Fort Hunter Liggett, CA',
  'Unit of Action execution costs to be mainly funded by the NAF',
  'Pay estimations for long tour orders include MAJ\'s & SMSGT\'s. Site visits and planning conferences used CAPT\'s',
  '',
];
const DEFAULT_REPORT_LIMFACS: ReportLimfacs = ['', '', ''];

function getReportAssumptions(exercise: ExerciseDetail): ReportAssumptions {
  return [
    String(exercise.reportAssumption1 ?? DEFAULT_REPORT_ASSUMPTIONS[0]),
    String(exercise.reportAssumption2 ?? DEFAULT_REPORT_ASSUMPTIONS[1]),
    String(exercise.reportAssumption3 ?? DEFAULT_REPORT_ASSUMPTIONS[2]),
    String(exercise.reportAssumption4 ?? DEFAULT_REPORT_ASSUMPTIONS[3]),
  ];
}

function getReportLimfacs(exercise: ExerciseDetail): ReportLimfacs {
  return [
    String(exercise.reportLimfac1 ?? DEFAULT_REPORT_LIMFACS[0]),
    String(exercise.reportLimfac2 ?? DEFAULT_REPORT_LIMFACS[1]),
    String(exercise.reportLimfac3 ?? DEFAULT_REPORT_LIMFACS[2]),
  ];
}

function fmtRate(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type PlanningSummaryEntry = {
  unitCode: string;
  count: number;
  dutyDays: number;
  isLocal: boolean;
  note: string;
  longTermA7Planner: boolean;
  fundingType: string;
  location: string;
};

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function normalizePlanningNote(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function getPlanningNoteCategory(value: string | null | undefined): string {
  const normalized = normalizePlanningNote(value);
  if ([
    'planning conference',
    'initial planning conference',
    'mid planning conference',
    'final planning conference',
  ].includes(normalized)) {
    return 'planning conference';
  }
  return normalized;
}

function getPlanningEventKey(entry: PlanningSummaryEntry): string {
  const normalizedNote = normalizePlanningNote(entry.note);
  const normalizedLocation = String(entry.location || '').trim().toUpperCase() || 'UNKNOWN';
  const normalizedDutyDays = Number(entry.dutyDays || 0);
  return `${normalizedNote}::${normalizedLocation}::${normalizedDutyDays}`;
}

function formatPlannerDuration(dutyDays: number): string {
  const months = dutyDays / DAYS_PER_MONTH;
  if (dutyDays > 0 && Number.isInteger(months) && months >= 1) {
    return pluralize(months, 'month');
  }
  return pluralize(dutyDays, 'duty day');
}

function formatDutyDayDuration(dutyDays: number): string {
  return pluralize(dutyDays, 'duty day');
}

function getPlannerUnitLabel(unitCode: string): string {
  return String(unitCode || '').toUpperCase() === 'CAB' ? 'UoA' : getUnitDisplayLabel(unitCode);
}

function getPlanningSummaryEntries(exercise: ExerciseDetail): PlanningSummaryEntry[] {
  return (exercise.unitBudgets || [])
    .flatMap((unitBudget) =>
      (unitBudget.personnelGroups || [])
        .filter((group) => group.role === 'PLANNING')
        .flatMap((group) => {
          const entries = group.personnelEntries.length > 0
            ? group.personnelEntries.map((entry) => ({
                count: Number(entry.count || 0),
                dutyDays: Number(entry.dutyDays ?? group.dutyDays ?? exercise.defaultDutyDays ?? 0),
                isLocal: !!(entry.isLocal ?? group.isLocal),
                note: String(entry.note || '').trim(),
                longTermA7Planner: !!entry.longTermA7Planner,
                fundingType: String(group.fundingType || ''),
                location: String(entry.location ?? group.location ?? ''),
              }))
            : (group.paxCount || 0) > 0
              ? [{
                  count: Number(group.paxCount || 0),
                  dutyDays: Number(group.dutyDays ?? exercise.defaultDutyDays ?? 0),
                  isLocal: !!group.isLocal,
                  note: 'Planning',
                  longTermA7Planner: false,
                  fundingType: String(group.fundingType || ''),
                  location: String(group.location || ''),
                }]
              : [];

          return entries.map((entry) => ({
            unitCode: unitBudget.unitCode,
            ...entry,
          }));
        }),
    )
    .filter((entry) => entry.count > 0);
}

function buildPlannerSummary(entries: PlanningSummaryEntry[]): string {
  if (entries.length === 0) return 'No long-tour planners configured';

  const totalPlanners = entries.reduce((sum, entry) => sum + entry.count, 0);
  const localPlanners = entries.reduce((sum, entry) => sum + (entry.isLocal ? entry.count : 0), 0);
  const nonLocalPlanners = totalPlanners - localPlanners;
  const unitCounts = entries.reduce<Record<string, number>>((acc, entry) => {
    const normalizedUnitCode = String(entry.unitCode || '').toUpperCase();
    acc[normalizedUnitCode] = (acc[normalizedUnitCode] || 0) + entry.count;
    return acc;
  }, {});
  const unitBreakdown = Object.entries(unitCounts)
    .sort(([left], [right]) => compareUnitCodes(left, right))
    .map(([unitCode, count]) => {
      const label = getPlannerUnitLabel(unitCode);
      return label === 'A7' ? `${count} A7 planners` : `${count} ${label}`;
    })
    .join(' / ');
  const uniqueDutyDays = [...new Set(entries.map((entry) => entry.dutyDays).filter((value) => value > 0))];
  const durationText = uniqueDutyDays.length === 1
    ? formatPlannerDuration(uniqueDutyDays[0])
    : 'mixed durations';

  return `${totalPlanners} total planners: ${unitBreakdown} - ${durationText} (${localPlanners} local / ${nonLocalPlanners} not local)`;
}

function buildPlanningEventSummary(entries: PlanningSummaryEntry[], singular: string, plural: string): string {
  if (entries.length === 0) return `No ${plural} configured`;

  const groupedEvents = Array.from(
    entries.reduce((acc, entry) => {
      const key = getPlanningEventKey(entry);
      const existing = acc.get(key) || { totalPax: 0, rpaPax: 0, omPax: 0, dutyDays: entry.dutyDays };
      existing.totalPax += entry.count;
      if (String(entry.fundingType || '').toUpperCase() === 'RPA') existing.rpaPax += entry.count;
      if (String(entry.fundingType || '').toUpperCase() === 'OM') existing.omPax += entry.count;
      acc.set(key, existing);
      return acc;
    }, new Map<string, { totalPax: number; rpaPax: number; omPax: number; dutyDays: number }>()),
  ).map(([, value]) => value);

  const eventCount = groupedEvents.length;
  const uniqueTotalPax = [...new Set(groupedEvents.map((event) => event.totalPax).filter((value) => value > 0))];
  const uniqueRpaPax = [...new Set(groupedEvents.map((event) => event.rpaPax).filter((value) => value >= 0))];
  const uniqueOmPax = [...new Set(groupedEvents.map((event) => event.omPax).filter((value) => value >= 0))];
  const nonZeroRpaPax = [...new Set(groupedEvents.map((event) => event.rpaPax).filter((value) => value > 0))];
  const nonZeroOmPax = [...new Set(groupedEvents.map((event) => event.omPax).filter((value) => value > 0))];
  const uniqueDutyDays = [...new Set(groupedEvents.map((event) => event.dutyDays).filter((value) => value > 0))];
  const dutyText = uniqueDutyDays.length === 1
    ? `${formatDutyDayDuration(uniqueDutyDays[0])}${eventCount > 1 ? ' each' : ''}`
    : 'mixed duty days';

  if (eventCount > 1 && nonZeroRpaPax.length === 1 && nonZeroOmPax.length === 1) {
    const rpaPaxEach = nonZeroRpaPax[0];
    const omPaxEach = nonZeroOmPax[0];
    const totalPaxEach = rpaPaxEach + omPaxEach;
    return `${eventCount} - ${totalPaxEach} PAX each (${rpaPaxEach} RPA/${omPaxEach} O&M) - ${dutyText}`;
  }

  if (eventCount === 1 || (uniqueTotalPax.length === 1 && uniqueRpaPax.length === 1 && uniqueOmPax.length === 1)) {
    const sampleEvent = groupedEvents[0];
    const paxText = `${sampleEvent.totalPax} PAX${eventCount > 1 ? ' each' : ''}`;
    return `${eventCount} - ${paxText} (${sampleEvent.rpaPax} RPA/${sampleEvent.omPax} O&M) - ${dutyText}`;
  }

  const totalRpaPax = groupedEvents.reduce((sum, event) => sum + event.rpaPax, 0);
  const totalOmPax = groupedEvents.reduce((sum, event) => sum + event.omPax, 0);
  return `${eventCount} - mixed PAX (${totalRpaPax} RPA/${totalOmPax} O&M across events) - ${dutyText}`;
}

interface ReportsPageProps {
  title?: string;
  showBudgetDetails?: boolean;
  showGrandTotals?: boolean;
  beforeBudgetBreakdownSection?: ReactNode;
  extraSections?: ReactNode;
}

type PrintBudgetFieldKey =
  | 'rpaMilPay'
  | 'planningOm'
  | 'rpaTravelAndPerDiem'
  | 'wcExecOm'
  | 'rpaMeals'
  | 'annualTourMilPay'
  | 'annualTourTravelPay'
  | 'annualTourTotal'
  | 'playerOm'
  | 'totalRpa'
  | 'totalOm';

type PrintBudgetSection = {
  title: string;
  totalKey: PrintBudgetFieldKey;
  fields: Array<{ key: PrintBudgetFieldKey; label: string }>;
};

type BudgetBreakdownRow = {
  key: string;
  unit: string;
  rpaMilPay: number;
  planningOm: number;
  rpaTravelAndPerDiem: number;
  wcExecOm: number;
  rpaMeals: number;
  annualTourMilPay: number;
  annualTourTravelPay: number;
  annualTourTotal: number;
  playerOm: number;
  totalRpa: number;
  totalOm: number;
  total: number;
  showRpaMeals: boolean;
};

export function ReportsPage({
  title = 'Reports & Export',
  showBudgetDetails = true,
  showGrandTotals = true,
  beforeBudgetBreakdownSection,
  extraSections,
}: ReportsPageProps) {
  const { exercise, budget, exerciseId } = useApp();
  const queryClient = useQueryClient();
  const [editTravel, setEditTravel] = useState(false);
  const [travelForm] = Form.useForm();
  const { data: appConfig = {} } = useQuery({ queryKey: ['appConfig'], queryFn: api.getAppConfig });
  const exportRef = useRef<HTMLDivElement>(null);
  const travelAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dutyDaysAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportAssumptionsAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportLimfacsAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const travelDraft = Form.useWatch([], travelForm);
  const [draftRpaBudgetTarget, setDraftRpaBudgetTarget] = useState(0);
  const [draftOmBudgetTarget, setDraftOmBudgetTarget] = useState(0);
  const [draftDutyDays, setDraftDutyDays] = useState(1);
  const [draftReportAssumptions, setDraftReportAssumptions] = useState<ReportAssumptions>(DEFAULT_REPORT_ASSUMPTIONS);
  const [draftReportLimfacs, setDraftReportLimfacs] = useState<ReportLimfacs>(DEFAULT_REPORT_LIMFACS);
  const skipBudgetTargetsSaveRef = useRef(true);
  const skipTotalBudgetSaveRef = useRef(true);
  const skipDutyDaysSaveRef = useRef(true);
  const skipReportAssumptionsSaveRef = useRef(true);
  const skipReportLimfacsSaveRef = useRef(true);

  const travelMut = useMutation({
    mutationFn: (data: any) => api.updateTravelConfig(exerciseId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
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

  const reportAssumptionsMut = useMutation({
    mutationFn: (data: Pick<ExerciseDetail, 'reportAssumption1' | 'reportAssumption2' | 'reportAssumption3' | 'reportAssumption4'>) =>
      api.updateExercise(exerciseId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });

  const reportLimfacsMut = useMutation({
    mutationFn: (data: Pick<ExerciseDetail, 'reportLimfac1' | 'reportLimfac2' | 'reportLimfac3'>) =>
      api.updateExercise(exerciseId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
    },
  });

  const totalBudgetMut = useMutation({
    mutationFn: (totalBudget: number) => api.updateExercise(exerciseId!, { totalBudget }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      queryClient.invalidateQueries({ queryKey: ['exercises'] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
    },
  });

  const appConfigMut = useMutation({
    mutationFn: (config: Record<string, string>) => api.updateAppConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appConfig'] });
      queryClient.invalidateQueries({ queryKey: ['budget', exerciseId] });
      message.success('Budget targets updated');
    },
  });

  const isLoading = !exercise || !budget;
  const activeExercise = (exercise ?? {
    name: '',
    startDate: '',
    endDate: '',
    totalBudget: 0,
    defaultDutyDays: 1,
    unitBudgets: [],
    travelConfig: undefined,
  }) as ExerciseDetail;
  const activeBudget = (budget ?? {
    units: {},
    totalPax: 0,
    totalRpa: 0,
    totalOm: 0,
    grandTotal: 0,
    exerciseOmTotal: 0,
    wrm: 0,
    totalPlayers: 0,
    totalAnnualTour: 0,
    totalWhiteCell: 0,
  }) as BudgetResult;

  const siteVisitPaxExclusions = getPlanningEventPaxExclusions(activeExercise);
  const displayTotalPax = getDisplayedPax(activeBudget.totalPax, siteVisitPaxExclusions.totalExcludedPax);

  const defaultAirfare = Number(appConfig.DEFAULT_AIRFARE ?? 400);
  const defaultRentalCarDailyRate = Number(appConfig.DEFAULT_RENTAL_CAR_DAILY ?? 50);

  const handleExport = () => api.exportExcel(exerciseId!);
  const handlePrint = () => window.print();
  const handleExportPdf = async () => {
    if (!exportRef.current) return;
    try {
      await exportElementToPdf(`${activeExercise.name} ${title}`, exportRef.current);
    } catch (error: any) {
      message.error(error?.message || 'Unable to export reports to PDF');
    }
  };

  const travel = activeExercise.travelConfig;
  const currentReportAssumptions = getReportAssumptions(activeExercise);
  const [currentReportAssumption1, currentReportAssumption2, currentReportAssumption3, currentReportAssumption4] = currentReportAssumptions;
  const currentReportLimfacs = getReportLimfacs(activeExercise);
  const [currentReportLimfac1, currentReportLimfac2, currentReportLimfac3] = currentReportLimfacs;

  useEffect(() => {
    if (!editTravel || !travelDraft || travelMut.isPending) return;
    const nextValues = {
      airfarePerPerson: Number(travelDraft.airfarePerPerson ?? travel?.airfarePerPerson ?? defaultAirfare),
      rentalCarDailyRate: Number(travelDraft.rentalCarDailyRate ?? travel?.rentalCarDailyRate ?? defaultRentalCarDailyRate),
      rentalCarCount: Number(travelDraft.rentalCarCount ?? travel?.rentalCarCount ?? 0),
      rentalCarDays: Number(travelDraft.rentalCarDays ?? travel?.rentalCarDays ?? 0),
    };
    const currentValues = {
      airfarePerPerson: Number(travel?.airfarePerPerson ?? defaultAirfare),
      rentalCarDailyRate: Number(travel?.rentalCarDailyRate ?? defaultRentalCarDailyRate),
      rentalCarCount: Number(travel?.rentalCarCount ?? 0),
      rentalCarDays: Number(travel?.rentalCarDays ?? 0),
    };
    const hasChanges = Object.keys(nextValues).some((key) => nextValues[key as keyof typeof nextValues] !== currentValues[key as keyof typeof currentValues]);
    if (!hasChanges) return;

    if (travelAutoSaveTimer.current) clearTimeout(travelAutoSaveTimer.current);
    travelAutoSaveTimer.current = setTimeout(() => {
      travelMut.mutate(nextValues);
    }, 700);

    return () => {
      if (travelAutoSaveTimer.current) clearTimeout(travelAutoSaveTimer.current);
    };
  }, [defaultAirfare, defaultRentalCarDailyRate, editTravel, travelDraft, travel, travelMut.isPending]);

  const playerOmResponsibilityByUnit = getPlayerOmResponsibilityByUnit(activeBudget);
  const rpaMealsResponsibilityByUnit = getRpaMealsResponsibilityByUnit(activeBudget);

  const unitData: BudgetBreakdownRow[] = Object.values(activeBudget.units)
    .sort((left, right) => compareUnitCodes(left.unitCode, right.unitCode))
    .map((u) => {
      const rpaTotals = getUnitRpaCategoryTotals(u);
      const normalizedUnitCode = String(u.unitCode || '').toUpperCase();
      const showRpaMeals = normalizedUnitCode === 'A7';
      const rpaMeals = rpaMealsResponsibilityByUnit[normalizedUnitCode]?.total || 0;
      const playerOm = playerOmResponsibilityByUnit[normalizedUnitCode]?.total || 0;
      const annualTourTotal = (u.annualTourRpa?.milPay || 0) + (u.annualTourRpa?.travel || 0) + (u.annualTourRpa?.perDiem || 0);
      const totalRpa = rpaTotals.milPay + rpaTotals.travelAndPerDiem + rpaMeals;
      const totalOm = u.planningOm.subtotal + u.whiteCellOm.subtotal + u.executionOm + playerOm;
      return {
        key: u.unitCode,
        unit: getUnitDisplayLabel(u.unitCode),
        rpaMilPay: rpaTotals.milPay,
        planningOm: u.planningOm.subtotal,
        rpaTravelAndPerDiem: rpaTotals.travelAndPerDiem,
        wcExecOm: u.whiteCellOm.subtotal + u.executionOm,
        rpaMeals,
        annualTourMilPay: u.annualTourRpa?.milPay || 0,
        annualTourTravelPay: (u.annualTourRpa?.travel || 0) + (u.annualTourRpa?.perDiem || 0),
        annualTourTotal,
        playerOm,
        totalRpa,
        totalOm,
        total: totalRpa + annualTourTotal + totalOm,
        showRpaMeals,
      };
    });
  const annualTourRpaTotal = getAnnualTourRpaMealsTotal(activeBudget);
  const annualTourBilletingOmTotal = getAnnualTourBilletingOmTotal(activeBudget);
  const rpaCategoryTotals = getRpaCategoryTotals(activeBudget);
  const rpaTravelAndPerDiemTotal = rpaCategoryTotals.travelAndPerDiem;

  const summaryRow: BudgetBreakdownRow = unitData.reduce(
    (totals, row) => ({
      ...totals,
      rpaMilPay: totals.rpaMilPay + row.rpaMilPay,
      planningOm: totals.planningOm + row.planningOm,
      rpaTravelAndPerDiem: totals.rpaTravelAndPerDiem + row.rpaTravelAndPerDiem,
      wcExecOm: totals.wcExecOm + row.wcExecOm,
      rpaMeals: totals.rpaMeals + row.rpaMeals,
      annualTourMilPay: totals.annualTourMilPay + row.annualTourMilPay,
      annualTourTravelPay: totals.annualTourTravelPay + row.annualTourTravelPay,
      annualTourTotal: totals.annualTourTotal + row.annualTourTotal,
      playerOm: totals.playerOm + row.playerOm,
      totalRpa: totals.totalRpa + row.totalRpa,
      totalOm: totals.totalOm + row.totalOm,
      total: totals.total + row.total,
    }),
    {
      key: '__summary__',
      unit: 'Total',
      rpaMilPay: 0,
      planningOm: 0,
      rpaTravelAndPerDiem: 0,
      wcExecOm: 0,
      rpaMeals: 0,
      annualTourMilPay: 0,
      annualTourTravelPay: 0,
      annualTourTotal: 0,
      playerOm: 0,
      totalRpa: 0,
      totalOm: 0,
      total: 0,
      showRpaMeals: true,
    },
  );

  const fullBudgetRows = [...unitData, summaryRow];
  const isSummaryRow = (row: { key: string }) => row.key === '__summary__';
  const renderBudgetLabel = (value: string, row: { key: string }) => (
    isSummaryRow(row) ? <strong>{value}</strong> : value
  );
  const renderBudgetAmount = (value: number, row: { key: string }) => (
    isSummaryRow(row) ? <strong>{fmt(value)}</strong> : fmt(value)
  );
  const renderBudgetMealsAmount = (value: number, row: BudgetBreakdownRow) => {
    if (!row.showRpaMeals && !isSummaryRow(row)) return null;
    return renderBudgetAmount(value, row);
  };
  const printBudgetSections: PrintBudgetSection[] = [
    {
      title: 'RPA',
      totalKey: 'totalRpa',
      fields: [
        { key: 'rpaMilPay', label: 'RPA Mil Pay' },
        { key: 'rpaTravelAndPerDiem', label: 'RPA Travel & Per Diem' },
        { key: 'rpaMeals', label: 'RPA Meals' },
      ],
    },
    {
      title: 'Annual Tour',
      totalKey: 'annualTourTotal',
      fields: [
        { key: 'annualTourMilPay', label: ANNUAL_TOUR_MIL_PAY_LABEL },
        { key: 'annualTourTravelPay', label: ANNUAL_TOUR_TRAVEL_PAY_LABEL },
      ],
    },
    {
      title: 'O&M',
      totalKey: 'totalOm',
      fields: [
        { key: 'planningOm', label: 'Planning O&M' },
        { key: 'wcExecOm', label: 'White Cell + Execution O&M' },
        { key: 'playerOm', label: 'Player O&M' },
      ],
    },
  ];

  const columns = [
    { title: 'Unit', dataIndex: 'unit', width: 60, render: renderBudgetLabel, align: 'center' as const },
    { title: 'RPA Mil Pay', dataIndex: 'rpaMilPay', render: renderBudgetAmount, align: 'center' as const },
    { title: 'RPA Travel & Per Diem', dataIndex: 'rpaTravelAndPerDiem', render: renderBudgetAmount, align: 'center' as const },
    { title: 'RPA Meals', dataIndex: 'rpaMeals', render: renderBudgetMealsAmount, align: 'center' as const },
    { title: 'Total RPA', dataIndex: 'totalRpa', render: renderBudgetAmount, align: 'center' as const },
    { title: 'O&M', dataIndex: 'totalOm', render: renderBudgetAmount, align: 'center' as const },
    { title: 'Total', dataIndex: 'total', render: renderBudgetAmount, align: 'center' as const },
  ];

  const totalBudgetLeft = (activeExercise.totalBudget || 0) - activeBudget.grandTotal;
  const hasStoredRpaBudgetTarget = appConfig.BUDGET_TARGET_RPA !== undefined && appConfig.BUDGET_TARGET_RPA !== '';
  const hasStoredOmBudgetTarget = appConfig.BUDGET_TARGET_OM !== undefined && appConfig.BUDGET_TARGET_OM !== '';
  const storedRpaBudgetTarget = hasStoredRpaBudgetTarget ? Number(appConfig.BUDGET_TARGET_RPA) : null;
  const storedOmBudgetTarget = hasStoredOmBudgetTarget ? Number(appConfig.BUDGET_TARGET_OM) : null;
  const rpaBudgetTarget = storedRpaBudgetTarget ?? (
    storedOmBudgetTarget !== null
      ? Math.max(0, Number(activeExercise.totalBudget || 0) - storedOmBudgetTarget)
      : Number(activeBudget.totalRpa || 0)
  );
  const omBudgetTarget = storedOmBudgetTarget ?? (
    storedRpaBudgetTarget !== null
      ? Math.max(0, Number(activeExercise.totalBudget || 0) - storedRpaBudgetTarget)
      : Number(activeBudget.totalOm || 0)
  );
  const hasStoredBudgetTargets = hasStoredRpaBudgetTarget || hasStoredOmBudgetTarget;
  const draftOverallBudget = draftRpaBudgetTarget + draftOmBudgetTarget;
  const hasBudgetDraftChanges =
    draftRpaBudgetTarget !== rpaBudgetTarget ||
    draftOmBudgetTarget !== omBudgetTarget;
  const overallBudgetDisplay =
    hasStoredBudgetTargets || hasBudgetDraftChanges
      ? draftOverallBudget
        : Number(activeExercise.totalBudget || draftOverallBudget);
      const planningSummaryEntries = getPlanningSummaryEntries(activeExercise);
  const explicitLongTourPlannerEntries = planningSummaryEntries.filter((entry) => entry.longTermA7Planner);
  const fallbackPlannerEntries = planningSummaryEntries.filter(
    (entry) =>
      ['A7', 'CAB'].includes(String(entry.unitCode || '').toUpperCase())
      && getPlanningNoteCategory(entry.note) === 'planning',
  );
  const plannerSummaryEntries = explicitLongTourPlannerEntries.length > 0
    ? explicitLongTourPlannerEntries
    : fallbackPlannerEntries;
  const siteVisitEntries = planningSummaryEntries.filter(
    (entry) => getPlanningNoteCategory(entry.note) === 'site visit',
  );
  const planningConferenceEntries = planningSummaryEntries.filter(
    (entry) => getPlanningNoteCategory(entry.note) === 'planning conference',
  );
  const breakfastCost = Number(appConfig.BREAKFAST_COST ?? 14);
  const dinnerCost = Number(appConfig.DINNER_COST ?? 14);
  const combinedBreakfastDinnerCost = breakfastCost + dinnerCost;
  const quickPlanningSummaryItems = [
    {
      key: 'planners',
      label: 'Long-Tour Planners',
      text: buildPlannerSummary(plannerSummaryEntries),
    },
    {
      key: 'site-visits',
      label: 'Site Visits',
      text: buildPlanningEventSummary(siteVisitEntries, 'site visit', 'site visits'),
    },
    {
      key: 'planning-conferences',
      label: 'Planning Conferences',
      text: buildPlanningEventSummary(planningConferenceEntries, 'planning conference', 'planning conferences'),
    },
  ];
  const quickPlanningRateItems = [
    {
      key: 'breakfast-dinner',
      label: 'Breakfast/Dinner',
      value: `${fmtRate(breakfastCost)} per meal = ${fmtRate(combinedBreakfastDinnerCost)}/day`,
      detail: 'RPA',
    },
    {
      key: 'lunch-mre',
      label: 'Lunch/MRE',
      value: `${fmtRate(Number(appConfig.LUNCH_MRE_COST ?? 15.91))}/day`,
      detail: 'RPA',
    },
    {
      key: 'player-per-diem',
      label: 'Player M&IE',
      value: `${fmtRate(Number(appConfig.PLAYER_PER_DIEM_PER_DAY ?? appConfig.FIELD_CONDITIONS_PER_DIEM ?? 5))}/day + ${fmtRate(Number(appConfig.DEFAULT_AIRFARE ?? 400))} airfare`,
      detail: 'RPA',
    },
    {
      key: 'player-billeting',
      label: 'Player Billeting',
      value: `${fmtRate(Number(appConfig.PLAYER_BILLETING_NIGHT ?? 27))}/night`,
      detail: 'O&M',
    },
  ];

  useEffect(() => {
    skipBudgetTargetsSaveRef.current = true;
    skipTotalBudgetSaveRef.current = true;
    setDraftRpaBudgetTarget(rpaBudgetTarget);
    setDraftOmBudgetTarget(omBudgetTarget);
  }, [rpaBudgetTarget, omBudgetTarget]);

  useEffect(() => {
    skipDutyDaysSaveRef.current = true;
    setDraftDutyDays(activeExercise.defaultDutyDays);
  }, [activeExercise.defaultDutyDays]);

  useEffect(() => {
    skipReportAssumptionsSaveRef.current = true;
    setDraftReportAssumptions(currentReportAssumptions);
  }, [
    currentReportAssumption1,
    currentReportAssumption2,
    currentReportAssumption3,
    currentReportAssumption4,
  ]);

  useEffect(() => {
    skipReportLimfacsSaveRef.current = true;
    setDraftReportLimfacs(currentReportLimfacs);
  }, [
    currentReportLimfac1,
    currentReportLimfac2,
    currentReportLimfac3,
  ]);

  useEffect(() => {
    if (skipBudgetTargetsSaveRef.current) {
      skipBudgetTargetsSaveRef.current = false;
      return;
    }
    if (appConfigMut.isPending) return;
    if (draftRpaBudgetTarget === rpaBudgetTarget && draftOmBudgetTarget === omBudgetTarget) return;

    if (budgetAutoSaveTimer.current) clearTimeout(budgetAutoSaveTimer.current);
    budgetAutoSaveTimer.current = setTimeout(() => {
      appConfigMut.mutate({
        ...appConfig,
        BUDGET_TARGET_RPA: String(draftRpaBudgetTarget),
        BUDGET_TARGET_OM: String(draftOmBudgetTarget),
      });
    }, 700);

    return () => {
      if (budgetAutoSaveTimer.current) clearTimeout(budgetAutoSaveTimer.current);
    };
  }, [
    appConfig,
    appConfigMut,
    draftRpaBudgetTarget,
    draftOmBudgetTarget,
    rpaBudgetTarget,
    omBudgetTarget,
  ]);

  useEffect(() => {
    if (skipTotalBudgetSaveRef.current) {
      skipTotalBudgetSaveRef.current = false;
      return;
    }
    if (!hasStoredBudgetTargets && !hasBudgetDraftChanges) return;
    if (totalBudgetMut.isPending) return;
    if (draftOverallBudget === activeExercise.totalBudget) return;
    totalBudgetMut.mutate(draftOverallBudget);
  }, [draftOverallBudget, activeExercise.totalBudget, hasBudgetDraftChanges, hasStoredBudgetTargets, totalBudgetMut]);

  useEffect(() => {
    if (skipDutyDaysSaveRef.current) {
      skipDutyDaysSaveRef.current = false;
      return;
    }
    if (exerciseMut.isPending) return;
    if (draftDutyDays === activeExercise.defaultDutyDays) return;

    if (dutyDaysAutoSaveTimer.current) clearTimeout(dutyDaysAutoSaveTimer.current);
    dutyDaysAutoSaveTimer.current = setTimeout(() => {
      exerciseMut.mutate({ defaultDutyDays: draftDutyDays });
    }, 700);

    return () => {
      if (dutyDaysAutoSaveTimer.current) clearTimeout(dutyDaysAutoSaveTimer.current);
    };
  }, [draftDutyDays, activeExercise.defaultDutyDays, exerciseMut]);

  useEffect(() => {
    if (skipReportAssumptionsSaveRef.current) {
      skipReportAssumptionsSaveRef.current = false;
      return;
    }
    if (reportAssumptionsMut.isPending) return;

    const hasChanges = draftReportAssumptions.some((line, index) => line !== currentReportAssumptions[index]);
    if (!hasChanges) return;

    if (reportAssumptionsAutoSaveTimer.current) clearTimeout(reportAssumptionsAutoSaveTimer.current);
    reportAssumptionsAutoSaveTimer.current = setTimeout(() => {
      reportAssumptionsMut.mutate({
        reportAssumption1: draftReportAssumptions[0],
        reportAssumption2: draftReportAssumptions[1],
        reportAssumption3: draftReportAssumptions[2],
        reportAssumption4: draftReportAssumptions[3],
      });
    }, 700);

    return () => {
      if (reportAssumptionsAutoSaveTimer.current) clearTimeout(reportAssumptionsAutoSaveTimer.current);
    };
  }, [
    currentReportAssumption1,
    currentReportAssumption2,
    currentReportAssumption3,
    currentReportAssumption4,
    draftReportAssumptions,
    reportAssumptionsMut,
  ]);

  useEffect(() => {
    if (skipReportLimfacsSaveRef.current) {
      skipReportLimfacsSaveRef.current = false;
      return;
    }
    if (reportLimfacsMut.isPending) return;

    const hasChanges = draftReportLimfacs.some((line, index) => line !== currentReportLimfacs[index]);
    if (!hasChanges) return;

    if (reportLimfacsAutoSaveTimer.current) clearTimeout(reportLimfacsAutoSaveTimer.current);
    reportLimfacsAutoSaveTimer.current = setTimeout(() => {
      reportLimfacsMut.mutate({
        reportLimfac1: draftReportLimfacs[0],
        reportLimfac2: draftReportLimfacs[1],
        reportLimfac3: draftReportLimfacs[2],
      });
    }, 700);

    return () => {
      if (reportLimfacsAutoSaveTimer.current) clearTimeout(reportLimfacsAutoSaveTimer.current);
    };
  }, [
    currentReportLimfac1,
    currentReportLimfac2,
    currentReportLimfac3,
    draftReportLimfacs,
    reportLimfacsMut,
  ]);

  if (isLoading) return <div className="ct-loading"><Spin size="large" /></div>;

  return (
    <div ref={exportRef}>
      <div className="ct-page-header">
        <Typography.Title level={4} className="ct-page-title">{title}</Typography.Title>
        <div className="ct-page-actions">
          <Space wrap>
            <Button icon={<FilePdfOutlined />} onClick={handleExportPdf}>Export to PDF</Button>
            <Button icon={<FileExcelOutlined />} type="primary" onClick={handleExport}>Export to Excel</Button>
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>Print</Button>
          </Space>
        </div>
      </div>

      {/* Exercise info */}
      <Card
        title="Exercise Details"
        className="ct-section-card ct-exercise-details-card"
        style={{ marginBottom: 24 }}
        extra={
          <Typography.Text type="secondary">
            {appConfigMut.isPending || totalBudgetMut.isPending || exerciseMut.isPending || reportAssumptionsMut.isPending || reportLimfacsMut.isPending ? 'Autosaving...' : 'Changes auto-save'}
          </Typography.Text>
        }
      >
        <Descriptions column={4} size="small">
          <Descriptions.Item label="Name">{exercise.name}</Descriptions.Item>
          <Descriptions.Item label="Start">{dayjs(exercise.startDate).format('DD MMM YYYY')}</Descriptions.Item>
          <Descriptions.Item label="End">{dayjs(exercise.endDate).format('DD MMM YYYY')}</Descriptions.Item>
          {showBudgetDetails ? (
            <Descriptions.Item label="Total Budget ($)">
              <Space direction="vertical" size={10} style={{ width: '100%', maxWidth: 320 }}>
                <InputNumber
                  size="small"
                  min={0}
                  value={overallBudgetDisplay}
                  addonBefore="Overall Budget"
                  style={{ width: '100%' }}
                  readOnly
                />
                <InputNumber
                  size="small"
                  min={0}
                  value={draftRpaBudgetTarget}
                  onChange={(v) => setDraftRpaBudgetTarget(v ?? 0)}
                  addonBefore="RPA Budget"
                  style={{ width: '100%' }}
                />
                <InputNumber
                  size="small"
                  min={0}
                  value={draftOmBudgetTarget}
                  onChange={(v) => setDraftOmBudgetTarget(v ?? 0)}
                  addonBefore="O&M Budget"
                  style={{ width: '100%' }}
                />
              </Space>
            </Descriptions.Item>
          ) : null}
          <Descriptions.Item label="Exercise Duration">
            <InputNumber
              size="small"
              min={1}
              value={draftDutyDays}
              onChange={(v) => setDraftDutyDays(v ?? 1)}
              formatter={(value) => (value == null ? '' : `${value} days`)}
              parser={(value) => Number((value ?? '').replace(/\s*days?$/i, '').trim())}
              style={{ width: 110 }}
            />
          </Descriptions.Item>
        </Descriptions>
        <div className="ct-report-notes-layout">
          <div className="ct-report-notes-section">
            <Typography.Text strong>Estimations include:</Typography.Text>
            <div className="ct-report-notes-list">
              {draftReportAssumptions.map((line, index) => (
                <div
                  key={`report-assumption-${index + 1}`}
                  className="ct-report-notes-row"
                >
                  <Typography.Text className="ct-report-notes-bullet">•</Typography.Text>
                  <Input
                    className="ct-report-notes-input ct-screen-only"
                    value={line}
                    onChange={(event) => {
                      const next = [...draftReportAssumptions] as ReportAssumptions;
                      next[index] = event.target.value;
                      setDraftReportAssumptions(next);
                    }}
                    placeholder={`Estimation line ${index + 1}`}
                    bordered={false}
                    style={{ color: '#596577', paddingInline: 0, background: 'transparent' }}
                  />
                  <span className="ct-report-notes-text ct-print-only">{line}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ct-report-notes-section">
            <Typography.Text strong>LIMFACs</Typography.Text>
            <div className="ct-report-notes-list">
              {draftReportLimfacs.map((line, index) => (
                <div
                  key={`report-limfac-${index + 1}`}
                  className="ct-report-notes-row"
                >
                  <Typography.Text className="ct-report-notes-bullet">•</Typography.Text>
                  <Input
                    className="ct-report-notes-input ct-screen-only"
                    value={line}
                    onChange={(event) => {
                      const next = [...draftReportLimfacs] as ReportLimfacs;
                      next[index] = event.target.value;
                      setDraftReportLimfacs(next);
                    }}
                    placeholder={`LIMFAC line ${index + 1}`}
                    bordered={false}
                    style={{ color: '#596577', paddingInline: 0, background: 'transparent' }}
                  />
                  <span className="ct-report-notes-text ct-print-only">{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {beforeBudgetBreakdownSection}

      <Card title="Quick Planning Summary" className="ct-section-card ct-quick-summary-card" style={{ marginBottom: 24 }}>
        <div className="ct-quick-summary-grid">
          {quickPlanningSummaryItems.map((item) => (
            <div key={item.key} className="ct-quick-summary-item">
              <div className="ct-quick-summary-label">{item.label}</div>
              <div className="ct-quick-summary-text">{item.text}</div>
            </div>
          ))}
        </div>
        <div className="ct-quick-summary-rates">
          <div className="ct-quick-summary-rates-title">Player Cost Rates</div>
          <div className="ct-quick-summary-rate-list">
            {quickPlanningRateItems.map((item) => (
              <div key={item.key} className="ct-quick-summary-rate-item">
                <div className="ct-quick-summary-rate-label">{item.label}</div>
                <div className="ct-quick-summary-rate-value">{item.value}</div>
                <div
                  className={`ct-quick-summary-rate-detail ${
                    item.detail === 'RPA'
                      ? 'ct-quick-summary-rate-detail-rpa'
                      : item.detail === 'O&M'
                        ? 'ct-quick-summary-rate-detail-om'
                        : ''
                  }`}
                >
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Full budget table */}
      <Card title="Full Budget Breakdown" className="ct-section-card" style={{ marginBottom: 24 }}>
        <div className="ct-table ct-screen-only">
            <Table size="small" pagination={false} dataSource={fullBudgetRows} columns={columns} scroll={{ x: 1080 }} />
        </div>
        <div className="ct-print-only ct-print-budget-list">
          {fullBudgetRows.map((row) => (
            <div
              key={row.key}
              className={`ct-print-budget-unit ${isSummaryRow(row) ? 'ct-print-budget-unit-total' : ''}`}
            >
              <div className="ct-print-budget-header">
                <div className="ct-print-budget-unit-name">{row.unit}</div>
                <div className="ct-print-budget-unit-total-value">Total: {fmt(row.total)}</div>
              </div>
              <div className="ct-print-budget-sections">
                {printBudgetSections.map((section) => (
                  <div key={section.title} className="ct-print-budget-section">
                    <div className="ct-print-budget-section-header">
                      <div className="ct-print-budget-section-title">{section.title}</div>
                      <div className="ct-print-budget-section-total">{fmt(row[section.totalKey])}</div>
                    </div>
                    <div className="ct-print-budget-grid">
                      {section.fields
                        .filter((field) => row.showRpaMeals || field.key !== 'rpaMeals')
                        .map((field) => (
                        <div key={field.key} className="ct-print-budget-item">
                          <div className="ct-print-budget-item-label">{field.label}</div>
                          <div className="ct-print-budget-item-value">{fmt(row[field.key])}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {extraSections}

      {/* Travel Config */}
      <Card
        title="Travel Configuration"
        className="ct-section-card"
        style={{ marginBottom: 24 }}
        extra={
          editTravel ? (
            <Space>
              <Typography.Text type="secondary">{travelMut.isPending ? 'Autosaving...' : 'Changes auto-save'}</Typography.Text>
              <Button icon={<SaveOutlined />} onClick={() => setEditTravel(false)}>
                Done
              </Button>
            </Space>
          ) : (
            <Button icon={<EditOutlined />} onClick={() => {
              setEditTravel(true);
              travelForm.setFieldsValue({
                airfarePerPerson: Number(travel?.airfarePerPerson ?? defaultAirfare),
                rentalCarDailyRate: Number(travel?.rentalCarDailyRate ?? defaultRentalCarDailyRate),
              });
            }}>
              Edit
            </Button>
          )
        }
      >
        {editTravel ? (
          <Form
            form={travelForm}
            layout="inline"
            initialValues={{
              airfarePerPerson: Number(travel?.airfarePerPerson ?? defaultAirfare),
              rentalCarDailyRate: Number(travel?.rentalCarDailyRate ?? defaultRentalCarDailyRate),
            }}
          >
            <Form.Item name="airfarePerPerson" label="Airfare ($/person)">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="rentalCarDailyRate" label="Rental Car ($/day)">
              <InputNumber min={0} />
            </Form.Item>
          </Form>
        ) : (
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Airfare">{fmt(travel?.airfarePerPerson ?? defaultAirfare)}/person</Descriptions.Item>
            <Descriptions.Item label="Car Rate">{fmt(travel?.rentalCarDailyRate ?? defaultRentalCarDailyRate)}/day</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {showGrandTotals ? (
        <Card title="Grand Totals" className="ct-section-card">
          <Descriptions column={3}>
            <Descriptions.Item label="Total Budget Left"><Typography.Text strong>{fmt(totalBudgetLeft)}</Typography.Text></Descriptions.Item>
            <Descriptions.Item label="Total RPA"><Typography.Text strong style={{ color: '#1677ff' }}>{fmt(budget.totalRpa)}</Typography.Text></Descriptions.Item>
            <Descriptions.Item label="Total O&M"><Typography.Text strong style={{ color: '#52c41a' }}>{fmt(budget.totalOm)}</Typography.Text></Descriptions.Item>
            <Descriptions.Item label="Grand Total"><Typography.Title level={4} style={{ margin: 0, fontSize: 32, lineHeight: 1.2 }}>{fmt(budget.grandTotal)}</Typography.Title></Descriptions.Item>
            <Descriptions.Item label="RPA Travel & Per Diem">{fmt(rpaTravelAndPerDiemTotal)}</Descriptions.Item>
            <Descriptions.Item label="Exercise O&M">{fmt(budget.exerciseOmTotal)}</Descriptions.Item>
            <Descriptions.Item label="WRM">{fmt(budget.wrm)}</Descriptions.Item>
            <Descriptions.Item label="Total PAX">{displayTotalPax}</Descriptions.Item>
            <Descriptions.Item label="Players">{budget.totalPlayers}</Descriptions.Item>
            <Descriptions.Item label="Annual Tour PAX">{budget.totalAnnualTour}</Descriptions.Item>
            <Descriptions.Item label={ANNUAL_TOUR_MEALS_LABEL}>{fmt(annualTourRpaTotal)}</Descriptions.Item>
            <Descriptions.Item label={ANNUAL_TOUR_BILLETING_LABEL}>{fmt(annualTourBilletingOmTotal)}</Descriptions.Item>
            <Descriptions.Item label="White Cell & Exercise Support">{budget.totalWhiteCell}</Descriptions.Item>
          </Descriptions>
        </Card>
      ) : null}
    </div>
  );
}

export default function Reports() {
  return <ReportsPage />;
}
