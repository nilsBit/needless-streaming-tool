import React from 'react';

interface Props {
  value: number;        // done count
  total: number;
  inverted?: boolean;   // true: value=open issues; color shifts green→red as ratio grows
}

export default function ProgressBar({ value, total, inverted = false }: Props) {
  const ratio = total > 0 ? value / total : 0;
  const pct = Math.round(ratio * 100);

  let color = '#e67e22';
  if (inverted) {
    // 0% open → green, 100% open → red
    if (ratio < 0.2)      color = '#2ecc71';
    else if (ratio < 0.5) color = '#f1c40f';
    else                  color = '#e74c3c';
  }

  return (
    <div className="progress-bar">
      <div
        className="progress-fill"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
  );
}
