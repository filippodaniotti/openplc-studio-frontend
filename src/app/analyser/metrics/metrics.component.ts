import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ListeningClient, listeningError } from '../../listening-studies/listening.client';
import { Study, StudyResults } from '../../listening-studies/listening.models';
import { StudyResultsComponent } from '../../listening-studies/study-results.component';
import { HumanListeningDistributionsComponent } from './human-listening-distributions.component';
import { Chart, ChartData, ChartOptions } from 'chart.js';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { DividerModule } from 'primeng/divider';
import { MultiSelectModule } from 'primeng/multiselect';
import { SkeletonModule } from 'primeng/skeleton';
import {
  catchError,
  debounceTime,
  exhaustMap,
  filter,
  forkJoin,
  map,
  of,
  Subject,
  switchMap,
  takeUntil,
  tap,
  timer,
} from 'rxjs';
import {
  FocusedRunModule,
  RunConfigurationDrawerComponent,
} from '../../shared/components/run-configuration-drawer/run-configuration-drawer.component';
import { ModuleType } from '../../shared/enums/module-type.enum';
import { ThemeService } from '../../shared/services/theme.service';
import { AnalysisService, MetricRaw, isHumanMetricPayload } from '../analysis.service';
import { DARK_COLORS, LIGHT_COLORS } from '../utils';
import { addPendingHumanMetric, buildMetricPresentations, MetricPresentation } from './metric-presentation';
import { SpectralEnergyHeatmapComponent } from './spectral-energy-heatmap/spectral-energy-heatmap.component';

const TD_METRICS = ['MSECalculator', 'MAECalculator', 'WindowedPEAQCalculator'];
const TD_METRICS_CHANNEL_AGNOSTIC_METRICS = ['PerceptualCalculator'];
const PACKET_ALIGNED_METRICS = ['WindowedPEAQCalculator', 'PerceptualCalculator'];
const SPECTRAL_ENERGY_METRIC = 'SpectralEnergyCalculator';
type ScalarMetricConfig = {
  label: string;
  minimum: number;
  maximum: number;
  description: string;
};

const SCALAR_METRICS: Record<string, ScalarMetricConfig[]> = {
  PLCMOSCalculator: [{ label: 'MOS', minimum: 1, maximum: 5, description: 'Higher is better' }],
  PESQCalculator: [{ label: 'MOS-LQO', minimum: -0.5, maximum: 4.5, description: 'Higher is better' }],
  PEAQCalculator: [
    { label: 'DI', minimum: -12, maximum: 3, description: 'Higher is better' },
    { label: 'ODG', minimum: -4, maximum: 0, description: 'Higher is better' },
  ],
};

type ChartMetricVisualization = {
  kind: 'chart';
  metric: MetricPresentation;
  data: ChartData;
  options: ChartOptions;
  type: 'line' | 'bar';
};

type ScalarMetricVisualization = {
  kind: 'scalar';
  metric: MetricPresentation;
  scores: ScalarMetricScore[];
  data: ChartData;
  options: ChartOptions;
  type: 'bar';
};

type ScalarMetricScore = {
  value: number;
  formattedValue: string;
  scoreLabel: string;
  rangeLabel: string;
  description: string;
};

type SpectralMetricVisualization = {
  kind: 'spectral';
  metric: MetricPresentation;
  fallbackIndex: number;
};

type UnsupportedMetricVisualization = {
  kind: 'unsupported';
  metric: MetricPresentation;
  message: string;
};

type MetricVisualization =
  | ChartMetricVisualization
  | ScalarMetricVisualization
  | SpectralMetricVisualization
  | UnsupportedMetricVisualization;

@Component({
  selector: 'plc-metrics',
  imports: [
    CommonModule,
    FormsModule,
    SkeletonModule,
    ChartModule,
    MultiSelectModule,
    ButtonModule,
    DividerModule,
    RunConfigurationDrawerComponent,
    SpectralEnergyHeatmapComponent,
    RouterLink,
    StudyResultsComponent,
    HumanListeningDistributionsComponent,
  ],
  templateUrl: './metrics.component.html',
  styleUrl: './metrics.component.scss',
})
export class MetricsComponent {
  public metrics: MetricRaw[] = [];
  public humanPanels: { study: Study; results: StudyResults }[] = [];
  public humanError = '';

  public metricOptions: MetricPresentation[] = [];

  public displayMetrics: MetricPresentation[] = [];

  public visualizations: MetricVisualization[] = [];

  public chartsReady = false;

  public configDrawerVisible = false;

  public focusedOutputAnalyserModule: FocusedRunModule | null = null;

  private latestWaveformBounds: number[] = [];

  private destroy$ = new Subject<void>();

  @ViewChild('chartContainer', { static: false })
  public chartContainer?: ElementRef<HTMLElement>;

  constructor(
    public readonly analysisService: AnalysisService,
    private readonly themeService: ThemeService,
    private readonly listening: ListeningClient,
  ) {}

  public ngOnInit(): void {
    this.analysisService.run
      .pipe(
        switchMap((run) =>
          run?.modules[ModuleType.OutputAnalyser].some((module) => module.name === 'HumanCalculator')
            ? (run.status === 'completed' ? timer(0) : timer(0, 5000)).pipe(
                exhaustMap(() =>
                  this.listening.studies(run.id).pipe(
                    switchMap((studies) =>
                      studies.length
                        ? forkJoin(
                            studies.map((study) =>
                              this.listening.results(study.id).pipe(map((results) => ({ study, results }))),
                            ),
                          )
                        : of([]),
                    ),
                    catchError((error) => {
                      this.humanError = listeningError(error);
                      return of(null);
                    }),
                  ),
                ),
              )
            : of([]),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe((panels) => {
        if (panels) {
          this.humanPanels = panels;
          this.humanError = '';
        }
      });
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
          const outputAnalyserModules = this.analysisService.run.value?.modules[ModuleType.OutputAnalyser] ?? [];
          this.metricOptions = buildMetricPresentations(metrics, outputAnalyserModules, (metric, fallbackIndex) =>
            this.analysisService.resolveOutputAnalyserModuleForMetric(metric.name, fallbackIndex),
          );
          if (
            this.analysisService.run.value?.status !== 'completed' &&
            this.analysisService.selectedTrackPlayback.value?.kind !== 'original-audio'
          ) {
            this.metricOptions = addPendingHumanMetric(this.metricOptions, outputAnalyserModules);
          }
          this.metrics = this.metricOptions;
          this.displayMetrics = [];
          this.visualizations = [];
        }),
        filter(() => this.metricOptions.length > 0),
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

  public get humanMetricSelected(): boolean {
    return this.displayMetrics.some((metric) => metric.calculatorName === 'HumanCalculator');
  }

  public isMetricDisplayed(metric: MetricRaw): boolean {
    return this.displayMetrics.some((displayMetric) => displayMetric.index === metric.index);
  }

  public openMetricConfiguration(metric: MetricPresentation): void {
    this.focusedOutputAnalyserModule =
      metric.moduleIndex === null ? null : { type: ModuleType.OutputAnalyser, index: metric.moduleIndex };
    this.configDrawerVisible = true;
  }

  private buildAllVisualizations(): void {
    this.visualizations = this.metricOptions.map((metric, fallbackIndex) =>
      this.buildVisualization(metric, fallbackIndex),
    );
  }

  private buildVisualization(metric: MetricPresentation, fallbackIndex: number): MetricVisualization {
    const metricModule = metric.calculatorName;
    if (
      metricModule === 'HumanCalculator' &&
      (this.analysisService.run.value?.status !== 'completed' ||
        (isHumanMetricPayload(metric.json) && metric.json.status === 'prepared'))
    )
      return {
        kind: 'unsupported',
        metric,
        message:
          'The listening study is not completed. Complete all listening trials and close collection in the Study Hub, then wait for finalization before viewing results.',
      };
    if (isHumanMetricPayload(metric.json))
      return {
        kind: 'unsupported',
        metric,
        message:
          metric.json.status === 'prepared'
            ? 'Manual input pending. Use listening studies to collect ratings; participant-aware results appear below.'
            : 'Finalized human output. Study-wide participant-aware results appear below; raw excerpt means are not independent observations.',
      };
    if (typeof metric.json !== 'number' && !Array.isArray(metric.json))
      return { kind: 'unsupported', metric, message: 'Unknown structured metric payload.' };

    const scalarConfigs = SCALAR_METRICS[metricModule];
    if (scalarConfigs) {
      const values = this.readScalarMetrics(metric.json, scalarConfigs.length);
      if (values === null) {
        return {
          kind: 'unsupported',
          metric,
          message: `${metricModule} returned invalid scalar metric values.`,
        };
      }
      return {
        kind: 'scalar',
        metric,
        scores: values.map((value, index) => this.initScalarMetricScore(value, scalarConfigs[index])),
        ...this.initScalarMetricChart(values, scalarConfigs),
      };
    }

    if (TD_METRICS.includes(metricModule)) {
      return { kind: 'chart', metric, ...this.initTDChart(metric) };
    }
    if (TD_METRICS_CHANNEL_AGNOSTIC_METRICS.includes(metricModule)) {
      return { kind: 'chart', metric, ...this.initTDCAChart(metric) };
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

  private readScalarMetrics(payload: MetricRaw['json'], expectedCount: number): number[] | null {
    if (typeof payload !== 'number' && !Array.isArray(payload)) return null;
    const values = typeof payload === 'number' ? [payload] : payload;
    if (
      values.length !== expectedCount ||
      values.some((value) => typeof value !== 'number' || !Number.isFinite(value))
    ) {
      return null;
    }
    return values as number[];
  }

  private initScalarMetricScore(value: number, config: ScalarMetricConfig): ScalarMetricScore {
    return {
      value,
      formattedValue: Number(value.toFixed(3)).toString(),
      scoreLabel: config.label,
      rangeLabel: `${config.minimum}–${config.maximum}`,
      description: config.description,
    };
  }

  private initScalarMetricChart(
    values: number[],
    configs: ScalarMetricConfig[],
  ): Pick<ScalarMetricVisualization, 'data' | 'options' | 'type'> {
    const { colorPalette, textColor, textColorSecondary, surfaceBorder } = this.getChartTheme();
    const colors = values.map((_, index) => colorPalette[index % colorPalette.length]);
    const data: ChartData = {
      labels: configs.map((config) => config.label),
      datasets: [
        {
          label: 'Value',
          data: values,
          borderColor: colors,
          backgroundColor: colors.map((color) => `${color}66`),
          borderWidth: 1,
          borderRadius: 8,
          barThickness: 24,
        },
      ],
    };
    const options: ChartOptions = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          min: Math.min(...configs.map((config) => config.minimum)),
          max: Math.max(...configs.map((config) => config.maximum)),
          ticks: { color: textColorSecondary },
          grid: { color: surfaceBorder },
        },
        y: { ticks: { color: textColor }, grid: { display: false } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { intersect: false, mode: 'nearest' as const },
      },
    };
    return { data, options, type: 'bar' };
  }

  private initTDChart(metric: MetricPresentation): Pick<ChartMetricVisualization, 'data' | 'options' | 'type'> {
    const { colorPalette, textColor, textColorSecondary, surfaceBorder } = this.getChartTheme();
    const values = Array.isArray(metric.json) ? metric.json : [];
    const channels = Array.isArray(values[0]) ? (values as number[][]) : [values as number[]];

    const data: ChartData = {
      labels: Array.from({ length: channels[0]?.length ?? 0 }, (_, i) => i.toString()),
      datasets: channels.map((channel, index) => ({
        label: this.getTimeSeriesLabel(metric.calculatorName, index, channels.length),
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
    const { colorPalette, textColor, textColorSecondary, surfaceBorder } = this.getChartTheme();
    const values = Array.isArray(metric.json) && !Array.isArray(metric.json[0]) ? (metric.json as number[]) : [];

    const data: ChartData = {
      labels: Array.from({ length: values.length }, (_, i) => i.toString()),
      datasets: [
        {
          label: 'Linked channels',
          data: values,
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

  private applyWaveformBounds(bounds: number[]): void {
    this.visualizations.forEach((visualization) => {
      if (visualization.kind !== 'chart') return;

      const metricName = visualization.metric.calculatorName;
      const fallbackIndex = this.metrics.findIndex((metric) => metric.index === visualization.metric.index);
      let chartBounds: [number, number] | null = null;

      if (TD_METRICS.includes(metricName) && !PACKET_ALIGNED_METRICS.includes(metricName)) {
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
      } else if (PACKET_ALIGNED_METRICS.includes(metricName)) {
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

  private getChartTheme(): {
    colorPalette: string[];
    textColor: string;
    textColorSecondary: string;
    surfaceBorder: string;
  } {
    const documentStyle = getComputedStyle(document.documentElement);
    return {
      colorPalette: this.themeService.isDarkMode.value ? DARK_COLORS : LIGHT_COLORS,
      textColor: documentStyle.getPropertyValue('--p-text-color'),
      textColorSecondary: documentStyle.getPropertyValue('--p-text-muted-color'),
      surfaceBorder: documentStyle.getPropertyValue('--p-content-border-color'),
    };
  }

  private getTimeSeriesLabel(metricName: string, index: number, channelCount: number): string {
    if (metricName === 'WindowedPEAQCalculator') {
      return ['DI', 'ODG'][index] ?? `Metric ${index + 1}`;
    }
    if (channelCount === 1) return 'Mono';
    return ['Left', 'Right'][index] ?? `Channel ${index + 1}`;
  }

  public destroyCharts(): void {
    this.visualizations = [];
    this.metricOptions = [];
    this.displayMetrics = [];
    this.focusedOutputAnalyserModule = null;
    this.chartsReady = false;
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
