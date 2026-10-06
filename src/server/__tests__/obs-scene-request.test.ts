import { describe, it, expect } from 'vitest';
import { resolveSceneMapping } from '../obs/scene-request';

// A channel-point redemption may switch only to scenes the streamer approved
// under "Szene per Kanalpunkt" — never to an arbitrary scene a viewer names.

const mappings = [
  { reward_title: 'Kamera zeigen', scene_name: 'Camera', duration_seconds: 30 },
  { reward_title: 'Szene wechseln', scene_name: 'Zeichenbrett', duration_seconds: 60, revert_scene: 'main' },
];

describe('scene by channel point', () => {
  it('switches to the scene a mapped reward names, whatever the viewer typed', () => {
    expect(resolveSceneMapping(mappings, 'Kamera zeigen', 'scene_change', 'Desktop')?.scene_name).toBe('Camera');
    expect(resolveSceneMapping(mappings, 'Kamera zeigen (10 s)', 'Kamera zeigen (10 s)', null)?.scene_name).toBe('Camera');
  });

  it('lets a "Szene" reward name an approved scene, case-insensitively', () => {
    const picked = resolveSceneMapping([{ reward_title: 'Spezial', scene_name: 'Camera' }], 'Szene wählen', 'scene_change', ' camera ');
    expect(picked?.scene_name).toBe('Camera');
  });

  it('never switches to a scene nobody approved', () => {
    expect(resolveSceneMapping(mappings, 'Szene wählen', 'scene_change', 'Desktop')).toBeNull();
    expect(resolveSceneMapping(mappings, 'Szene wählen', 'scene_change', '')).toBeNull();
    expect(resolveSceneMapping([], 'Szene wählen', 'scene_change', 'Camera')).toBeNull();
  });

  it('ignores viewer text on rewards that are not about scenes', () => {
    expect(resolveSceneMapping(mappings, 'Roulette', 'roulette', 'Camera')).toBeNull();
  });
});
