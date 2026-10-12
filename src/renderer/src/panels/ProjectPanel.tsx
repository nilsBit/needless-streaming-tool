import React, { useRef, useState } from 'react';
import { useApi, apiFetch } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import { celebrate } from '../components/ux/celebrate';
import Dialog from '../components/ux/Dialog';
import QuestPath, { ChoiceCards, PathDone } from '../components/quests/QuestPath';
import type { Project, ProjectKind, ProjectsState } from '../../../shared/types';

// "Projekt" on "Im Stream" (2026-10-12, Weg A from the canvas): what the
// stream works on over many streams. The current project on top with one
// button to go on; the two last worked on below, the rest behind a button.

const SHOWN_OPEN = 2;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const number = new Intl.NumberFormat('de-DE');

const PRESETS: Array<{ label: string; steps: string[] }> = [
  { label: 'Malen', steps: ['Skizze', 'Linework', 'Farbe', 'Details'] },
  { label: 'Bemalen', steps: ['Grundieren', 'Basisfarben', 'Washes', 'Details', 'Base'] },
  { label: 'Basteln', steps: ['Planen', 'Zuschneiden', 'Zusammenbauen', 'Gestalten'] },
  { label: 'Schreiben', steps: ['Plot', 'Rohfassung', 'Überarbeiten', 'Lektorat'] },
];

const KINDS: Array<{ value: ProjectKind; title: string; text: string; icon: string }> = [
  { value: 'steps', title: 'Schritte', text: 'Skizze → Farbe → fertig. Du schaltest von Schritt zu Schritt.', icon: 'M5 12h4M15 12h4M9 12a3 3 0 106 0 3 3 0 00-6 0' },
  { value: 'count', title: 'Zähler', text: '12 von 30 Figuren. Jeder Klick zählt eins dazu.', icon: 'M5 7h14M5 12h14M5 17h9' },
  { value: 'goal', title: 'Zahl mit Ziel', text: '6.200 von 10.000 Wörtern. Du trägst den Stand ein, wie er in deinem Programm steht.', icon: 'M4 18l5-6 4 3 7-9' },
];

function dateWord(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (d.toDateString() === new Date().toDateString()) return 'heute';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

function agoWord(iso: string): string {
  const then = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    - new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / 86_400_000);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 14) return 'vor einer Woche';
  if (days < 45) return `vor ${Math.round(days / 7)} Wochen`;
  const months = Math.round(days / 30);
  return months === 1 ? 'vor einem Monat' : `vor ${months} Monaten`;
}

function streamLine(p: Project): string {
  const since = dateWord(p.created_at);
  const sinceText = since === 'heute' ? 'seit heute' : `seit ${since}`;
  if (p.live) return `Der ${p.streams}. Stream an diesem Projekt · ${sinceText}`;
  if (p.streams > 0) return `${p.streams} ${p.streams === 1 ? 'Stream' : 'Streams'} bisher · ${sinceText}`;
  return since === 'heute' ? 'Angelegt heute' : `Angelegt ${since}`;
}

function forwardLabel(p: Project): string {
  if (p.kind === 'steps') {
    return p.position === p.steps.length - 1 ? `„${p.step}“ fertig` : `Weiter zu „${p.steps[p.position + 1]}“`;
  }
  return '+1';
}

/** One line under "Auch offen": where it stands, when it was last worked on. */
function openLine(p: Project): string {
  const where = p.kind === 'steps' ? (p.finished ? 'alle Schritte geschafft' : `bei ${p.step}`) : p.stand;
  return `${where} · ${agoWord(p.last_worked_at)}`;
}

async function send(path: string, method: string, body?: unknown): Promise<{ ok: boolean; data: unknown }> {
  const res = await apiFetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, data };
}

export default function ProjectPanel() {
  const { toast } = useToast();
  const { data, loading, refetch } = useApi<ProjectsState>('/projects');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [undoFor, setUndoFor] = useState<number | null>(null);
  const [finished, setFinished] = useState<Project | null>(null);
  const nowRef = useRef<HTMLDivElement>(null);

  useWebSocket((event) => {
    if (event.startsWith('project-')) refetch();
  });

  const fail = (d: unknown, fallback: string) => toast.error((d as { message?: string } | null)?.message || fallback);

  const forward = async () => {
    const { ok, data: d } = await send('/projects/current/forward', 'POST');
    if (!ok) { fail(d, 'Nicht weitergeschaltet'); return; }
    setUndoFor((d as Project).id);
    celebrate('check', nowRef.current);
    refetch();
  };
  const back = async () => {
    const { ok, data: d } = await send('/projects/current/back', 'POST');
    if (!ok) { fail(d, 'Nicht zurückgenommen'); return; }
    setUndoFor(null);
    refetch();
  };
  const pick = async (p: Project) => {
    const { ok, data: d } = await send(`/projects/${p.id}/current`, 'POST');
    if (!ok) { fail(d, 'Nicht gewechselt'); return; }
    setUndoFor(null);
    setFinished(null);
    setShowAll(false);
    refetch();
  };
  const finish = async (p: Project) => {
    const { ok, data: d } = await send(`/projects/${p.id}/finish`, 'POST');
    if (!ok) { fail(d, 'Nicht abgeschlossen'); return false; }
    setUndoFor(null);
    setFinished(d as Project);
    refetch();
    return true;
  };

  if (loading && !data) return <div className="panel"><p className="empty">Laden …</p></div>;

  const current = data?.current ?? null;
  const open = data?.open ?? [];
  const shown = showAll ? open : open.slice(0, SHOWN_OPEN);

  return (
    <div className="panel card-slim">
      {finished && (
        <div className="project-done" role="status">
          <strong>{finished.name} ist fertig</strong>
          <span>{finished.streams > 0 ? `${finished.streams} ${finished.streams === 1 ? 'Stream' : 'Streams'} seit ${dateWord(finished.created_at)}. ` : ''}Es verschwindet aus der Liste, gelöscht wird nichts.</span>
        </div>
      )}

      {current && (
        <div className="project-now" ref={nowRef}>
          <div className="project-now-head">
            <span className="project-kicker">Gerade dran</span>
            <span className="project-streams">{streamLine(current)}</span>
          </div>
          <span className="project-name">{current.name}</span>
          {current.kind === 'steps' ? (
            <ol className="project-steps" aria-label="Schritte">
              {current.steps.map((label, i) => {
                const state = i < current.position ? 'past' : i === current.position ? 'now' : 'ahead';
                return (
                  <li key={`${i}-${label}`} className={`project-step ${state}`} aria-current={state === 'now' ? 'step' : undefined}>
                    <span className="project-step-dot" aria-hidden="true">{state === 'past' ? '✓' : ''}</span>{label}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="project-bar-wrap">
              <div className="card-line"><strong>{current.stand}</strong><span className="card-status">{current.pct} %</span></div>
              <div className="progress-bar-container"><div className="progress-bar" style={{ width: `${current.pct}%` }} /></div>
            </div>
          )}
          <div className="card-row card-wrap">
            {!current.finished && current.kind === 'goal' && <StandField key={`${current.id}-${current.position}`} project={current} onSaved={refetch} />}
            {!current.finished && current.kind !== 'goal' && <button type="button" className="card-primary" onClick={forward}>{forwardLabel(current)}</button>}
            {current.finished && <button type="button" className="card-primary" onClick={() => finish(current)}>Projekt abschließen</button>}
            {undoFor === current.id && current.position > 0 && <button type="button" className="card-secondary" onClick={back}>Rückgängig</button>}
            <span className="card-grow" />
            <button type="button" className="card-link" onClick={() => setEditing(current)}>Bearbeiten</button>
          </div>
        </div>
      )}

      {!current && open.length > 0 && <span className="project-ask">Woran arbeitest du heute?</span>}

      {open.length > 0 && (
        <div className="project-open">
          {current && <span className="project-kicker">Auch offen</span>}
          {shown.map((p) => (
            <div key={p.id} className="project-open-row">
              <div className="project-open-text">
                <span className="project-open-name">{p.name}</span>
                <span className="project-open-line">{openLine(p)}</span>
              </div>
              <button type="button" className="card-secondary" onClick={() => pick(p)}>Weitermachen</button>
            </div>
          ))}
        </div>
      )}

      <div className="card-row card-wrap">
        {!current && open.length === 0 && <button type="button" className="card-primary" onClick={() => setCreating(true)}>Projekt anlegen</button>}
        {open.length > SHOWN_OPEN && (
          <button type="button" className="card-secondary" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Weniger anzeigen' : `Alle ${open.length} offenen Projekte`}
          </button>
        )}
        {(current || open.length > 0) && <button type="button" className="card-link" onClick={() => setCreating(true)}>+ Neues Projekt anlegen</button>}
      </div>

      {creating && <CreateProject onClose={() => setCreating(false)} onCreated={() => { setFinished(null); setUndoFor(null); refetch(); }} />}
      {editing && (
        <EditProject
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch(); }}
          onFinish={async () => { if (await finish(editing)) setEditing(null); }}
          onDeleted={() => { setEditing(null); setUndoFor(null); refetch(); }}
        />
      )}
    </div>
  );
}

/** The steps of a project: one field each, remove, add, or start from a template. */
function StepsEditor({ steps, onChange }: { steps: string[]; onChange: (steps: string[]) => void }) {
  return (
    <div className="project-steps-editor">
      <div className="card-row card-wrap">
        <span className="dialog-hint">Vorlage:</span>
        {PRESETS.map((preset) => (
          <button key={preset.label} type="button" className="pill" onClick={() => onChange([...preset.steps])}>{preset.label}</button>
        ))}
      </div>
      <ol className="project-step-fields">
        {steps.map((step, i) => (
          <li key={i} className="card-row">
            <span className="project-step-number" aria-hidden="true">{i + 1}.</span>
            <input type="text" aria-label={`Schritt ${i + 1}`} value={step} maxLength={60} onChange={(e) => onChange(steps.map((s, j) => (j === i ? e.target.value : s)))} />
            <button type="button" className="card-secondary" aria-label={`Schritt ${i + 1} entfernen`} onClick={() => onChange(steps.filter((_, j) => j !== i))} disabled={steps.length <= 1}>✕</button>
          </li>
        ))}
      </ol>
      <button type="button" className="card-secondary" onClick={() => onChange([...steps, ''])} disabled={steps.length >= 30}>+ Schritt</button>
    </div>
  );
}

const whole = (raw: string): number | null => {
  const n = Number(raw.replace(/[.\s]/g, ''));
  return raw.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : null;
};

function NumberField({ label, value, onChange, width }: { label: string; value: string; onChange: (v: string) => void; width?: number }) {
  return (
    <label className="project-field" style={width ? { maxWidth: width } : undefined}>
      <span>{label}</span>
      <input type="text" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** "Zahl mit Ziel" on the card: the stand is typed in, as the writing program shows it. */
function StandField({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState(String(project.position));
  const n = whole(value);
  const save = async () => {
    if (n === null) return;
    const { ok, data } = await send('/projects/current/stand', 'POST', { position: n });
    if (!ok) { toast.error((data as { message?: string } | null)?.message || 'Nicht eingetragen'); return; }
    onSaved();
  };
  return (
    <form className="project-stand" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label className="project-field">
        <span>Stand jetzt{project.unit ? ` (${project.unit})` : ''}</span>
        <input type="text" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button type="submit" className="card-primary" disabled={n === null || n === project.position}>Eintragen</button>
    </form>
  );
}

/** The guided way to a new project: name, kind, stand, preview. */
function CreateProject({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ProjectKind>('steps');
  const [steps, setSteps] = useState<string[]>([...PRESETS[0].steps]);
  const [unit, setUnit] = useState('');
  const [total, setTotal] = useState('');
  const [start, setStart] = useState('0');
  const [weekly, setWeekly] = useState(false);
  const [made, setMade] = useState('');

  const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
  const totalN = whole(total);
  const startN = whole(start);
  const kindTitle = KINDS.find((k) => k.value === kind)?.title ?? 'Stand';

  const standMissing = kind === 'steps'
    ? (cleanSteps.length < 2 ? 'Mindestens zwei Schritte.' : '')
    : !unit.trim() ? (kind === 'goal' ? 'Trag eine Einheit ein.' : 'Trag ein, was gezählt wird.')
      : totalN === null || totalN < 1 ? 'Das Ziel ist eine Zahl über 0.'
        : startN === null ? 'Der Stand ist eine Zahl ab 0.'
          : !weekly && startN > totalN ? 'Der Stand ist größer als das Ziel.' : '';

  // The preview, worded like the server words it.
  const previewName = name.trim() || 'Dein Projekt';
  const previewStand = kind === 'steps'
    ? `${cleanSteps[0] ?? 'Schritt 1'} (Schritt 1 von ${Math.max(cleanSteps.length, 1)})`
    : `${number.format(startN ?? 0)} von ${number.format(totalN ?? 0)} ${unit.trim()}${weekly ? ' diese Woche' : ''}`;
  const previewPct = kind === 'steps' ? 0 : Math.min(100, Math.round(((startN ?? 0) / Math.max(totalN ?? 1, 1)) * 100));

  const create = async (): Promise<boolean> => {
    const body = kind === 'steps'
      ? { name: name.trim(), kind, steps: cleanSteps }
      : { name: name.trim(), kind, unit: unit.trim(), total: totalN, position: startN, ...(kind === 'goal' ? { weekly } : {}) };
    const { ok, data } = await send('/projects', 'POST', body);
    if (!ok) { toast.error((data as { message?: string } | null)?.message || 'Nicht angelegt'); return false; }
    setMade((data as Project).name);
    onCreated();
    return true;
  };

  return (
    <QuestPath
      title="Projekt anlegen"
      sentence="Woran du über mehrere Streams arbeitest – mit Stand für Overlay und !projekt."
      finishLabel="Loslegen"
      onFinish={create}
      onClose={onClose}
      steps={[
        {
          label: 'Name',
          ready: name.trim().length > 0 && name.trim().length <= 80,
          content: (
            <>
              <h3 className="quest-step-title">Woran arbeitest du?</h3>
              <input aria-label="Name des Projekts" type="text" className="quest-input" value={name} maxLength={80} placeholder="z. B. Zwergenarmee, Drache für Mia, Roman „Nebelstadt“" onChange={(e) => setName(e.target.value)} autoFocus />
              <span className="dialog-hint">So heißt es im Overlay und in der Antwort auf !projekt.</span>
            </>
          ),
        },
        {
          label: 'Art',
          content: (
            <>
              <h3 className="quest-step-title">Wie misst du den Stand?</h3>
              <ChoiceCards<ProjectKind> label="Art des Stands" value={kind} onChange={setKind} options={KINDS} />
            </>
          ),
        },
        {
          label: kindTitle,
          ready: !standMissing,
          content: kind === 'steps' ? (
            <>
              <h3 className="quest-step-title">Welche Schritte hat dein Projekt?</h3>
              <StepsEditor steps={steps} onChange={setSteps} />
              {standMissing && <span className="dialog-hint" role="alert">{standMissing}</span>}
            </>
          ) : (
            <>
              <h3 className="quest-step-title">{kind === 'count' ? 'Was zählst du?' : 'Welche Zahl, welches Ziel?'}</h3>
              <div className="project-fields">
                <label className="project-field project-field-wide">
                  <span>{kind === 'count' ? 'Was wird gezählt?' : 'Einheit'}</span>
                  <input type="text" value={unit} maxLength={30} placeholder={kind === 'count' ? 'Figuren, Seiten, Karten' : 'Wörter, Minuten, Seiten'} onChange={(e) => setUnit(e.target.value)} />
                </label>
                <NumberField label={kind === 'count' ? 'Wie viele werden es?' : 'Ziel'} value={total} onChange={setTotal} />
                <NumberField label={kind === 'count' ? 'Schon fertig' : 'Stand jetzt'} value={start} onChange={setStart} />
              </div>
              {kind === 'goal' && (
                <>
                  <span className="dialog-hint">Den Stand trägst du später auf der Karte ein, so wie er in deinem Programm steht.</span>
                  <label className="card-check"><input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> Beginnt jeden Montag neu</label>
                </>
              )}
              {standMissing && <span className="dialog-hint" role="alert">{standMissing}</span>}
            </>
          ),
        },
        {
          label: 'Vorschau',
          content: (
            <>
              <h3 className="quest-step-title">So sieht es der Stream</h3>
              <div className="project-preview-overlay">
                <strong>{previewName}</strong>
                <div className="progress-bar-container"><div className="progress-bar" style={{ width: `${previewPct}%` }} /></div>
                <span>{kind === 'steps' ? `${cleanSteps[0] ?? ''} · Schritt 1 von ${cleanSteps.length}` : previewStand}</span>
              </div>
              <div className="quest-preview-chat">
                <span className="preview-who viewer">neu_hier:</span> !projekt<br />
                <span className="preview-who bot">Bot:</span> Gerade dran: {previewName} – {previewStand}.
              </div>
            </>
          ),
        },
      ]}
      done={<PathDone title={`${made || previewName} ist angelegt!`} xp={null} text="Ab jetzt zählt jeder Stream mit, an dem du daran arbeitest. Overlay und !projekt zeigen es schon." />}
    />
  );
}

/** Changing a project: name, steps or numbers, where it stands — and finishing or deleting it. */
function EditProject({ project, onClose, onSaved, onFinish, onDeleted }: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
  onFinish: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(project.name);
  const [steps, setSteps] = useState<string[]>(project.steps.length ? project.steps : ['']);
  const [position, setPosition] = useState(String(project.position));
  const [unit, setUnit] = useState(project.unit ?? '');
  const [total, setTotal] = useState(String(project.total ?? ''));
  const [weekly, setWeekly] = useState(project.weekly);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
  const stepAt = Math.min(Number(position) || 0, cleanSteps.length);

  const save = async () => {
    const body = project.kind === 'steps'
      ? { name: name.trim(), steps: cleanSteps, position: stepAt }
      : { name: name.trim(), unit: unit.trim(), total: whole(total), position: whole(position), ...(project.kind === 'goal' ? { weekly } : {}) };
    const { ok, data } = await send(`/projects/${project.id}`, 'PATCH', body);
    if (!ok) { toast.error((data as { message?: string } | null)?.message || 'Nicht gespeichert'); return; }
    onSaved();
  };
  const remove = async () => {
    const { ok } = await send(`/projects/${project.id}`, 'DELETE');
    if (!ok) { toast.error('Nicht gelöscht'); return; }
    onDeleted();
  };

  return (
    <Dialog
      title="Projekt bearbeiten"
      sentence={KINDS.find((k) => k.value === project.kind)?.title ?? ''}
      onClose={onClose}
      width={640}
      footer={<>
        {confirmDelete ? (
          <>
            <span className="dialog-hint">Wirklich löschen? Das lässt sich nicht zurücknehmen.</span>
            <button type="button" className="card-secondary" onClick={remove}>Löschen</button>
            <button type="button" className="card-link" onClick={() => setConfirmDelete(false)}>Doch nicht</button>
          </>
        ) : (
          <button type="button" className="card-link" onClick={() => setConfirmDelete(true)}>Löschen</button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="card-secondary" onClick={onFinish}>Projekt abschließen</button>
        <button type="button" className="card-primary" onClick={save} disabled={!name.trim()}>Speichern</button>
      </>}
    >
      <label className="project-field">
        <span>Name</span>
        <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      {project.kind === 'steps' ? (
        <>
          <StepsEditor steps={steps} onChange={setSteps} />
          <label className="project-field">
            <span>Gerade bei</span>
            <select className="card-select" value={stepAt} onChange={(e) => setPosition(e.target.value)}>
              {cleanSteps.map((s, i) => <option key={`${i}-${s}`} value={i}>{s}</option>)}
              <option value={cleanSteps.length}>Alle Schritte geschafft</option>
            </select>
          </label>
        </>
      ) : (
        <>
          <div className="project-fields">
            <label className="project-field project-field-wide">
              <span>{project.kind === 'count' ? 'Was wird gezählt?' : 'Einheit'}</span>
              <input type="text" value={unit} maxLength={30} onChange={(e) => setUnit(e.target.value)} />
            </label>
            <NumberField label={project.kind === 'count' ? 'Wie viele werden es?' : 'Ziel'} value={total} onChange={setTotal} />
            <NumberField label="Stand jetzt" value={position} onChange={setPosition} />
          </div>
          {project.kind === 'goal' && (
            <>
              <label className="card-check"><input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> Beginnt jeden Montag neu</label>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
