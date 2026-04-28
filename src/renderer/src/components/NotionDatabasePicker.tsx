import React, { useEffect, useState } from 'react';
import { useApi, apiPost, apiGet } from '../hooks/useApi';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';
import { NotionDatabase, NotionPage, NotionDatabaseCheck } from '../../../shared/types';
import { TranslationKey } from '../i18n/translations';

interface Props {
  onConfigured?: () => void;
  compact?: boolean;
}

type Phase = 'loading' | 'picker' | 'empty' | 'configured' | 'creating' | 'token_missing';

export default function NotionDatabasePicker({ onConfigured, compact }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: tokenInfo } = useApi<{ configured: boolean }>('/settings/notion');
  const { data: dbInfo, refetch: refetchDb } = useApi<{ configured: boolean; database_id: string | null }>('/settings/notion/database');

  const [phase, setPhase] = useState<Phase>('loading');
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [check, setCheck] = useState<NotionDatabaseCheck | null>(null);
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [newName, setNewName] = useState('Stream Clips');
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadDatabases = async () => {
    setPhase('loading');
    try {
      const dbs = await apiGet<NotionDatabase[]>('/settings/notion/databases');
      if (!dbs) { setPhase('empty'); return; }
      setDatabases(dbs);
      setPhase(dbs.length > 0 ? 'picker' : 'empty');
    } catch { setPhase('empty'); }
  };

  const loadCheck = async () => {
    const c = await apiGet<NotionDatabaseCheck>('/settings/notion/database/check');
    setCheck(c);
  };

  useEffect(() => {
    // Wait for initial data to load before deciding phase
    if (tokenInfo === null || dbInfo === null) return;
    if (!tokenInfo.configured) { setPhase('token_missing'); return; }
    if (dbInfo.configured) {
      setPhase('configured');
      loadCheck();
    } else {
      loadDatabases();
    }
  }, [tokenInfo?.configured, dbInfo?.configured]);

  const pickDatabase = async (db: NotionDatabase) => {
    setBusy(true);
    const ok = await apiPost('/settings/notion/database', { database_id: db.id });
    if (!ok) { toast.error(t('error.action_failed')); setBusy(false); return; }
    if (db.missing_properties.length > 0) {
      await apiPost('/settings/notion/database/heal', { database_id: db.id });
    }
    toast.success(t('notion.picker.ready'));
    setBusy(false);
    refetchDb();
    onConfigured?.();
  };

  const pickManual = async () => {
    const cleaned = manualId.trim();
    if (!cleaned) return;
    setBusy(true);
    const ok = await apiPost('/settings/notion/database', { database_id: cleaned });
    if (!ok) { toast.error(t('error.action_failed')); setBusy(false); return; }
    setManualId('');
    setShowManual(false);
    setBusy(false);
    refetchDb();
    onConfigured?.();
  };

  const openCreate = async () => {
    const ps = await apiGet<NotionPage[]>('/settings/notion/pages');
    setPages(ps || []);
    setSelectedParent(ps && ps.length > 0 ? ps[0].id : null);
    setPhase('creating');
  };

  const submitCreate = async () => {
    if (!selectedParent) return;
    setBusy(true);
    const ok = await apiPost('/settings/notion/database/create', { parent_page_id: selectedParent, title: newName || 'Stream Clips' });
    setBusy(false);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    toast.success(t('notion.picker.ready'));
    refetchDb();
    onConfigured?.();
  };

  const healNow = async () => {
    const dbId = dbInfo?.database_id;
    if (!dbId) return;
    setBusy(true);
    const ok = await apiPost('/settings/notion/database/heal', { database_id: dbId });
    setBusy(false);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    toast.success(t('notion.picker.ready'));
    loadCheck();
  };

  const unlinkDatabase = async () => {
    await apiPost('/settings/notion/database', { database_id: '' });
    refetchDb();
    setCheck(null);
    loadDatabases();
  };

  const fmt = (key: TranslationKey, n: number) => t(key).replace('{n}', String(n));

  if (phase === 'token_missing') {
    return <div className="notion-picker-empty">{t('notion.picker.token_needed')}</div>;
  }

  if (phase === 'loading') {
    return <div className="notion-picker-loading">…</div>;
  }

  if (phase === 'configured') {
    const dbId = dbInfo?.database_id;
    const schemaOk = check && 'ok' in check && check.ok === true;
    const schemaMissing = check && 'ok' in check && check.ok === false && 'missing_properties' in check ? check.missing_properties : null;
    const hardError = check && 'ok' in check && check.ok === false && 'error' in check ? check.error : null;
    return (
      <div className={`notion-picker configured ${compact ? 'compact' : ''}`}>
        <div className="notion-picker-current">
          <span className="notion-picker-icon">📊</span>
          <span className="notion-picker-title">{dbId ? `${dbId.substring(0, 8)}…${dbId.substring(24)}` : ''}</span>
          {schemaOk && <span className="notion-picker-badge ok">✓ {t('notion.picker.ready')}</span>}
          {schemaMissing && <span className="notion-picker-badge warn">⚠ {fmt('notion.picker.schema_fix', schemaMissing.length)}</span>}
          {hardError === 'db_gone' && <span className="notion-picker-badge error">{t('notion.picker.error_db_gone')}</span>}
          {hardError === 'token_invalid' && <span className="notion-picker-badge error">{t('notion.picker.error_token')}</span>}
        </div>
        {schemaOk && <p className="notion-picker-sub">{t('notion.picker.schema_ok')}</p>}
        <div className="notion-picker-actions">
          {schemaMissing && <button onClick={healNow} disabled={busy}>🔧</button>}
          <button onClick={unlinkDatabase} disabled={busy}>{t('notion.picker.other')}</button>
        </div>
      </div>
    );
  }

  if (phase === 'creating') {
    return (
      <div className={`notion-picker creating ${compact ? 'compact' : ''}`}>
        <h4>{t('notion.picker.create')}</h4>
        <label>
          {t('notion.picker.create_name')}
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
        {pages.length === 0 ? (
          <p className="notion-picker-hint">{t('notion.picker.create_empty_pages')}</p>
        ) : (
          <fieldset className="notion-picker-pages">
            <legend>{t('notion.picker.create_parent')}</legend>
            {pages.map((p) => (
              <label key={p.id} className="notion-picker-page-option">
                <input type="radio" name="parent" checked={selectedParent === p.id} onChange={() => setSelectedParent(p.id)} />
                <span>{p.icon || '📄'} {p.title}</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="notion-picker-actions">
          <button onClick={() => loadDatabases()} disabled={busy}>{t('notion.picker.create_cancel')}</button>
          <button onClick={submitCreate} disabled={busy || !selectedParent || pages.length === 0}>{t('notion.picker.create_button')}</button>
        </div>
      </div>
    );
  }

  if (phase === 'empty') {
    return (
      <div className={`notion-picker empty ${compact ? 'compact' : ''}`}>
        <h4>{t('notion.picker.empty_title')}</h4>
        <p>{t('notion.picker.empty_help_intro')}</p>
        <ol>
          <li>{t('notion.picker.empty_help_1')}</li>
          <li>{t('notion.picker.empty_help_2')}</li>
          <li>{t('notion.picker.empty_help_3')}</li>
        </ol>
        <div className="notion-picker-actions">
          <button onClick={loadDatabases} disabled={busy}>🔄 {t('notion.picker.refresh')}</button>
          <button onClick={openCreate} disabled={busy}>➕ {t('notion.picker.create')}</button>
        </div>
      </div>
    );
  }

  // phase === 'picker'
  return (
    <div className={`notion-picker picker ${compact ? 'compact' : ''}`}>
      <div className="notion-picker-header">
        <h4>{t('notion.picker.title')}</h4>
        <button className="notion-picker-refresh" onClick={loadDatabases} disabled={busy} title={t('notion.picker.refresh')}>🔄</button>
      </div>
      <button className="notion-picker-create-btn" onClick={openCreate} disabled={busy}>➕ {t('notion.picker.create')}</button>
      <ul className="notion-picker-list">
        {databases.map((db) => (
          <li key={db.id} className="notion-picker-item" onClick={() => !busy && pickDatabase(db)}>
            <span className="notion-picker-icon">{db.icon || '📊'}</span>
            <span className="notion-picker-title">{db.title}</span>
            {db.missing_properties.length > 0 && <span className="notion-picker-badge warn">⚠ {fmt('notion.picker.schema_missing_chip', db.missing_properties.length)}</span>}
          </li>
        ))}
      </ul>
      <div className="notion-picker-manual-toggle">
        {showManual ? (
          <div className="notion-picker-manual-input">
            <input type="text" placeholder="notion.so/…" value={manualId} onChange={(e) => setManualId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pickManual()} />
            <button onClick={pickManual} disabled={busy}>✓</button>
          </div>
        ) : (
          <button className="link" onClick={() => setShowManual(true)}>🔗 {t('notion.picker.manual')}</button>
        )}
      </div>
    </div>
  );
}
