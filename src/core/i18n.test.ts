import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

function has(obj: unknown, path: string): boolean {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>))
      cur = (cur as Record<string, unknown>)[part];
    else return false;
  }
  return typeof cur === 'string';
}

describe('i18n coverage', () => {
  it('every literal t("...") key used in src exists in en.json', () => {
    const missing: string[] = [];
    const re = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
    for (const file of walk(join(process.cwd(), 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(re)) {
        const key = m[1]!;
        // `set.*` strings are generated from the settings schema at runtime
        if (key.startsWith('set.')) continue;
        if (!has(en, key)) missing.push(`${file.split('src')[1]}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has no empty strings', () => {
    const empty: string[] = [];
    const visit = (o: unknown, path: string) => {
      if (typeof o === 'string') {
        if (o.trim() === '') empty.push(path);
      } else if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) visit(v, path ? `${path}.${k}` : k);
      }
    };
    visit(en, '');
    expect(empty).toEqual([]);
  });
});
