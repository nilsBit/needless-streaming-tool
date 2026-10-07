import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const SERVER = path.join(__dirname, '..');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('where the built-in overlays come from', () => {
  /**
   * The packaged app keeps them in resources/overlays. Five places built the
   * path from the working directory instead, so the installed tool answered
   * every overlay with 404 (found 2026-10-07, before sending it to a second PC).
   * paths.ts is the one place that knows both.
   */
  it('asks paths.ts instead of building src/overlays from the working directory', () => {
    const offenders = sources(SERVER)
      .filter((file) => path.basename(file) !== 'paths.ts')
      .filter((file) => /process\.cwd\(\)\s*,\s*'src'\s*,\s*'overlays'/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SERVER, file));

    expect(offenders).toEqual([]);
  });
});
