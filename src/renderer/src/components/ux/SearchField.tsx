import React from 'react';

// One search field for every list that grows long (Nils, 08.10.: "überall wo
// wir ne suche brauchen"). It filters as you type; Escape empties it.

/** Lower case, umlauts and ß spelled out, accents dropped — "Glücksrad" is found by "gluecks". */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Whether every word of the query stands somewhere in the texts. An empty query matches everything. */
export function matchesSearch(query: string, ...texts: Array<string | null | undefined>): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(texts.filter(Boolean).join(' '));
  return words.every((w) => haystack.includes(w));
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** What is searched, for the placeholder and screen readers: "Funktionen suchen". */
  label: string;
  width?: number;
}

export default function SearchField({ value, onChange, label, width = 240 }: Props) {
  return (
    <input
      type="search"
      className="search-field"
      placeholder={label}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange(''); } }}
      // flex: none — the same size in a row and in a column (the overlay list stacks).
      style={{ width, maxWidth: '100%', flex: 'none', boxSizing: 'border-box' }}
    />
  );
}
