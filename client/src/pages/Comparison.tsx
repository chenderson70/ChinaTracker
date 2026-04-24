import { Card, Empty, Select, Spin, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import type { BudgetResult, Exercise, ExerciseDetail, PersonnelEntry, PersonnelGroup } from '../types';
import { getAnnualTourBilletingOmTotal, getAnnualTourBoxTotal, getAnnualTourMilPayTotal, getAnnualTourTravelPayTotal, getRpaCategoryTotals } from '../utils/budgetSummary';
import { compareUnitCodes, getUnitDisplayLabel } from '../utils/unitLabels';

type SustainmentCounts = {
  mresNeeded: number;
  playerRoomsNeeded: number;
  playerRoomNights: number;
  localHotelRoomsNeeded: number;
  localHotelRoomNights: number;
};

type ExecutionPaxCounts = {
  playerPax: number;
  whiteCellSupportPax: number;
};

type UnitComparisonMetrics = SustainmentCounts & {
  totalFunding: number;
  rpaFunding: number;
  omFunding: number;
};

type ExerciseComparisonMetrics = {
  totalFunding: number;
  rpaFunding: number;
  omFunding: number;
  annualTourFunding: number;
  milPayFunding: number;
  travelPerDiemFunding: number;
  mealsFunding: number;
  lodgingFunding: number;
  executionPax: ExecutionPaxCounts;
  sustainment: SustainmentCounts;
  units: Record<string, UnitComparisonMetrics>;
};

type ComparisonRow = {
  key: string;
  metric: string;
  current: number;
  comparison: number;
  delta: number;
};

type UnitComparisonRow = {
  key: string;
  unit: string;
  currentFunding: number;
  comparisonFunding: number;
  fundingDelta: number;
  currentPlayerRooms: number;
  comparisonPlayerRooms: number;
  playerRoomDelta: number;
  currentMres: number;
  comparisonMres: number;
  mresDelta: number;
  currentLocalHotelRooms: number;
  comparisonLocalHotelRooms: number;
  localHotelRoomDelta: number;
};

type SummaryBreakdownItem = {
  label: string;
  value: string;
};

type SummaryCard = {
  key: string;
  title: string;
  currentLabel: string;
  currentValue: string;
  comparisonLabel: string;
  comparisonValue: string;
  delta: number;
  deltaText: string;
  formatter: (value: number) => string;
  currentBreakdown?: SummaryBreakdownItem[];
  comparisonBreakdown?: SummaryBreakdownItem[];
};

const fmtCurrency = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const fmtCount = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });

function formatSignedCurrency(value: number): string {
  if (value === 0) return fmtCurrency(0);
  return `${value > 0 ? '+' : '-'}${fmtCurrency(Math.abs(value))}`;
}

function formatSignedCount(value: number): string {
  if (value === 0) return fmtCount(0);
  return `${value > 0 ? '+' : '-'}${fmtCount(Math.abs(value))}`;
}

function renderSignedValue(value: number, formatter: (amount: number) => string) {
  const color = value > 0 ? '#cf1322' : value < 0 ? '#1677ff' : '#1f1f1f';
  return <Typography.Text style={{ color, fontWeight: 600 }}>{formatter(value)}</Typography.Text>;
}

function toCount(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function toLocalFlag(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'local';
  }
  return false;
}

function getEffectiveEntries(group: PersonnelGroup, defaultDutyDays: number): Array<Partial<PersonnelEntry>> {
  if (group.personnelEntries.length > 0) {
    return group.personnelEntries;
  }

  if ((group.paxCount || 0) <= 0) {
    return [];
  }

  return [{
    count: group.paxCount,
    dutyDays: group.dutyDays ?? defaultDutyDays,
    isLocal: group.isLocal,
  }];
}

function createEmptySustainmentCounts(): SustainmentCounts {
  return {
    mresNeeded: 0,
    playerRoomsNeeded: 0,
    playerRoomNights: 0,
    localHotelRoomsNeeded: 0,
    localHotelRoomNights: 0,
  };
}

function createEmptyExecutionPaxCounts(): ExecutionPaxCounts {
  return {
    playerPax: 0,
    whiteCellSupportPax: 0,
  };
}

function buildExecutionPaxCounts(groupList: PersonnelGroup[], defaultDutyDays: number): ExecutionPaxCounts {
  const counts = createEmptyExecutionPaxCounts();

  for (const group of groupList) {
    const role = String(group.role || '').toUpperCase();
    const isPlayerLike = role === 'PLAYER' || role === 'ANNUAL_TOUR';
    const isWhiteCellSupport = role === 'WHITE_CELL' || role === 'SUPPORT';

    if (!isPlayerLike && !isWhiteCellSupport) continue;

    for (const entry of getEffectiveEntries(group, defaultDutyDays)) {
      const count = toCount(entry.count);
      if (count <= 0) continue;

      if (isPlayerLike) {
        counts.playerPax += count;
      }

      if (isWhiteCellSupport) {
        counts.whiteCellSupportPax += count;
      }
    }
  }

  return counts;
}

function buildUnitSustainmentMetrics(groupList: PersonnelGroup[], defaultDutyDays: number): SustainmentCounts {
  const metrics = createEmptySustainmentCounts();

  for (const group of groupList) {
    const role = String(group.role || '').toUpperCase();
    const isPlayerLike = role === 'PLAYER' || role === 'ANNUAL_TOUR';
    const isExecutionHotelGroup = role === 'WHITE_CELL' || role === 'SUPPORT';
    const isRpaPlayerMealsGroup = isPlayerLike && String(group.fundingType || '').toUpperCase() === 'RPA';

    for (const entry of getEffectiveEntries(group, defaultDutyDays)) {
      const count = toCount(entry.count);
      const dutyDays = toCount(entry.dutyDays ?? group.dutyDays ?? defaultDutyDays);
      const isLocal = toLocalFlag(entry.isLocal) || toLocalFlag(group.isLocal);

      if (count <= 0 || dutyDays <= 0) continue;

      if (isRpaPlayerMealsGroup) {
        metrics.mresNeeded += count * dutyDays;
      }

      if (isPlayerLike && !isLocal) {
        metrics.playerRoomsNeeded += count;
        metrics.playerRoomNights += count * dutyDays;
      }

      if (isExecutionHotelGroup && !isLocal) {
        metrics.localHotelRoomsNeeded += count;
        metrics.localHotelRoomNights += count * dutyDays;
      }
    }
  }

  return metrics;
}

function buildExerciseMetrics(exercise: ExerciseDetail, budget: BudgetResult): ExerciseComparisonMetrics {
  const units: Record<string, UnitComparisonMetrics> = {};
  const unitBudgetsByCode = new Map(
    (exercise.unitBudgets || []).map((unitBudget) => [String(unitBudget.unitCode || '').toUpperCase(), unitBudget]),
  );

  for (const unit of Object.values(budget.units)) {
    const normalizedUnitCode = String(unit.unitCode || '').toUpperCase();
    const sustainment = buildUnitSustainmentMetrics(
      unitBudgetsByCode.get(normalizedUnitCode)?.personnelGroups || [],
      exercise.defaultDutyDays || 1,
    );

    units[normalizedUnitCode] = {
      ...sustainment,
      totalFunding: Number(unit.unitTotal || 0),
      rpaFunding: Number(unit.unitTotalRpa || 0),
      omFunding: Number(unit.unitTotalOm || 0),
    };
  }

  const sustainmentTotals = Object.values(units).reduce(
    (acc, unit) => ({
      mresNeeded: acc.mresNeeded + unit.mresNeeded,
      playerRoomsNeeded: acc.playerRoomsNeeded + unit.playerRoomsNeeded,
      playerRoomNights: acc.playerRoomNights + unit.playerRoomNights,
      localHotelRoomsNeeded: acc.localHotelRoomsNeeded + unit.localHotelRoomsNeeded,
      localHotelRoomNights: acc.localHotelRoomNights + unit.localHotelRoomNights,
    }),
    createEmptySustainmentCounts(),
  );

  const executionPaxTotals = (exercise.unitBudgets || []).reduce(
    (acc, unitBudget) => {
      const counts = buildExecutionPaxCounts(unitBudget.personnelGroups || [], exercise.defaultDutyDays || 1);
      return {
        playerPax: acc.playerPax + counts.playerPax,
        whiteCellSupportPax: acc.whiteCellSupportPax + counts.whiteCellSupportPax,
      };
    },
    createEmptyExecutionPaxCounts(),
  );

  const mealTotals = getRpaCategoryTotals(budget);
  const playerBilletingFunding = Object.values(budget.units)
    .reduce((sum, unit) => sum + (unit.playerOm?.billeting || 0), 0);
  const lodgingFunding = playerBilletingFunding + getAnnualTourBilletingOmTotal(budget);
  const omTravelPerDiemFunding = Object.values(budget.units)
    .reduce(
      (sum, unit) =>
        sum +
        (unit.planningOm?.travel || 0) +
        (unit.planningOm?.perDiem || 0) +
        (unit.whiteCellOm?.travel || 0) +
        (unit.whiteCellOm?.perDiem || 0) +
        (unit.playerOm?.travel || 0) +
        (unit.playerOm?.perDiem || 0),
      0,
    );
  const annualTourFunding = Number(getAnnualTourBoxTotal(budget) || 0);
  const milPayFunding = Number((mealTotals.milPay || 0) + getAnnualTourMilPayTotal(budget));
  const travelPerDiemFunding = Number((mealTotals.travelAndPerDiem || 0) + omTravelPerDiemFunding + getAnnualTourTravelPayTotal(budget));

  return {
    totalFunding: Number(budget.grandTotal || 0),
    rpaFunding: Number(budget.totalRpa || 0),
    omFunding: Number(budget.totalOm || 0),
    annualTourFunding,
    milPayFunding,
    travelPerDiemFunding,
    mealsFunding: Number(mealTotals.meals || 0),
    lodgingFunding,
    executionPax: executionPaxTotals,
    sustainment: sustainmentTotals,
    units,
  };
}

export default function Comparison() {
  const { exercise, budget, exerciseId } = useApp();
  const [comparisonExerciseId, setComparisonExerciseId] = useState<string | null>(null);

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises'],
    queryFn: api.getExercises,
  });

  const comparisonOptions = exercises
    .filter((item) => item.id !== exerciseId)
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));

  useEffect(() => {
    if (comparisonOptions.length === 0) {
      setComparisonExerciseId(null);
      return;
    }

    if (!comparisonExerciseId || !comparisonOptions.some((option) => option.value === comparisonExerciseId)) {
      setComparisonExerciseId(comparisonOptions[0].value);
    }
  }, [comparisonExerciseId, comparisonOptions]);

  const comparisonExerciseQuery = useQuery({
    queryKey: ['exercise', comparisonExerciseId],
    queryFn: () => api.getExercise(comparisonExerciseId!),
    enabled: !!comparisonExerciseId,
  });

  const comparisonBudgetQuery = useQuery({
    queryKey: ['budget', comparisonExerciseId],
    queryFn: () => api.calculateBudget(comparisonExerciseId!),
    enabled: !!comparisonExerciseId,
  });

  if (!exercise || !budget) {
    return <div className="ct-loading"><Spin size="large" /></div>;
  }

  if (comparisonOptions.length === 0) {
    return (
      <div>
        <div className="ct-page-header">
          <Typography.Title level={4} className="ct-page-title">Comparison</Typography.Title>
        </div>
        <Card className="ct-section-card">
          <Empty description="Create at least one more exercise to compare it against the current one." />
        </Card>
      </div>
    );
  }

  if (!comparisonExerciseId || comparisonExerciseQuery.isLoading || comparisonBudgetQuery.isLoading) {
    return <div className="ct-loading"><Spin size="large" /></div>;
  }

  const comparisonExercise = comparisonExerciseQuery.data;
  const comparisonBudget = comparisonBudgetQuery.data;

  if (!comparisonExercise || !comparisonBudget) {
    return (
      <div>
        <div className="ct-page-header">
          <Typography.Title level={4} className="ct-page-title">Comparison</Typography.Title>
        </div>
        <Card className="ct-section-card">
          <Empty description="Select another exercise to generate the comparison report." />
        </Card>
      </div>
    );
  }

  const currentMetrics = buildExerciseMetrics(exercise, budget);
  const selectedMetrics = buildExerciseMetrics(comparisonExercise, comparisonBudget);

  const summaryCards: SummaryCard[] = [
    {
      key: 'funding',
      title: 'Funding Difference',
      currentLabel: exercise.name,
      currentValue: fmtCurrency(currentMetrics.totalFunding),
      comparisonLabel: comparisonExercise.name,
      comparisonValue: fmtCurrency(selectedMetrics.totalFunding),
      delta: selectedMetrics.totalFunding - currentMetrics.totalFunding,
      deltaText: 'Grand total',
      formatter: formatSignedCurrency,
    },
    {
      key: 'travel',
      title: 'Travel & Per Diem Difference',
      currentLabel: exercise.name,
      currentValue: fmtCurrency(currentMetrics.travelPerDiemFunding),
      comparisonLabel: comparisonExercise.name,
      comparisonValue: fmtCurrency(selectedMetrics.travelPerDiemFunding),
      delta: selectedMetrics.travelPerDiemFunding - currentMetrics.travelPerDiemFunding,
      deltaText: 'Travel + per diem',
      formatter: formatSignedCurrency,
    },
    {
      key: 'meals',
      title: 'Meals Difference',
      currentLabel: exercise.name,
      currentValue: `${fmtCount(currentMetrics.sustainment.mresNeeded)} MREs`,
      comparisonLabel: comparisonExercise.name,
      comparisonValue: `${fmtCount(selectedMetrics.sustainment.mresNeeded)} MREs`,
      delta: selectedMetrics.sustainment.mresNeeded - currentMetrics.sustainment.mresNeeded,
      deltaText: 'MRE requirement',
      formatter: formatSignedCount,
    },
    {
      key: 'pax',
      title: 'PAX Difference',
      currentLabel: exercise.name,
      currentValue: `${fmtCount(currentMetrics.executionPax.playerPax + currentMetrics.executionPax.whiteCellSupportPax)} PAX`,
      currentBreakdown: [
        {
          label: 'Player',
          value: `${fmtCount(currentMetrics.executionPax.playerPax)} PAX`,
        },
        {
          label: 'White Cell / Support',
          value: `${fmtCount(currentMetrics.executionPax.whiteCellSupportPax)} PAX`,
        },
      ],
      comparisonLabel: comparisonExercise.name,
      comparisonValue: `${fmtCount(selectedMetrics.executionPax.playerPax + selectedMetrics.executionPax.whiteCellSupportPax)} PAX`,
      comparisonBreakdown: [
        {
          label: 'Player',
          value: `${fmtCount(selectedMetrics.executionPax.playerPax)} PAX`,
        },
        {
          label: 'White Cell / Support',
          value: `${fmtCount(selectedMetrics.executionPax.whiteCellSupportPax)} PAX`,
        },
      ],
      delta: (selectedMetrics.executionPax.playerPax + selectedMetrics.executionPax.whiteCellSupportPax)
        - (currentMetrics.executionPax.playerPax + currentMetrics.executionPax.whiteCellSupportPax),
      deltaText: 'Total execution PAX',
      formatter: formatSignedCount,
    },
    {
      key: 'lodging',
      title: 'Lodging Difference',
      currentLabel: exercise.name,
      currentValue: `${fmtCount(currentMetrics.sustainment.playerRoomsNeeded + currentMetrics.sustainment.localHotelRoomsNeeded)} rooms`,
      currentBreakdown: [
        {
          label: 'Player billeting',
          value: `${fmtCount(currentMetrics.sustainment.playerRoomsNeeded)} rooms`,
        },
        {
          label: 'Support / White Cell hotel',
          value: `${fmtCount(currentMetrics.sustainment.localHotelRoomsNeeded)} rooms`,
        },
      ],
      comparisonLabel: comparisonExercise.name,
      comparisonValue: `${fmtCount(selectedMetrics.sustainment.playerRoomsNeeded + selectedMetrics.sustainment.localHotelRoomsNeeded)} rooms`,
      comparisonBreakdown: [
        {
          label: 'Player billeting',
          value: `${fmtCount(selectedMetrics.sustainment.playerRoomsNeeded)} rooms`,
        },
        {
          label: 'Support / White Cell hotel',
          value: `${fmtCount(selectedMetrics.sustainment.localHotelRoomsNeeded)} rooms`,
        },
      ],
      delta: (selectedMetrics.sustainment.playerRoomsNeeded + selectedMetrics.sustainment.localHotelRoomsNeeded)
        - (currentMetrics.sustainment.playerRoomsNeeded + currentMetrics.sustainment.localHotelRoomsNeeded),
      deltaText: 'Total rooms',
      formatter: formatSignedCount,
    },
  ];

  const fundingRows: ComparisonRow[] = [
    {
      key: 'grand-total',
      metric: 'Grand Total',
      current: currentMetrics.totalFunding,
      comparison: selectedMetrics.totalFunding,
      delta: selectedMetrics.totalFunding - currentMetrics.totalFunding,
    },
    {
      key: 'rpa-funding',
      metric: 'RPA Funding',
      current: currentMetrics.rpaFunding,
      comparison: selectedMetrics.rpaFunding,
      delta: selectedMetrics.rpaFunding - currentMetrics.rpaFunding,
    },
    {
      key: 'om-funding',
      metric: 'O&M Funding',
      current: currentMetrics.omFunding,
      comparison: selectedMetrics.omFunding,
      delta: selectedMetrics.omFunding - currentMetrics.omFunding,
    },
    {
      key: 'annual-tour-funding',
      metric: 'Annual Tour Operations',
      current: currentMetrics.annualTourFunding,
      comparison: selectedMetrics.annualTourFunding,
      delta: selectedMetrics.annualTourFunding - currentMetrics.annualTourFunding,
    },
  ];

  const budgetDriverRows: ComparisonRow[] = [
    {
      key: 'mil-pay',
      metric: 'Mil Pay',
      current: currentMetrics.milPayFunding,
      comparison: selectedMetrics.milPayFunding,
      delta: selectedMetrics.milPayFunding - currentMetrics.milPayFunding,
    },
    {
      key: 'travel-per-diem',
      metric: 'Travel & Per Diem',
      current: currentMetrics.travelPerDiemFunding,
      comparison: selectedMetrics.travelPerDiemFunding,
      delta: selectedMetrics.travelPerDiemFunding - currentMetrics.travelPerDiemFunding,
    },
    {
      key: 'meals-funding',
      metric: 'Meals Funding',
      current: currentMetrics.mealsFunding,
      comparison: selectedMetrics.mealsFunding,
      delta: selectedMetrics.mealsFunding - currentMetrics.mealsFunding,
    },
    {
      key: 'lodging-funding',
      metric: 'Lodging Funding',
      current: currentMetrics.lodgingFunding,
      comparison: selectedMetrics.lodgingFunding,
      delta: selectedMetrics.lodgingFunding - currentMetrics.lodgingFunding,
    },
  ];

  const sustainmentRows: ComparisonRow[] = [
    {
      key: 'mres',
      metric: "MRE's",
      current: currentMetrics.sustainment.mresNeeded,
      comparison: selectedMetrics.sustainment.mresNeeded,
      delta: selectedMetrics.sustainment.mresNeeded - currentMetrics.sustainment.mresNeeded,
    },
    {
      key: 'player-rooms',
      metric: 'Player billeting rooms',
      current: currentMetrics.sustainment.playerRoomsNeeded,
      comparison: selectedMetrics.sustainment.playerRoomsNeeded,
      delta: selectedMetrics.sustainment.playerRoomsNeeded - currentMetrics.sustainment.playerRoomsNeeded,
    },
    {
      key: 'player-room-nights',
      metric: 'Player billeting room nights',
      current: currentMetrics.sustainment.playerRoomNights,
      comparison: selectedMetrics.sustainment.playerRoomNights,
      delta: selectedMetrics.sustainment.playerRoomNights - currentMetrics.sustainment.playerRoomNights,
    },
    {
      key: 'local-hotel-rooms',
      metric: 'Local hotel rooms',
      current: currentMetrics.sustainment.localHotelRoomsNeeded,
      comparison: selectedMetrics.sustainment.localHotelRoomsNeeded,
      delta: selectedMetrics.sustainment.localHotelRoomsNeeded - currentMetrics.sustainment.localHotelRoomsNeeded,
    },
    {
      key: 'local-hotel-room-nights',
      metric: 'Local hotel room nights',
      current: currentMetrics.sustainment.localHotelRoomNights,
      comparison: selectedMetrics.sustainment.localHotelRoomNights,
      delta: selectedMetrics.sustainment.localHotelRoomNights - currentMetrics.sustainment.localHotelRoomNights,
    },
  ];

  const allUnitCodes = Array.from(new Set([
    ...Object.keys(currentMetrics.units),
    ...Object.keys(selectedMetrics.units),
  ])).sort(compareUnitCodes);

  const unitRows: UnitComparisonRow[] = allUnitCodes.map((unitCode) => {
    const currentUnit = currentMetrics.units[unitCode] || {
      ...createEmptySustainmentCounts(),
      totalFunding: 0,
      rpaFunding: 0,
      omFunding: 0,
    };
    const comparisonUnit = selectedMetrics.units[unitCode] || {
      ...createEmptySustainmentCounts(),
      totalFunding: 0,
      rpaFunding: 0,
      omFunding: 0,
    };

    return {
      key: unitCode,
      unit: getUnitDisplayLabel(unitCode),
      currentFunding: currentUnit.totalFunding,
      comparisonFunding: comparisonUnit.totalFunding,
      fundingDelta: comparisonUnit.totalFunding - currentUnit.totalFunding,
      currentPlayerRooms: currentUnit.playerRoomsNeeded,
      comparisonPlayerRooms: comparisonUnit.playerRoomsNeeded,
      playerRoomDelta: comparisonUnit.playerRoomsNeeded - currentUnit.playerRoomsNeeded,
      currentMres: currentUnit.mresNeeded,
      comparisonMres: comparisonUnit.mresNeeded,
      mresDelta: comparisonUnit.mresNeeded - currentUnit.mresNeeded,
      currentLocalHotelRooms: currentUnit.localHotelRoomsNeeded,
      comparisonLocalHotelRooms: comparisonUnit.localHotelRoomsNeeded,
      localHotelRoomDelta: comparisonUnit.localHotelRoomsNeeded - currentUnit.localHotelRoomsNeeded,
    };
  });

  const fundingColumns = [
    { title: 'Category', dataIndex: 'metric', key: 'metric', width: 280, render: (value: string) => <strong>{value}</strong> },
    { title: exercise.name, dataIndex: 'current', key: 'current', width: 180, align: 'right' as const, render: (value: number) => fmtCurrency(value) },
    { title: comparisonExercise.name, dataIndex: 'comparison', key: 'comparison', width: 180, align: 'right' as const, render: (value: number) => fmtCurrency(value) },
    { title: 'Difference', dataIndex: 'delta', key: 'delta', width: 180, align: 'right' as const, render: (value: number) => renderSignedValue(value, formatSignedCurrency) },
  ];

  const sustainmentColumns = [
    { title: 'Metric', dataIndex: 'metric', key: 'metric', width: 280, render: (value: string) => <strong>{value}</strong> },
    { title: exercise.name, dataIndex: 'current', key: 'current', width: 180, align: 'right' as const, render: (value: number) => fmtCount(value) },
    { title: comparisonExercise.name, dataIndex: 'comparison', key: 'comparison', width: 180, align: 'right' as const, render: (value: number) => fmtCount(value) },
    { title: 'Difference', dataIndex: 'delta', key: 'delta', width: 180, align: 'right' as const, render: (value: number) => renderSignedValue(value, formatSignedCount) },
  ];

  const unitColumns = [
    { title: 'Unit', dataIndex: 'unit', key: 'unit', render: (value: string) => <strong>{value}</strong> },
    { title: `${exercise.name} Funding`, dataIndex: 'currentFunding', key: 'currentFunding', align: 'right' as const, render: (value: number) => fmtCurrency(value) },
    { title: `${comparisonExercise.name} Funding`, dataIndex: 'comparisonFunding', key: 'comparisonFunding', align: 'right' as const, render: (value: number) => fmtCurrency(value) },
    { title: 'Funding Diff', dataIndex: 'fundingDelta', key: 'fundingDelta', align: 'right' as const, render: (value: number) => renderSignedValue(value, formatSignedCurrency) },
    { title: "MRE Diff", dataIndex: 'mresDelta', key: 'mresDelta', align: 'right' as const, render: (value: number) => renderSignedValue(value, formatSignedCount) },
    { title: 'Player Room Diff', dataIndex: 'playerRoomDelta', key: 'playerRoomDelta', align: 'right' as const, render: (value: number) => renderSignedValue(value, formatSignedCount) },
    { title: 'Hotel Room Diff', dataIndex: 'localHotelRoomDelta', key: 'localHotelRoomDelta', align: 'right' as const, render: (value: number) => renderSignedValue(value, formatSignedCount) },
  ];

  return (
    <div>
      <div className="ct-page-header">
        <Typography.Title level={4} className="ct-page-title">Comparison</Typography.Title>
      </div>

      <Card className="ct-section-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 20, alignItems: 'end' }}>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              Compare current exercise against
            </Typography.Text>
            <Select
              style={{ width: '100%' }}
              value={comparisonExerciseId}
              options={comparisonOptions}
              onChange={setComparisonExerciseId}
            />
          </div>
          <Typography.Text type="secondary">
            Current exercise: <strong>{exercise.name}</strong>. Difference columns show <strong>{comparisonExercise.name}</strong> minus <strong>{exercise.name}</strong>.
          </Typography.Text>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        {summaryCards.map((card) => (
          <Card key={card.key} className="ct-section-card ct-comparison-summary-card">
            <Typography.Text type="secondary" className="ct-comparison-summary-title">
              {card.title}
            </Typography.Text>
            <Typography.Text className="ct-comparison-summary-label">
              {card.currentLabel}
            </Typography.Text>
            <Typography.Text strong className="ct-comparison-summary-value">
              {card.currentValue}
            </Typography.Text>
            {card.currentBreakdown && (
              <div className="ct-comparison-summary-breakdown">
                {card.currentBreakdown.map((item) => (
                  <div key={`${card.key}-current-${item.label}`} className="ct-comparison-summary-breakdown-line">
                    <Typography.Text className="ct-comparison-summary-breakdown-label">
                      {item.label}
                    </Typography.Text>
                    <Typography.Text className="ct-comparison-summary-breakdown-value">
                      {item.value}
                    </Typography.Text>
                  </div>
                ))}
              </div>
            )}
            <Typography.Text className="ct-comparison-summary-label">
              {card.comparisonLabel}
            </Typography.Text>
            <Typography.Text strong className="ct-comparison-summary-value">
              {card.comparisonValue}
            </Typography.Text>
            {card.comparisonBreakdown && (
              <div className="ct-comparison-summary-breakdown">
                {card.comparisonBreakdown.map((item) => (
                  <div key={`${card.key}-comparison-${item.label}`} className="ct-comparison-summary-breakdown-line">
                    <Typography.Text className="ct-comparison-summary-breakdown-label">
                      {item.label}
                    </Typography.Text>
                    <Typography.Text className="ct-comparison-summary-breakdown-value">
                      {item.value}
                    </Typography.Text>
                  </div>
                ))}
              </div>
            )}
            <div className="ct-comparison-summary-delta">
              <Typography.Text className="ct-comparison-summary-delta-label">
                {card.deltaText}
              </Typography.Text>
              <div className="ct-comparison-summary-delta-value">
                {renderSignedValue(card.delta, card.formatter)}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Funding Comparison" className="ct-section-card" style={{ marginBottom: 24 }}>
        <div className="ct-table ct-comparison-compact-table">
          <Table
            size="small"
            pagination={false}
            dataSource={fundingRows}
            columns={fundingColumns}
          />
        </div>
      </Card>

      <Card title="Key Budget Drivers" className="ct-section-card" style={{ marginBottom: 24 }}>
        <div className="ct-table ct-comparison-compact-table">
          <Table
            size="small"
            pagination={false}
            dataSource={budgetDriverRows}
            columns={fundingColumns}
          />
        </div>
      </Card>

      <Card title="Meals & Lodging Comparison" className="ct-section-card" style={{ marginBottom: 24 }}>
        <div className="ct-table ct-comparison-compact-table">
          <Table
            size="small"
            pagination={false}
            dataSource={sustainmentRows}
            columns={sustainmentColumns}
          />
        </div>
      </Card>

      <Card title="Unit-Level Differences" className="ct-section-card">
        <div className="ct-table">
          <Table
            size="small"
            pagination={false}
            dataSource={unitRows}
            columns={unitColumns}
            scroll={{ x: 1080 }}
          />
        </div>
      </Card>
    </div>
  );
}
