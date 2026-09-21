import { importCaptures, type Capture } from './import';

figma.showUI(__html__, { width: 360, height: 420 });

const log = (text: string) => figma.ui.postMessage({ type: 'log', text });

void figma.clientStorage.getAsync('token').then((token) => {
  figma.ui.postMessage({ type: 'token', token: typeof token === 'string' ? token : '' });
});

figma.ui.onmessage = async (msg: { type: string; token?: string; captures?: Capture[] }) => {
  try {
    if (msg.type === 'save-token') await figma.clientStorage.setAsync('token', msg.token ?? '');
    if (msg.type === 'import') await importCaptures(msg.captures ?? [], log);
  } catch (e) {
    log(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
  }
};
