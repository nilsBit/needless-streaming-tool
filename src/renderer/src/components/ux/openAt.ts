import { useEffect } from 'react';

// Opening a page at one thing in it (08.10.: an overlay's "Inhalt einstellen"
// and "Aussehen ändern"). The page may mount after the request, so the
// request waits until a page of its kind picks it up.

const pending = new Map<string, string>();

export function openAt(kind: string, value: string): void {
  pending.set(kind, value);
  window.dispatchEvent(new CustomEvent(`nst-open-at-${kind}`, { detail: value }));
}

export function useOpenAt(kind: string, open: (value: string) => void): void {
  useEffect(() => {
    const waiting = pending.get(kind);
    if (waiting !== undefined) { pending.delete(kind); open(waiting); }
    const on = (e: Event) => { pending.delete(kind); open((e as CustomEvent<string>).detail); };
    window.addEventListener(`nst-open-at-${kind}`, on);
    return () => window.removeEventListener(`nst-open-at-${kind}`, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Scrolls to an element once it is there and lights it up for a moment. */
export function lightUp(find: () => Element | null, tries = 20): void {
  const el = find();
  if (!el) { if (tries > 0) setTimeout(() => lightUp(find, tries - 1), 100); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('quest-spot');
  setTimeout(() => el.classList.remove('quest-spot'), 3500);
}
