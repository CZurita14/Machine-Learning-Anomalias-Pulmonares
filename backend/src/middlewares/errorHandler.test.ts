import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from './errorHandler.js';

function createMockResponse() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (payload: unknown) => { res.body = payload; return res; };
  return res;
}

test('responde 500 con mensaje genérico para errores no controlados', () => {
  const res = createMockResponse();
  errorHandler(new Error('boom interno'), {} as any, res, (() => {}) as any);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error interno del servidor.' });
});
