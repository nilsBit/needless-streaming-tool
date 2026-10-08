import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { encode, decode } from '@msgpack/msgpack';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { disconnectObs } from '../obs/index';

/**
 * The tool keeps what it asked OBS about scenes and overlays until OBS says
 * something changed (08.10.). Before, the readiness poll and every scene
 * change walked every scene, group and source anew — mid-stream. Against a
 * stub that speaks obs-websocket v5 and counts the requests it gets. In Node
 * the client speaks MessagePack (obs-websocket-js picks its msgpack build).
 */

const PORT = 4000; // the overlay URLs below point at the tool's own port
let wss: WebSocketServer;
let client: WebSocket | null = null;
const calls: string[] = [];
const count = (type: string) => calls.filter((c) => c === type).length;

const SCENES = ['main', 'pause'];
const ITEMS: Record<string, Array<{ sourceName: string; sceneItemEnabled: boolean }>> = {
  main: [{ sourceName: 'NST Song', sceneItemEnabled: true }, { sourceName: 'Kamera', sceneItemEnabled: true }],
  pause: [{ sourceName: 'NST Pause', sceneItemEnabled: true }],
};
const URLS: Record<string, string> = {
  'NST Song': `http://localhost:${PORT}/overlay/song/index.html`,
  'NST Pause': `http://localhost:${PORT}/overlay/pause/index.html`,
};

function answer(type: string, data: Record<string, unknown> | undefined): Record<string, unknown> {
  switch (type) {
    case 'GetSceneList': return { scenes: SCENES.map((sceneName) => ({ sceneName })), currentProgramSceneName: 'main' };
    case 'GetCurrentProgramScene': return { currentProgramSceneName: 'main' };
    case 'GetSceneItemList': return { sceneItems: ITEMS[String(data?.sceneName)] ?? [] };
    case 'GetInputSettings': return { inputSettings: { url: URLS[String(data?.inputName)] } };
    case 'GetStreamStatus': case 'GetRecordStatus': return { outputActive: false };
    case 'GetInputList': return { inputs: [] };
    default: return {};
  }
}

function startStub(): Promise<number> {
  wss = new WebSocketServer({ host: '127.0.0.1', port: 0, handleProtocols: () => 'obswebsocket.msgpack' });
  wss.on('connection', (ws) => {
    client = ws;
    ws.send(encode({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1 } }));
    ws.on('message', (raw) => {
      const { op, d } = decode(raw as Uint8Array) as { op: number; d: { requestType: string; requestId: string; requestData?: Record<string, unknown> } };
      if (op === 1) { ws.send(encode({ op: 2, d: { negotiatedRpcVersion: 1 } })); return; }
      if (op === 6) {
        calls.push(d.requestType);
        ws.send(encode({ op: 7, d: { requestType: d.requestType, requestId: d.requestId, requestStatus: { result: true, code: 100 }, responseData: answer(d.requestType, d.requestData) } }));
      }
    });
  });
  return new Promise((resolve) => wss.on('listening', () => resolve((wss.address() as { port: number }).port)));
}

const emit = (eventType: string, eventData: Record<string, unknown> = {}) =>
  client?.send(encode({ op: 5, d: { eventType, eventIntent: 1, eventData } }));
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('what the tool asks OBS', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    const port = await startStub();
    await request(app).post('/api/obs/config').set(auth()).send({ host: '127.0.0.1', port, password: '' }).expect(200);
    await request(app).post('/api/obs/connect').set(auth()).expect(200);
  });
  afterAll(async () => {
    await disconnectObs();
    wss.close();
  });

  it('walks the scenes once for several questions, and again once OBS says a source came', async () => {
    calls.length = 0;
    const first = (await request(app).get('/api/obs/overlay-scenes').set(auth()).expect(200)).body;
    await request(app).get('/api/readiness').set(auth()).expect(200);
    await request(app).get('/api/obs/overlay-scenes').set(auth()).expect(200);
    expect(first.byOverlay ?? first).toMatchObject({ song: ['main'], pause: ['pause'] });
    expect(count('GetSceneItemList')).toBe(2); // one per scene, once
    expect(count('GetSceneList')).toBe(2);     // the scene names and the walk, once each

    emit('SceneItemCreated', { sceneName: 'main', sourceName: 'NST Chat' });
    await settle();
    await request(app).get('/api/obs/overlay-scenes').set(auth()).expect(200);
    expect(count('GetSceneItemList')).toBe(4);
  });

  it('asks again which overlays are on screen after a scene change, not before', async () => {
    calls.length = 0;
    const seen = (await request(app).get('/api/obs/visible-overlays').set(auth()).expect(200)).body;
    await request(app).get('/api/obs/visible-overlays').set(auth()).expect(200);
    expect(seen).toEqual({ scene: 'main', overlays: ['song'] });
    expect(count('GetSceneItemList')).toBe(1);

    emit('CurrentProgramSceneChanged', { sceneName: 'pause' });
    await settle();
    await request(app).get('/api/obs/visible-overlays').set(auth()).expect(200);
    expect(count('GetSceneItemList')).toBe(2);
  });

  it('forgets the scene names when OBS renames one', async () => {
    calls.length = 0;
    // Asked for in the first test already: no new request.
    await request(app).get('/api/obs/scenes').set(auth()).expect(200);
    await request(app).get('/api/obs/scenes').set(auth()).expect(200);
    expect(count('GetSceneList')).toBe(0);
    emit('SceneNameChanged', { oldSceneName: 'pause', sceneName: 'Pause' });
    await settle();
    await request(app).get('/api/obs/scenes').set(auth()).expect(200);
    await request(app).get('/api/obs/scenes').set(auth()).expect(200);
    expect(count('GetSceneList')).toBe(1);
  });
});
