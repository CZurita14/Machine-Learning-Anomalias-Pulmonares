import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUploadedImage } from './analysisService.js';

test('analyzeUploadedImage rechaza un buffer que no es una imagen decodificable', async () => {
  const notAnImage = Buffer.from('this is not an image');
  await assert.rejects(() => analyzeUploadedImage(notAnImage, 'fibrosis.txt'));
});
