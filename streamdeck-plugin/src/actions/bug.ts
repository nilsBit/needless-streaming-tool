import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface BugSettings extends JsonObject {
  bugTitle?: string;
}

interface IssueRow {
  status?: string;
}

let openCount = 0;

async function fetchCount(): Promise<void> {
  try {
    const issues = await apiGet<IssueRow[]>('/public/issues');
    openCount = Array.isArray(issues) ? issues.filter((b) => b.status === 'open').length : 0;
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.thelab.toolkit.bug' })
export class BugAction extends SingletonAction<BugSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchCount();
      this.updateAll();
    });
    connectionManager.on('message', async (event: string) => {
      if (event === 'issue-created' || event === 'issue-updated' || event === 'issue-deleted') {
        await fetchCount();
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<BugSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<BugSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const title = ev.payload.settings.bugTitle?.trim() || 'Stream Bug';
    try {
      await apiPost('/api/issues', { title });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : `${openCount} Bugs`;
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}
