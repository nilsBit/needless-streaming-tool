import { writeFileSync, mkdirSync } from 'node:fs';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=',
  'base64'
);

const dirs = [
  'com.nilsr.stream-toolkit.sdPlugin/imgs/plugin',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/clip',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/compile-pray',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/bug-roulette',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/obs-scene',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/stream-status',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/open-bugs',
];

dirs.forEach(dir => mkdirSync(dir, { recursive: true }));

const files = [
  'com.nilsr.stream-toolkit.sdPlugin/imgs/plugin/marketplace.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/clip/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/clip/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/compile-pray/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/compile-pray/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/bug-roulette/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/bug-roulette/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/obs-scene/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/obs-scene/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/stream-status/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/stream-status/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/open-bugs/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/open-bugs/key.png',
];

files.forEach(file => writeFileSync(file, PNG));
console.log(`Created ${files.length} placeholder icon files.`);
