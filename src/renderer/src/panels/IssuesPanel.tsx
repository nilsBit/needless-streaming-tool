import React, { useState, useEffect } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Issue } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

export default function IssuesPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: bugs, loading, refetch } = useApi<Issue[]>('/issues');
  const [newIssue, setNewIssue] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [spinning, setSpinning] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  useWebSocket((event, data) => {
    if (event === 'issue-created' || event === 'issue-updated' || event === 'issue-deleted') refetch();
    if (event === 'roulette-cooldown') setCooldown((data as { remaining_seconds: number }).remaining_seconds);
    if (event === 'roulette-result') {
      const result = data as { title: string; id: number };
      const found = bugs?.find((b) => b.id === result.id);
      if (found) setSelectedIssue(found);
      setSpinning(false);
    }
  });

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown > 0]);

  if (loading && !bugs) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const addIssue = async () => {
    if (!newIssue.trim()) return;
    const result = await apiPost('/issues', { title: newIssue });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setNewIssue('');
    refetch();
  };

  const fixIssue = async (id: number) => {
    const result = await apiPatch(`/issues/${id}`, { status: 'fixed' });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const deleteIssue = async (id: number) => {
    const ok = await apiDelete(`/issues/${id}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const spinRoulette = async () => {
    const openIssues = bugs?.filter((b) => b.status === 'open') || [];
    if (openIssues.length === 0) return;

    setSpinning(true);
    setSelectedIssue(null);

    const result = await apiPost<{ winner: { id: number; title: string } }>('/actions/roulette', {});
    if (!result) {
      toast.error(t('error.action_failed'));
      setSpinning(false);
    }
    // Result comes back via WebSocket 'roulette-result' event
  };

  const openIssues = bugs?.filter((b) => b.status === 'open') || [];
  const fixedIssues = bugs?.filter((b) => b.status === 'fixed') || [];

  return (
    <div className="panel issues-panel">
      <h2>🎯 Glücksrad</h2>
      <p className="panel-desc">{t('issues.desc')}</p>

      <div className="issue-input">
        <input
          type="text"
          placeholder={t('issues.placeholder')}
          value={newIssue}
          onChange={(e) => setNewIssue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addIssue()}
        />
        <button onClick={addIssue}>+</button>
      </div>

      <button
        className="btn-roulette"
        onClick={spinRoulette}
        disabled={spinning || openIssues.length === 0 || cooldown > 0}
      >
        {spinning ? `🎰 ${t('issues.spinning')}` : cooldown > 0 ? `⏳ ${t('issues.cooldown')} ${cooldown}s` : `🎰 ${t('issues.spin')}`}
      </button>

      {selectedIssue && !spinning && (
        <div className="roulette-result">
          ➡️ <strong>{selectedIssue.title}</strong>
        </div>
      )}

      <div className="issue-list">
        {openIssues.length === 0 && fixedIssues.length === 0 && !spinning && !selectedIssue && (
          <p className="empty">{t('issues.empty_list')}</p>
        )}
        <h3>{t('issues.open')} ({openIssues.length})</h3>
        {openIssues.map((bug) => (
          <div key={bug.id} className="issue-item">
            <span>{bug.title}</span>
            <div className="issue-actions">
              <button onClick={() => fixIssue(bug.id)}>✅</button>
              <button title={t('tooltip.delete')} onClick={() => deleteIssue(bug.id)}>🗑️</button>
            </div>
          </div>
        ))}
        {fixedIssues.length > 0 && (
          <>
            <h3>{t('issues.fixed')} ({fixedIssues.length})</h3>
            {fixedIssues.map((bug) => (
              <div key={bug.id} className="issue-item fixed">
                <span>{bug.title}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <ChatCommands commands={[
        { cmd: '!issues', desc: t('issues.cmd_issues') },
      ]} />
    </div>
  );
}
