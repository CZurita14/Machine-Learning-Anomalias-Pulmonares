import { test } from 'node:test';
import assert from 'node:assert/strict';
import { softmax, mapLogitsToPrediction } from './inferenceService.js';

test('softmax suma 1.0 y preserva el orden relativo', () => {
  const result = softmax(new Float32Array([1, 2, 3]));
  const sum = result.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-6);
  assert.ok(result[2]! > result[1]! && result[1]! > result[0]!);
});

test('mapLogitsToPrediction elige el label de mayor probabilidad', () => {
  const id2label: Record<string, string> = { '0': 'NORMAL', '1': 'PNEUMONIA' };
  const prediction = mapLogitsToPrediction(new Float32Array([0.1, 4.5]), id2label);
  assert.equal(prediction.label, 'PNEUMONIA');
  assert.ok(prediction.confidence > 0.9);
});

test('mapLogitsToPrediction funciona igual si NORMAL tiene el logit mayor', () => {
  const id2label: Record<string, string> = { '0': 'NORMAL', '1': 'PNEUMONIA' };
  const prediction = mapLogitsToPrediction(new Float32Array([5.0, 0.2]), id2label);
  assert.equal(prediction.label, 'NORMAL');
});
