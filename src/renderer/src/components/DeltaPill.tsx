import React from 'react';

interface Props {
  value: number;
  suffix?: string;
}

export default function DeltaPill({ value, suffix }: Props) {
  let cls = 'delta-pill';
  let glyph = '•';
  let sign = '';
  if (value > 0)      { cls += ' up';   glyph = '▲'; sign = '+'; }
  else if (value < 0) { cls += ' down'; glyph = '▼'; sign = '−'; }
  else                { cls += ' flat'; glyph = '•'; }

  const display = value === 0 ? '0' : `${sign}${Math.abs(value)}`;

  return (
    <span className={cls} title={suffix}>
      {glyph} {display}
    </span>
  );
}
