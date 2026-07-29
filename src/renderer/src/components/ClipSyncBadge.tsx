import React from 'react';

export type SyncState = 'pending' | 'syncing' | 'synced' | 'failed' | 'disabled';

interface Props {
  state: SyncState;
  onRetry?: () => void;
}

export default function ClipSyncBadge({ state, onRetry }: Props) {
  if (state === 'disabled') return null;

  const icon =
    state === 'pending' ? '⋯' :
    state === 'syncing' ? '⏳' :
    state === 'synced' ? '✅' :
    '⚠️';

  const title =
    state === 'pending' ? 'Wartet auf Sync' :
    state === 'syncing' ? 'Synchronisiert…' :
    state === 'synced' ? 'In Notion — klicken zum Öffnen' :
    'Sync fehlgeschlagen — klicken für Retry';
  const clickable = state === 'failed' && !!onRetry;

  return (
    <span
      className={`clip-sync-badge ${state} ${clickable ? 'clickable' : ''}`}
      title={title}
      onClick={clickable ? onRetry : undefined}
    >
      {icon}
    </span>
  );
}
