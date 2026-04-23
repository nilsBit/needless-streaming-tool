import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPatch } from '../api.js';
import { connectionManager } from '../connection.js';

interface MilestoneSettings extends JsonObject {
  milestoneId?: string;
}

interface MilestoneRow {
  id?: number;
  status?: string;
}

let pendingCount = 0;

async function fetchCount(): Promise<void> {
  try {
    const milestones = await apiGet<MilestoneRow[]>('/api/milestones');
    pendingCount = Array.isArray(milestones)
      ? milestones.filter((m) => m.status === 'pending').length
      : 0;
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.nst.deck.milestone' })
export class MilestoneAction extends SingletonAction<MilestoneSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchCount();
      this.updateAll();
    });
    connectionManager.on('message', async (event: string) => {
      if (
        event === 'milestone-trigger' ||
        event === 'milestone-created' ||
        event === 'milestone-updated' ||
        event === 'milestone-deleted'
      ) {
        await fetchCount();
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<MilestoneSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<MilestoneSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const milestoneId = ev.payload.settings.milestoneId?.trim() || 'next';
    try {
      let targetId: number | string;
      if (milestoneId === 'next') {
        const milestones = await apiGet<MilestoneRow[]>('/api/milestones');
        const next = Array.isArray(milestones)
          ? milestones.find((m) => m.status === 'pending')
          : undefined;
        if (!next || next.id === undefined) {
          await ev.action.showAlert();
          return;
        }
        targetId = next.id;
      } else {
        targetId = milestoneId;
      }
      await apiPatch(`/api/milestones/${targetId}`, { status: 'completed' });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : `${pendingCount} MS`;
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}
