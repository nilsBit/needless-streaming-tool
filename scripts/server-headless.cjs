// Starts only the Express server inside Electron — full Electron APIs
// (safeStorage, shell), but no window. For the Chrome walk-through
// (`npm run ui:walk`) and showcase captures on a machine where the app
// should not pop up. `npm run server:headless` compiles first, like nodemon.
//
// CommonJS on purpose: Electron loads its entry script with require().
const { app } = require('electron');
const path = require('path');
const net = require('net');

const root = path.resolve(__dirname, '..');
process.chdir(root);
process.env.NST_DEV = '1';

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

app.whenReady().then(async () => {
  if (!(await portFree(4000))) {
    console.error('[Headless] Port 4000 ist belegt — läuft das Tool schon? Dann einfach das benutzen.');
    app.exit(1);
    return;
  }
  try {
    const { startServer } = require(path.join(root, 'dist/server/index.js'));
    const { port } = await startServer();
    console.log(`[Headless] Server läuft auf Port ${port}, ohne Fenster. Beenden mit Strg+C.`);
  } catch (e) {
    console.error('[Headless] Start fehlgeschlagen', e);
    app.exit(1);
  }
});

// There is no window, so this must not quit the app.
app.on('window-all-closed', () => {});
