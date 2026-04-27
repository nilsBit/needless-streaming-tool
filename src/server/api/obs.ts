import { Router } from 'express';
import {
  getObsConfig,
  saveObsConfig,
  getObsStatus,
  connectObs,
  disconnectObs,
  changeScene,
  getScenes,
  getCurrentScene,
  getSceneMappings,
  saveSceneMappings,
} from '../obs/index';

const router = Router();

// OBS connection config
router.get('/config', (_req, res) => {
  const config = getObsConfig();
  if (!config) {
    res.json({ configured: false });
    return;
  }
  res.json({
    configured: true,
    host: config.host,
    port: config.port,
    has_password: !!config.password,
  });
});

router.post('/config', (req, res) => {
  const { host, port, password } = req.body;
  if (!host || !port) {
    res.status(400).json({ error: 'host and port required' });
    return;
  }
  saveObsConfig({ host, port: Number(port), password: password || '' });
  res.json({ success: true });
});

// Connection management
router.get('/status', (_req, res) => {
  res.json(getObsStatus());
});

router.post('/connect', async (_req, res) => {
  try {
    const success = await connectObs();
    res.json({ connected: success });
  } catch (err) {
    res.status(500).json({ error: 'OBS connection failed', details: String(err) });
  }
});

router.post('/disconnect', async (_req, res) => {
  try {
    await disconnectObs();
    res.json({ connected: false });
  } catch (err) {
    res.status(500).json({ error: 'OBS disconnect failed', details: String(err) });
  }
});

// Scene management
router.get('/scenes', async (_req, res) => {
  try {
    const scenes = await getScenes();
    const current = await getCurrentScene();
    res.json({ scenes, current });
  } catch {
    res.status(503).json({ error: 'OBS not connected or unreachable' });
  }
});

router.post('/scene', async (req, res) => {
  const { scene } = req.body;
  if (!scene) {
    res.status(400).json({ error: 'scene name required' });
    return;
  }
  try {
    const result = await changeScene(scene);
    if (result.success) {
      res.json({ success: true, scene });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch {
    res.status(503).json({ error: 'OBS not connected or unreachable' });
  }
});

// Scene-Reward Mappings
router.get('/mappings', (_req, res) => {
  res.json(getSceneMappings());
});

router.post('/mappings', (req, res) => {
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    res.status(400).json({ error: 'mappings must be an array of { reward_title, scene_name }' });
    return;
  }
  for (const m of mappings) {
    if (!m.reward_title || !m.scene_name) {
      res.status(400).json({ error: 'Each mapping needs reward_title and scene_name' });
      return;
    }
  }
  saveSceneMappings(mappings);
  res.json({ success: true, count: mappings.length });
});

export default router;
