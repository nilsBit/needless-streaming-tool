import React, { useState } from 'react';
import { apiPatch, apiPost, useApi } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';

interface CommandInfo {
  trigger: string;
  description: string;
  group: 'text' | 'lookup' | 'builtin';
  id: string;
  stored: boolean;
}

interface CommandList {
  commands: CommandInfo[];
  panel: string;
  builtinDescriptions: Record<string, string>;
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
        Im Chat erklärt „!befehle &lt;Name&gt;“ einen einzelnen Befehl.
      </p>

      {showPanel && <pre className="command-overview-panel">{data?.panel}</pre>}

      {GROUPS.map(({ group, title, hint }) => {
        const commands = (data?.commands ?? []).filter((c) => c.group === group);
        if (commands.length === 0) return null;
        return (
          <div key={group} className="command-overview-group">
            <h4>{title} <small>{hint}</small></h4>
            {commands.map((command) => (
              <div key={key(command)} className="command-overview-row">
                <code className="text-command-trigger">{command.trigger}</code>
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
