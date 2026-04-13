import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { triggerBugRoulette } from '../api';

@action({ UUID: 'com.nilsr.stream-toolkit.bug-roulette' })
export class BugRouletteAction extends SingletonAction {
  private cooldownUntil = 0;
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle('🎰\nRoulette');
  }

  async onKeyDown(ev: KeyDownEvent): Promise<void> {
    if (Date.now() < this.cooldownUntil) {
      await ev.action.showAlert();
      return;
    }

    const result = await triggerBugRoulette();

    if (result.onCooldown) {
      await this.startCooldown(ev);
      return;
    }

    if (result.success) {
      await ev.action.showOk();
      this.cooldownUntil = Date.now() + 60_000;
      await this.startCooldown(ev);
    } else {
      await ev.action.showAlert();
    }
  }

  private async startCooldown(ev: KeyDownEvent): Promise<void> {
    if (this.cooldownTimer) return;

    this.cooldownTimer = setInterval(async () => {
      const remaining = Math.ceil((this.cooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(this.cooldownTimer!);
        this.cooldownTimer = null;
        await ev.action.setTitle('🎰\nRoulette');
      } else {
        await ev.action.setTitle(`⏳\n${remaining}s`);
      }
    }, 1000);
  }
}
