import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPatch } from '../api.js';
import { onEvent } from '../ws.js';

interface MilestoneSettings extends JsonObject {
  milestoneId?: string;
}

interface MilestoneRow {
  id?: number;
  status?: string;
}

let pendingCount = 0;
let connected = false;

async function fetchCount(): Promise<void> {
  try {
    const milestones = await apiGet<MilestoneRow[]>('/api/milestones');
    pendingCount = Array.isArray(milestones)
      ? milestones.filter((m) => m.status === 'pending').length
      : 0;
  } catch {
    /* leave pendingCount as-is; updateAll will still run */
  }
}

@action({ UUID: 'com.thelab.toolkit.milestone' })
export class MilestoneAction extends SingletonAction<MilestoneSettings> {
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
    const titleStr = !connected ? 'OFFLINE' : `${pendingCount} MS`;
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => {
        /* ignore */
      });
    }
  }
}
