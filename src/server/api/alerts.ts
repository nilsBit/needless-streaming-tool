import express, { Router } from 'express';
import { looksLikeSound } from '../sound-sniff';
import fs from 'fs';
import path from 'path';
import { broadcast } from '../websocket/index';
import {
  ALERT_SLOTS,
  ALERT_SOUND_DIR,
  MAX_LABEL,
  MAX_TEXT,
  deleteSound,
  getAlertSettings,
  isAlertSlot,
  listSounds,
  sampleAlert,
  saveAlertSettings,
  uploadName,
} from '../bot/alerts';

/**
 * The streamer's own wording and sounds for the Alerts overlay
 * (Settings → Features → Alerts).
 */
const router = Router();

/** A notification sound, not a song. */
const MAX_SOUND_BYTES = 5 * 1024 * 1024;

function overview() {
  const settings = getAlertSettings();
  return {
    alerts: Object.entries(ALERT_SLOTS).map(([slot, info]) => ({
      slot,
      name: info.name,
      placeholders: Object.keys(info.placeholders),
      defaults: { label: info.label, text: info.text },
      ...settings[slot as keyof typeof settings],
    })),
    sounds: listSounds(),
    limits: { label: MAX_LABEL, text: MAX_TEXT, soundBytes: MAX_SOUND_BYTES },
  };
}

router.get('/', (_req, res) => {
  res.json(overview());
});

router.post('/', (req, res) => {
  try {
    saveAlertSettings(req.body);
    res.json(overview());
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// The file itself is the body; its name rides in the query. Audio never comes
// as JSON, so the global parser leaves this body alone.
router.post('/sounds', express.raw({ type: () => true, limit: MAX_SOUND_BYTES }), (req, res) => {
  const name = uploadName(req.query.name);
  if (!name) {
    res.status(400).json({ error: 'name must be a file name ending in .mp3, .wav or .ogg' });
    return;
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({ error: 'sound file required as the request body' });
    return;
  }
  if (!looksLikeSound(req.body, name)) {
    res.status(400).json({ error: 'the file is not an MP3, WAV or OGG sound' });
    return;
  }
  fs.mkdirSync(ALERT_SOUND_DIR, { recursive: true });
  fs.writeFileSync(path.join(ALERT_SOUND_DIR, name), req.body);
  res.json({ name, ...overview() });
});

router.delete('/sounds/:name', (req, res) => {
  if (!deleteSound(req.params.name)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(overview());
});

// One alert as a viewer would cause it, made-up name and all — visible in the stream.
router.post('/test/:slot', (req, res) => {
  const slot = req.params.slot;
  if (!isAlertSlot(slot)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const alert = sampleAlert(slot);
  broadcast('alert', alert);
  res.json({ sent: alert });
});

export default router;
