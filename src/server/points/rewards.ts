import { getDb } from '../db/index';
import { isActionKey, sceneOfReward, type ActionKey } from '../reward-actions';

/**
 * Punkte-Belohnungen: what viewers buy with the tool's own points, made in
 * the app. The name is what follows `!einlösen`, unique without regard to
 * case. A scene reward names one of the mapped scenes — never a free one.
 */
export interface PointReward {
  id: number;
  name: string;
  cost: number;
  action: ActionKey;
  scene_name: string | null;
  scene_seconds: number | null;
  needs_input: boolean;
  cooldown_seconds: number;
  enabled: boolean;
}

interface Row extends Omit<PointReward, 'needs_input' | 'enabled'> { needs_input: number; enabled: number }

const NAME_MAX = 40;
const COST_MAX = 1_000_000;
const COOLDOWN_MAX = 24 * 60 * 60;

const fromRow = (row: Row): PointReward => ({ ...row, needs_input: !!row.needs_input, enabled: !!row.enabled });

export function listPointRewards(): PointReward[] {
  return (getDb().prepare('SELECT id, name, cost, action, scene_name, scene_seconds, needs_input, cooldown_seconds, enabled FROM point_rewards ORDER BY cost ASC, name ASC').all() as Row[]).map(fromRow);
}

export function getPointReward(id: number): PointReward | null {
  const row = getDb().prepare('SELECT id, name, cost, action, scene_name, scene_seconds, needs_input, cooldown_seconds, enabled FROM point_rewards WHERE id = ?').get(id) as Row | undefined;
  return row ? fromRow(row) : null;
}

export function findPointReward(name: string): PointReward | null {
  const row = getDb().prepare('SELECT id, name, cost, action, scene_name, scene_seconds, needs_input, cooldown_seconds, enabled FROM point_rewards WHERE name = ? COLLATE NOCASE').get(name.trim()) as Row | undefined;
  return row ? fromRow(row) : null;
}

/** Checks the fields given; `base` is the reward being edited, if any. */
function validate(input: unknown, base: PointReward | null): Omit<PointReward, 'id'> | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'reward must be an object' };
  const body = input as Record<string, unknown>;
  const next: Omit<PointReward, 'id'> = base
    ? { name: base.name, cost: base.cost, action: base.action, scene_name: base.scene_name, scene_seconds: base.scene_seconds, needs_input: base.needs_input, cooldown_seconds: base.cooldown_seconds, enabled: base.enabled }
    : { name: '', cost: 0, action: 'alert', scene_name: null, scene_seconds: null, needs_input: false, cooldown_seconds: 0, enabled: true };

  if ('name' in body || !base) {
    if (typeof body.name !== 'string') return { error: 'name is required' };
    const name = body.name.trim().replace(/\s+/g, ' ');
    if (!name || name.length > NAME_MAX) return { error: `name must be 1 to ${NAME_MAX} characters` };
    if (name.startsWith('!')) return { error: 'name must not start with !' };
    next.name = name;
  }
  if ('cost' in body || !base) {
    if (!Number.isInteger(body.cost) || (body.cost as number) < 1 || (body.cost as number) > COST_MAX) return { error: `cost must be a whole number from 1 to ${COST_MAX}` };
    next.cost = body.cost as number;
  }
  if ('action' in body || !base) {
    if (!isActionKey(body.action)) return { error: 'unknown action' };
    next.action = body.action;
  }
  const scene = sceneOfReward(next.action, 'scene_name' in body ? body.scene_name : next.scene_name, 'scene_seconds' in body ? body.scene_seconds : next.scene_seconds);
  if ('error' in scene) return { error: scene.error };
  next.scene_name = scene.scene_name;
  next.scene_seconds = scene.scene_seconds;
  if ('needs_input' in body) {
    if (typeof body.needs_input !== 'boolean') return { error: 'needs_input must be true or false' };
    next.needs_input = body.needs_input;
  }
  if ('cooldown_seconds' in body) {
    if (!Number.isInteger(body.cooldown_seconds) || (body.cooldown_seconds as number) < 0 || (body.cooldown_seconds as number) > COOLDOWN_MAX) return { error: `cooldown_seconds must be from 0 to ${COOLDOWN_MAX}` };
    next.cooldown_seconds = body.cooldown_seconds as number;
  }
  if ('enabled' in body) {
    if (typeof body.enabled !== 'boolean') return { error: 'enabled must be true or false' };
    next.enabled = body.enabled;
  }
  const clash = findPointReward(next.name);
  if (clash && clash.id !== base?.id) return { error: 'a reward with this name exists' };
  return next;
}

export function createPointReward(input: unknown): PointReward | { error: string } {
  const r = validate(input, null);
  if ('error' in r) return r;
  const id = getDb().prepare('INSERT INTO point_rewards (name, cost, action, scene_name, scene_seconds, needs_input, cooldown_seconds, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(r.name, r.cost, r.action, r.scene_name, r.scene_seconds, r.needs_input ? 1 : 0, r.cooldown_seconds, r.enabled ? 1 : 0).lastInsertRowid;
  return getPointReward(Number(id))!;
}

/** null when there is no such reward. */
export function updatePointReward(id: number, input: unknown): PointReward | { error: string } | null {
  const base = getPointReward(id);
  if (!base) return null;
  const r = validate(input, base);
  if ('error' in r) return r;
  getDb().prepare('UPDATE point_rewards SET name = ?, cost = ?, action = ?, scene_name = ?, scene_seconds = ?, needs_input = ?, cooldown_seconds = ?, enabled = ? WHERE id = ?')
    .run(r.name, r.cost, r.action, r.scene_name, r.scene_seconds, r.needs_input ? 1 : 0, r.cooldown_seconds, r.enabled ? 1 : 0, id);
  return getPointReward(id);
}

export function deletePointReward(id: number): boolean {
  return getDb().prepare('DELETE FROM point_rewards WHERE id = ?').run(id).changes > 0;
}
