import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

function getOverrideDir(): string {
  try {
    const electron = require('electron');
    const electronApp = electron?.app;
    if (electronApp?.isPackaged) {
      return path.join(electronApp.getPath('userData'), 'overlay-overrides');
    }
  } catch {}
  return path.join(process.cwd(), 'data', 'overlay-overrides');
}

function getBuiltinDir(): string {
  return path.join(process.cwd(), 'src', 'overlays');
}

function getCustomOverlayDir(): string {
  try {
    const electron = require('electron');
    const electronApp = electron?.app;
    if (electronApp?.isPackaged) {
      return path.join(electronApp.getPath('userData'), 'custom-overlays');
    }
  } catch {}
  return path.join(process.cwd(), 'data', 'custom-overlays');
}

function ensureDir() {
  const dir = getCustomOverlayDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// List all custom overlays
router.get('/', (_req, res) => {
  const dir = ensureDir();
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const overlays = entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const indexPath = path.join(dir, e.name, 'index.html');
        const exists = fs.existsSync(indexPath);
        return {
          name: e.name,
          hasIndex: exists,
          url: `http://localhost:4000/overlay/custom/${e.name}/index.html`,
        };
      });
    res.json(overlays);
  } catch {
    res.json([]);
  }
});

// Get builtin overlays list (with override status)
router.get('/builtin', (_req, res) => {
  const builtinPath = getBuiltinDir();
  const overrideDir = getOverrideDir();
  try {
    const entries = fs.readdirSync(builtinPath, { withFileTypes: true });
    const overlays = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => {
        const overridePath = path.join(overrideDir, e.name, 'index.html');
        return {
          name: e.name,
          url: `http://localhost:4000/overlay/${e.name}/index.html`,
          builtin: true,
          customized: fs.existsSync(overridePath),
        };
      });
    res.json(overlays);
  } catch {
    res.json([]);
  }
});

// Get builtin overlay source (current = override if exists, otherwise original)
router.get('/builtin/:name/source', (req, res) => {
  const name = req.params.name;
  const overridePath = path.join(getOverrideDir(), name, 'index.html');
  const builtinPath = path.join(getBuiltinDir(), name, 'index.html');

  const filePath = fs.existsSync(overridePath) ? overridePath : builtinPath;
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Overlay not found' });
    return;
  }

  const html = fs.readFileSync(filePath, 'utf-8');
  res.json({ name, html, customized: fs.existsSync(overridePath) });
});

// Get builtin overlay DEFAULT source (always the original)
router.get('/builtin/:name/default', (req, res) => {
  const name = req.params.name;
  const builtinPath = path.join(getBuiltinDir(), name, 'index.html');

  if (!fs.existsSync(builtinPath)) {
    res.status(404).json({ error: 'Overlay not found' });
    return;
  }

  const html = fs.readFileSync(builtinPath, 'utf-8');
  res.json({ name, html });
});

// Override a builtin overlay with custom HTML
router.put('/builtin/:name', (req, res) => {
  const { html } = req.body;
  const name = req.params.name;

  if (!html) {
    res.status(400).json({ error: 'html required' });
    return;
  }

  // Verify it's a real builtin overlay
  const builtinPath = path.join(getBuiltinDir(), name, 'index.html');
  if (!fs.existsSync(builtinPath)) {
    res.status(404).json({ error: 'Builtin overlay not found' });
    return;
  }

  const overrideDir = path.join(getOverrideDir(), name);
  if (!fs.existsSync(overrideDir)) {
    fs.mkdirSync(overrideDir, { recursive: true });
  }

  fs.writeFileSync(path.join(overrideDir, 'index.html'), html, 'utf-8');
  res.json({ success: true, customized: true });
});

// Reset a builtin overlay to default
router.delete('/builtin/:name/override', (req, res) => {
  const name = req.params.name;
  const overrideDir = path.join(getOverrideDir(), name);

  if (fs.existsSync(overrideDir)) {
    fs.rmSync(overrideDir, { recursive: true });
  }

  res.json({ success: true, customized: false });
});

// Create new custom overlay from uploaded HTML
router.post('/', (req, res) => {
  const { name, html } = req.body;
  if (!name || !html) {
    res.status(400).json({ error: 'name and html required' });
    return;
  }

  // Sanitize folder name
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  if (!safeName) {
    res.status(400).json({ error: 'Invalid overlay name' });
    return;
  }

  const dir = ensureDir();
  const overlayDir = path.join(dir, safeName);

  if (!fs.existsSync(overlayDir)) {
    fs.mkdirSync(overlayDir, { recursive: true });
  }

  fs.writeFileSync(path.join(overlayDir, 'index.html'), html, 'utf-8');

  res.json({
    success: true,
    name: safeName,
    url: `http://localhost:4000/overlay/custom/${safeName}/index.html`,
  });
});

// Update existing overlay
router.put('/:name', (req, res) => {
  const { html } = req.body;
  const safeName = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

  const dir = getCustomOverlayDir();
  const filePath = path.join(dir, safeName, 'index.html');

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Overlay not found' });
    return;
  }

  fs.writeFileSync(filePath, html, 'utf-8');
  res.json({ success: true });
});

// Get overlay HTML source
router.get('/:name/source', (req, res) => {
  const safeName = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const dir = getCustomOverlayDir();
  const filePath = path.join(dir, safeName, 'index.html');

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Overlay not found' });
    return;
  }

  const html = fs.readFileSync(filePath, 'utf-8');
  res.json({ name: safeName, html });
});

// Delete overlay
router.delete('/:name', (req, res) => {
  const safeName = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  const dir = getCustomOverlayDir();
  const overlayDir = path.join(dir, safeName);

  if (!fs.existsSync(overlayDir)) {
    res.status(404).json({ error: 'Overlay not found' });
    return;
  }

  fs.rmSync(overlayDir, { recursive: true });
  res.json({ success: true });
});

// Get the template HTML
router.get('/template', (_req, res) => {
  const templatePath = path.join(process.cwd(), 'src', 'overlays', '_template', 'index.html');
  try {
    const html = fs.readFileSync(templatePath, 'utf-8');
    res.json({ html });
  } catch {
    res.status(404).json({ error: 'Template not found' });
  }
});

export default router;
