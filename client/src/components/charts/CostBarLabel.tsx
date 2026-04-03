type CostBarLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  fill?: string;
};

const compactCurrencyFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatCompactCurrency(value: number): string {
  return `$${compactCurrencyFormatter.format(value)}`;
}

export function renderCostBarLabel(props: CostBarLabelProps) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    value = 0,
    fill = '#102039',
  } = props;

  const numericX = Number(x || 0);
  const numericY = Number(y || 0);
  const numericWidth = Number(width || 0);
  const numericHeight = Number(height || 0);
  const numericValue = Number(value || 0);
  if (!numericValue || numericWidth <= 0 || numericHeight <= 0) {
    return null;
  }

  const canFitInsideBar = numericHeight >= 34;
  const labelX = numericX + (numericWidth / 2);
  const labelY = canFitInsideBar ? numericY + 16 : numericY - 8;

  return (
    <text
      x={labelX}
      y={labelY}
      textAnchor="middle"
      dominantBaseline={canFitInsideBar ? 'middle' : 'auto'}
      fill={canFitInsideBar ? '#ffffff' : fill}
      fontSize={14}
      fontWeight={800}
    >
      {formatCompactCurrency(numericValue)}
    </text>
  );
}
