import React, { useState } from 'react';
import { apiFetch, apiPatch, apiPost, useApi } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';

interface CommandInfo {
  trigger: string;
  description: string;
  group: 'text' | 'lookup' | 'builtin';
  id: string;
  stored: boolean;
  aliases: string[];
}

interface CommandList {
  commands: CommandInfo[];
  panel: string;
  builtinDescriptions: Record<string, string>;
  /** Second name → the command it stands for. */
  aliases: Record<string, string>;
  /** The few `!befehle` names first. */
  featured: { triggers: string[]; stored: boolean; max: number };
}

const GROUPS: { group: CommandInfo['group']; title: string; hint: string }[] = [
  { group: 'text', title: 'Eigene Texte', hint: 'Deine Erklär-Commands.' },
  { group: 'lookup', title: 'Aus der Welt', hint: 'Suchen im Worldbuilder.' },
  { group: 'builtin', title: 'Rund um den Stream', hint: 'Eingebaut — Songs, Aufgaben, Abstimmungen.' },
];

/**
 * Every command in one list, with the sentence viewers read. What is left
 * empty gets a derived sentence (shown as the placeholder), so the list reads
 * well without any work. The same list answers `!befehle <Name>` in chat and
 * fills the text for a Twitch panel.
 */
export default function CommandOverview() {
  const { toast } = useToast();
  const { data, refetch } = useApi<CommandList>('/commands');
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [showPanel, setShowPanel] = useState(false);
  const [newAlias, setNewAlias] = useState({ alias: '', target: '' });

  // The whole map goes back each time; the server refuses what it cannot keep.
  const saveAliases = async (aliases: Record<string, string>) => {
    const res = await apiFetch('/commands/aliases', { method: 'POST', body: JSON.stringify(aliases) });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.message ?? 'Zweitname nicht gespeichert');
      return false;
    }
    refetch();
    return true;
  };

  const addAlias = async () => {
    if (!data || !newAlias.alias.trim() || !newAlias.target) return;
    if (await saveAliases({ ...data.aliases, [newAlias.alias.trim()]: newAlias.target })) setNewAlias({ alias: '', target: '' });
  };

  const removeAlias = async (alias: string) => {
    if (!data) return;
    const next = { ...data.aliases };
    delete next[alias];
    await saveAliases(next);
  };

  const toggleFeatured = async (trigger: string) => {
    if (!data) return;
    const current = data.featured.triggers;
    const triggers = current.includes(trigger) ? current.filter((t) => t !== trigger) : [...current, trigger];
    if (triggers.length > data.featured.max) { toast.error(`Höchstens ${data.featured.max} — mehr liest im Chat niemand.`); return; }
    const res = await apiFetch('/commands/featured', { method: 'POST', body: JSON.stringify({ triggers }) });
    if (!res.ok) { toast.error('Nicht gespeichert'); return; }
    refetch();
  };

  const key = (command: CommandInfo) => `${command.group}:${command.id}`;
  const valueOf = (command: CommandInfo) => edited[key(command)] ?? (command.stored ? command.description : '');

  const save = async (command: CommandInfo) => {
    const text = valueOf(command).trim();
    if (text === (command.stored ? command.description : '')) return;
    const ok = command.group === 'builtin'
      ? await apiPost('/commands/descriptions', { ...data?.builtinDescriptions, [command.id]: text })
      : await apiPatch(`/${command.group === 'text' ? 'text-commands' : 'lookup-commands'}/${command.id}`, { description: text });
    if (!ok) { toast.error('Speichern fehlgeschlagen'); return; }
    setEdited((prev) => { const next = { ...prev }; delete next[key(command)]; return next; });
    refetch();
  };

  const copyPanel = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.panel);
      toast.success('Text kopiert — in Twitch unter „Kanal bearbeiten → Panels“ einfügen');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  return (
    <div className="command-overview">
      <div className="text-commands-section">
        <h3>📋 Übersicht für Zuschauer</h3>
        <div className="command-overview-actions">
          <button className="btn-export-small" onClick={copyPanel} disabled={!data}>Für Twitch-Panel kopieren</button>
          <button className="btn-export-small" onClick={() => setShowPanel(!showPanel)} disabled={!data}>
            {showPanel ? 'Vorschau zu' : 'Vorschau'}
          </button>
        </div>
      </div>
      <p className="panel-desc">
        Alle Befehle mit einem Satz dazu. Leer gelassene Sätze schreibt das Tool selbst — sie stehen blass im Feld.
        Im Chat nennt „!befehle“ nur die mit ★, „!befehle alle“ jeden, „!befehle &lt;Name&gt;“ erklärt einen.
        Ein Zweitname antwortet wie der Befehl, für den er steht.
      </p>

      {showPanel && <pre className="command-overview-panel">{data?.panel}</pre>}

      {data && (
        <div className="command-overview-group">
          <h4>Zweitnamen <small>{Object.keys(data.aliases).length ? '' : 'Noch keine — z. B. !socials für !links.'}</small></h4>
          {Object.entries(data.aliases).sort().map(([alias, target]) => (
            <div key={alias} className="command-overview-row">
              <code className="text-command-trigger">{alias}</code>
              <span className="command-overview-arrow">→ {target}</span>
              <button className="btn-export-small" onClick={() => removeAlias(alias)} title="Zweitname entfernen">✕</button>
            </div>
          ))}
          <div className="command-overview-row">
            <input
              type="text" placeholder="!zweitname" style={{ flex: '0 0 140px' }}
              value={newAlias.alias} onChange={(e) => setNewAlias({ ...newAlias, alias: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addAlias()}
            />
            <select className="s-alert-select" value={newAlias.target} onChange={(e) => setNewAlias({ ...newAlias, target: e.target.value })}>
              <option value="">steht für…</option>
              {data.commands.map((c) => <option key={c.trigger} value={c.trigger}>{c.trigger}</option>)}
            </select>
            <button className="btn-export-small" onClick={addAlias} disabled={!newAlias.alias.trim() || !newAlias.target}>Hinzufügen</button>
          </div>
        </div>
      )}

      {GROUPS.map(({ group, title, hint }) => {
        const commands = (data?.commands ?? []).filter((c) => c.group === group);
        if (commands.length === 0) return null;
        return (
          <div key={group} className="command-overview-group">
            <h4>{title} <small>{hint}</small></h4>
            {commands.map((command) => (
              <div key={key(command)} className="command-overview-row">
                <button
                  className={`command-overview-star ${data?.featured.triggers.includes(command.trigger) ? 'on' : ''}`}
                  onClick={() => toggleFeatured(command.trigger)}
                  title={data?.featured.triggers.includes(command.trigger) ? 'Steht in „!befehle“ vorn — abwählen' : 'In „!befehle“ vorn nennen'}
                >★</button>
                <code className="text-command-trigger" title={command.aliases.length ? `auch ${command.aliases.join(', ')}` : undefined}>
                  {command.trigger}{command.aliases.length ? <small> +{command.aliases.length}</small> : null}
                </code>
                <input
                  type="text"
                  value={valueOf(command)}
                  placeholder={command.description}
                  onChange={(e) => setEdited((prev) => ({ ...prev, [key(command)]: e.target.value }))}
                  onBlur={() => save(command)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
