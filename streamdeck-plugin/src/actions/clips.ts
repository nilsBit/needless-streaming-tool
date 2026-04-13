import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { createClip } from '../api';

const TAG_LABELS: Record<string, string> = {
  highlight: '⭐\nHighlight',
  fail: '💀\nFail',
  funny: '😂\nFunny',
  tutorial: '📚\nTutorial',
  bug: '🐛\nBug',
};

@action({ UUID: 'com.nilsr.stream-toolkit.clip.highlight' })
export class HighlightClipAction extends SingletonAction {
  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle(TAG_LABELS['highlight']);
  }

  async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const success = await createClip('highlight');
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }
}

@action({ UUID: 'com.nilsr.stream-toolkit.clip.fail' })
export class FailClipAction extends SingletonAction {
  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle(TAG_LABELS['fail']);
  }

  async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const success = await createClip('fail');
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }
}

@action({ UUID: 'com.nilsr.stream-toolkit.clip.funny' })
export class FunnyClipAction extends SingletonAction {
  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle(TAG_LABELS['funny']);
  }

  async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const success = await createClip('funny');
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }
}

@action({ UUID: 'com.nilsr.stream-toolkit.clip.tutorial' })
export class TutorialClipAction extends SingletonAction {
  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle(TAG_LABELS['tutorial']);
  }

  async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const success = await createClip('tutorial');
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }
}

@action({ UUID: 'com.nilsr.stream-toolkit.clip.bug' })
export class BugClipAction extends SingletonAction {
  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle(TAG_LABELS['bug']);
  }

  async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const success = await createClip('bug');
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }
}
