import React from 'react';

interface Props {
  tabs: ReadonlyArray<{ key: string; label: string }>;
  active: string;
  onSelect: (key: string) => void;
  label?: string;
}

// The row of topics under a page header. Words only, no symbols.
export default function SubTabs({ tabs, active, onSelect, label = 'Unterbereiche' }: Props) {
  return (
    <div role="tablist" aria-label={label} className="sub-tabs">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`sub-tab ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
