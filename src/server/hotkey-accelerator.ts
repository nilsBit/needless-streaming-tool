/**
 * An Electron accelerator as the hotkeys setting may store it: any number of
 * modifiers, then one key. Anything else makes globalShortcut.register throw
 * and leaves the remaining shortcuts unregistered. An empty string means
 * "no shortcut".
 */
const MODIFIER = '(?:CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta)';
const KEY = '(?:[0-9A-Za-z]|F(?:[1-9]|1[0-9]|2[0-4])|Plus|Space|Tab|Capslock|Numlock|Scrolllock|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|VolumeUp|VolumeDown|VolumeMute|MediaNextTrack|MediaPreviousTrack|MediaStop|MediaPlayPause|PrintScreen|num[0-9]|numdec|numadd|numsub|nummult|numdiv|[~!@#$%^&*()_\\-+=\\[\\]{};:\'",<.>/?`|])';
const ACCELERATOR = new RegExp(`^(?:${MODIFIER}\\+)*${KEY}$`);

export function isAccelerator(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || (value.length <= 60 && ACCELERATOR.test(value)));
}
