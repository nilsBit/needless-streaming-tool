import React from 'react';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

export default function Sparkline({
  values,
  width = 80,
  height = 24,
  color = '#e67e22',
  strokeWidth = 2,
}: Props) {
  if (values.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const pad = strokeWidth;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * usableW;
    const y = pad + usableH - ((v - min) / range) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
