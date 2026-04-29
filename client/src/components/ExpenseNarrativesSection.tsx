import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Input, Table, Typography, message } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from './AppLayout';
import * as api from '../services/api';
import type { Exercise, ExerciseDetail, ExpenseNarrativeItem } from '../types';
import {
  buildExpenseNarrativeRows,
  getSavableExpenseNarratives,
  normalizeExpenseNarratives,
  type DerivedExpenseNarrativeRow,
} from '../utils/expenseNarratives';

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export default function ExpenseNarrativesSection() {
  const { exercise, budget, exerciseId, pushUndoSnapshot } = useApp();
  const queryClient = useQueryClient();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutoSaveRef = useRef(true);
  const [draftRows, setDraftRows] = useState<DerivedExpenseNarrativeRow[]>([]);

  const savedExpenseNarratives = normalizeExpenseNarratives(exercise?.expenseNarratives);
  const savedExpenseNarrativesJson = JSON.stringify(savedExpenseNarratives);

  const derivedRows = useMemo(
    () => (exercise && budget ? buildExpenseNarrativeRows(exercise, budget, savedExpenseNarratives) : []),
    [budget, exercise, savedExpenseNarrativesJson],
  );
  const derivedRowsJson = JSON.stringify(derivedRows);
  const sectionedDraftRows = useMemo(
    () => ([
      {
        key: 'OM' as const,
        title: 'O&M',
        className: 'ct-expense-narratives-section-title-om',
        rows: draftRows.filter((row) => row.section === 'OM'),
      },
      {
        key: 'RPA' as const,
        title: 'RPA',
        className: 'ct-expense-narratives-section-title-rpa',
        rows: draftRows.filter((row) => row.section === 'RPA'),
      },
    ].filter((section) => section.rows.length > 0)),
    [draftRows],
  );

  const expenseNarrativesMut = useMutation({
    mutationFn: async (expenseNarratives: ExpenseNarrativeItem[]) => {
      await pushUndoSnapshot('Expense narratives');
      return api.updateExercise(exerciseId!, { expenseNarratives });
    },
    onSuccess: (updatedExercise) => {
      const nextExpenseNarratives = normalizeExpenseNarratives(updatedExercise.expenseNarratives);
      queryClient.setQueryData<ExerciseDetail | null>(['exercise', exerciseId], (current) =>
        current ? { ...current, expenseNarratives: nextExpenseNarratives } : current,
      );
      queryClient.setQueryData<Exercise[]>(['exercises'], (current) =>
        current?.map((item) => (
          item.id === updatedExercise.id
            ? { ...item, ...updatedExercise, expenseNarratives: nextExpenseNarratives }
            : item
        )),
      );
    },
    onError: (error: any) => {
      message.error(error?.message || 'Unable to save expense notes');
    },
  });
  const isSavingExpenseNarratives = expenseNarrativesMut.isPending;
  const saveExpenseNarratives = expenseNarrativesMut.mutate;

  useEffect(() => {
    skipAutoSaveRef.current = true;
    setDraftRows(derivedRows);
  }, [exercise?.id, derivedRowsJson]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!exerciseId) return;

    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }

    if (isSavingExpenseNarratives) return;

    const nextExpenseNarratives = getSavableExpenseNarratives(draftRows);
    if (JSON.stringify(nextExpenseNarratives) === savedExpenseNarrativesJson) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveExpenseNarratives(nextExpenseNarratives);
    }, 350);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draftRows, exerciseId, isSavingExpenseNarratives, saveExpenseNarratives, savedExpenseNarrativesJson]);

  if (!exercise || !budget) return null;

  const updateDraftField = (
    expenseKey: string,
    field: 'justification' | 'impact',
    value: string,
  ) => {
    setDraftRows((current) => current.map((row) => (
      row.expenseKey === expenseKey ? { ...row, [field]: value } : row
    )));
  };

  const columns = [
    {
      title: 'Expense',
      dataIndex: 'expenseLabel',
      key: 'expenseLabel',
      width: 260,
      render: (_value: string, row: DerivedExpenseNarrativeRow) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{row.expenseLabel}</div>
          <Typography.Text type="secondary">{fmt(row.amount)}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Justification',
      dataIndex: 'justification',
      key: 'justification',
      render: (value: string, row: DerivedExpenseNarrativeRow) => (
        <Input.TextArea
          value={value}
          onChange={(event) => updateDraftField(row.expenseKey, 'justification', event.target.value)}
          autoSize={{ minRows: 2, maxRows: 5 }}
          placeholder="Enter justification"
        />
      ),
    },
    {
      title: 'Impact',
      dataIndex: 'impact',
      key: 'impact',
      render: (value: string, row: DerivedExpenseNarrativeRow) => (
        <Input.TextArea
          value={value}
          onChange={(event) => updateDraftField(row.expenseKey, 'impact', event.target.value)}
          autoSize={{ minRows: 2, maxRows: 5 }}
          placeholder="Enter impact"
        />
      ),
    },
  ];

  return (
    <Card
      title="Expense Justification & Impact"
      className="ct-section-card"
      style={{ marginBottom: 28 }}
      extra={<Typography.Text type="secondary">{isSavingExpenseNarratives ? 'Autosaving...' : 'Changes auto-save'}</Typography.Text>}
    >
      {sectionedDraftRows.map((section, index) => (
        <div key={section.key} style={{ marginTop: index === 0 ? 0 : 24 }}>
          <Typography.Title
            level={5}
            className={`ct-expense-narratives-section-title ${section.className}`}
            style={{ marginBottom: 12 }}
          >
            {section.title}
          </Typography.Title>
          <div className="ct-table">
            <Table
              dataSource={section.rows.map((row) => ({ ...row, key: row.expenseKey }))}
              columns={columns}
              pagination={false}
              size="small"
              tableLayout="fixed"
            />
          </div>
        </div>
      ))}
    </Card>
  );
}
