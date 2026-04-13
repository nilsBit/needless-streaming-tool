import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { triggerCompilePray } from '../api';

@action({ UUID: 'com.nilsr.stream-toolkit.compile-pray' })
export class CompilePrayAction extends SingletonAction {
  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle('🙏\nCompile\n& Pray');
  }

  async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const success = await triggerCompilePray();
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }
}
