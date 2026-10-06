/**
 * CSV cells the way a spreadsheet will not misread them: every cell quoted
 * (RFC 4180), inner quotes doubled, line breaks flattened, and a leading
 * = + - @ or tab disarmed with an apostrophe so a title from a GitHub issue or
 * a note from chat never becomes a formula in Excel or Numbers.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  text = text.replace(/[\r\n]+/g, ' ');
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(',');
}
