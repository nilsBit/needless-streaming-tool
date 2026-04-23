import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPost } from '../api.js';
import { onEvent } from '../ws.js';

interface BugSettings extends JsonObject {
  bugTitle?: string;
}

interface IssueRow {
  status?: string;
}

let openCount = 0;
let connected = false;

async function fetchCount(): Promise<void> {
  try {
    const issues = await apiGet<IssueRow[]>('/public/issues');
    openCount = Array.isArray(issues) ? issues.filter((b) => b.status === 'open').length : 0;
  } catch {
    /* leave openCount as-is; updateAll will still run */
  }
}

@action({ UUID: 'com.thelab.toolkit.bug' })
export class BugAction extends SingletonAction<BugSettings> {
  constructor() {
    super();
    onEvent(async (event) => {
      if (event === '_connected') {
        connected = true;
        await fetchCount();
        this.updateAll();
      } else if (event === '_disconnected') {
        connected = false;
        this.updateAll();
      } else if (
        event === 'issue-created' ||
        event === 'issue-updated' ||
        event === 'issue-deleted'
      ) {
        await fetchCount();
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<BugSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<BugSettings>): Promise<void> {
    const title = ev.payload.settings.bugTitle?.trim() || 'Stream Bug';
    try {
      await apiPost('/api/issues', { title });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connected ? 'OFFLINE' : `${openCount} Bugs`;
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => {
        /* ignore */
      });
    }
  }
}
