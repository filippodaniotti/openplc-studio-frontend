import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import Chart, { ChartEvent, Plugin } from 'chart.js/auto';
import { SelectButtonModule } from 'primeng/selectbutton';
import { debounceTime, filter, Subject, takeUntil, tap } from 'rxjs';
import { ThemeService } from '../../../shared/services/theme.service';
import { AnalysisService, MetricRaw } from '../../analysis.service';
import {
  getBinForFrequency,
  getFrameCenterTime,
  getFrameIndexForTime,
  getFrequencyForBin,
  getPositiveFrequencyBinCount,
  getSpectralMaximum,
  NormalizedSpectralEnergy,
  normalizeSpectralEnergyPayload,
  rasterizeSpectralEnergy,
  spectralEnergyToRelativeDb,
  SPECTRAL_DB_FLOOR,
  SpectralFrequencyScale,
} from './spectral-energy-heatmap.utils';

interface HeatmapTooltip {
  channel: string;
  time: number;
  frequency: number;
  relativeDb: number;
  rawEnergy: number;
  x: number;
  y: number;
}

interface CachedRaster {
  key: string;
  canvas: HTMLCanvasElement;
}

const SPECTRUM_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [13, 8, 135],
  [75, 3, 161],
  [125, 3, 168],
  [168, 34, 150],
  [203, 70, 121],
  [229, 107, 93],
  [248, 148, 65],
  [253, 195, 40],
  [240, 249, 33],
];

@Component({
  selector: 'plc-spectral-energy-heatmap',
  imports: [CommonModule, FormsModule, SelectButtonModule],
  templateUrl: './spectral-energy-heatmap.component.html',
  styleUrls: ['./spectral-energy-heatmap.component.scss'],
})
export class SpectralEnergyHeatmapComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) metric!: MetricRaw;

  @Input() fallbackIndex: number | null = null;

  @ViewChild('canvas')
  set canvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvas = ref;
    if (ref) {
      this.createChart();
    } else {
      this.destroyChart();
    }
  }

  public selectedChannel = 0;

  public frequencyScale: SpectralFrequencyScale = 'logarithmic';

  public readonly frequencyScaleOptions: Array<{ label: string; value: SpectralFrequencyScale }> = [
    { label: 'Log', value: 'logarithmic' },
    { label: 'Linear', value: 'linear' },
  ];

  public channelOptions: Array<{ label: string; value: number }> = [];

  public errorMessage = '';

  public tooltip: HeatmapTooltip | null = null;

  public get hasMultipleChannels(): boolean {
    return this.channelOptions.length > 1;
  }

  public get tooltipUsesKhz(): boolean {
    return (this.tooltip?.frequency ?? 0) >= 1000;
  }

  private canvas?: ElementRef<HTMLCanvasElement>;

  private chart?: Chart<'scatter'>;

  private spectralData: NormalizedSpectralEnergy | null = null;

  private fftSize = 0;

  private hopSize = 0;

  private sampleRate = 0;

  private positiveBinCount = 0;

  private maximumEnergy = 0;

  private waveformBounds: number[] = [];

  private cachedRaster?: CachedRaster;

  private destroy$ = new Subject<void>();

  constructor(
    public readonly analysisService: AnalysisService,
    private readonly themeService: ThemeService,
    private readonly zone: NgZone,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  public ngOnInit(): void {
    this.analysisService.wsZoomBounds
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        filter((bounds) => Array.isArray(bounds) && bounds.length === 2),
        tap((bounds) => {
          this.waveformBounds = bounds;
          this.applyWaveformBounds();
        }),
      )
      .subscribe();

    this.themeService.isDarkMode
      .pipe(
        takeUntil(this.destroy$),
        tap(() => this.applyTheme()),
      )
      .subscribe();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['metric'] || changes['fallbackIndex']) {
      this.prepareData();
      this.createChart();
    }
  }

  public onChannelChange(): void {
    this.cachedRaster = undefined;
    this.tooltip = null;
    this.chart?.draw();
  }

  public onFrequencyScaleChange(): void {
    this.updateMaximumEnergy();
    this.cachedRaster = undefined;
    this.tooltip = null;
    this.createChart();
  }

  public formatEnergy(value: number): string {
    return value === 0 ? '0' : value.toExponential(3);
  }

  private prepareData(): void {
    this.errorMessage = '';
    this.tooltip = null;
    this.cachedRaster = undefined;
    this.spectralData = normalizeSpectralEnergyPayload(this.metric?.json);

    if (!this.spectralData) {
      this.errorMessage = 'Spectral energy data is empty or malformed.';
      this.destroyChart();
      return;
    }

    const outputAnalyserModule = this.analysisService.resolveOutputAnalyserModuleForMetric(
      this.metric.name,
      this.fallbackIndex,
    );
    const configuredFftSize = Number(this.analysisService.getModuleSettingValue(outputAnalyserModule, 'N'));
    const configuredHopSize = Number(this.analysisService.getModuleSettingValue(outputAnalyserModule, 'hop'));

    this.fftSize = configuredFftSize > 0 ? configuredFftSize : this.spectralData.frequencyBinCount;
    this.hopSize = configuredHopSize > 0 ? configuredHopSize : this.fftSize / 2;
    this.sampleRate = this.analysisService.selectedTrackPlaybackSampleRate.value;

    if (this.sampleRate <= 0) {
      this.errorMessage = 'The selected track sample rate is unavailable.';
      this.destroyChart();
      return;
    }

    this.positiveBinCount = getPositiveFrequencyBinCount(this.spectralData.frequencyBinCount);
    this.updateMaximumEnergy();
    this.selectedChannel = Math.min(this.selectedChannel, this.spectralData.channels.length - 1);
    this.channelOptions = this.spectralData.channels.map((_channel, index) => ({
      label: this.getChannelLabel(index),
      value: index,
    }));
  }

  private createChart(): void {
    if (!this.canvas || !this.spectralData || this.errorMessage) {
      return;
    }

    this.destroyChart();

    const domain = this.getTimeDomain();
    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--p-text-color');
    const textColorSecondary = documentStyle.getPropertyValue('--p-text-muted-color');
    const surfaceBorder = documentStyle.getPropertyValue('--p-content-border-color');

    this.chart = new Chart(this.canvas.nativeElement, {
      type: 'scatter',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { right: 70 } },
        scales: {
          x: {
            type: 'linear',
            min: domain[0],
            max: domain[1],
            title: { display: true, text: 'Time [s]', color: textColor },
            ticks: {
              color: textColorSecondary,
              maxTicksLimit: 8,
              callback: (value) => `${Number(value).toFixed(2)}`,
            },
            grid: { color: surfaceBorder },
          },
          y: {
            type: this.frequencyScale,
            min: this.getMinimumDisplayedFrequency(),
            max: this.sampleRate / 2,
            title: { display: true, text: 'Frequency', color: textColor },
            ticks: {
              color: textColorSecondary,
              maxTicksLimit: 8,
              callback: (value) => this.formatFrequency(Number(value)),
            },
            grid: { color: surfaceBorder },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
      plugins: [this.createHeatmapPlugin()],
    });

    this.applyWaveformBounds();
  }

  private createHeatmapPlugin(): Plugin<'scatter'> {
    return {
      id: `spectral-energy-heatmap-${this.metric.index}`,
      beforeDraw: (chart) => this.drawHeatmap(chart),
      afterDraw: (chart) => {
        this.drawColorLegend(chart);
        this.drawCrosshair(chart);
      },
      afterEvent: (chart, args) => this.handleChartEvent(chart, args.event),
    };
  }

  private drawHeatmap(chart: Chart<'scatter'>): void {
    if (!this.spectralData) {
      return;
    }

    const { chartArea } = chart;
    const xScale = chart.scales['x'];
    const frameStart = getFrameIndexForTime(
      xScale.min,
      this.fftSize,
      this.hopSize,
      this.sampleRate,
      this.spectralData.frameCount,
    );
    const frameEnd = getFrameIndexForTime(
      xScale.max,
      this.fftSize,
      this.hopSize,
      this.sampleRate,
      this.spectralData.frameCount,
    );
    const firstFrame = Math.min(frameStart, frameEnd);
    const lastFrame = Math.max(frameStart, frameEnd);
    const width = Math.max(1, Math.floor(chartArea.width));
    const height = Math.max(1, Math.floor(chartArea.height));
    const cacheKey = [
      this.selectedChannel,
      this.frequencyScale,
      firstFrame,
      lastFrame,
      width,
      height,
      this.maximumEnergy,
    ].join(':');

    if (!this.cachedRaster || this.cachedRaster.key !== cacheKey) {
      const raster = rasterizeSpectralEnergy({
        channel: this.spectralData.channels[this.selectedChannel],
        frameStart: firstFrame,
        frameEnd: lastFrame,
        positiveBinCount: this.positiveBinCount,
        pixelWidth: width,
        pixelHeight: height,
        maximum: this.maximumEnergy,
        fftSize: this.fftSize,
        sampleRate: this.sampleRate,
        frequencyScale: this.frequencyScale,
      });
      const offscreen = document.createElement('canvas');
      offscreen.width = raster.width;
      offscreen.height = raster.height;
      const context = offscreen.getContext('2d');

      if (!context) {
        return;
      }

      const image = context.createImageData(raster.width, raster.height);
      raster.values.forEach((db, index) => {
        const [red, green, blue] = this.getSpectrumColor(db);
        const offset = index * 4;
        image.data[offset] = red;
        image.data[offset + 1] = green;
        image.data[offset + 2] = blue;
        image.data[offset + 3] = 255;
      });
      context.putImageData(image, 0, 0);
      this.cachedRaster = { key: cacheKey, canvas: offscreen };
    }

    chart.ctx.save();
    chart.ctx.imageSmoothingEnabled = false;
    chart.ctx.drawImage(this.cachedRaster.canvas, chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    chart.ctx.restore();
  }

  private drawColorLegend(chart: Chart<'scatter'>): void {
    const { ctx, chartArea } = chart;
    const legendX = chartArea.right + 22;
    const legendWidth = 12;
    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);

    SPECTRUM_COLORS.forEach((color, index) => {
      gradient.addColorStop(index / (SPECTRUM_COLORS.length - 1), `rgb(${color.join(',')})`);
    });

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--p-text-muted-color');
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, chartArea.top, legendWidth, chartArea.height);
    ctx.strokeStyle = textColor;
    ctx.strokeRect(legendX, chartArea.top, legendWidth, chartArea.height);
    ctx.fillStyle = textColor;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('0', legendX + 17, chartArea.top + 2);
    ctx.fillText('-40', legendX + 17, chartArea.top + chartArea.height / 2);
    ctx.fillText('-80', legendX + 17, chartArea.bottom - 2);
    ctx.fillText('dB', legendX, chartArea.bottom + 14);
    ctx.restore();
  }

  private handleChartEvent(chart: Chart<'scatter'>, event: ChartEvent): void {
    if (!this.spectralData || event.type === 'mouseout' || event.x === null || event.y === null) {
      this.setTooltip(null);
      return;
    }

    const { left, right, top, bottom } = chart.chartArea;
    if (event.x < left || event.x > right || event.y < top || event.y > bottom) {
      this.setTooltip(null);
      return;
    }

    const time = chart.scales['x'].getValueForPixel(event.x);
    const frequency = chart.scales['y'].getValueForPixel(event.y);
    if (time === undefined || frequency === undefined) {
      this.setTooltip(null);
      return;
    }

    const frame = getFrameIndexForTime(time, this.fftSize, this.hopSize, this.sampleRate, this.spectralData.frameCount);
    const bin = getBinForFrequency(frequency, this.fftSize, this.sampleRate, this.positiveBinCount);
    const rawEnergy = this.spectralData.channels[this.selectedChannel][bin][frame];

    this.setTooltip({
      channel: this.getChannelLabel(this.selectedChannel),
      time: getFrameCenterTime(frame, this.fftSize, this.hopSize, this.sampleRate),
      frequency: getFrequencyForBin(bin, this.fftSize, this.sampleRate),
      relativeDb: spectralEnergyToRelativeDb(rawEnergy, this.maximumEnergy),
      rawEnergy,
      x: event.x,
      y: event.y,
    });
  }

  private setTooltip(tooltip: HeatmapTooltip | null): void {
    this.zone.run(() => {
      this.tooltip = tooltip;
      this.changeDetector.markForCheck();
    });
    this.chart?.draw();
  }

  private drawCrosshair(chart: Chart<'scatter'>): void {
    if (!this.tooltip) {
      return;
    }

    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(this.tooltip.x, chartArea.top);
    ctx.lineTo(this.tooltip.x, chartArea.bottom);
    ctx.moveTo(chartArea.left, this.tooltip.y);
    ctx.lineTo(chartArea.right, this.tooltip.y);
    ctx.stroke();
    ctx.restore();
  }

  private applyWaveformBounds(): void {
    if (!this.chart || !this.spectralData) {
      return;
    }

    const domain = this.getTimeDomain();
    const requestedStart = this.waveformBounds[0] ?? domain[0];
    const requestedEnd = this.waveformBounds[1] ?? domain[1];
    const start = Math.max(domain[0], Math.min(requestedStart, domain[1]));
    const end = Math.max(start, Math.min(requestedEnd, domain[1]));
    const minimumSpan = this.hopSize / this.sampleRate;

    const xScale = this.chart.options.scales?.['x'];
    if (!xScale) {
      return;
    }

    xScale.min = start;
    xScale.max = end > start ? end : Math.min(domain[1], start + minimumSpan);
    this.cachedRaster = undefined;
    this.chart.update('none');
  }

  private applyTheme(): void {
    if (!this.chart) {
      return;
    }

    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--p-text-color');
    const textColorSecondary = documentStyle.getPropertyValue('--p-text-muted-color');
    const surfaceBorder = documentStyle.getPropertyValue('--p-content-border-color');

    Object.values(this.chart.options.scales ?? {}).forEach((scale) => {
      if (!scale) return;
      if (scale.title) scale.title.color = textColor;
      if (scale.ticks) scale.ticks.color = textColorSecondary;
      if (scale.grid) scale.grid.color = surfaceBorder;
    });
    this.chart.update('none');
  }

  private updateMaximumEnergy(): void {
    if (!this.spectralData) {
      this.maximumEnergy = 0;
      return;
    }

    const firstBin = this.frequencyScale === 'logarithmic' ? 1 : 0;
    this.maximumEnergy = getSpectralMaximum(this.spectralData, firstBin);
  }

  private getMinimumDisplayedFrequency(): number {
    return this.frequencyScale === 'logarithmic' ? getFrequencyForBin(1, this.fftSize, this.sampleRate) : 0;
  }

  private getTimeDomain(): [number, number] {
    if (!this.spectralData) {
      return [0, 1];
    }

    const start = getFrameCenterTime(0, this.fftSize, this.hopSize, this.sampleRate);
    const end = getFrameCenterTime(this.spectralData.frameCount - 1, this.fftSize, this.hopSize, this.sampleRate);
    const halfHop = this.hopSize / this.sampleRate / 2;
    return end > start ? [start, end] : [Math.max(0, start - halfHop), start + halfHop];
  }

  private getSpectrumColor(db: number): readonly [number, number, number] {
    const normalized = Math.max(0, Math.min(1, (db - SPECTRAL_DB_FLOOR) / -SPECTRAL_DB_FLOOR));
    const scaled = normalized * (SPECTRUM_COLORS.length - 1);
    const lowerIndex = Math.floor(scaled);
    const upperIndex = Math.min(SPECTRUM_COLORS.length - 1, lowerIndex + 1);
    const amount = scaled - lowerIndex;
    const lower = SPECTRUM_COLORS[lowerIndex];
    const upper = SPECTRUM_COLORS[upperIndex];

    return [
      Math.round(lower[0] + (upper[0] - lower[0]) * amount),
      Math.round(lower[1] + (upper[1] - lower[1]) * amount),
      Math.round(lower[2] + (upper[2] - lower[2]) * amount),
    ];
  }

  private getChannelLabel(index: number): string {
    return ['Left', 'Right'][index] ?? `Channel ${index + 1}`;
  }

  private formatFrequency(frequency: number): string {
    if (frequency < 1000) {
      return `${frequency.toFixed(0)} Hz`;
    }

    const decimals = frequency >= 10000 ? 0 : 1;
    return `${(frequency / 1000).toFixed(decimals)} kHz`;
  }

  private destroyChart(): void {
    this.chart?.destroy();
    this.chart = undefined;
    this.cachedRaster = undefined;
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyChart();
  }
}
