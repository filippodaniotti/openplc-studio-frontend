import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Chart, ChartData, ChartOptions, CategoryScale, LinearScale } from 'chart.js';
import { BoxPlotController, BoxAndWiskers, ViolinController, Violin } from '@sgratzl/chartjs-chart-boxplot';
import { ChartModule } from 'primeng/chart';
import { SelectModule } from 'primeng/select';
import { BehaviorSubject, Subject, catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { Study } from '../../listening-studies/listening.models';
import { ListeningClient, listeningError } from '../../listening-studies/listening.client';
import { ChartCondition } from '../../listening-studies/charts/listening-chart-data';
import { ThemeService } from '../../shared/services/theme.service';
import { ListeningRating, ListeningDistribution, listeningDistributions } from './human-listening-distributions';

Chart.register(CategoryScale, LinearScale, BoxPlotController, BoxAndWiskers, ViolinController, Violin);
type DistributionType = 'boxplot' | 'violin';

@Component({
  selector: 'plc-human-listening-distributions',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartModule, SelectModule],
  template: `
    <section aria-label="Listener score distributions" class="distribution-section">
      <header>
        <h3>Listener score distributions</h3>
      </header>
      <div class="chart-controls">
        <div class="control-group">
          <span id="plot-style-label">Plot style</span>
          <div class="plot-style" role="group" aria-labelledby="plot-style-label">
            <button
              type="button"
              [class.active]="plotType === 'boxplot'"
              [attr.aria-pressed]="plotType === 'boxplot'"
              (click)="selectPlotType('boxplot')"
            >
              <i class="pi pi-chart-bar" aria-hidden="true"></i>
              Boxplot
            </button>
            <button
              type="button"
              [class.active]="plotType === 'violin'"
              [attr.aria-pressed]="plotType === 'violin'"
              (click)="selectPlotType('violin')"
            >
              <i class="pi pi-chart-line" aria-hidden="true"></i>
              Violin
            </button>
          </div>
        </div>
        <div class="control-group aggregation-control">
          <label for="distribution-aggregation">Aggregation</label>
          <p-select
            inputId="distribution-aggregation"
            [options]="aggregationOptions"
            optionLabel="label"
            optionValue="value"
            [(ngModel)]="selectedAggregation"
            [disabled]="loading || !panels.length"
            appendTo="body"
            styleClass="w-full"
          />
        </div>
        @if (!chartConditions) {
          <label class="quality-control-toggle">
            <input type="checkbox" [(ngModel)]="showQualityControls" (ngModelChange)="qualityControls.next($event)" />
            Show reference & anchor
          </label>
        }
      </div>
      @if (showDetails) {
        <p>
          Each observation is one completed, included listener’s average score. The overall plot weights tracks equally
          within each listener. Reference and anchor are optional quality-control comparisons, not PLC conditions.
        </p>
        <p class="help">
          Boxplots show the median, middle 50% of scores, whiskers and outliers. Violins show a smoothed distribution;
          with very few listeners they may not be informative. These are descriptive distributions, not confidence
          intervals.
        </p>
      }
      @if (loading) {
        <p role="status">Loading listener distributions…</p>
      }
      @if (error) {
        <p role="alert">{{ error }}</p>
        <button type="button" (click)="reload()">Retry</button>
      }
      @if (selectedPanel; as panel) {
        <article>
          <h4>{{ panel.trackId === null ? 'Overall · all tracks' : 'Track · ' + panel.trackId }}</h4>
          @if (panel.hasScores) {
            @if (showDetails) {
              <p class="help">{{ panel.counts }}</p>
            }
            <!-- PrimeNG narrows its type input to built-ins; Chart.js registers these extension types above. -->
            <p-chart [type]="$any(plotType)" [data]="panel.data" [options]="options" height="340px" />
          } @else {
            <p>No included listener scores are available for this study.</p>
          }
        </article>
      }
    </section>
  `,
  styles: [
    `
      .distribution-section {
        margin: 1.5rem 0;
        color: var(--p-text-color);
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
      }
      h3,
      h4 {
        font-weight: 700;
      }
      h3 {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 1.15rem;
        line-height: 1.35;
        letter-spacing: -0.015em;
      }
      h3::before {
        content: '';
        width: 0.25rem;
        height: 1.25rem;
        flex: 0 0 auto;
        border-radius: 999px;
        background: var(--p-primary-color);
      }
      h4 {
        font-size: 1.05rem;
        overflow-wrap: anywhere;
      }
      p {
        margin: 0.75rem 0;
        line-height: 1.6;
      }
      .help {
        color: var(--p-text-muted-color);
        font-size: 0.9rem;
      }
      article {
        margin-top: 1.5rem;
        padding: 1rem;
        border: 1px solid var(--p-content-border-color);
        border-radius: 0.75rem;
      }
      .chart-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem 1.5rem;
        margin: 1rem 0;
        align-items: flex-end;
      }
      .control-group {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        font-size: 0.85rem;
        font-weight: 600;
      }
      .aggregation-control {
        flex: 1;
        min-width: min(100%, 240px);
        max-width: 420px;
      }
      .quality-control-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.65rem 0;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 600;
      }
      .quality-control-toggle input {
        width: 1.1rem;
        height: 1.1rem;
        accent-color: var(--p-primary-color);
      }
      .plot-style {
        display: inline-flex;
        padding: 0.25rem;
        gap: 0.25rem;
        border-radius: 0.65rem;
        background: var(--p-content-hover-background);
        border: 1px solid var(--p-content-border-color);
      }
      .plot-style button {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.55rem 0.9rem;
        border-color: transparent;
        background: transparent;
        cursor: pointer;
        font-weight: 600;
      }
      .plot-style button.active {
        color: var(--p-highlight-color);
        background: var(--p-highlight-background);
        border-color: var(--p-primary-color);
      }
      .plot-style button:hover:not(.active) {
        background: var(--p-content-background);
      }
      button:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 2px;
      }
      select,
      button {
        font: inherit;
        padding: 0.5rem;
        color: var(--p-text-color);
        background: var(--p-content-background);
        border: 1px solid var(--p-content-border-color);
        border-radius: 0.4rem;
      }
    `,
  ],
})
export class HumanListeningDistributionsComponent implements OnChanges {
  @Input({ required: true }) public study!: Study;
  @Input() public showDetails = true;
  @Input() public ratings?: ListeningRating[];
  @Input() public ratingsLoading = false;
  @Input() public ratingsError = '';
  @Input() public chartConditions?: ChartCondition[];
  @Output() public readonly ratingsRetry = new EventEmitter<void>();
  private studyId = '';
  public plotType: DistributionType = 'boxplot';
  public selectedAggregation = 'null';
  public showQualityControls = false;
  public readonly qualityControls = new BehaviorSubject(false);
  public get aggregationOptions(): { label: string; value: string }[] {
    return this.panels.map((panel) => ({
      label: panel.trackId === null ? 'Overall · all tracks' : panel.trackId,
      value: JSON.stringify(panel.trackId),
    }));
  }
  public get selectedPanel() {
    return this.panels.find((panel) => JSON.stringify(panel.trackId) === this.selectedAggregation) ?? this.panels[0];
  }
  public selectPlotType(type: DistributionType): void {
    if (this.plotType === type) return;
    this.plotType = type;
    this.changePlotType();
  }
  public loading = true;
  public error = '';
  public panels: { trackId: string | null; data: ChartData<DistributionType>; counts: string; hasScores: boolean }[] =
    [];
  public options: ChartOptions<DistributionType> = {};
  private readonly requests = new Subject<Study>();
  private readonly data = new BehaviorSubject<ListeningDistribution[]>([]);
  private readonly destroyRef = inject(DestroyRef);
  constructor(
    private readonly http: HttpClient,
    private readonly listening: ListeningClient,
    theme: ThemeService,
  ) {
    this.requests
      .pipe(
        switchMap((study) => {
          this.loading = true;
          this.error = '';
          this.data.next([]);
          return this.http.get<ListeningRating[]>(this.listening.exportUrl(study.id, 'responses.json')).pipe(
            map((rows) =>
              listeningDistributions(rows, [
                ...study.conditions.map((condition) => condition.id),
                'reference',
                'anchor35',
              ]),
            ),
            catchError((error) => {
              this.error = listeningError(error);
              return of([]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((distributions) => {
        this.loading = false;
        this.data.next(distributions);
      });
    combineLatest([this.data, theme.isDarkMode, this.qualityControls])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([distributions, dark, showQualityControls]) => {
        const includesQualityControls = this.chartConditions
          ? this.chartConditions.some(
              (condition) => condition.role === 'anchor' || condition.role === 'hidden_reference',
            )
          : showQualityControls;
        const style = getComputedStyle(document.documentElement);
        const text = style.getPropertyValue('--p-text-color').trim() || (dark ? '#e5e7eb' : '#374151');
        const grid = dark ? '#374151' : '#e5e7eb';
        this.options = {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
          scales: {
            x: {
              ticks: { color: text },
              grid: { display: false },
              title: {
                display: true,
                text: includesQualityControls ? 'PLC conditions & quality controls' : 'PLC condition',
                color: text,
              },
            },
            y: {
              min: 0,
              max: 100,
              ticks: { color: text },
              grid: { color: grid },
              title: { display: true, text: 'Quality score · higher is better', color: text },
            },
          },
        };
        const colors = dark
          ? ['#60a5fa', '#34d399', '#fbbf24', '#c084fc', '#fb7185']
          : ['#2563eb', '#059669', '#d97706', '#9333ea', '#e11d48'];
        this.panels = distributions.map((distribution) => {
          const conditions: ChartCondition[] = this.chartConditions ?? [
            ...(showQualityControls ? [{ id: 'anchor35', name: 'Anchor · QC', module_index: -1 }] : []),
            ...this.study.conditions,
            ...(showQualityControls ? [{ id: 'reference', name: 'Hidden reference · QC', module_index: -1 }] : []),
          ];
          const conditionColors = conditions.map((condition, index) => {
            if (condition.role === 'anchor') return dark ? '#94a3b8' : '#475569';
            if (condition.role === 'hidden_reference') return dark ? '#fbbf24' : '#b45309';
            const colorIndex = this.chartConditions
              ? this.study.conditions.findIndex((item) => item.id === condition.id)
              : index;
            return colors[Math.max(0, colorIndex) % colors.length];
          });
          return {
            trackId: distribution.trackId,
            counts: conditions
              .map((condition) => `${condition.name}: ${distribution.values[condition.id].length} listeners`)
              .join(' · '),
            hasScores: conditions.some((condition) => distribution.values[condition.id].length > 0),
            data: {
              labels: conditions.map((condition) =>
                condition.module_index < 0 ? condition.name : `${condition.name} (#${condition.module_index + 1})`,
              ),
              datasets: [
                {
                  label: 'Listener averages',
                  data: conditions.map((condition) => distribution.values[condition.id]),
                  backgroundColor: conditionColors.map((color) => color + '66'),
                  borderColor: conditionColors,
                  borderWidth: 1.5,
                },
              ],
            },
          };
        });
      });
  }
  public changePlotType(): void {
    // PrimeNG only reinitializes Chart.js on data/options changes, not type changes.
    this.panels = this.panels.map((panel) => ({ ...panel, data: { ...panel.data } }));
  }
  public ngOnChanges(): void {
    if (this.study.id !== this.studyId) {
      this.studyId = this.study.id;
      this.selectedAggregation = 'null';
    }
    if (this.ratings !== undefined) {
      this.loading = this.ratingsLoading;
      this.error = this.ratingsError;
      const ids = (this.chartConditions ?? this.study.conditions).map((condition) => condition.id);
      this.data.next(listeningDistributions(this.ratings, ids));
    } else {
      this.reload();
    }
  }
  public reload(): void {
    if (this.ratings !== undefined) this.ratingsRetry.emit();
    else this.requests.next(this.study);
  }
}
