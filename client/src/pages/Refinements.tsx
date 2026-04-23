import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Input, Select, Spin, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../components/AppLayout';
import * as api from '../services/api';
import type { Exercise, ExerciseDetail, RefinementItem, RefinementStatus } from '../types';

const REFINEMENT_STATUS_OPTIONS: Array<{ value: RefinementStatus; label: string }> = [
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETE', label: 'Complete' },
];

function createRefinementId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `refinement-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function createBlankRefinement(): RefinementItem {
  return {
    id: createRefinementId(),
    improvementNote: '',
    status: 'IN_PROGRESS',
    statusNote: '',
  };
}

function normalizeRefinements(items: RefinementItem[] | undefined | null): RefinementItem[] {
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    id: String(item?.id || createRefinementId()),
    improvementNote: String(item?.improvementNote || ''),
    status: item?.status === 'COMPLETE' ? 'COMPLETE' : 'IN_PROGRESS',
    statusNote: String(item?.statusNote || ''),
  }));
}

function getSavableRefinements(items: RefinementItem[]): RefinementItem[] {
  return normalizeRefinements(items)
    .map((item) => ({
      ...item,
      improvementNote: item.improvementNote.trim(),
      statusNote: item.statusNote.trim(),
    }));
}

export default function Refinements() {
  const { exercise, exerciseId } = useApp();
  const queryClient = useQueryClient();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutoSaveRef = useRef(true);
  const [draftRefinements, setDraftRefinements] = useState<RefinementItem[]>([]);

  const savedRefinements = normalizeRefinements(exercise?.refinements);
  const savedRefinementsJson = JSON.stringify(savedRefinements);

  const refinementsMut = useMutation({
    mutationFn: (data: Pick<Exercise, 'refinements'>) => api.updateExercise(exerciseId!, data),
    onSuccess: (updatedExercise) => {
      const nextRefinements = normalizeRefinements(updatedExercise.refinements);
      queryClient.setQueryData<ExerciseDetail | null>(['exercise', exerciseId], (current) =>
        current ? { ...current, refinements: nextRefinements } : current,
      );
      queryClient.setQueryData<Exercise[]>(['exercises'], (current) =>
        current?.map((item) => item.id === updatedExercise.id ? { ...item, ...updatedExercise, refinements: nextRefinements } : item),
      );
    },
    onError: (error: any) => {
      message.error(error?.message || 'Unable to save refinements');
    },
  });
  const isSavingRefinements = refinementsMut.isPending;
  const saveRefinements = refinementsMut.mutate;

  useEffect(() => {
    skipAutoSaveRef.current = true;
    setDraftRefinements(savedRefinements);
  }, [exercise?.id, savedRefinementsJson]);

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

    if (isSavingRefinements) return;

    const nextRefinements = getSavableRefinements(draftRefinements);
    if (JSON.stringify(nextRefinements) === savedRefinementsJson) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveRefinements({ refinements: nextRefinements });
    }, 350);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draftRefinements, exerciseId, isSavingRefinements, saveRefinements, savedRefinementsJson]);

  if (!exercise) return <div className="ct-loading"><Spin size="large" /></div>;

  const handleAddRefinement = () => {
    setDraftRefinements((current) => [...current, createBlankRefinement()]);
  };

  const handleRefinementChange = (
    refinementId: string,
    field: keyof Pick<RefinementItem, 'improvementNote' | 'status' | 'statusNote'>,
    value: string,
  ) => {
    setDraftRefinements((current) =>
      current.map((item) => item.id === refinementId ? { ...item, [field]: value } : item),
    );
  };

  const handleRemoveRefinement = (refinementId: string) => {
    setDraftRefinements((current) => current.filter((item) => item.id !== refinementId));
  };

  return (
    <div>
      <div className="ct-page-header">
        <Typography.Title level={4} className="ct-page-title">Refinements</Typography.Title>
      </div>

      <Card
        className="ct-section-card ct-refinements-card"
        extra={<Typography.Text type="secondary">{isSavingRefinements ? 'Autosaving...' : 'Changes auto-save'}</Typography.Text>}
      >
        <div className="ct-refinements-toolbar">
          <div>
            <Typography.Text type="secondary">
              Add as many refinement rows as you need. Everything on this page saves automatically.
            </Typography.Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRefinement}>
            Add Refinement
          </Button>
        </div>

        {draftRefinements.length > 0 ? (
          <div className="ct-refinements-list">
            {draftRefinements.map((refinement, index) => (
              <div
                key={refinement.id}
                className={`ct-refinement-row ${refinement.status === 'COMPLETE' ? 'is-complete' : 'is-in-progress'}`}
              >
                <div className="ct-refinement-row-grid">
                  <div className="ct-refinement-field">
                    <Typography.Text className="ct-refinement-field-label">
                      Improvement {index + 1}
                    </Typography.Text>
                    <Input.TextArea
                      className="ct-refinement-textarea"
                      value={refinement.improvementNote}
                      onChange={(event) => handleRefinementChange(refinement.id, 'improvementNote', event.target.value)}
                      autoSize={{ minRows: 5, maxRows: 10 }}
                      placeholder="Enter an improvement note or refinement item"
                    />
                  </div>

                  <div className="ct-refinement-field ct-refinement-status-field">
                    <Typography.Text className="ct-refinement-field-label">
                      Status
                    </Typography.Text>
                    <Select
                      className="ct-refinement-status-select"
                      value={refinement.status}
                      options={REFINEMENT_STATUS_OPTIONS}
                      onChange={(value) => handleRefinementChange(refinement.id, 'status', value)}
                    />
                  </div>

                  <div className="ct-refinement-field">
                    <Typography.Text className="ct-refinement-field-label">
                      Status Notes
                    </Typography.Text>
                    <Input.TextArea
                      className="ct-refinement-textarea"
                      value={refinement.statusNote}
                      onChange={(event) => handleRefinementChange(refinement.id, 'statusNote', event.target.value)}
                      autoSize={{ minRows: 5, maxRows: 10 }}
                      placeholder="Add notes about the current status if needed"
                    />
                  </div>

                  <div className="ct-refinement-row-actions">
                    <Button
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveRefinement(refinement.id)}
                      aria-label={`Remove refinement ${index + 1}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            className="ct-refinements-empty"
            description="No refinements yet. Add your first improvement note to start tracking follow-up work."
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRefinement}>
              Add First Refinement
            </Button>
          </Empty>
        )}
      </Card>
    </div>
  );
}
