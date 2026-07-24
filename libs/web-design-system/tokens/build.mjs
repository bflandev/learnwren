// Token build: emits src/generated/tokens.css from the JSON sources in this
// directory. Slice A is a flat emit (no aliases between tokens yet);
// Style Dictionary joins in Slice B when component-scoped tokens reference
// the core via aliases.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../src/generated/', import.meta.url);

function block(selector, tokens) {
  const lines = Object.entries(tokens)
    .map(([name, v]) => `  --lw-${name}: ${v.value};`)
    .join('\n');
  return `${selector} {\n${lines}\n}`;
}

async function loadJson(rel) {
  return JSON.parse(await readFile(new URL(rel, import.meta.url), 'utf8'));
}

const [dark, light, type, radius, density] = await Promise.all([
  loadJson('./semantic/dark.json'),
  loadJson('./semantic/light.json'),
  loadJson('./primitives/type.json'),
  loadJson('./primitives/radius.json'),
  loadJson('./primitives/density.json'),
]);

const darkAll = { ...dark.lw, ...type.lw, ...radius.lw };
const css = [
  '/* GENERATED — do not edit. Source: libs/web-design-system/tokens/ */',
  block(':root,\n.lw-theme-dark', darkAll),
  block('.lw-theme-light', light.lw),
  ...Object.entries(density.lw).map(([name, set]) =>
    block(`.lw-density-${name}`, set),
  ),
].join('\n\n');

await mkdir(OUT, { recursive: true });
await writeFile(new URL('tokens.css', OUT), css + '\n');
console.log('tokens.css written');
