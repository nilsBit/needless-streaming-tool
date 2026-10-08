// Colours and fonts as they are being chosen, before they are saved (08.10.:
// "das direkt in dem fenster links sehen"). Whoever edits the palette sends
// it here; every overlay preview passes it on to its frame. The last one is
// kept, so a preview that loads later starts from it.

export interface PaletteConfig { global: Record<string, string>; overrides: Record<string, Record<string, string>> }

const EVENT = 'nst-palette-preview';
let last: PaletteConfig | null = null;

export function sendPreview(config: PaletteConfig): void {
  last = config;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: config }));
}

/** A saved config is the new starting point, without telling every preview again. */
export function rememberPreview(config: PaletteConfig): void {
  last = config;
}

export function lastPreview(): PaletteConfig | null {
  return last;
}

export function onPreview(fn: (config: PaletteConfig) => void): () => void {
  const on = (e: Event) => fn((e as CustomEvent<PaletteConfig>).detail);
  window.addEventListener(EVENT, on);
  return () => window.removeEventListener(EVENT, on);
}
