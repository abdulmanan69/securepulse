'use client';

import { useId, useState } from 'react';

/**
 * Score over time for one site.
 *
 * A single-series line chart, so it needs no legend - the heading names it.
 * The horizontal guides are the grade thresholds rather than arbitrary round
 * numbers, which makes the y-axis encode the thing the reader actually cares
 * about: not "is the number going down" but "has it crossed into a worse
 * grade". Colour is the one accent; grade state is carried by the labels.
 */

export interface TrendPoint {
  scanId: string;
  at: string;
  score: number;
  grade: string;
}

const BANDS = [
  { score: 90, label: 'A' },
  { score: 80, label: 'B' },
  { score: 70, label: 'C' },
  { score: 60, label: 'D' },
];

const WIDTH = 900;
const HEIGHT = 200;
const PAD = { top: 16, right: 40, bottom: 26, left: 30 };

export function ScoreTrend({ points }: { points: TrendPoint[] }) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex aspect-[9/2] items-center justify-center border border-dashed border-rule-strong bg-surface">
        <p className="text-[13px] text-slate">No completed scans yet.</p>
      </div>
    );
  }

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const x = (index: number) =>
    points.length === 1
      ? PAD.left + plotW / 2
      : PAD.left + (index / (points.length - 1)) * plotW;
  const y = (score: number) => PAD.top + (1 - score / 100) * plotH;

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.score)}`)
    .join(' ');

  const area = `${line} L ${x(points.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`;

  const active = hover !== null ? points[hover] : null;
  const last = points[points.length - 1];

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const position = ratio * WIDTH;
    // Nearest point, so the hit target is the whole column, not the 8px dot.
    let nearest = 0;
    let best = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const distance = Math.abs(x(index) - position);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    setHover(nearest);
  }

  return (
    <figure className="m-0">
      <div className="relative border border-rule bg-surface p-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Security score over the last ${points.length} scans. Most recent: ${last.score} out of 100, grade ${last.grade}.`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
            </clipPath>
            <linearGradient id={`${clipId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {BANDS.map((band) => (
            <g key={band.label}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(band.score)}
                y2={y(band.score)}
                stroke="var(--rule)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={y(band.score) + 3.5}
                textAnchor="end"
                className="fill-muted font-mono"
                fontSize="9"
              >
                {band.label}
              </text>
            </g>
          ))}

          <g clipPath={`url(#${clipId})`}>
            <path d={area} fill={`url(#${clipId}-fill)`} />
            <path
              d={line}
              fill="none"
              stroke="var(--signal)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>

          {active ? (
            <line
              x1={x(hover as number)}
              x2={x(hover as number)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--ink)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.35"
            />
          ) : null}

          {points.map((point, index) => {
            const isActive = index === hover;
            const isLast = index === points.length - 1;
            if (!isActive && !isLast && points.length > 14) return null;
            return (
              <circle
                key={point.scanId}
                cx={x(index)}
                cy={y(point.score)}
                r={isActive ? 5 : 4}
                fill="var(--signal)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
            );
          })}

          <text
            x={x(points.length - 1) + 8}
            y={y(last.score) + 3.5}
            className="fill-ink font-mono"
            fontSize="11"
            fontWeight="600"
          >
            {last.score}
          </text>

          <text
            x={PAD.left}
            y={HEIGHT - 8}
            className="fill-muted font-mono"
            fontSize="9"
          >
            {new Date(points[0].at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </text>
          <text
            x={PAD.left + plotW}
            y={HEIGHT - 8}
            textAnchor="end"
            className="fill-muted font-mono"
            fontSize="9"
          >
            {new Date(last.at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </text>
        </svg>

        {active ? (
          <div
            className="pointer-events-none absolute top-3 rounded-sm border border-rule bg-surface px-2.5 py-1.5 shadow-md"
            style={{
              left: `calc(${(x(hover as number) / WIDTH) * 100}% - 3rem)`,
            }}
          >
            <p className="font-mono text-[10px] text-slate">
              {new Date(active.at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </p>
            <p className="font-mono text-[12px] font-semibold tabular-nums">
              {active.score}
              <span className="text-slate">/100 · {active.grade}</span>
            </p>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
