import { Router } from 'express';
import { getBotConfig, saveBotConfig } from '../bot/config';
import { connectBot, disconnectBot, getBotStatus } from '../bot/index';
import { BotConfig } from '../../shared/types';
import { getFixedToken } from '../auth-token';
import { getDb } from '../db/index';
import path from 'path';
import fs from 'fs';
import { DEFAULT_HOTKEYS } from '../../shared/types';
import { listDatabases, listPages, createDatabase, healDatabase, checkDatabase } from './notion-sync';
import { getSyncStatus, syncToRemoteManual, readSyncConfig, writeSyncConfig } from '../sync';

const router = Router();

router.get('/twitch', (_req, res) => {
  const config = getBotConfig();
  if (!config) {
    res.json({ configured: false });
    return;
  }
  res.json({
    configured: true,
    channel: config.channel,
    username: config.username,
    has_token: !!config.oauth_token,
  });
});

router.post('/twitch', (req, res) => {
  const { channel, username, oauth_token } = req.body as BotConfig;
  if (!channel || !username || !oauth_token) {
    res.status(400).json({ error: 'channel, username and oauth_token required' });
    return;
  }
  saveBotConfig({ channel, username, oauth_token });
  res.json({ success: true });
});

router.get('/bot-status', (_req, res) => {
  res.json(getBotStatus());
});

router.post('/bot/connect', async (_req, res) => {
  try {
    const success = await connectBot();
    res.json({ connected: success });
  } catch (err) {
    res.status(500).json({ error: 'Bot connection failed', details: String(err) });
  }
});

router.post('/bot/disconnect', async (_req, res) => {
  try {
    await disconnectBot();
    res.json({ connected: false });
  } catch (err) {
    res.status(500).json({ error: 'Bot disconnect failed', details: String(err) });
  }
});

// Notion token
router.get('/notion', (_req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_token') as { value: string } | undefined;
  res.json({ configured: !!row?.value, preview: row?.value ? row.value.substring(0, 8) + '...' : null });
});

router.post('/notion', (req, res) => {
  const { token } = req.body;
  if (token === undefined) { res.status(400).json({ error: 'token required' }); return; }
  if (token) {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notion_token', token);
  } else {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run('notion_token');
  }
  res.json({ success: true });
});

// Notion Clips Database ID
router.get('/notion/database', (_req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_clips_db') as { value: string } | undefined;
  res.json({ configured: !!row?.value, database_id: row?.value || null });
});

router.post('/notion/database', (req, res) => {
  const { database_id } = req.body;
  if (database_id === undefined) { res.status(400).json({ error: 'database_id required' }); return; }
  if (database_id) {
    // Clean up: accept full Notion URLs or just the ID
    const cleanId = database_id.replace(/[-]/g, '').replace(/.*\/([a-f0-9]{32}).*/, '$1');
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notion_clips_db', cleanId);
    const existingAutoSync = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_auto_sync') as { value: string } | undefined;
    if (!existingAutoSync) {
      getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('notion_auto_sync', 'true');
    }
  } else {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run('notion_clips_db');
  }
  res.json({ success: true });
});

router.get('/notion/databases', async (_req, res) => {
  try {
    const dbs = await listDatabases();
    res.json(dbs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'no_token' || msg === 'token_invalid') {
      res.status(401).json({ error: msg });
    } else {
      res.status(502).json({ error: 'notion_error', details: msg });
    }
  }
});

router.get('/notion/pages', async (_req, res) => {
  try {
    const pages = await listPages();
    res.json(pages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'no_token' || msg === 'token_invalid') {
      res.status(401).json({ error: msg });
    } else {
      res.status(502).json({ error: 'notion_error', details: msg });
    }
  }
});

router.post('/notion/database/create', async (req, res) => {
  const { parent_page_id, title } = req.body as { parent_page_id?: string; title?: string };
  if (!parent_page_id) { res.status(400).json({ error: 'parent_page_id required' }); return; }
  try {
    const created = await createDatabase(parent_page_id, (title && title.trim()) || 'Stream Clips');
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notion_clips_db', created.id);
    // Auto-Sync-Default on first configuration
    const existingAutoSync = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_auto_sync') as { value: string } | undefined;
    if (!existingAutoSync) {
      getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('notion_auto_sync', 'true');
    }
    res.json(created);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'no_parent_access') res.status(403).json({ error: msg });
    else if (msg === 'token_invalid' || msg === 'no_token') res.status(401).json({ error: msg });
    else res.status(502).json({ error: 'notion_error', details: msg });
  }
});

router.post('/notion/database/heal', async (req, res) => {
  const { database_id } = req.body as { database_id?: string };
  if (!database_id) { res.status(400).json({ error: 'database_id required' }); return; }
  try {
    const result = await healDatabase(database_id);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'db_gone') res.status(404).json({ error: msg });
    else if (msg === 'token_invalid' || msg === 'no_token') res.status(401).json({ error: msg });
    else res.status(502).json({ error: 'notion_error', details: msg });
  }
});

router.get('/notion/database/check', async (_req, res) => {
  const result = await checkDatabase();
  res.json(result);
});

// Onboarding
router.get('/onboarding', (_req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('onboarding_completed') as { value: string } | undefined;
  res.json({ completed: row?.value === 'true' });
});

router.post('/onboarding', (req, res) => {
  const { completed } = req.body;
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('onboarding_completed', completed ? 'true' : 'false');
  res.json({ success: true });
});

// Install Stream Deck plugin
router.post('/streamdeck/install', async (_req, res) => {
  try {
    const { shell } = require('electron');
    // Check both dev and production paths
    let pluginPath = path.join(process.cwd(), 'assets', 'com.nst.deck.streamDeckPlugin');
    if (!fs.existsSync(pluginPath)) {
      // Production: check resources dir
      try {
        const { app } = require('electron');
        pluginPath = path.join(process.resourcesPath || app.getAppPath(), 'assets', 'com.nst.deck.streamDeckPlugin');
      } catch {}
    }
    if (!fs.existsSync(pluginPath)) {
      res.status(404).json({ error: 'Plugin file not found' });
      return;
    }
    await shell.openPath(pluginPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to open plugin', details: String(err) });
  }
});

// Fixed API token for Stream Deck
router.get('/api-token', (_req, res) => {
  const token = getFixedToken();
  res.json({ token: token || null });
});

// Hotkeys config
router.get('/hotkeys', (_req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('hotkeys') as { value: string } | undefined;
  if (row?.value) {
    try {
      res.json(JSON.parse(row.value));
    } catch {
      res.json(DEFAULT_HOTKEYS);
    }
  } else {
    res.json(DEFAULT_HOTKEYS);
  }
});

router.post('/hotkeys', (req, res) => {
  const config = req.body;
  if (!config || typeof config !== 'object') {
    res.status(400).json({ error: 'hotkey config object required' });
    return;
  }
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('hotkeys', JSON.stringify(config));
  res.json({ success: true });
});

// Autostart
router.get('/autostart', (_req, res) => {
  try {
    const { app } = require('electron');
    const settings = app.getLoginItemSettings();
    res.json({ enabled: settings.openAtLogin });
  } catch {
    res.json({ enabled: false });
  }
});

router.post('/autostart', (req, res) => {
  const { enabled } = req.body;
  try {
    const { app } = require('electron');
    app.setLoginItemSettings({ openAtLogin: !!enabled });
    res.json({ success: true, enabled: !!enabled });
  } catch (err) {
    res.status(500).json({ error: 'Autostart nicht verfügbar', details: String(err) });
  }
});

// Generic key/value endpoints for arbitrary settings
router.get('/get/:key', (req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(req.params.key) as { value: string } | undefined;
  res.json({ value: row?.value ?? null });
});

router.post('/set', (req, res) => {
  const { key, value } = req.body as { key?: string; value?: string };
  if (!key) { res.status(400).json({ error: 'key required' }); return; }
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value ?? ''));
  res.json({ success: true });
});

router.post('/batch', (req, res) => {
  const settings = req.body as Record<string, string>;
  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'object of key/value pairs required' });
    return;
  }
  const db = getDb();
  for (const [key, value] of Object.entries(settings)) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  }
  res.json({ success: true });
});

// Custom command names
router.get('/commands', (_req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('custom_commands') as { value: string } | undefined;
  const defaults: Record<string, string> = {
    challenge: '!challenge', issues: '!issues', song: '!song', hype: '!hype',
    uptime: '!uptime', design: '!design', todo: '!todo', progress: '!progress',
    scene: '!scene', vote: '!vote',
  };
  let custom: Record<string, string> = {};
  if (row?.value) { try { custom = JSON.parse(row.value); } catch {} }
  res.json({ ...defaults, ...custom });
});

router.post('/commands', (req, res) => {
  const commands = req.body as Record<string, string>;
  if (!commands || typeof commands !== 'object') { res.status(400).json({ error: 'Invalid data' }); return; }
  // Ensure all values start with !
  const cleaned: Record<string, string> = {};
  for (const [key, val] of Object.entries(commands)) {
    if (typeof val === 'string' && val.trim()) {
      cleaned[key] = val.startsWith('!') ? val.toLowerCase() : `!${val.toLowerCase()}`;
    }
  }
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('custom_commands', JSON.stringify(cleaned));
  res.json({ success: true });
});

// Cloud Sync
router.get('/sync/status', (_req, res) => {
  res.json(getSyncStatus());
});

router.post('/sync/trigger', async (_req, res) => {
  const result = await syncToRemoteManual();
  res.json(result);
});

router.get('/sync/config', (_req, res) => {
  const config = readSyncConfig();
  res.json(config || { enabled: false, syncPath: '' });
});

router.post('/sync/config', (req, res) => {
  const { enabled, syncPath } = req.body as { enabled?: boolean; syncPath?: string };
  writeSyncConfig({ enabled: !!enabled, syncPath: syncPath || '' });
  res.json({ success: true });
});

export default router;
