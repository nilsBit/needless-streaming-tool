import React from 'react';
import { useTranslation } from '../i18n/LanguageContext';

export type SyncState = 'pending' | 'syncing' | 'synced' | 'failed' | 'disabled';

interface Props {
  state: SyncState;
  onRetry?: () => void;
}

export default function ClipSyncBadge({ state, onRetry }: Props) {
  const { t } = useTranslation();
  if (state === 'disabled') return null;

  const icon =
    state === 'pending' ? '⋯' :
    state === 'syncing' ? '⏳' :
    state === 'synced' ? '✅' :
    '⚠️';

  const titleKey =
    state === 'pending' ? ('clips.sync_status.pending' as const) :
    state === 'syncing' ? ('clips.sync_status.syncing' as const) :
    state === 'synced' ? ('clips.sync_status.synced' as const) :
    ('clips.sync_status.failed' as const);
  const title = t(titleKey);
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
