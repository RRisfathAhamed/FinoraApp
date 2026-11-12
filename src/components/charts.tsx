import { formatMoney } from '../lib/money';

/** Lightweight, theme-aware SVG charts — no canvas, no external charting dep. */

export function IncomeExpenseBars({
  data,
  currency,
  hide,
}: {
  data: { label: string; income: number; expense: number }[];
  currency: string;
  hide?: boolean;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  return (
    <div className="bars">
      <div className="bars__plot" aria-hidden>
        {data.map((d) => (
          <div className="bars__group" key={d.label}>
            <div className="bars__pair">
              <span className="bars__bar bars__bar--in" style={{ height: `${(d.income / max) * 100}%` }} />
              <span className="bars__bar bars__bar--out" style={{ height: `${(d.expense / max) * 100}%` }} />
            </div>
            <span className="bars__label">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="legend">
        <span className="legend__item"><i className="dot dot--in" /> Income</span>
        <span className="legend__item"><i className="dot dot--out" /> Expenses</span>
        <span className="legend__value">
          {hide ? '••••' : `${formatMoney(Math.max(...data.map((d) => d.income)), currency, { compact: true })} peak`}
        </span>
      </div>
    </div>
  );
}

export function Donut({
  slices,
  total,
  currency,
  hide,
}: {
  slices: { label: string; value: number; color: string }[];
  total: number;
  currency: string;
  hide?: boolean;
}) {
  const size = 132;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {slices.map((slice) => {
          const fraction = total > 0 ? slice.value / total : 0;
          const dash = fraction * circumference;
          const element = (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, dash - 3)} ${circumference}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return element;
        })}
      </svg>
      <div className="donut__center">
        <span className="donut__label">Total</span>
        <strong className="donut__value">{hide ? '••••' : formatMoney(total, currency, { compact: true })}</strong>
      </div>
    </div>
  );
}

export function Sparkline({
  points,
  tone = 'brand',
  height = 40,
}: {
  points: number[];
  tone?: 'brand' | 'danger';
  height?: number;
}) {
  if (points.length < 2) return <div className="spark spark--empty" style={{ height }} />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const width = 120;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className={`spark spark--${tone}`} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={coords.join(' ')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
