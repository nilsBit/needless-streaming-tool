/** Whether a file's first bytes match the sound format its name claims — MP3, WAV or OGG. */
export function looksLikeSound(bytes: Buffer, name: string): boolean {
  if (bytes.length < 12) return false;
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  const ascii = (from: number, to: number) => bytes.toString('latin1', from, to);
  if (ext === '.mp3') return ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (ext === '.wav') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
  if (ext === '.ogg') return ascii(0, 4) === 'OggS';
  return false;
}
