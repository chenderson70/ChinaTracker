import { Card, Empty, Select, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import type { BudgetResult, ExerciseDetail, PersonnelEntry, PersonnelGroup } from '../types';
import {
  getAnnualTourBilletingOmTotal,
  getAnnualTourBoxTotal,
  getAnnualTourMilPayTotal,
  getAnnualTourTravelPayTotal,
  getRpaCategoryTotals,
} from '../utils/budgetSummary';
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
  unitDisplayName?: string | null;
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
  valueFormatter?: MetricFormatter;
  deltaFormatter?: MetricFormatter;
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

type SnapshotMetric = {
  label: string;
  value: string;
  detail: string;
};

type MetricFormatter = (value: number) => string;

type ComparisonBandSectionProps = {
  title: string;
  description: string;
  rows: ComparisonRow[];
  formatter: MetricFormatter;
  deltaFormatter: MetricFormatter;
  currentName: string;
  comparisonName: string;
};

type ExerciseSnapshotCardProps = {
  badge: string;
  name: string;
  metrics: ExerciseComparisonMetrics;
  tone: 'current' | 'comparison';
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

type DeltaTone = 'increase' | 'decrease' | 'neutral';

function getDeltaTone(value: number): DeltaTone {
  if (value > 0) return 'increase';
  if (value < 0) return 'decrease';
  return 'neutral';
}

function getDeltaStateLabel(value: number): string {
  if (value > 0) return 'Higher';
  if (value < 0) return 'Lower';
  return 'No change';
}

function renderDeltaBlock(value: number, formatter: MetricFormatter, compact = false) {
  const tone = getDeltaTone(value);

  return (
    <div
      className={[
        'ct-comparison-delta-block',
        `ct-comparison-delta-block--${tone}`,
        compact ? 'ct-comparison-delta-block--compact' : '',
      ].filter(Boolean).join(' ')}
    >
      <span className="ct-comparison-delta-state">{getDeltaStateLabel(value)}</span>
      {value !== 0 && <span className="ct-comparison-delta-number">{formatter(value)}</span>}
    </div>
  );
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
      unitDisplayName: unitBudgetsByCode.get(normalizedUnitCode)?.unitDisplayName ?? unit.unitDisplayName ?? null,
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

function getTotalExecutionPax(metrics: ExerciseComparisonMetrics): number {
  return metrics.executionPax.playerPax + metrics.executionPax.whiteCellSupportPax;
}

function getTotalRooms(metrics: ExerciseComparisonMetrics): number {
  return metrics.sustainment.playerRoomsNeeded + metrics.sustainment.localHotelRoomsNeeded;
}

function buildSnapshotMetrics(metrics: ExerciseComparisonMetrics): SnapshotMetric[] {
  return [
    {
      label: 'Total funding',
      value: fmtCurrency(metrics.totalFunding),
      detail: `RPA ${fmtCurrency(metrics.rpaFunding)} / O&M ${fmtCurrency(metrics.omFunding)}`,
    },
    {
      label: 'Travel & per diem',
      value: fmtCurrency(metrics.travelPerDiemFunding),
      detail: `Annual tour ${fmtCurrency(metrics.annualTourFunding)}`,
    },
    {
      label: 'Execution PAX',
      value: `${fmtCount(getTotalExecutionPax(metrics))} PAX`,
      detail: `Player ${fmtCount(metrics.executionPax.playerPax)} / White Cell ${fmtCount(metrics.executionPax.whiteCellSupportPax)}`,
    },
    {
      label: 'Meals',
      value: `${fmtCount(metrics.sustainment.mresNeeded)} MREs`,
      detail: `Funding ${fmtCurrency(metrics.mealsFunding)}`,
    },
    {
      label: 'Lodging',
      value: `${fmtCount(getTotalRooms(metrics))} rooms`,
      detail: `Player ${fmtCount(metrics.sustainment.playerRoomsNeeded)} / Support hotel ${fmtCount(metrics.sustainment.localHotelRoomsNeeded)}`,
    },
  ];
}

function ComparisonBandSection({
  title,
  description,
  rows,
  formatter,
  deltaFormatter,
  currentName,
  comparisonName,
}: ComparisonBandSectionProps) {
  return (
    <Card title={title} className="ct-section-card ct-comparison-band-card">
      <Typography.Text type="secondary" className="ct-comparison-band-description">
        {description}
      </Typography.Text>
      <div className="ct-comparison-band">
        <div className="ct-comparison-band-header">
          <span>Metric</span>
          <span>{currentName}</span>
          <span>{comparisonName}</span>
          <span>Difference</span>
        </div>
        {rows.map((row) => (
          <div key={row.key} className="ct-comparison-band-row">
            <div className="ct-comparison-band-cell ct-comparison-band-cell--metric">
              <Typography.Text strong className="ct-comparison-band-label">
                {row.metric}
              </Typography.Text>
            </div>
            <div className="ct-comparison-band-cell ct-comparison-band-cell--value">
              <span className="ct-comparison-band-mobile-label">Current</span>
              <span className="ct-comparison-band-number">
                {(row.valueFormatter || formatter)(row.current)}
              </span>
            </div>
            <div className="ct-comparison-band-cell ct-comparison-band-cell--value">
              <span className="ct-comparison-band-mobile-label">Compared</span>
              <span className="ct-comparison-band-number">
                {(row.valueFormatter || formatter)(row.comparison)}
              </span>
            </div>
            <div className="ct-comparison-band-cell ct-comparison-band-cell--delta">
              <span className="ct-comparison-band-mobile-label">Difference</span>
              {renderDeltaBlock(row.delta, row.deltaFormatter || deltaFormatter)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ExerciseSnapshotCard({ badge, name, metrics, tone }: ExerciseSnapshotCardProps) {
  const snapshotMetrics = buildSnapshotMetrics(metrics);

  return (
    <Card className={`ct-section-card ct-comparison-snapshot-card ct-comparison-snapshot-card--${tone}`}>
      <div className="ct-comparison-snapshot-header">
        <Typography.Text className="ct-comparison-snapshot-badge">
          {badge}
        </Typography.Text>
        <Typography.Title level={5} className="ct-comparison-snapshot-name">
          {name}
        </Typography.Title>
      </div>
      <div className="ct-comparison-snapshot-metrics">
        {snapshotMetrics.map((item) => (
          <div key={`${badge}-${item.label}`} className="ct-comparison-snapshot-metric">
            <Typography.Text className="ct-comparison-snapshot-metric-label">
              {item.label}
            </Typography.Text>
            <Typography.Text strong className="ct-comparison-snapshot-metric-value">
              {item.value}
            </Typography.Text>
            <Typography.Text className="ct-comparison-snapshot-metric-detail">
              {item.detail}
            </Typography.Text>
          </div>
        ))}
      </div>
    </Card>
  );
}

function hasUnitChange(row: UnitComparisonRow): boolean {
  return row.fundingDelta !== 0
    || row.mresDelta !== 0
    || row.playerRoomDelta !== 0
    || row.localHotelRoomDelta !== 0;
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

  const highlightRows: ComparisonRow[] = [
    {
      key: 'highlight-grand-total',
      metric: 'Grand total funding',
      current: currentMetrics.totalFunding,
      comparison: selectedMetrics.totalFunding,
      delta: selectedMetrics.totalFunding - currentMetrics.totalFunding,
      valueFormatter: fmtCurrency,
      deltaFormatter: formatSignedCurrency,
    },
    {
      key: 'highlight-travel',
      metric: 'Travel & per diem',
      current: currentMetrics.travelPerDiemFunding,
      comparison: selectedMetrics.travelPerDiemFunding,
      delta: selectedMetrics.travelPerDiemFunding - currentMetrics.travelPerDiemFunding,
      valueFormatter: fmtCurrency,
      deltaFormatter: formatSignedCurrency,
    },
    {
      key: 'highlight-pax',
      metric: 'Total execution PAX',
      current: getTotalExecutionPax(currentMetrics),
      comparison: getTotalExecutionPax(selectedMetrics),
      delta: getTotalExecutionPax(selectedMetrics) - getTotalExecutionPax(currentMetrics),
      valueFormatter: (value) => `${fmtCount(value)} PAX`,
      deltaFormatter: (value) => `${value > 0 ? '+' : value < 0 ? '-' : ''}${fmtCount(Math.abs(value))} PAX`,
    },
    {
      key: 'highlight-mres',
      metric: 'MRE requirement',
      current: currentMetrics.sustainment.mresNeeded,
      comparison: selectedMetrics.sustainment.mresNeeded,
      delta: selectedMetrics.sustainment.mresNeeded - currentMetrics.sustainment.mresNeeded,
      valueFormatter: (value) => `${fmtCount(value)} MREs`,
      deltaFormatter: (value) => `${value > 0 ? '+' : value < 0 ? '-' : ''}${fmtCount(Math.abs(value))} MREs`,
    },
    {
      key: 'highlight-rooms',
      metric: 'Total rooms',
      current: getTotalRooms(currentMetrics),
      comparison: getTotalRooms(selectedMetrics),
      delta: getTotalRooms(selectedMetrics) - getTotalRooms(currentMetrics),
      valueFormatter: (value) => `${fmtCount(value)} rooms`,
      deltaFormatter: (value) => `${value > 0 ? '+' : value < 0 ? '-' : ''}${fmtCount(Math.abs(value))} rooms`,
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

  const personnelAndLodgingRows: ComparisonRow[] = [
    {
      key: 'player-pax',
      metric: 'Player PAX',
      current: currentMetrics.executionPax.playerPax,
      comparison: selectedMetrics.executionPax.playerPax,
      delta: selectedMetrics.executionPax.playerPax - currentMetrics.executionPax.playerPax,
    },
    {
      key: 'white-cell-pax',
      metric: 'White Cell / Support PAX',
      current: currentMetrics.executionPax.whiteCellSupportPax,
      comparison: selectedMetrics.executionPax.whiteCellSupportPax,
      delta: selectedMetrics.executionPax.whiteCellSupportPax - currentMetrics.executionPax.whiteCellSupportPax,
    },
    {
      key: 'total-pax',
      metric: 'Total execution PAX',
      current: getTotalExecutionPax(currentMetrics),
      comparison: getTotalExecutionPax(selectedMetrics),
      delta: getTotalExecutionPax(selectedMetrics) - getTotalExecutionPax(currentMetrics),
    },
    {
      key: 'mres',
      metric: 'MREs',
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

  const unitRows: UnitComparisonRow[] = allUnitCodes
    .map((unitCode) => {
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
        unit: getUnitDisplayLabel(
          unitCode,
          currentUnit.unitDisplayName ?? comparisonUnit.unitDisplayName ?? null,
        ),
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
    })
    .sort((left, right) => {
      const leftChanged = hasUnitChange(left) ? 1 : 0;
      const rightChanged = hasUnitChange(right) ? 1 : 0;

      if (leftChanged !== rightChanged) {
        return rightChanged - leftChanged;
      }

      const fundingMagnitude = Math.abs(right.fundingDelta) - Math.abs(left.fundingDelta);
      if (fundingMagnitude !== 0) {
        return fundingMagnitude;
      }

      return left.unit.localeCompare(right.unit);
    });

  const changedUnitCount = unitRows.filter(hasUnitChange).length;

  return (
    <div>
      <div className="ct-page-header">
        <Typography.Title level={4} className="ct-page-title">Comparison</Typography.Title>
      </div>

      <Card className="ct-section-card ct-comparison-hero-card" style={{ marginBottom: 24 }}>
        <div className="ct-comparison-hero-grid">
          <div className="ct-comparison-hero-panel ct-comparison-hero-panel--current">
            <Typography.Text className="ct-comparison-hero-eyebrow">
              Current exercise
            </Typography.Text>
            <Typography.Title level={4} className="ct-comparison-hero-name">
              {exercise.name}
            </Typography.Title>
            <Typography.Text className="ct-comparison-hero-value-label">
              Total funding
            </Typography.Text>
            <Typography.Text strong className="ct-comparison-hero-value">
              {fmtCurrency(currentMetrics.totalFunding)}
            </Typography.Text>
          </div>

          <div className="ct-comparison-hero-selector">
            <Typography.Text className="ct-comparison-hero-selector-label">
              Compare against
            </Typography.Text>
            <Select
              style={{ width: '100%' }}
              value={comparisonExerciseId}
              options={comparisonOptions}
              onChange={setComparisonExerciseId}
            />
            <Typography.Text type="secondary" className="ct-comparison-hero-helper">
              Difference values show <strong>{comparisonExercise.name}</strong> minus <strong>{exercise.name}</strong>.
            </Typography.Text>
          </div>

          <div className="ct-comparison-hero-panel ct-comparison-hero-panel--comparison">
            <Typography.Text className="ct-comparison-hero-eyebrow">
              Selected comparison
            </Typography.Text>
            <Typography.Title level={4} className="ct-comparison-hero-name">
              {comparisonExercise.name}
            </Typography.Title>
            <Typography.Text className="ct-comparison-hero-value-label">
              Total funding
            </Typography.Text>
            <Typography.Text strong className="ct-comparison-hero-value">
              {fmtCurrency(selectedMetrics.totalFunding)}
            </Typography.Text>
          </div>
        </div>
      </Card>

      <div className="ct-comparison-snapshot-grid">
        <ExerciseSnapshotCard
          badge="Current snapshot"
          name={exercise.name}
          metrics={currentMetrics}
          tone="current"
        />
        <ExerciseSnapshotCard
          badge="Comparison snapshot"
          name={comparisonExercise.name}
          metrics={selectedMetrics}
          tone="comparison"
        />
      </div>

      <div className="ct-comparison-sections">
        <ComparisonBandSection
          title="Biggest Differences"
          description="Start here for the headline changes most likely to drive the brief."
          rows={highlightRows}
          formatter={fmtCurrency}
          deltaFormatter={formatSignedCurrency}
          currentName={exercise.name}
          comparisonName={comparisonExercise.name}
        />

        <div className="ct-comparison-detail-grid">
          <ComparisonBandSection
            title="Funding Structure"
            description="Topline funding plus the main cost drivers behind the total."
            rows={fundingRows}
            formatter={fmtCurrency}
            deltaFormatter={formatSignedCurrency}
            currentName={exercise.name}
            comparisonName={comparisonExercise.name}
          />
          <ComparisonBandSection
            title="Personnel, Meals & Lodging"
            description="Execution footprint and sustainment requirements side by side."
            rows={personnelAndLodgingRows}
            formatter={fmtCount}
            deltaFormatter={formatSignedCount}
            currentName={exercise.name}
            comparisonName={comparisonExercise.name}
          />
        </div>
      </div>

      <Card title="Unit-by-Unit Changes" className="ct-section-card">
        <Typography.Text type="secondary" className="ct-comparison-unit-summary">
          {changedUnitCount === 0
            ? 'No unit-level differences were detected between these exercises.'
            : `${changedUnitCount} unit${changedUnitCount === 1 ? '' : 's'} changed. Units with differences are listed first.`}
        </Typography.Text>

        {unitRows.length === 0 ? (
          <Empty description="No unit data is available for this comparison." />
        ) : (
          <div className="ct-comparison-unit-grid">
            {unitRows.map((row) => {
              const unitMetrics = [
                {
                  key: 'funding',
                  label: 'Total funding',
                  current: row.currentFunding,
                  comparison: row.comparisonFunding,
                  delta: row.fundingDelta,
                  formatter: fmtCurrency,
                  deltaFormatter: formatSignedCurrency,
                },
                {
                  key: 'mres',
                  label: 'MREs',
                  current: row.currentMres,
                  comparison: row.comparisonMres,
                  delta: row.mresDelta,
                  formatter: fmtCount,
                  deltaFormatter: formatSignedCount,
                },
                {
                  key: 'player-rooms',
                  label: 'Player rooms',
                  current: row.currentPlayerRooms,
                  comparison: row.comparisonPlayerRooms,
                  delta: row.playerRoomDelta,
                  formatter: fmtCount,
                  deltaFormatter: formatSignedCount,
                },
                {
                  key: 'hotel-rooms',
                  label: 'Hotel rooms',
                  current: row.currentLocalHotelRooms,
                  comparison: row.comparisonLocalHotelRooms,
                  delta: row.localHotelRoomDelta,
                  formatter: fmtCount,
                  deltaFormatter: formatSignedCount,
                },
              ];

              return (
                <div
                  key={row.key}
                  className={[
                    'ct-comparison-unit-card',
                    hasUnitChange(row) ? '' : 'ct-comparison-unit-card--unchanged',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="ct-comparison-unit-card-header">
                    <Typography.Text strong className="ct-comparison-unit-card-title">
                      {row.unit}
                    </Typography.Text>
                    {renderDeltaBlock(row.fundingDelta, formatSignedCurrency, true)}
                  </div>

                  <div className="ct-comparison-unit-card-body">
                    {unitMetrics.map((metric) => (
                      <div key={`${row.key}-${metric.key}`} className="ct-comparison-unit-stat">
                        <div className="ct-comparison-unit-stat-top">
                          <Typography.Text className="ct-comparison-unit-stat-label">
                            {metric.label}
                          </Typography.Text>
                          {renderDeltaBlock(metric.delta, metric.deltaFormatter, true)}
                        </div>

                        <div className="ct-comparison-unit-stat-values">
                          <div className="ct-comparison-unit-stat-value">
                            <span className="ct-comparison-unit-stat-caption">Current</span>
                            <span className="ct-comparison-unit-stat-number">
                              {metric.formatter(metric.current)}
                            </span>
                          </div>
                          <div className="ct-comparison-unit-stat-value">
                            <span className="ct-comparison-unit-stat-caption">Compared</span>
                            <span className="ct-comparison-unit-stat-number">
                              {metric.formatter(metric.comparison)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
