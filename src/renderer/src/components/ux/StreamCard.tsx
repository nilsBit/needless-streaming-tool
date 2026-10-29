import React from 'react';

/**
 * Where a card's overlay stands in OBS: in the scene on now, in another scene
 * (`where` names them), or in no scene at all. `null`: OBS is out of reach.
 */
export type SceneState = { state: 'on' } | { state: 'elsewhere'; where: string[] } | { state: 'none' } | null;

interface Props {
  title: string;
  sentence: string;
  /** What chat types for this card, as the streamer named it: "!vote <Nummer>". */
  commands?: string[];
  scene: SceneState;
  /** "In OBS anlegen" for an overlay that sits in no scene. */
  onPlace?: () => void;
  children: React.ReactNode;
}

// One card on "Im Stream": name, one sentence, whether its overlay is in the
// current OBS scene (09.10.: green and first, so what is live stands out),
// then the panel that does the work.
export default function StreamCard({ title, sentence, commands = [], scene, onPlace, children }: Props) {
  const state = scene?.state ?? null;
  return (
    <section className={`stream-card ${state === 'on' ? 'on-screen' : ''}`} aria-label={title}>
      <div className="stream-card-head">
        <h2>{title}</h2>
        {state && (
          <span className={`stream-chip ${state}`}>
            <span className="stream-chip-dot" aria-hidden="true" />
            {state === 'on' ? 'In der Szene' : state === 'none' ? 'Nicht in OBS' : 'Nicht in der Szene'}
          </span>
        )}
      </div>
      <p className="stream-card-sentence">{sentence}</p>
      <ChatCommands commands={commands} />
      {scene?.state === 'elsewhere' && <p className="stream-card-where">Liegt in {scene.where.map((w) => `„${w}“`).join(', ')}</p>}
      {scene?.state === 'none' && onPlace && <button type="button" className="card-link stream-card-where" onClick={onPlace}>In OBS anlegen</button>}
      <div className="stream-card-body">{children}</div>
    </section>
  );
}

// 29.10.: "Im Chat" on every card — the commands were only in "Chat & Bot",
// so in the stream nobody knew what to tell chat.
export function ChatCommands({ commands }: { commands: string[] }) {
  if (commands.length === 0) return null;
  return (
    <p className="stream-card-commands">
      <span>Im Chat</span>
      {commands.map((command) => <code key={command}>{command}</code>)}
    </p>
  );
}
