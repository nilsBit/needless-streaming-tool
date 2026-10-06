import { describe, it, expect } from 'vitest';
import { isReleaseTag, isReleaseUrl } from '../../main/release-url';

// The update check hands the renderer only a release page of this repository.
describe('release data from GitHub', () => {
  it('accepts a release page of this repository and a plain version tag', () => {
    expect(isReleaseUrl('https://github.com/nilsBit/needless-streaming-tool/releases/tag/v0.2.0')).toBe(true);
    expect(isReleaseTag('v0.2.0')).toBe(true);
    expect(isReleaseTag('1.2.3-beta.1')).toBe(true);
  });

  it('refuses everything else', () => {
    expect(isReleaseUrl('https://github.com/someone-else/tool/releases/tag/v9')).toBe(false);
    expect(isReleaseUrl('http://github.com/nilsBit/needless-streaming-tool/releases/tag/v1')).toBe(false);
    expect(isReleaseUrl('https://evil.example/github.com/nilsBit/needless-streaming-tool/releases/')).toBe(false);
    expect(isReleaseUrl(42)).toBe(false);
    expect(isReleaseTag('<script>')).toBe(false);
  });
});
