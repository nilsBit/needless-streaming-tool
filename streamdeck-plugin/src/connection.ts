import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';
import { getSettings, updateSettings } from './api.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface ConnectionFile {
  version?: number;
  token: string;
  port: number;
  pid: number;
}

const CONNECTION_FILE = path.join(
  process.platform === 'win32'
    ? (process.env.APPDATA || os.homedir())
    : os.homedir(),
  '.thelab',
  'connection.json'
);

const BACKOFF_INITIAL = 1000;
const BACKOFF_MAX = 30000;

class ConnectionManagerImpl extends EventEmitter {
  private _state: ConnectionState = 'disconnected';
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff = BACKOFF_INITIAL;
  private stopped = true;

  get state(): ConnectionState {
    return this._state;
  }

  isConnected(): boolean {
    return this._state === 'connected';
  }

  start(): void {
    this.stopped = false;
    this.tryConnect();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    this.closeWs();
    this.setState('disconnected');
  }

  /** Read connection file and update settings if valid. Returns true if file was usable. */
  readConnectionFile(): boolean {
    try {
      if (!fs.existsSync(CONNECTION_FILE)) return false;
      const raw = fs.readFileSync(CONNECTION_FILE, 'utf-8');
      const data: ConnectionFile = JSON.parse(raw);
      if (!data.token || !data.port) return false;

      // PID liveness check — process.kill(pid, 0) throws if process doesn't exist
      try {
        process.kill(data.pid, 0);
      } catch (err: unknown) {
        // EPERM means process exists but we lack permission — treat as alive
        if ((err as NodeJS.ErrnoException).code === 'EPERM') {
          // Process exists, continue
        } else {
          // ESRCH or other — stale file, clean up
          try { fs.unlinkSync(CONNECTION_FILE); } catch { /* best-effort */ }
          return false;
        }
      }

      // Check priority: if Global Settings have a non-localhost host, the user
      // intentionally configured a remote machine — don't override
      const current = getSettings();
      if (current.host && current.host !== 'localhost' && current.host !== '127.0.0.1' && current.apiToken) {
        return false;
      }

      updateSettings({
        host: 'localhost',
        port: data.port,
        apiToken: data.token,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Called by PI via sendToPlugin to check connection status */
  getConnectionInfo(): { connected: boolean; port?: number } {
    if (this._state === 'connected') {
      return { connected: true, port: getSettings().port };
    }
    // Try reading connection file for the PI
    const hasFile = this.readConnectionFile();
    return { connected: false, port: hasFile ? getSettings().port : undefined };
  }

  private tryConnect(): void {
    if (this.stopped) return;

    // Re-read connection file on every connect attempt (token may have changed)
    this.readConnectionFile();

    const settings = getSettings();
    if (!settings.apiToken) {
      this.scheduleReconnect();
      return;
    }

    this.setState('connecting');
    this.closeWs();

    const url = `ws://${settings.host || 'localhost'}:${settings.port || 4000}?token=${settings.apiToken}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      this.backoff = BACKOFF_INITIAL;
      this.setState('connected');
    });

    ws.on('close', () => {
      this.setState('disconnected');
      this.scheduleReconnect();
    });

    ws.on('error', () => {
      try { ws.close(); } catch { /* ignore */ }
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { event?: string; data?: unknown };
        if (typeof msg.event === 'string') {
          this.emit('message', msg.event, msg.data);
        }
      } catch { /* ignore non-JSON */ }
    });
  }

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    this.emit('stateChange', state);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.tryConnect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeWs(): void {
    try {
      this.ws?.removeAllListeners();
      this.ws?.close();
    } catch { /* ignore */ }
    this.ws = null;
  }
}

export const connectionManager = new ConnectionManagerImpl();
