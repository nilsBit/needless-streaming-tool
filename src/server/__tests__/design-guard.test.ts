import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { violations } from '../design-guard';

const TOKEN = 'a'.repeat(32);
const check = (file: string, before: string | undefined, after: string | undefined) =>
  violations(file, before === undefined ? undefined : Buffer.from(before), after === undefined ? undefined : Buffer.from(after), [TOKEN]);

const real = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', 'overlays', file), 'utf8');

describe('what a Claude run may change in the overlays', () => {
  const card = real('character/index.html');

  it('lets plain design work through on the real overlays', () => {
    const css = card.replace('</style>', '  .title { font-size: 90px; letter-spacing: 0.02em; }\n  .badge::after { content: "\\2192"; }\n</style>');
    expect(check('character/index.html', card, css)).toEqual([]);
    const markup = card.replace('<body>', '<body>\n<div class="frame" style="width: 40px; background: url(\'portrait.svg\')"><span data-role="x">Neu</span><svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg></div>');
    expect(check('character/index.html', card, markup)).toEqual([]);
    const lexikon = real('lexikon.css');
    expect(check('lexikon.css', lexikon, `${lexikon}\n.lex-title { font-size: 2rem; }\n`)).toEqual([]);
    for (const dir of fs.readdirSync(path.join(process.cwd(), 'src', 'overlays'))) {
      const file = `${dir}/index.html`;
      if (fs.existsSync(path.join(process.cwd(), 'src', 'overlays', file))) expect(check(file, real(file), real(file).replace('</body>', '<p>x</p></body>'))).toEqual([]);
    }
  });

  it('refuses any change to a script, even one that keeps the count', () => {
    const changed = card.replace(/(<script\b[^>]*>)/i, '$1\nconsole.log(1);');
    expect(check('character/index.html', card, changed).length).toBeGreaterThan(0);
  });

  it('refuses a script that runs past a lookalike end tag', () => {
    const before = '<body><script>go();</script></body>';
    expect(check('x/index.html', before, '<body><script>go();</scriptx> evil(); </script></body>').length).toBeGreaterThan(0);
  });

  const attacks: [string, string][] = [
    ['new script', '<script>evil()</script>'],
    ['javascript: frame', '<iframe src="javascript:alert(1)"></iframe>'],
    ['srcdoc', '<div srcdoc="&lt;script&gt;x&lt;/script&gt;"></div>'],
    ['handler after slash', '<svg/onload=alert(1)>'],
    ['handler on img', '<img src="portrait.svg" onerror="x()">'],
    ['entity-built URL', '<img src="&#104;ttps://evil.com/a.png">'],
    ['scheme without slashes', '<img src="https:evil.com/a.png">'],
    ['backslash host', '<img src="/\\evil.com/a.png">'],
    ['protocol-relative', '<img src="//evil.com/a.png">'],
    ['meta refresh', '<meta http-equiv="refresh" content="0;url=https:evil.com">'],
    ['base', '<base href="/\\evil.com">'],
    ['link import', '<link rel="import" href="x.html">'],
    ['external stylesheet', '<link rel="stylesheet" href="https://evil.com/x.css">'],
    ['anchor', '<a href="x">x</a>'],
    ['svg animate', '<svg><animate attributeName="href" to="javascript:x"/></svg>'],
    ['markup inside svg style', '<svg><style><img src=x onerror=alert(1)></style></svg>'],
    ['markup hidden in a comment', '<!--> <img src=x onerror=alert(1)> -->'],
    ['unclosed tag', '<div class="a'],
    ['style import', '<style>@import url(https://evil.com/x.css);</style>'],
    ['style escape', '<style>@\\69mport "x.css";</style>'],
    ['style url', '<div style="background: url(//evil.com/x.png)"></div>'],
    ['style url with escapes', '<div style="background: url(&quot;\\2f\\2f evil.com&quot;)"></div>'],
    ['token', `<div data-x="${TOKEN}"></div>`],
    ['plaintext', '<plaintext>'],
    ['template', '<template><img src=x onerror=alert(1)></template>'],
    ['math breakout', '<math><mi><img src=x onerror=alert(1)></mi></math>'],
    ['uppercase handler', '<DIV ONCLICK="x()"></DIV>'],
    ['handler after a quoted value', '<div class="a"onclick="x()"></div>'],
    ['entity in handler-free URL', '<img src="java&Tab;script:x">'],
    ['svg fill url', '<svg><rect fill="url(//evil.com/#a)"/></svg>'],
    ['markup in a title', '<title></title><img src=x onerror=alert(1)>'],
  ];
  for (const [name, snippet] of attacks) {
    it(`refuses ${name}`, () => {
      expect(check('character/index.html', card, card.replace('</body>', `${snippet}</body>`))).not.toEqual([]);
    });
  }

  it('refuses CSS that loads from elsewhere, also behind a comment in a string', () => {
    expect(check('lexikon.css', '', '@import url("x.css");')).not.toEqual([]);
    expect(check('lexikon.css', '', 'a { content: "/*"; } @import url(//evil.com); /* */')).not.toEqual([]);
    expect(check('lexikon.css', '', 'a { background: image-set("https://evil.com/x.png" 1x); }')).not.toEqual([]);
    expect(check('lexikon.css', '', 'a { background: u\\72l(//evil.com/x.png); }')).not.toEqual([]);
    expect(check('lexikon.css', '', 'a { background: url(data:image/png;base64,iVBORw0KGgo=); }')).toEqual([]);
  });

  it('keeps what was there already, as often as it was', () => {
    const before = '<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X"></head>';
    expect(check('x/index.html', before, `${before}<p>x</p>`)).toEqual([]);
    expect(check('x/index.html', before, `${before}${before}`)).not.toEqual([]);
  });

  it('leaves states.json alone — its names become paths, its test data markup', () => {
    const states = real('showcase/states.json');
    const parsed = JSON.parse(states);
    parsed.overlays.character.size.width = '<img src=x onerror=alert(1)>';
    expect(check('showcase/states.json', states, JSON.stringify(parsed))).not.toEqual([]);
  });

  it('allows new stylesheets and real images only, and no deletions', () => {
    expect(check('character/extra.css', undefined, '.a { color: red; }')).toEqual([]);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    expect(violations('character/p.png', undefined, png, [TOKEN])).toEqual([]);
    expect(check('character/p.png', undefined, '<script>x()</script>')).not.toEqual([]);
    expect(check('character/x.html', undefined, '<p>x</p>')).not.toEqual([]);
    expect(check('character/x.svg', undefined, '<svg></svg>')).not.toEqual([]);
    expect(check('character/x.js', undefined, 'x()')).not.toEqual([]);
    expect(check('boot.js', 'a()', 'b()')).not.toEqual([]);
    expect(check('character/index.html', card, undefined)).not.toEqual([]);
  });
});
