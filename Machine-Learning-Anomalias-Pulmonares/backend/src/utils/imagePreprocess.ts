import sharp from 'sharp';

export interface PreprocessorConfig {
  image_mean: number[];
  image_std: number[];
  size: { height: number; width: number } | { shortest_edge: number };
  do_normalize?: boolean;
  do_resize?: boolean;
  do_rescale?: boolean;
  rescale_factor?: number;
  /** PIL resample filter id, as found in preprocessor_config.json (e.g. 2 = BILINEAR). */
  resample?: number;
}

function resolveTargetSize(size: PreprocessorConfig['size']): { width: number; height: number } {
  if ('shortest_edge' in size) {
    return { width: size.shortest_edge, height: size.shortest_edge };
  }
  return { width: size.width, height: size.height };
}

/**
 * sharp/libvips ships a `linear` (triangle filter) reduction kernel that is the
 * equivalent of PIL's BILINEAR resample. It is NOT listed in sharp's TypeScript
 * `KernelEnum` (backend/node_modules/sharp/lib/index.d.ts only declares nearest,
 * cubic, mitchell, lanczos2, lanczos3), but it IS present and validated at runtime
 * in sharp/lib/resize.js's internal `kernel` map, so `kernel: 'linear'` works even
 * though `sharp.kernel.linear` does not exist on the typed constant. Hence the cast
 * to `keyof sharp.KernelEnum` below is deliberate, not a type-safety hole.
 *
 * PIL resample ids (PIL.Image): NEAREST=0, LANCZOS=1, BILINEAR=2, BICUBIC=3,
 * BOX=4, HAMMING=5. Only ids with a confident, direct sharp equivalent are mapped;
 * everything else (including BOX/HAMMING, which have no matching sharp kernel)
 * falls back to the historical `cubic` default so unrecognized configs don't
 * silently change behavior.
 */
const PIL_RESAMPLE_TO_SHARP_KERNEL: Record<number, keyof sharp.KernelEnum> = {
  0: 'nearest',
  1: 'lanczos3',
  2: 'linear' as keyof sharp.KernelEnum,
  3: 'cubic',
};

const DEFAULT_KERNEL: keyof sharp.KernelEnum = 'cubic';

export function resampleToSharpKernel(resample?: number): keyof sharp.KernelEnum {
  if (resample === undefined) return DEFAULT_KERNEL;
  return PIL_RESAMPLE_TO_SHARP_KERNEL[resample] ?? DEFAULT_KERNEL;
}

export async function preprocessImage(
  imageBuffer: Buffer,
  config: PreprocessorConfig,
): Promise<Float32Array> {
  const { width, height } = resolveTargetSize(config.size);
  const kernel = resampleToSharpKernel(config.resample);

  const { data, info } = await sharp(imageBuffer)
    .resize(width, height, { fit: 'fill', kernel })
    .removeAlpha()
    .toColorspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 3) {
    throw new Error(`Se esperaban 3 canales (RGB), se obtuvieron ${info.channels}`);
  }

  const doRescale = config.do_rescale ?? true;
  const rescaleFactor = config.rescale_factor ?? 1 / 255;
  const doNormalize = config.do_normalize ?? true;
  const { image_mean: mean, image_std: std } = config;

  if (mean.length < 3 || std.length < 3) {
    throw new RangeError(
      `image_mean and image_std must have at least 3 elements (RGB), got ${mean.length} and ${std.length}`,
    );
  }

  const plane = width * height;
  const chw = new Float32Array(3 * plane);
  const bufferData = data as Uint8Array;

  for (let pixelIndex = 0; pixelIndex < plane; pixelIndex++) {
    for (let channel = 0; channel < 3; channel++) {
      let value: number = bufferData[pixelIndex * 3 + channel] ?? 0;
      // TypeScript narrows the array access after length validation above
      const meanVal: number = mean[channel]!;
      const stdVal: number = std[channel]!;
      if (doRescale) value = value * rescaleFactor;
      if (doNormalize) value = (value - meanVal) / stdVal;
      chw[channel * plane + pixelIndex] = value;
    }
  }

  return chw;
}
