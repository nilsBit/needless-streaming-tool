import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

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

// Get builtin overlays list
router.get('/builtin', (_req, res) => {
  const builtinPath = path.join(process.cwd(), 'src', 'overlays');
  try {
    const entries = fs.readdirSync(builtinPath, { withFileTypes: true });
    const overlays = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => ({
        name: e.name,
        url: `http://localhost:4000/overlay/${e.name}/index.html`,
        builtin: true,
      }));
    res.json(overlays);
  } catch {
    res.json([]);
  }
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
