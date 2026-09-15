/** Case, accents, ß and quote marks never decide whether two names are the same. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[„“”"'‚‘’«»]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
