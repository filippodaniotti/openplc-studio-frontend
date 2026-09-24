import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart, ChartData, ChartOptions } from 'chart.js';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { DividerModule } from 'primeng/divider';
import { MultiSelectModule } from 'primeng/multiselect';
import { SkeletonModule } from 'primeng/skeleton';
import { debounceTime, filter, of, Subject, switchMap, takeUntil, tap } from 'rxjs';
import {
  FocusedRunModule,
  RunConfigurationDrawerComponent,
} from '../../shared/components/run-configuration-drawer/run-configuration-drawer.component';
import { ModuleType } from '../../shared/enums/module-type.enum';
import { ThemeService } from '../../shared/services/theme.service';
import { AnalysisService, MetricRaw } from '../analysis.service';
import { DARK_COLORS, LIGHT_COLORS } from '../utils';
import { MetricLabelPipe, metricLabelTransform } from './metric-label.pipe';
import { SpectralEnergyHeatmapComponent } from './spectral-energy-heatmap/spectral-energy-heatmap.component';

const TD_METRICS = ['MSECalculator', 'MAECalculator'];
const TD_METRICS_CHANNEL_AGNOSTIC_METRICS = ['WindowedPEAQCalculator', 'PerceptualCalculator'];
const SPECTRAL_ENERGY_METRIC = 'SpectralEnergyCalculator';

type MetricOption = MetricRaw & { displayName: string };

type ChartMetricVisualization = {
  kind: 'chart';
  metric: MetricRaw;
  data: ChartData;
  options: ChartOptions;
  type: 'line' | 'bar';
};

type SpectralMetricVisualization = {
  kind: 'spectral';
  metric: MetricRaw;
  fallbackIndex: number;
};

type UnsupportedMetricVisualization = {
  kind: 'unsupported';
  metric: MetricRaw;
  message: string;
};

type MetricVisualization = ChartMetricVisualization | SpectralMetricVisualization | UnsupportedMetricVisualization;

@Component({
  selector: 'plc-metrics',
  imports: [
    CommonModule,
    FormsModule,
    SkeletonModule,
    ChartModule,
    MultiSelectModule,
    MetricLabelPipe,
    ButtonModule,
    DividerModule,
    RunConfigurationDrawerComponent,
    SpectralEnergyHeatmapComponent,
  ],
  templateUrl: './metrics.component.html',
})
export class MetricsComponent {
  public metrics: MetricRaw[] = [];

  public metricOptions: MetricOption[] = [];

  public displayMetrics: MetricOption[] = [];

  public visualizations: MetricVisualization[] = [];

  public chartsReady = false;

  public configDrawerVisible = false;

  private latestWaveformBounds: number[] = [];

  private destroy$ = new Subject<void>();

  @ViewChild('chartContainer', { static: false })
  public chartContainer?: ElementRef<HTMLElement>;

  constructor(
    public readonly analysisService: AnalysisService,
    private readonly themeService: ThemeService,
  ) {}

  public ngOnInit(): void {
    this.themeService.isDarkMode
      .asObservable()
      .pipe(
        takeUntil(this.destroy$),
        filter(() => this.chartsReady),
        tap(() => this.rebuildChartsForTheme()),
      )
      .subscribe();

    this.analysisService.wsZoomBounds
      .asObservable()
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        filter((bounds) => Array.isArray(bounds) && bounds.length === 2),
        tap((bounds) => {
          this.latestWaveformBounds = bounds;
          this.applyWaveformBounds(bounds);
        }),
      )
      .subscribe();

    this.analysisService.selectedTrackPlayback
      .asObservable()
      .pipe(
        takeUntil(this.destroy$),
        filter((track): track is { name: string } => !!track?.name),
        switchMap((track) => of(this.analysisService.playbaleTrackToMetricsMap.value[track.name.split('.')[0]] ?? [])),
        tap(() => this.destroyCharts()),
        tap((metrics) => {
          this.metrics = metrics;
          this.metricOptions = metrics.map((metric) => ({
            ...metric,
            displayName: metricLabelTransform(metric.name),
          }));
        }),
        filter((metrics) => metrics.length > 0),
        tap(() => this.buildAllVisualizations()),
        tap(() => (this.displayMetrics = this.metricOptions.slice(0, 1))),
        tap(() => {
          this.chartsReady = true;
          if (this.latestWaveformBounds.length === 2) {
            this.applyWaveformBounds(this.latestWaveformBounds);
          }
        }),
      )
      .subscribe();
  }

  public isMetricDisplayed(metric: MetricRaw): boolean {
    return this.displayMetrics.some((displayMetric) => displayMetric.index === metric.index);
  }

  public get focusedOutputAnalyserModules(): FocusedRunModule[] {
    const modules = this.analysisService.run.value?.modules[ModuleType.OutputAnalyser] ?? [];
    const focusedIndexes = new Set<number>();

    this.displayMetrics.forEach((metric) => {
      const fallbackIndex = this.metrics.findIndex((candidate) => candidate.index === metric.index);
      const module = this.analysisService.resolveOutputAnalyserModuleForMetric(
        metric.name,
        fallbackIndex >= 0 ? fallbackIndex : null,
      );
      if (!module) return;

      const moduleIndex = modules.indexOf(module);
      if (moduleIndex >= 0) focusedIndexes.add(moduleIndex);
    });

    return [...focusedIndexes].map((index) => ({ type: ModuleType.OutputAnalyser, index }));
  }

  private buildAllVisualizations(): void {
    this.visualizations = this.metrics.map((metric, fallbackIndex) => this.buildVisualization(metric, fallbackIndex));
  }

  private buildVisualization(metric: MetricRaw, fallbackIndex: number): MetricVisualization {
    const metricModule = this.getMetricsNameFromRawName(metric.name.split('/').pop());

    if (TD_METRICS.includes(metricModule)) {
      return { kind: 'chart', metric, ...this.initTDChart(metric) };
    }
    if (TD_METRICS_CHANNEL_AGNOSTIC_METRICS.includes(metricModule)) {
      return { kind: 'chart', metric, ...this.initTDCAChart(metric) };
    }
    if (metricModule === 'PEAQCalculator') {
      return { kind: 'chart', metric, ...this.initPEAQChart(metric) };
    }
    if (metricModule === SPECTRAL_ENERGY_METRIC) {
      return { kind: 'spectral', metric, fallbackIndex };
    }

    return {
      kind: 'unsupported',
      metric,
      message: `No analyser visualization is available for ${metricModule || 'this metric'}.`,
    };
  }

  private initTDChart(metric: MetricRaw): Pick<ChartMetricVisualization, 'data' | 'options' | 'type'> {
    const colorPalette = this.themeService.isDarkMode.value ? DARK_COLORS : LIGHT_COLORS;
    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--p-text-color');
    const textColorSecondary = documentStyle.getPropertyValue('--p-text-muted-color');
    const surfaceBorder = documentStyle.getPropertyValue('--p-content-border-color');
    const channels = Array.isArray(metric.json[0]) ? (metric.json as number[][]) : [metric.json as number[]];

    const data: ChartData = {
      labels: Array.from({ length: channels[0]?.length ?? 0 }, (_, i) => i.toString()),
      datasets: channels.map((channel, index) => ({
        label: this.getChannelLabel(index),
        data: channel,
        tension: 0.25,
        borderColor: colorPalette[index % colorPalette.length],
        backgroundColor: `${colorPalette[index % colorPalette.length]}26`,
        pointRadius: 2,
        fill: true,
      })),
    };

    const options: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 8, color: textColorSecondary }, grid: { color: surfaceBorder } },
        y: { beginAtZero: true, ticks: { color: textColorSecondary }, grid: { color: surfaceBorder } },
      },
      plugins: {
        legend: { display: true, labels: { color: textColor } },
        tooltip: { intersect: false, mode: 'index' as const },
      },
    };
    return { data, options, type: 'line' };
  }

  private initTDCAChart(metric: MetricRaw): Pick<ChartMetricVisualization, 'data' | 'options' | 'type'> {
    const colorPalette = this.themeService.isDarkMode.value ? DARK_COLORS : LIGHT_COLORS;
    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--p-text-color');
    const textColorSecondary = documentStyle.getPropertyValue('--p-text-muted-color');
    const surfaceBorder = documentStyle.getPropertyValue('--p-content-border-color');

    const data: ChartData = {
      labels: Array.from({ length: metric.json.length }, (_, i) => i.toString()),
      datasets: [
        {
          label: 'Linked channels',
          data: metric.json,
          tension: 0.25,
          borderColor: colorPalette[0],
          backgroundColor: `${colorPalette[0]}26`,
          pointRadius: 2,
          fill: true,
        },
      ],
    };

    const options: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 8, color: textColorSecondary }, grid: { color: surfaceBorder } },
        y: { beginAtZero: true, ticks: { color: textColorSecondary }, grid: { color: surfaceBorder } },
      },
      plugins: {
        legend: { display: true, labels: { color: textColor } },
        tooltip: { intersect: false, mode: 'index' as const },
      },
    };
    return { data, options, type: 'line' };
  }

  private initPEAQChart(metric: MetricRaw): Pick<ChartMetricVisualization, 'data' | 'options' | 'type'> {
    const colorPalette = this.themeService.isDarkMode.value ? DARK_COLORS : LIGHT_COLORS;
    const documentStyle = getComputedStyle(document.documentElement);
    const textColorSecondary = documentStyle.getPropertyValue('--p-text-muted-color');
    const surfaceBorder = documentStyle.getPropertyValue('--p-content-border-color');

    const data: ChartData = {
      labels: ['DI', 'ODG'],
      datasets: [
        {
          data: metric.json,
          borderColor: [colorPalette[0], colorPalette[1]],
          backgroundColor: [`${colorPalette[0]}26`, `${colorPalette[1]}26`],
          borderWidth: 1,
        },
      ],
    };
    const options: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { ticks: { autoSkip: true, maxTicksLimit: 8, color: textColorSecondary }, grid: { color: surfaceBorder } },
        y: { beginAtZero: true, min: -4, ticks: { color: textColorSecondary }, grid: { color: surfaceBorder } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { intersect: false, mode: 'index' as const },
      },
    };
    return { data, options, type: 'bar' };
  }

  private applyWaveformBounds(bounds: number[]): void {
    this.visualizations.forEach((visualization) => {
      if (visualization.kind !== 'chart') return;

      const metricName = this.getMetricsNameFromRawName(visualization.metric.name);
      const fallbackIndex = this.metrics.findIndex((metric) => metric.index === visualization.metric.index);
      let chartBounds: [number, number] | null = null;

      if (TD_METRICS.includes(metricName)) {
        const outputAnalyserModule = this.analysisService.resolveOutputAnalyserModuleForMetric(
          visualization.metric.name,
          fallbackIndex >= 0 ? fallbackIndex : null,
        );
        const windowLength = Number(this.analysisService.getModuleSettingValue(outputAnalyserModule, 'N')) || 0;
        const hopSize =
          Number(this.analysisService.getModuleSettingValue(outputAnalyserModule, 'hop')) || windowLength / 2;
        chartBounds = bounds.map((bound) =>
          Math.round((bound * this.analysisService.selectedTrackPlaybackSampleRate.value - windowLength) / hopSize + 1),
        ) as [number, number];
      } else if (TD_METRICS_CHANNEL_AGNOSTIC_METRICS.includes(metricName)) {
        const packetSize =
          this.analysisService.sampleMaskPacketSizes[this.analysisService.selectedSampleMaskIndex.value];
        chartBounds = bounds.map(
          (bound) => (bound * this.analysisService.selectedTrackPlaybackSampleRate.value) / packetSize,
        ) as [number, number];
      }

      if (!chartBounds || !visualization.options.scales?.['x']) return;

      visualization.options.scales['x'].min = chartBounds[0];
      visualization.options.scales['x'].max = chartBounds[1];
      this.updateMountedChart(visualization.metric.index, chartBounds);
    });
  }

  private updateMountedChart(metricIndex: number, bounds: [number, number]): void {
    const wrapper = this.chartContainer?.nativeElement.querySelector<HTMLElement>(
      `[data-standard-metric-index="${metricIndex}"]`,
    );
    const canvas = wrapper?.querySelector('canvas');
    const chart = canvas ? Chart.getChart(canvas) : undefined;

    if (chart?.options.scales?.['x']) {
      chart.options.scales['x'].min = bounds[0];
      chart.options.scales['x'].max = bounds[1];
      chart.update('none');
    }
  }

  private rebuildChartsForTheme(): void {
    if (!this.chartsReady) return;
    this.buildAllVisualizations();
    if (this.latestWaveformBounds.length === 2) {
      this.applyWaveformBounds(this.latestWaveformBounds);
    }
  }

  private getChannelLabel(index: number): string {
    return ['Left', 'Right'][index] ?? `Channel ${index + 1}`;
  }

  public getMetricsNameFromRawName(rawName: string | undefined): string {
    if (!rawName) return '';
    return metricLabelTransform(rawName).split('-')[0];
  }

  public destroyCharts(): void {
    this.visualizations = [];
    this.metricOptions = [];
    this.displayMetrics = [];
    this.chartsReady = false;
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
