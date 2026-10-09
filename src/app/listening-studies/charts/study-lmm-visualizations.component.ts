import { Component, DestroyRef, Input, OnChanges, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
import { Study, StudyResults, StudyInference } from '../listening.models';
import { ListeningClient, listeningError } from '../listening.client';
import { ChartCondition, FrozenListeningRating, ListenerProfile, listenerProfiles } from './listening-chart-data';
import { StudyResultsComponent } from '../study-results.component';
import { HumanListeningDistributionsComponent } from '../../analyser/metrics/human-listening-distributions.component';
import { EmmPlotComponent } from './emm-plot.component';
import { TukeyForestPlotComponent } from './tukey-forest-plot.component';
import { SignificanceHeatmapComponent } from './significance-heatmap.component';
import { ParticipantSpaghettiPlotComponent } from './participant-spaghetti-plot.component';

type RatingsRequest = { study: Study; results: StudyResults } | null;
@Component({
  selector: 'plc-study-lmm-visualizations',
  standalone: true,
  imports: [
    StudyResultsComponent,
    HumanListeningDistributionsComponent,
    EmmPlotComponent,
    TukeyForestPlotComponent,
    SignificanceHeatmapComponent,
    ParticipantSpaghettiPlotComponent,
  ],
  template: `
    @if (finalized) {
      <section aria-label="Finalized listening-study visualizations">
        <label class="quality-control-toggle">
          <input
            type="checkbox"
            [checked]="showQualityControls"
            [disabled]="!qualityControlsAvailable"
            (change)="changeQualityControls($event)"
          />
          Show reference & anchor
        </label>
        @if (showResults && !plotsOnly) {
          <plc-study-results [study]="study" [results]="results" [showQualityControls]="showQualityControls" />
        }
        @if (!plotsOnly) {
          <h2>Finalized listening-study visualizations</h2>
          @if (showQualityControls) {
            <p class="scope-notice" role="status">
              Exploratory QC-inclusive analysis · Anchor → PLC conditions → Hidden reference. These plots use a separate
              LMM and Tukey family including all rated conditions, matching the selected tables above. Even PLC-to-PLC
              comparisons may change. Switch off reference & anchor to view the primary PLC-only analysis.
            </p>
          }
          <p class="help">
            {{ showQualityControls ? 'PLC conditions plus quality controls' : 'All PLC conditions' }} and all source
            tracks. Model uncertainty is asymptotic; pointwise EMM intervals and simultaneous Tukey difference intervals
            answer different questions.
          </p>
          @if (activeInference.correction_note) {
            <p class="help">{{ activeInference.correction_note }}</p>
          }
          @if (showQualityControls && activeInference.fallback) {
            <p class="help">Exploratory model fallback: random intercepts without participant-condition deviations.</p>
          }
          @if (showQualityControls && activeInference.diagnostics?.length) {
            <details>
              <summary>Exploratory QC model diagnostics</summary>
              <ul>
                @for (message of activeInference.diagnostics; track $index) {
                  <li>{{ message }}</li>
                }
              </ul>
            </details>
          }
        } @else {
          <div class="analysis-scope" role="status">
            {{ showQualityControls ? 'Exploratory QC-inclusive LMM + Tukey' : 'Primary PLC-only LMM + Tukey' }}
          </div>
        }
        @if (includeDistributions) {
          <plc-human-listening-distributions
            [study]="study"
            [ratings]="rows"
            [chartConditions]="visibleConditions"
            [ratingsLoading]="loading"
            [ratingsError]="error"
            [showDetails]="!plotsOnly"
            (ratingsRetry)="reload()"
          />
        }
        <div class="chart-grid">
          <plc-emm-plot
            [showDetails]="!plotsOnly"
            [conditions]="visibleConditions"
            [means]="activeInference.estimated_marginal_means ?? []"
            [unavailable]="inferenceNotice"
          />
          <plc-tukey-forest-plot
            [showDetails]="!plotsOnly"
            [conditions]="visibleConditions"
            [pairs]="activeInference.pairwise ?? []"
            [unavailable]="inferenceNotice"
          />
          <plc-significance-heatmap
            [showDetails]="!plotsOnly"
            [conditions]="visibleConditions"
            [pairs]="activeInference.pairwise ?? []"
            [unavailable]="inferenceNotice"
          />
          <plc-participant-spaghetti-plot
            [showDetails]="!plotsOnly"
            [conditions]="visibleConditions"
            [profiles]="profiles"
            [loading]="loading"
            [error]="error"
            (retry)="reload()"
          />
        </div>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      section {
        margin-top: 1.5rem;
        color: var(--p-text-color);
      }
      h2 {
        font-size: 1.3rem;
        font-weight: 700;
      }
      .help {
        color: var(--p-text-muted-color);
        line-height: 1.6;
        margin: 0.75rem 0;
      }
      .analysis-scope {
        color: var(--p-text-muted-color);
        font-size: 0.9rem;
        margin: 0.5rem 0;
      }
      .quality-control-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        margin: 0.75rem 0;
        font-weight: 600;
        cursor: pointer;
      }
      .quality-control-toggle input {
        width: 1.1rem;
        height: 1.1rem;
        accent-color: var(--p-primary-color);
      }
      .quality-control-toggle input:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 3px;
      }
      .scope-notice {
        padding: 0.75rem;
        border: 1px solid var(--p-content-border-color);
        border-radius: 0.5rem;
        line-height: 1.6;
        background: var(--p-content-hover-background);
      }
      summary {
        cursor: pointer;
        color: var(--p-primary-color);
      }
      .chart-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }
      @media (max-width: 1000px) {
        .chart-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class StudyLmmVisualizationsComponent implements OnChanges {
  @Input({ required: true }) public study!: Study;
  @Input({ required: true }) public results!: StudyResults;
  @Input() public plotsOnly = false;
  @Input() public includeDistributions = false;
  @Input() public showResults = false;
  public profiles: ListenerProfile[] = [];
  public visibleConditions: ChartCondition[] = [];
  public showQualityControls = true;
  public loading = false;
  public error = '';
  private key = '';
  private studyId = '';
  private qualityControlPreference: boolean | null = null;
  public rows: FrozenListeningRating[] = [];
  private readonly requests = new Subject<RatingsRequest>();
  private readonly destroyRef = inject(DestroyRef);
  public get finalized(): boolean {
    return (
      this.study?.status === 'finalized' &&
      this.results?.status === 'finalized' &&
      !this.results.provisional &&
      this.results.study_id === this.study.id
    );
  }
  public get activeInference(): StudyInference {
    return this.showQualityControls
      ? (this.results.analysis.quality_control_analysis?.inference ?? {
          available: false,
          reason: 'qc_inclusive_analysis_not_available',
        })
      : this.results.analysis.inference;
  }
  public get qualityControlsAvailable(): boolean {
    return !!this.results?.analysis.quality_control_analysis?.conditions.some((condition) => condition.role !== 'plc');
  }
  public get inferenceNotice(): string {
    const inference = this.activeInference;
    return inference.available
      ? ''
      : `Model comparisons unavailable: ${(inference.reason ?? 'not estimable').replaceAll('_', ' ')}.`;
  }
  constructor(
    private readonly http: HttpClient,
    private readonly client: ListeningClient,
  ) {
    this.requests
      .pipe(
        switchMap((request) => {
          this.profiles = [];
          this.rows = [];
          this.error = '';
          this.loading = !!request;
          if (!request) return of({ rows: [], error: '' });
          const inclusion = request.results.included_sessions ? new Set(request.results.included_sessions) : null;
          return this.http.get<FrozenListeningRating[]>(this.client.exportUrl(request.study.id, 'responses.json')).pipe(
            map((rows) => ({
              rows: rows.filter(
                (row) =>
                  (!inclusion || inclusion.has(row.session_id)) &&
                  (!row.session_status || row.session_status === 'completed'),
              ),
              error: '',
            })),
            catchError((error) => of({ rows: [], error: listeningError(error) })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ rows, error }) => {
        this.rows = rows;
        this.refreshView();
        this.error = error;
        this.loading = false;
      });
  }
  public ngOnChanges(): void {
    if (this.study?.id !== this.studyId) {
      this.studyId = this.study?.id ?? '';
      this.qualityControlPreference = null;
    }
    this.showQualityControls = (this.qualityControlPreference ?? true) && this.qualityControlsAvailable;
    this.refreshView();
    const next = this.finalized
      ? JSON.stringify([this.study.id, this.results.analysis_input_digest ?? this.results.study_revision])
      : '';
    if (next === this.key) return;
    this.key = next;
    this.requests.next(this.finalized ? { study: this.study, results: this.results } : null);
  }
  public changeQualityControls(event: Event): void {
    this.qualityControlPreference = (event.target as HTMLInputElement).checked;
    this.showQualityControls = this.qualityControlPreference && this.qualityControlsAvailable;
    this.refreshView();
  }
  private refreshView(): void {
    if (!this.finalized) {
      this.visibleConditions = [];
      this.profiles = [];
      return;
    }
    const controls = this.results.analysis.quality_control_analysis?.conditions ?? [];
    const qcConditions = (role: 'anchor' | 'hidden_reference'): ChartCondition[] =>
      controls
        .filter((condition) => condition.role === role)
        .map((condition) => ({
          id: condition.id,
          role,
          module_index: -1,
          name: role === 'anchor' ? 'Anchor · QC' : 'Hidden reference · QC',
        }));
    this.visibleConditions = this.showQualityControls
      ? [...qcConditions('anchor'), ...this.study.conditions, ...qcConditions('hidden_reference')]
      : this.study.conditions;
    this.profiles = listenerProfiles(this.rows, this.visibleConditions);
  }
  public reload(): void {
    if (this.finalized) this.requests.next({ study: this.study, results: this.results });
  }
}
