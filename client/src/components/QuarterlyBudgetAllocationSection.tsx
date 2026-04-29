import { useMemo } from 'react';
import { Card, Spin, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import { useApp } from './AppLayout';
import {
  buildQuarterlyBudgetAllocation,
  buildQuarterlyBudgetRateInputs,
  QUARTERLY_BUDGET_ROW_META,
  type QuarterlyBudgetCategoryKey,
} from '../utils/quarterlyBudgetAllocation';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

type QuarterlyBudgetAllocationSectionProps = {
  appConfig: Record<string, string>;
};

type AllocationRow = {
  key: QuarterlyBudgetCategoryKey;
  category: string;
  tone?: 'rpa' | 'om' | 'grand';
  total: number;
  [bucketKey: string]: string | number | undefined;
};

function getValueColor(tone: AllocationRow['tone']): string | undefined {
  if (tone === 'rpa') return '#1677ff';
  if (tone === 'om') return '#52c41a';
  if (tone === 'grand') return '#1a1a2e';
  return undefined;
}

export default function QuarterlyBudgetAllocationSection({ appConfig }: QuarterlyBudgetAllocationSectionProps) {
  const { exercise } = useApp();
  const { data: cpdRates = [], isLoading: cpdLoading } = useQuery({ queryKey: ['cpdRates'], queryFn: api.getCpdRates });
  const { data: perDiemRates = [], isLoading: perDiemLoading } = useQuery({ queryKey: ['perDiemRates'], queryFn: api.getPerDiemRates });

  const allocation = useMemo(() => {
    if (!exercise) return null;

    const rateInputs = buildQuarterlyBudgetRateInputs({
      cpdRates,
      perDiemRates,
      appConfig,
    });

    return buildQuarterlyBudgetAllocation(exercise, rateInputs);
  }, [appConfig, cpdRates, exercise, perDiemRates]);

  if (!exercise) return null;

  const isLoading = cpdLoading || perDiemLoading;
  const buckets = allocation?.buckets || [];
  const fallbackDateUsage = allocation?.fallbackDateUsage;
  const rows: AllocationRow[] = allocation
    ? QUARTERLY_BUDGET_ROW_META.map((rowMeta) => {
        const bucketValues = Object.fromEntries(
          buckets.map((bucket) => [bucket.key, allocation.totalsByBucket[bucket.key][rowMeta.key]]),
        );
        const total = buckets.reduce((sum, bucket) => sum + allocation.totalsByBucket[bucket.key][rowMeta.key], 0);

        return {
          key: rowMeta.key,
          category: rowMeta.label,
          tone: rowMeta.tone,
          total,
          ...bucketValues,
        };
      })
    : [];

  const columns = [
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      fixed: 'left' as const,
      width: 220,
      render: (value: string, row: AllocationRow) => (
        <Typography.Text strong={!!row.tone} style={row.tone === 'grand' ? { color: '#1a1a2e' } : undefined}>
          {value}
        </Typography.Text>
      ),
    },
    ...buckets.map((bucket) => ({
      title: bucket.label,
      dataIndex: bucket.key,
      key: bucket.key,
      width: 150,
      align: 'center' as const,
      render: (value: number, row: AllocationRow) => (
        <Typography.Text strong={!!row.tone} style={row.tone ? { color: getValueColor(row.tone) } : undefined}>
          {fmt(value || 0)}
        </Typography.Text>
      ),
    })),
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      width: 150,
      align: 'center' as const,
      render: (value: number, row: AllocationRow) => (
        <Typography.Text strong style={row.tone ? { color: getValueColor(row.tone) } : undefined}>
          {fmt(value || 0)}
        </Typography.Text>
      ),
    },
  ];

  const fallbackNotes = fallbackDateUsage
    ? [
        fallbackDateUsage.personnelEntries > 0 ? `${fallbackDateUsage.personnelEntries} personnel entr${fallbackDateUsage.personnelEntries === 1 ? 'y used' : 'ies used'} an exercise-date fallback` : '',
        fallbackDateUsage.executionCostLines > 0 ? `${fallbackDateUsage.executionCostLines} execution cost line${fallbackDateUsage.executionCostLines === 1 ? ' used' : 's used'} an exercise-window fallback` : '',
        fallbackDateUsage.exerciseOmCostLines > 0 ? `${fallbackDateUsage.exerciseOmCostLines} exercise O&M line${fallbackDateUsage.exerciseOmCostLines === 1 ? ' used' : 's used'} an exercise-window fallback` : '',
      ].filter(Boolean)
    : [];

  return (
    <Card
      title="Quarterly Budget Allocation"
      className="ct-section-card"
      style={{ marginBottom: 24 }}
      extra={(
        <Typography.Text type="secondary">
          Costs spanning multiple quarters are split by overlap days.
        </Typography.Text>
      )}
    >
      {isLoading ? (
        <div className="ct-loading" style={{ minHeight: 160 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>
            One-time airfare and manual cost lines are prorated across the same saved date span so the quarter totals roll back up to the report totals.
          </Typography.Text>
          {fallbackNotes.length > 0 ? (
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>
              {fallbackNotes.join(' • ')}.
            </Typography.Text>
          ) : null}
          <div className="ct-table">
            <Table
              size="small"
              pagination={false}
              columns={columns}
              dataSource={rows}
              scroll={{ x: Math.max(860, 220 + (buckets.length + 1) * 150) }}
            />
          </div>
        </>
      )}
    </Card>
  );
}
