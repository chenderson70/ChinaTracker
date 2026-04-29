import { useMemo } from 'react';
import { Card, Spin, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import * as api from '../services/api';
import { useApp } from './AppLayout';
import {
  buildQuarterlyBudgetAllocation,
  buildQuarterlyBudgetRateInputs,
  QUARTERLY_BUDGET_ROW_META,
  QUARTERLY_BUDGET_SECTION_META,
  type QuarterlyBudgetCategoryKey,
} from '../utils/quarterlyBudgetAllocation';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

type QuarterlyBudgetAllocationSectionProps = {
  appConfig?: Record<string, string>;
  title?: string;
};

type AllocationRow = {
  key: QuarterlyBudgetCategoryKey;
  category: string;
  tone?: 'rpa' | 'om' | 'annualTour';
  total: number;
  [bucketKey: string]: string | number | undefined;
};

const rowMetaByKey = new Map(
  QUARTERLY_BUDGET_ROW_META.map((rowMeta) => [rowMeta.key, rowMeta]),
);

function getValueColor(tone: AllocationRow['tone']): string | undefined {
  if (tone === 'rpa') return '#1677ff';
  if (tone === 'om') return '#52c41a';
  if (tone === 'annualTour') return '#0958d9';
  return undefined;
}

function formatQuarterValue(value: number, tone?: AllocationRow['tone']) {
  if (!value) {
    return <Typography.Text type="secondary">-</Typography.Text>;
  }

  return (
    <Typography.Text strong={!!tone} style={tone ? { color: getValueColor(tone) } : undefined}>
      {fmt(value)}
    </Typography.Text>
  );
}

export default function QuarterlyBudgetAllocationSection({
  appConfig,
  title = 'Quarterly Cost View',
}: QuarterlyBudgetAllocationSectionProps) {
  const { exercise } = useApp();
  const { data: cpdRates = [], isLoading: cpdLoading } = useQuery({ queryKey: ['cpdRates'], queryFn: api.getCpdRates });
  const { data: perDiemRates = [], isLoading: perDiemLoading } = useQuery({ queryKey: ['perDiemRates'], queryFn: api.getPerDiemRates });
  const { data: loadedAppConfig = {}, isLoading: appConfigLoading } = useQuery({
    queryKey: ['appConfig'],
    queryFn: api.getAppConfig,
    enabled: !appConfig,
  });

  const effectiveAppConfig = appConfig ?? loadedAppConfig;

  const allocation = useMemo(() => {
    if (!exercise) return null;

    const rateInputs = buildQuarterlyBudgetRateInputs({
      cpdRates,
      perDiemRates,
      appConfig: effectiveAppConfig,
    });

    return buildQuarterlyBudgetAllocation(exercise, rateInputs);
  }, [cpdRates, effectiveAppConfig, exercise, perDiemRates]);

  const rowsByKey = useMemo(() => {
    if (!allocation) return new Map<QuarterlyBudgetCategoryKey, AllocationRow>();

    return new Map(
      QUARTERLY_BUDGET_ROW_META.map((rowMeta) => {
        const bucketValues = Object.fromEntries(
          allocation.buckets.map((bucket) => [bucket.key, allocation.totalsByBucket[bucket.key][rowMeta.key]]),
        );
        const total = allocation.buckets.reduce((sum, bucket) => sum + allocation.totalsByBucket[bucket.key][rowMeta.key], 0);

        return [
          rowMeta.key,
          {
            key: rowMeta.key,
            category: rowMeta.label,
            tone: rowMeta.tone,
            total,
            ...bucketValues,
          } satisfies AllocationRow,
        ];
      }),
    );
  }, [allocation]);

  if (!exercise) return null;

  const isLoading = cpdLoading || perDiemLoading || (!appConfig && appConfigLoading);
  const buckets = allocation?.buckets || [];
  const visibleBuckets = allocation
    ? buckets.filter((bucket) => QUARTERLY_BUDGET_ROW_META.some((rowMeta) => {
        if (rowMeta.key === 'totalOm' || rowMeta.key === 'totalRpa') return false;
        return (allocation.totalsByBucket[bucket.key][rowMeta.key] || 0) > 0.000001;
      }))
    : [];
  const displayedBuckets = visibleBuckets.length > 0 ? visibleBuckets : buckets;
  return (
    <Card
      title={title}
      className="ct-section-card"
      style={{ marginBottom: 24 }}
      extra={(
        <Typography.Text type="secondary">
          Only quarters with applicable costs are shown.
        </Typography.Text>
      )}
    >
      {isLoading ? (
        <div className="ct-loading" style={{ minHeight: 160 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          {QUARTERLY_BUDGET_SECTION_META.map((section, index) => {
            const sectionRows = section.rowKeys
              .map((rowKey) => rowsByKey.get(rowKey))
              .filter((row): row is AllocationRow => !!row)
              .filter((row) => {
                const rowMeta = rowMetaByKey.get(row.key);
                return !!rowMeta?.alwaysShow || row.total > 0.000001;
              });

            if (sectionRows.length === 0) return null;

            const columns = [
              {
                title: 'Category',
                dataIndex: 'category',
                key: 'category',
                fixed: 'left' as const,
                width: 220,
                render: (value: string, row: AllocationRow) => (
                  <Typography.Text strong={row.key === 'totalOm' || row.key === 'totalRpa'} style={row.tone ? { color: getValueColor(row.tone) } : undefined}>
                    {value}
                  </Typography.Text>
                ),
              },
              ...displayedBuckets.map((bucket) => ({
                title: bucket.label,
                dataIndex: bucket.key,
                key: bucket.key,
                width: 150,
                align: 'center' as const,
                render: (value: number, row: AllocationRow) => formatQuarterValue(value || 0, row.tone),
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

            return (
              <div key={section.key} style={{ marginTop: index === 0 ? 0 : 24 }}>
                <Typography.Title
                  level={5}
                  className={section.tone === 'annualTour' ? 'ct-expense-narratives-section-title' : `ct-expense-narratives-section-title ct-expense-narratives-section-title-${section.key}`}
                  style={section.tone === 'annualTour' ? { marginBottom: 12, color: '#0958d9', textTransform: 'uppercase' } : { marginBottom: 12 }}
                >
                  {section.label}
                </Typography.Title>
                <div className="ct-table">
                  <Table
                    size="small"
                    pagination={false}
                    columns={columns}
                    dataSource={sectionRows}
                    scroll={{ x: Math.max(820, 220 + (displayedBuckets.length + 1) * 150) }}
                    rowKey="key"
                  />
                </div>
              </div>
            );
          })}
        </>
      )}
    </Card>
  );
}
