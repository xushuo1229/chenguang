import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  DEV_API_BASE,
  PROD_API_BASE,
  normalizeApiBase,
  resolveApiBase
} from '../js/config/apiBase.js';

describe('API base resolution', () => {
  test('production defaults to the same-origin API path', () => {
    expect(resolveApiBase({ documentRef: null, env: { PROD: true } })).toBe(PROD_API_BASE);
  });

  test('development defaults to the local backend', () => {
    expect(resolveApiBase({ documentRef: null, env: { PROD: false } })).toBe(DEV_API_BASE);
  });

  test('HTML meta can override the default base', () => {
    const documentRef = {
      querySelector: (selector) => (
        selector === 'meta[name="api-base"]'
          ? { getAttribute: () => 'https://api.example.com/api/' }
          : null
      )
    };
    expect(resolveApiBase({ documentRef, env: { PROD: true } })).toBe('https://api.example.com/api');
  });

  test('invalid meta values are ignored', () => {
    const documentRef = {
      querySelector: () => ({ getAttribute: () => 'not-a-base' })
    };
    expect(resolveApiBase({ documentRef, env: { PROD: true } })).toBe(PROD_API_BASE);
  });

  test('normalize trims trailing slashes', () => {
    expect(normalizeApiBase('/api/')).toBe('/api');
  });

  test('API base is owned by one shared module', () => {
    const apiClientSource = readFileSync('js/apiClient.js', 'utf8');
    const syncSource = readFileSync('js/sync.js', 'utf8');

    expect(apiClientSource).toContain("from './config/apiBase.js'");
    expect(syncSource).toContain("from './config/apiBase.js'");
    expect(apiClientSource).not.toMatch(/var API_BASE\s*=/);
    expect(syncSource).not.toMatch(/var API_BASE\s*=/);
  });
});
