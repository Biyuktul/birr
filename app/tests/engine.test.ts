import { describe, it, expect } from 'vitest';
import { runSelfTest } from '../src/lib/selftest';

describe('Birr engine', () => {
  const run = runSelfTest();

  for (const r of run.results) {
    it(`${r.n}. ${r.name}`, () => {
      expect(r.pass ? 'pass' : `FAIL: ${r.detail}`).toBe('pass');
    });
  }

  it('every check passes', () => {
    expect(`${run.passed}/${run.total}`).toBe(`${run.total}/${run.total}`);
  });
});
