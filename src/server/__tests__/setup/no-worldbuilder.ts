import os from 'os';
import path from 'path';

// The Worldbuilder announces itself in ~/.worldbuilder/anschluss.json. A file
// left behind on the developer's machine (Worldbuilder killed, 07.10.) made
// tests that expect no Worldbuilder fail there and pass in CI. Every test
// starts without one; a test that wants it points WORLDBUILDER_ANSCHLUSS at
// its own file, as before.
process.env.WORLDBUILDER_ANSCHLUSS = path.join(os.tmpdir(), `nst-no-worldbuilder-${process.pid}.json`);
