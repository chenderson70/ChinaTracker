import { useEffect, useState, type CSSProperties } from 'react';
import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { normalizeDateString } from '../utils/dateRanges';

export default function InlineDateInput({
  value,
  onSave,
  size = 'small',
  style,
}: {
  value: string | null | undefined;
  onSave: (value: string | null) => void;
  size?: 'small' | 'middle' | 'large';
  style?: CSSProperties;
}) {
  const normalizedValue = normalizeDateString(value);
  const [draft, setDraft] = useState<Dayjs | null>(normalizedValue ? dayjs(normalizedValue) : null);

  useEffect(() => {
    setDraft(normalizedValue ? dayjs(normalizedValue) : null);
  }, [normalizedValue]);

  const commit = (nextValue: Dayjs | null) => {
    const nextDate = nextValue ? nextValue.format('YYYY-MM-DD') : null;
    if (nextDate !== normalizedValue) {
      onSave(nextDate);
    }
  };

  return (
    <DatePicker
      size={size}
      allowClear
      value={draft}
      style={style}
      format="DD MMM YYYY"
      onChange={(nextValue) => {
        setDraft(nextValue);
        commit(nextValue);
      }}
    />
  );
}
