import React, { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useNavigate } from '../NavigationContext';

// "Nach dem Stream" (canvas "A überarbeitet · mehr als Twitch", 09.10.): one
// stream at a time — the numbers next to the five streams before, the parts
// of the stream by what ran, what stood out, who was here, what was used.
// Everything is counted by the tool while live; nothing is guessed.

interface StreamItem { id: number; started_at: string; minutes: number; live: boolean }
interface Kpi { key: string; label: string; value: number | null; mean: number | null }
interface Part { from: number; to: number; minutes: number; label: string; rate: number; chatters: number; follows: number; moments: number; note: string }
interface Insight { kind: string; big: string; text: string; tone: 'busy' | 'join' | 'follow' | 'quiet' }
interface Report {
  id: number; started_at: string; minutes: number; live: boolean;
  kpis: Kpi[]; average_rate: number; busiest: { label: string; ratio: number } | null;
  parts: Part[]; insights: Insight[];
  people: { total: number; known: number | null; fresh: string[]; fresh_more: number; missing: string[] | null; follows: number; follows_chatted: number };
  used: Array<{ name: string; count: number; people: number; kind: 'command' | 'reward' }>;
  unused: string[] | null;
}

const LIVE_REFRESH_MS = 60_000;
const GHOST_KPIS = ['Zuschauer im Schnitt', 'Höchstens gleichzeitig', 'Neue Follower', 'Aktive Chatter', 'Nachrichten', 'Belohnungen eingelöst'];
const comma = (n: number) => String(n).replace('.', ',');
const clock = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;
const duration = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} h`;
const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });

export default function StreamReportPanel() {
  const { data: streams, loading } = useApi<StreamItem[]>('/streams');
  const [picked, setPicked] = useState<number | null>(null);
  if (loading && !streams) return <div className="panel"><p className="empty">Laden …</p></div>;
  if (!streams || streams.length === 0) {
    // No stream yet: a note with the one next step, and the page as it will look, greyed out.
    return (
      <div className="panel report">
        <section className="report-empty">
          <div className="report-empty-text">
            <strong>Ab deinem nächsten Stream steht hier die Auswertung</strong>
            <span>Das Tool schreibt mit, solange du live bist: was lief, wie viel im Chat los war, wer neu dazukam. Danach füllt sich diese Seite – so wie unten.</span>
          </div>
          <NextStep />
        </section>
        <div className="report-ghost" aria-hidden="true">
          <section className="report-kpis">
            {GHOST_KPIS.map((label) => (
              <div key={label} className="report-kpi">
                <span className="report-muted">{label}</span>
                <span className="report-kpi-value">–</span>
                <span className="report-ghost-line short" />
              </div>
            ))}
          </section>
          <section className="report-card">
            <h3>Ablauf des Streams</h3>
            <div className="report-parts">
              {[70, 45, 60].map((w) => (
                <div key={w} className="report-part">
                  <span className="report-ghost-line" /><span className="report-ghost-line" style={{ width: `${w}%` }} /><span className="report-ghost-line thin" />
                  <span /><span /><span />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }
  const id = picked ?? streams[0].id;
  return <ReportView key={id} id={id} streams={streams} onPick={setPicked} />;
}

/** What is still missing before the first report: Twitch, then OBS. */
function NextStep() {
  const go = useNavigate();
  const { data: bot, refetch: refetchBot } = useApi<{ connected: boolean }>('/settings/bot-status');
  const { data: obs, refetch: refetchObs } = useApi<{ connected: boolean }>('/obs/status');
  useWebSocket((event) => {
    if (event === 'bot-status') refetchBot();
    if (event === 'obs-status') refetchObs();
  });
  if (!bot || !obs) return null;
  // All connected: nothing to do here — going live happens in OBS and on Twitch.
  if (bot.connected && obs.connected) return null;
  const label = bot.connected ? 'OBS verbinden' : 'Twitch verbinden';
  return (
    <button type="button" className="card-primary report-empty-next" onClick={() => go({ area: 'settings', subTab: 'verbindungen' })}>{label}</button>
  );
}

function ReportView({ id, streams, onPick }: { id: number; streams: StreamItem[]; onPick: (id: number) => void }) {
  const { data: r, refetch } = useApi<Report>(`/streams/${id}`);
  // A stream that still runs fills up; the page follows once a minute.
  useEffect(() => {
    if (!r?.live) return;
    const timer = setInterval(() => void refetch(), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [r?.live, refetch]);
  if (!r) return <div className="panel"><p className="empty">Laden …</p></div>;

  const maxRate = Math.max(1, ...r.parts.map((p) => p.rate));
  const busiest = r.parts.reduce<Part | null>((a, p) => (!a || p.rate > a.rate ? p : a), null);
  const isLatest = streams[0].id === r.id;

  return (
    <div className="panel report">
      <header className="report-head">
        <p className="report-when">
          {r.live ? 'Läuft gerade: ' : isLatest ? 'Letzter Stream: ' : 'Stream: '}
          {day(r.started_at)} · {duration(r.minutes)}
        </p>
        {streams.length > 1 && (
          <label className="report-pick">
            <span>Anderer Stream</span>
            <select value={r.id} onChange={(e) => onPick(Number(e.target.value))}>
              {streams.map((s) => <option key={s.id} value={s.id}>{day(s.started_at)} · {duration(s.minutes)}{s.live ? ' · läuft' : ''}</option>)}
            </select>
          </label>
        )}
      </header>

      <p className="report-sentence">
        Twitch zählt, wer da war. Hier steht, was den Chat bewegt hat
        {r.busiest
          ? <>: <strong>{r.busiest.label}</strong> ({comma(r.busiest.ratio)}-mal so viele Nachrichten pro Minute wie im Schnitt).</>
          : '. Für einen Vergleich braucht es mehr als einen Teil im Stream.'}
      </p>

      <section className="report-kpis" aria-label="Zahlen">
        {r.kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
      </section>

      <section className="report-card">
        <div className="report-card-head">
          <h3>Ablauf des Streams</h3>
          <span>Schnitt über den ganzen Stream: {comma(r.average_rate)} Nachrichten pro Minute</span>
        </div>
        <div className="report-parts" role="table" aria-label="Ablauf des Streams">
          <div className="report-part report-part-head" role="row">
            <span role="columnheader">Zeit</span><span role="columnheader">Was lief</span><span role="columnheader">Nachrichten pro Minute</span>
            <span role="columnheader">Chatter</span><span role="columnheader">Follows</span><span role="columnheader">Momente</span>
          </div>
          {r.parts.map((p) => (
            <div key={p.from} className={`report-part${p === busiest && r.parts.length > 1 ? ' busiest' : ''}`} role="row">
              <span role="cell" className="report-time"><strong>{clock(p.from)}–{clock(p.to)}</strong><small>{p.minutes} min</small></span>
              <span role="cell" className="report-what"><strong>{p.label}</strong>{p.note && <small>{p.note}</small>}</span>
              <span role="cell" className="report-rate">
                <span className="report-bar"><span className={p.rate > r.average_rate ? 'above' : ''} style={{ width: `${Math.round((p.rate / maxRate) * 100)}%` }} /></span>
                <strong>{comma(p.rate)}</strong>
              </span>
              <span role="cell" className="report-count"><small>Chatter</small>{p.chatters}</span>
              <span role="cell" className="report-count"><small>Follows</small>{p.follows}</span>
              <span role="cell" className="report-count"><small>Momente</small>{p.moments}</span>
            </div>
          ))}
        </div>
      </section>

      {r.insights.length > 0 && (
        <section className="report-insights" aria-label="Was funktioniert hat">
          {r.insights.map((i) => (
            <div key={i.tone} className={`report-insight ${i.tone}`}>
              <span className="report-kicker">{i.kind}</span>
              <span className="report-big">{i.big}</span>
              <span>{i.text}</span>
            </div>
          ))}
        </section>
      )}

      <div className="report-pair">
        <section className="report-card">
          <h3>Deine Leute</h3>
          {r.people.total === 0 ? <p className="report-muted">Niemand hat geschrieben.</p> : (
            <>
              <p className="report-lead">
                {r.people.known === null ? `${r.people.total} ${r.people.total === 1 ? 'Person hat' : 'Leute haben'} geschrieben – der erste Stream, den das Tool auswertet.` : `${r.people.known} von ${r.people.total} im Chat kennst du schon.`}
              </p>
              <ul className="report-people">
                {r.people.known !== null && r.people.fresh.length > 0 && (
                  <li><strong className="fresh">Zum ersten Mal da:</strong> {r.people.fresh.join(', ')}{r.people.fresh_more > 0 ? ` und ${r.people.fresh_more} weitere` : ''}</li>
                )}
                {r.people.missing && r.people.missing.length > 0 && (
                  <li><strong className="missing">Sonst immer da, heute nicht:</strong> {r.people.missing.join(', ')}</li>
                )}
                {r.people.follows > 0 && (
                  <li><strong className="follow">Neue Follower, die auch geschrieben haben:</strong> {r.people.follows_chatted} von {r.people.follows}</li>
                )}
              </ul>
            </>
          )}
        </section>
        <section className="report-card">
          <h3>Was genutzt wurde</h3>
          {r.used.length === 0 ? <p className="report-muted">Keine Befehle und keine Belohnungen.</p> : (
            <div className="report-used">
              {r.used.map((u) => (
                <div key={`${u.kind}:${u.name}`}>
                  <div className="report-used-row"><span>{u.name}</span><span className="report-muted">{u.count}× · {u.people === 1 ? '1 Person' : `${u.people} Leute`}</span></div>
                  <span className="report-bar"><span className="above" style={{ width: `${Math.round((u.count / r.used[0].count) * 100)}%` }} /></span>
                </div>
              ))}
            </div>
          )}
          {r.unused && r.unused.length > 0 && <p className="report-muted">Seit 5 Streams nicht genutzt: {r.unused.join(', ')}</p>}
        </section>
      </div>
    </div>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const d = kpi.value !== null && kpi.mean !== null ? kpi.value - kpi.mean : null;
  return (
    <div className="report-kpi">
      <span className="report-muted">{kpi.label}</span>
      <span className="report-kpi-value">{kpi.value ?? '–'}</span>
      {d !== null && <span className={`report-pill ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>{d > 0 ? `+${d} zum Schnitt` : d < 0 ? `${d} zum Schnitt` : 'wie sonst'}</span>}
      <small className="report-muted">
        {kpi.value === null ? 'Twitch hat keine Zahl geliefert.' : kpi.mean === null ? 'Noch kein Stream davor zum Vergleich.' : `Schnitt der Streams davor: ${kpi.mean}`}
      </small>
    </div>
  );
}
