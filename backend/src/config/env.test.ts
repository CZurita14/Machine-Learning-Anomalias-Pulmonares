import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from './env.js';

test('aplica defaults cuando no hay variables seteadas', () => {
  const env = loadEnv({});
  assert.equal(env.PORT, 8000);
  assert.equal(env.CORS_ORIGIN, '*');
  assert.equal(env.MODEL_DIR, './models');
  assert.equal(env.UPLOADS_DIR, './uploads');
  assert.equal(env.MAX_UPLOAD_MB, 10);
});

test('castea PORT y MAX_UPLOAD_MB de string a number', () => {
  const env = loadEnv({ PORT: '9000', MAX_UPLOAD_MB: '25' });
  assert.equal(env.PORT, 9000);
  assert.equal(env.MAX_UPLOAD_MB, 25);
});

test('lanza si PORT no es un entero positivo', () => {
  assert.throws(() => loadEnv({ PORT: 'no-es-numero' }));
});
