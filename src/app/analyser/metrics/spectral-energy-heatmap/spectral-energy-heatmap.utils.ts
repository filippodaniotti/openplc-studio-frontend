export const SPECTRAL_DB_FLOOR = -80;

export interface NormalizedSpectralEnergy {
  channels: number[][][];
  frequencyBinCount: number;
  frameCount: number;
}

export type SpectralFrequencyScale = 'linear' | 'logarithmic';

export interface SpectralRaster {
  values: Float32Array;
  width: number;
  height: number;
}

export interface SpectralRasterOptions {
  channel: number[][];
  frameStart: number;
  frameEnd: number;
  positiveBinCount: number;
  pixelWidth: number;
  pixelHeight: number;
  maximum: number;
  fftSize: number;
  sampleRate: number;
  frequencyScale: SpectralFrequencyScale;
  floorDb?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateChannel(channel: unknown): channel is number[][] {
  if (!Array.isArray(channel) || channel.length === 0 || !Array.isArray(channel[0])) {
    return false;
  }

  const frameCount = channel[0].length;
  if (frameCount === 0) {
    return false;
  }

  return channel.every(
    (frequencyBin) =>
      Array.isArray(frequencyBin) &&
      frequencyBin.length === frameCount &&
      frequencyBin.every((value) => isFiniteNumber(value)),
  );
}

export function normalizeSpectralEnergyPayload(payload: unknown): NormalizedSpectralEnergy | null {
  if (!Array.isArray(payload) || payload.length === 0 || !Array.isArray(payload[0])) {
    return null;
  }

  const isMono = payload[0].length > 0 && isFiniteNumber(payload[0][0]);
  const channels: unknown[] = isMono ? [payload] : payload;

  if (!channels.every((channel) => validateChannel(channel))) {
    return null;
  }

  const typedChannels = channels as number[][][];
  const frequencyBinCount = typedChannels[0].length;
  const frameCount = typedChannels[0][0].length;

  if (
    !typedChannels.every(
      (channel) =>
        channel.length === frequencyBinCount && channel.every((frequencyBin) => frequencyBin.length === frameCount),
    )
  ) {
    return null;
  }

  return { channels: typedChannels, frequencyBinCount, frameCount };
}

export function getPositiveFrequencyBinCount(frequencyBinCount: number): number {
  return Math.floor(frequencyBinCount / 2) + 1;
}

export function getSpectralMaximum(data: NormalizedSpectralEnergy, firstBin: number = 0): number {
  const positiveBinCount = getPositiveFrequencyBinCount(data.frequencyBinCount);
  let maximum = 0;

  data.channels.forEach((channel) => {
    for (let bin = firstBin; bin < positiveBinCount; bin += 1) {
      const values = channel[bin];
      for (let frame = 0; frame < data.frameCount; frame += 1) {
        maximum = Math.max(maximum, Math.max(0, values[frame]));
      }
    }
  });

  return maximum;
}

export function spectralEnergyToRelativeDb(
  value: number,
  maximum: number,
  floorDb: number = SPECTRAL_DB_FLOOR,
): number {
  if (value <= 0 || maximum <= 0) {
    return floorDb;
  }

  return Math.max(floorDb, Math.min(0, 10 * Math.log10(value / maximum)));
}

export function getFrameCenterTime(frame: number, fftSize: number, hopSize: number, sampleRate: number): number {
  return (frame * hopSize + fftSize / 2) / sampleRate;
}

export function getFrameIndexForTime(
  time: number,
  fftSize: number,
  hopSize: number,
  sampleRate: number,
  frameCount: number,
): number {
  const frame = Math.round((time * sampleRate - fftSize / 2) / hopSize);
  return Math.max(0, Math.min(frameCount - 1, frame));
}

export function getFrequencyForBin(bin: number, fftSize: number, sampleRate: number): number {
  return (bin * sampleRate) / fftSize;
}

export function getBinForFrequency(
  frequency: number,
  fftSize: number,
  sampleRate: number,
  positiveBinCount: number,
): number {
  const bin = Math.round((frequency * fftSize) / sampleRate);
  return Math.max(0, Math.min(positiveBinCount - 1, bin));
}

export function rasterizeSpectralEnergy(options: SpectralRasterOptions): SpectralRaster {
  const {
    channel,
    frameStart,
    frameEnd,
    positiveBinCount,
    pixelWidth,
    pixelHeight,
    maximum,
    fftSize,
    sampleRate,
    frequencyScale,
    floorDb = SPECTRAL_DB_FLOOR,
  } = options;
  const firstBin = frequencyScale === 'logarithmic' ? 1 : 0;
  const renderedBinCount = Math.max(1, positiveBinCount - firstBin);
  const visibleFrameCount = Math.max(1, frameEnd - frameStart + 1);
  const width = Math.max(1, Math.min(Math.floor(pixelWidth), visibleFrameCount));
  const height = Math.max(1, Math.min(Math.floor(pixelHeight), renderedBinCount));
  const values = new Float32Array(width * height);
  values.fill(floorDb);

  const minimumFrequency = getFrequencyForBin(Math.max(1, firstBin), fftSize, sampleRate);
  const maximumFrequency = getFrequencyForBin(positiveBinCount - 1, fftSize, sampleRate);
  const logarithmicRange = Math.log(maximumFrequency) - Math.log(minimumFrequency);

  for (let y = 0; y < height; y += 1) {
    const normalizedHigh = 1 - y / height;
    const normalizedLow = 1 - (y + 1) / height;
    const frequencyLow =
      frequencyScale === 'logarithmic' && logarithmicRange > 0
        ? Math.exp(Math.log(minimumFrequency) + normalizedLow * logarithmicRange)
        : normalizedLow * maximumFrequency;
    const frequencyHigh =
      frequencyScale === 'logarithmic' && logarithmicRange > 0
        ? Math.exp(Math.log(minimumFrequency) + normalizedHigh * logarithmicRange)
        : normalizedHigh * maximumFrequency;
    const binStart = Math.max(firstBin, Math.floor((frequencyLow * fftSize) / sampleRate));
    const binEnd = Math.min(positiveBinCount - 1, Math.ceil((frequencyHigh * fftSize) / sampleRate));

    for (let x = 0; x < width; x += 1) {
      const bucketFrameStart = frameStart + Math.floor((x * visibleFrameCount) / width);
      const bucketFrameEnd = Math.min(frameEnd, frameStart + Math.ceil(((x + 1) * visibleFrameCount) / width) - 1);
      let bucketMaximum = 0;

      for (let bin = binStart; bin <= binEnd; bin += 1) {
        for (let frame = bucketFrameStart; frame <= bucketFrameEnd; frame += 1) {
          bucketMaximum = Math.max(bucketMaximum, channel[bin][frame]);
        }
      }

      values[y * width + x] = spectralEnergyToRelativeDb(bucketMaximum, maximum, floorDb);
    }
  }

  return { values, width, height };
}
