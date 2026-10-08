import React, { useEffect, useState } from 'react';
import { apiFetch, apiGet, apiPost } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import QuestPath, { ChoiceCards, PathDone } from '../QuestPath';
import { useQuests } from '../useQuests';

// Creating a chat command as a Quest-Pfad (spec 2026-10-08-quests-design):
// Art · Name · Antwort (or the Art in the world) · Vorschau · Geschafft.
// The command dialog stays for editing.

type Kind = 'text' | 'lookup';

// Usual stream commands; those that exist already are left out.
const TEXT_IDEAS = [
  { trigger: '!story', response: 'Wir schreiben live eine Welt – jede Woche ein Stück mehr.' },
  { trigger: '!welt', response: 'Die Welt spielt in … [hier beschreibst du in zwei Sätzen, wo alles spielt].' },
  { trigger: '!zeitplan', response: 'Live bin ich … [deine Tage und Uhrzeiten].' },
  { trigger: '!discord', response: 'Komm auf den Discord: [dein Einladungslink]' },
  { trigger: '!links', response: 'Alles an einem Ort: [deine Links]' },
  { trigger: '!regeln', response: 'Sei freundlich, kein Spam, keine Spoiler. Danke!' },
  { trigger: '!lurk', response: 'Schön, dass du still mitliest – mach es dir gemütlich.' },
  { trigger: '!idee', response: 'Eine Idee für die Welt? Schreib sie in den Chat oder auf den Discord: [Link]' },
  { trigger: '!musik', response: 'Die Musik im Stream: [woher sie kommt, Playlist-Link]' },
  { trigger: '!setup', response: 'Mein Setup: [Kamera, Mikro, was du benutzt]' },
  { trigger: '!danke', response: 'Danke an alle, die heute dabei sind!' },
  { trigger: '!clip', response: 'Einen Moment festhalten? Clip ihn mit dem Clip-Knopf unter dem Video.' },
];
const LOOKUP_IDEAS = ['!figur', '!ort', '!gilde', '!begriff'];

interface Props {
  /** A suggestion clicked on the page: starts at the name with this filled in. */
  initialTrigger?: string;
  /** Triggers that exist already — never suggested again. */
  taken: string[];
  onClose: () => void;
  onCreated: () => void;
}

export default function CommandQuestPath({ initialTrigger, taken, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const { quests } = useQuests();
  const [arten, setArten] = useState<string[] | null>(null);
  const [kind, setKind] = useState<Kind>('text');
  const used = new Set(taken.map((t) => t.toLowerCase()));
  const textIdeas = TEXT_IDEAS.filter((i) => !used.has(i.trigger));
  const lookupIdeas = LOOKUP_IDEAS.filter((t) => !used.has(t));
  const firstIdea = textIdeas.find((i) => i.trigger === initialTrigger) ?? textIdeas[0];
  const [trigger, setTrigger] = useState(initialTrigger ?? firstIdea?.trigger ?? '!');
  const [response, setResponse] = useState(firstIdea?.response ?? '');
  const [art, setArt] = useState('');
  const [parts, setParts] = useState<number>(1);
  const [made, setMade] = useState<string>('');

  useEffect(() => { apiGet<string[]>('/lookup-commands/arten').then((a) => { setArten(a); if (a?.length) setArt(a[0]); }); }, []);
  // How many chat messages the answer becomes: more than one is said, not hidden.
  useEffect(() => {
    if (kind !== 'text') return;
    const t = setTimeout(async () => setParts((await apiPost<{ messages: string[] }>('/text-commands/preview', { response }))?.messages.length ?? 1), 250);
    return () => clearTimeout(t);
  }, [response, kind]);

  const name = trigger.trim().startsWith('!') ? trigger.trim().toLowerCase() : `!${trigger.trim().toLowerCase()}`;
  // The first command is a quest of its own; "five" is done only by the fifth.
  const quest = quests?.open.find((q) => q.key === 'command') ?? null;

  const pickKind = (k: Kind) => {
    setKind(k);
    setTrigger(k === 'text' ? (textIdeas[0]?.trigger ?? '!') : (lookupIdeas[0] ?? '!'));
  };

  const create = async (): Promise<boolean> => {
    const res = kind === 'text'
      ? await apiFetch('/text-commands', { method: 'POST', body: JSON.stringify({ trigger: name, response }) })
      : await apiFetch('/lookup-commands', { method: 'POST', body: JSON.stringify({ trigger: name, art }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.message || d.error || 'Nicht angelegt'); return false; }
    setMade((await res.json()).trigger ?? name);
    onCreated();
    return true;
  };

  const lookupReady = arten !== null && arten.length > 0;

  return (
    <QuestPath
      title="Neuer Befehl"
      sentence="Etwas, das der Chat tippt und der Bot beantwortet."
      startAt={initialTrigger ? 1 : 0}
      finishLabel="Anlegen"
      onFinish={create}
      onClose={onClose}
      steps={[
        {
          label: 'Art',
          ready: kind === 'text' || lookupReady,
          content: (
            <>
              <h3 className="quest-step-title">Was soll der Befehl tun?</h3>
              <ChoiceCards<Kind>
                label="Art des Befehls"
                value={kind}
                onChange={pickKind}
                options={[
                  { value: 'text', title: 'Mit deinem Text antworten', text: 'Für alles, was du sonst in jedem Stream neu erklärst: !story, !welt, !zeitplan.', icon: 'M4 5h16v11H8l-4 4z' },
                  { value: 'lookup', title: 'In deiner Welt nachschlagen', text: lookupReady ? 'Der Chat fragt !figur Mila, der Bot antwortet aus dem Worldbuilder.' : 'Geht, sobald der Worldbuilder läuft.', icon: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4' },
                ]}
              />
            </>
          ),
        },
        {
          label: 'Name',
          ready: name.length > 1 && !used.has(name),
          content: (
            <>
              <h3 className="quest-step-title">Was tippt der Chat?</h3>
              <input aria-label="Name des Befehls" type="text" className="quest-input" value={trigger} onChange={(e) => setTrigger(e.target.value)} autoFocus />
              {used.has(name) && <span className="dialog-hint" role="alert">{name} gibt es schon – wähl einen anderen Namen.</span>}
              <div className="card-row card-wrap" hidden={(kind === 'text' ? textIdeas.length : lookupIdeas.length) === 0}>
                <span className="dialog-hint">Vorschläge:</span>
                {(kind === 'text' ? textIdeas.map((i) => i.trigger) : lookupIdeas).map((t) => (
                  <button key={t} type="button" className="pill" onClick={() => { setTrigger(t); const idea = TEXT_IDEAS.find((i) => i.trigger === t); if (idea) setResponse(idea.response); }}>{t}</button>
                ))}
              </div>
            </>
          ),
        },
        kind === 'text'
          ? {
            label: 'Antwort',
            ready: response.trim().length > 0,
            content: (
              <>
                <h3 className="quest-step-title">Was antwortet der Bot auf {name}?</h3>
                <textarea aria-label="Antwort" rows={4} className="quest-input" value={response} onChange={(e) => setResponse(e.target.value)} />
                <span className="dialog-hint">{response.length} Zeichen{parts > 1 ? ` · wird ${parts} Chat-Nachrichten` : ' · eine Chat-Nachricht'}. Was in [eckigen Klammern] steht, ersetzt du durch deins.</span>
              </>
            ),
          }
          : {
            label: 'Art in der Welt',
            ready: !!art,
            content: (
              <>
                <h3 className="quest-step-title">Was soll {name} nachschlagen?</h3>
                <ChoiceCards label="Art in der Welt" value={art} onChange={setArt} options={(arten ?? []).map((a) => ({ value: a, title: a, text: `${name} <Name> sucht unter „${a}“.` }))} />
              </>
            ),
          },
        {
          label: 'Vorschau',
          content: (
            <>
              <h3 className="quest-step-title">So sieht es im Chat aus</h3>
              <div className="quest-preview-chat">
                <span className="preview-who viewer">kartograph:</span> {kind === 'text' ? name : `${name} Mila`}<br />
                <span className="preview-who bot">Bot:</span> {kind === 'text' ? response : `Mila – ${art}: [die Kurzbeschreibung aus deiner Welt]`}
              </div>
              <p className="dialog-hint" style={{ margin: 0 }}>Nach dem Anlegen steht {name} auch in !befehle.</p>
            </>
          ),
        },
      ]}
      done={
        <PathDone title={`${made || name} ist da!`} xp={quest ? quest.xp : null} text={`Schreib im Chat ${made || name}${kind === 'lookup' ? ' und einen Namen' : ''} – oder probier es unter Chat & Bot → Ausprobieren, ohne live zu sein.`} />
      }
    />
  );
}
