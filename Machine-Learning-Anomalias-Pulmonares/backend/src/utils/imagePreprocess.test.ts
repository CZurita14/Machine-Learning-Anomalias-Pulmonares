import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { preprocessImage, resampleToSharpKernel, type PreprocessorConfig } from './imagePreprocess.js';

const testConfig: PreprocessorConfig = {
  image_mean: [0.5, 0.5, 0.5],
  image_std: [0.5, 0.5, 0.5],
  size: { height: 2, width: 2 },
  do_normalize: true,
  do_rescale: true,
  rescale_factor: 1 / 255,
};

test('normaliza un pixel blanco puro (255,255,255) a ~1.0 en cada canal', async () => {
  const whitePixelPng = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();

  const tensor = await preprocessImage(whitePixelPng, testConfig);

  assert.equal(tensor.length, 3 * 2 * 2);
  for (const value of tensor) {
    assert.ok(Math.abs(value - 1.0) < 1e-4, `esperado ~1.0, obtuvo ${value}`);
  }
});

test('normaliza un pixel negro puro (0,0,0) a ~-1.0 en cada canal', async () => {
  const blackPixelPng = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png().toBuffer();

  const tensor = await preprocessImage(blackPixelPng, testConfig);
  for (const value of tensor) {
    assert.ok(Math.abs(value - -1.0) < 1e-4, `esperado ~-1.0, obtuvo ${value}`);
  }
});

test('produce layout CHW (no HWC): el plano 0 son todos valores del canal R', async () => {
  const redPixelPng = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();

  const tensor = await preprocessImage(redPixelPng, testConfig);
  const plane = 2 * 2;
  const rPlane = tensor.slice(0, plane);
  const gPlane = tensor.slice(plane, plane * 2);

  for (const value of rPlane) assert.ok(Math.abs(value - 1.0) < 1e-4);
  for (const value of gPlane) assert.ok(Math.abs(value - -1.0) < 1e-4);
});

test('resampleToSharpKernel mapea el resample de PIL (preprocessor_config.json) al kernel de sharp', () => {
  // 0 = PIL Image.NEAREST -> sharp nearest
  assert.equal(resampleToSharpKernel(0), 'nearest');
  // 1 = PIL Image.LANCZOS -> sharp lanczos3 (Lanczos a=3, el default de sharp)
  assert.equal(resampleToSharpKernel(1), 'lanczos3');
  // 2 = PIL Image.BILINEAR -> sharp linear (filtro triangular, equivalente a bilinear)
  assert.equal(resampleToSharpKernel(2), 'linear');
  // 3 = PIL Image.BICUBIC -> sharp cubic
  assert.equal(resampleToSharpKernel(3), 'cubic');
});

test('resampleToSharpKernel usa cubic por defecto si resample es undefined o no reconocido', () => {
  assert.equal(resampleToSharpKernel(undefined), 'cubic');
  assert.equal(resampleToSharpKernel(4), 'cubic'); // BOX, no soportado explícitamente
  assert.equal(resampleToSharpKernel(5), 'cubic'); // HAMMING, no soportado explícitamente
  assert.equal(resampleToSharpKernel(999), 'cubic');
});
