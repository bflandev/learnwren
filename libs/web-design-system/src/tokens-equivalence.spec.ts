import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Parse `--lw-x: value;` declarations per selector block. */
function parseCustomProps(css: string): Map<string, Map<string, string>> {
  const blocks = new Map<string, Map<string, string>>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^}]*)\}/g;
  for (const [, rawSel, body] of withoutComments.matchAll(re)) {
    const sel = rawSel.trim().replace(/\s+/g, ' ');
    const props = new Map<string, string>();
    for (const [, name, value] of body.matchAll(
      /(--lw-[\w-]+)\s*:\s*([^;]+);/g,
    )) {
      props.set(name, value.trim());
    }
    if (props.size) blocks.set(sel, props);
  }
  return blocks;
}

describe('generated tokens.css equivalence with the legacy hand-written file', () => {
  const legacy = parseCustomProps(
    readFileSync(join(HERE, '../../web-ui/src/styles/tokens.css'), 'utf8'),
  );
  const generated = parseCustomProps(
    readFileSync(join(HERE, 'generated/tokens.css'), 'utf8'),
  );

  it('legacy file yields custom-property blocks', () => {
    expect(legacy.size).toBeGreaterThan(0);
  });

  it.each([...legacy.keys()])('block "%s" matches', (selector) => {
    const want = legacy.get(selector);
    const got = generated.get(selector);
    expect(got, `missing block ${selector}`).toBeDefined();
    expect(Object.fromEntries(got as Map<string, string>)).toEqual(
      Object.fromEntries(want as Map<string, string>),
    );
  });
});
