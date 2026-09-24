import {
  getBinForFrequency,
  getFrameCenterTime,
  getFrameIndexForTime,
  getFrequencyForBin,
  getPositiveFrequencyBinCount,
  getSpectralMaximum,
  normalizeSpectralEnergyPayload,
  rasterizeSpectralEnergy,
  spectralEnergyToRelativeDb,
  SPECTRAL_DB_FLOOR,
} from './spectral-energy-heatmap.utils';

describe('spectral energy heatmap utilities', () => {
  it('normalizes mono and multichannel payloads', () => {
    const mono = normalizeSpectralEnergyPayload([
      [1, 2],
      [3, 4],
    ]);
    const stereo = normalizeSpectralEnergyPayload([
      [
        [1, 2],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
      ],
    ]);

    expect(mono?.channels.length).toBe(1);
    expect(mono?.frequencyBinCount).toBe(2);
    expect(mono?.frameCount).toBe(2);
    expect(stereo?.channels.length).toBe(2);
  });

  it('rejects empty, ragged, and non-numeric payloads', () => {
    expect(normalizeSpectralEnergyPayload([])).toBeNull();
    expect(normalizeSpectralEnergyPayload([[1], [2, 3]])).toBeNull();
    expect(normalizeSpectralEnergyPayload([[1], ['bad']])).toBeNull();
  });

  it('uses only DC through Nyquist and finds a shared channel maximum', () => {
    const data = normalizeSpectralEnergyPayload([
      [[1], [2], [3], [100]],
      [[4], [5], [6], [200]],
    ]);

    expect(getPositiveFrequencyBinCount(4)).toBe(3);
    expect(getSpectralMaximum(data!)).toBe(6);

    const dcDominated = normalizeSpectralEnergyPayload([[100], [10], [5], [10]]);
    expect(getSpectralMaximum(dcDominated!, 1)).toBe(10);
  });

  it('maps FFT bins and window centers to physical coordinates', () => {
    expect(getFrequencyForBin(256, 1024, 48000)).toBe(12000);
    expect(getBinForFrequency(12000, 1024, 48000, 513)).toBe(256);
    expect(getFrameCenterTime(0, 1024, 512, 48000)).toBeCloseTo(1024 / 2 / 48000);
    expect(getFrameIndexForTime(getFrameCenterTime(4, 1024, 512, 48000), 1024, 512, 48000, 10)).toBe(4);
  });

  it('converts energy to a clamped relative dB scale', () => {
    expect(spectralEnergyToRelativeDb(100, 100)).toBe(0);
    expect(spectralEnergyToRelativeDb(1, 100)).toBe(-20);
    expect(spectralEnergyToRelativeDb(0, 100)).toBe(SPECTRAL_DB_FLOOR);
    expect(spectralEnergyToRelativeDb(1e-20, 100)).toBe(SPECTRAL_DB_FLOOR);
  });

  it('bounds the raster to display pixels and preserves a narrow peak by max pooling', () => {
    const channel = Array.from({ length: 4 }, () => Array.from({ length: 8 }, () => 0));
    channel[2][5] = 10;

    const raster = rasterizeSpectralEnergy({
      channel,
      frameStart: 0,
      frameEnd: 7,
      positiveBinCount: 4,
      pixelWidth: 2,
      pixelHeight: 2,
      maximum: 10,
      fftSize: 6,
      sampleRate: 48000,
      frequencyScale: 'linear',
    });

    expect(raster.width).toBe(2);
    expect(raster.height).toBe(2);
    expect(Array.from(raster.values)).toContain(0);
  });

  it('excludes DC and fills every represented log-frequency interval', () => {
    const channel = Array.from({ length: 5 }, (_unused, bin) => [bin === 0 ? 100 : 10]);

    const raster = rasterizeSpectralEnergy({
      channel,
      frameStart: 0,
      frameEnd: 0,
      positiveBinCount: 5,
      pixelWidth: 1,
      pixelHeight: 4,
      maximum: 10,
      fftSize: 8,
      sampleRate: 48000,
      frequencyScale: 'logarithmic',
    });

    expect(raster.height).toBe(4);
    expect(Array.from(raster.values)).toEqual([0, 0, 0, 0]);
  });
});
