import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { ConditionSummary, Study, StudyResults } from './listening.models';

@Component({
  selector: 'plc-study-results',
  standalone: true,
  imports: [CommonModule, TooltipModule, ButtonModule, ProgressBarModule],
  template: `
    @if (results; as result) {
      <section class="results" aria-label="Human listening results">
        <div class="results-heading">
          <h2>{{ result.provisional ? 'Listening results so far' : 'Frozen listening results' }}</h2>
          <span class="results-badge">{{ result.provisional ? 'Collection in progress' : 'Frozen snapshot' }}</span>
        </div>
        @if (result.provisional) {
          <p class="note">
            A live preview, not the final result. Complete collection and finalize the study to freeze the results.
          </p>
        }
        <dl class="result-counts">
          <div>
            <dt>Completed & included</dt>
            <dd>{{ result.counts.included }}</dd>
          </div>
          <div>
            <dt>Excluded</dt>
            <dd>{{ result.counts.excluded }}</dd>
          </div>
          <div>
            <dt>Flagged for review</dt>
            <dd>{{ result.counts.flagged }}</dd>
          </div>
        </dl>
        <p class="note">
          Only completed, non-excluded sessions contribute to these results. Quality flags do not automatically exclude
          anyone.
        </p>
        @if (result.provisional && !result.counts.included) {
          <div class="results-empty" role="status">
            <i class="pi pi-headphones" aria-hidden="true"></i>
            <div>
              <h3>Waiting for completed responses</h3>
              <p>
                Invite listeners and ask them to finish and submit every trial. Included completed sessions will
                populate the score summaries and rating distributions here while collection is still open.
              </p>
            </div>
          </div>
        } @else {
          <h3>Quality scores by condition</h3>
          <p class="note">
            Scores range from 0 (bad) to 100 (excellent). Missing scores are not zero. Reference and anchor scores are
            quality checks, not PLC comparisons.
          </p>
          <div class="scroll">
            <table>
              <caption class="descriptive-caption">
                Participant-level descriptive estimates
                <span>0–100 · higher is better</span>
              </caption>
              <thead>
                <tr>
                  @for (column of descriptiveColumns; track column.label) {
                    <th scope="col">
                      <span class="column-heading">
                        {{ column.label }}
                        <p-button
                          icon="pi pi-info-circle"
                          severity="info"
                          size="small"
                          [text]="true"
                          [rounded]="true"
                          [ariaLabel]="column.label + ': more information'"
                          [pTooltip]="column.help"
                          tooltipEvent="both"
                          tooltipPosition="top"
                          appendTo="body"
                        ></p-button>
                      </span>
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (condition of summaries; track condition.id) {
                  <tr>
                    <th>{{ label(condition.id) }}</th>
                    <td>{{ condition.participant_count }}</td>
                    <td>{{ condition.response_count }}</td>
                    <td>{{ format(condition.mean) }}</td>
                    <td>{{ format(condition.median) }}</td>
                    <td>{{ format(condition.sd) }}</td>
                    <td>{{ format(condition.iqr) }}</td>
                    <td [title]="condition.ci_unavailable_reason ?? ''">{{ interval(condition.ci95) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (qualityControlScope && !result.analysis.quality_control_analysis?.summaries) {
            <p class="note">QC descriptive summaries are unavailable in this frozen snapshot.</p>
          }
          @if (hasDistributions(result)) {
            <h3>How listeners rated each condition</h3>
            <p class="note">
              Bars show the number of individual ratings in each score band. These update during collection; they are
              not a separate final result.
            </p>
          }
          <div class="distributions">
            @for (condition of summaries; track condition.id) {
              @if (condition.response_count > 0 && condition.score_histogram) {
                <article>
                  <h4>{{ label(condition.id) }}</h4>
                  <p class="note">
                    {{ condition.response_count }} {{ condition.response_count === 1 ? 'rating' : 'ratings' }} · mean
                    {{ format(condition.mean) }} / 100
                  </p>
                  <div class="mean-bar">
                    @if (condition.mean !== null) {
                      <p-progressbar
                        [value]="condition.mean"
                        [showValue]="false"
                        [ariaLabel]="label(condition.id) + ' mean score out of 100'"
                        [style]="{ height: '0.5rem' }"
                      />
                    }
                  </div>
                  @if (condition.score_histogram; as histogram) {
                    <div class="histogram" aria-label="Unweighted individual rating distribution">
                      @for (count of histogram.counts; track $index) {
                        <div
                          class="bin"
                          [style.height.%]="height(count, histogram.counts)"
                          [pTooltip]="
                            histogram.edges[$index] + '–' + histogram.edges[$index + 1] + ': ' + count + ' ratings'
                          "
                          tooltipPosition="top"
                          appendTo="body"
                        ></div>
                      }
                    </div>
                    <small>Individual ratings, bins 0–10 … 90–100 (descriptive only)</small>
                  }
                </article>
              }
            }
          </div>
          @let inference = selectedInference;
          <h3>Statistical comparisons</h3>
          @if (qualityControlScope) {
            <p class="note">
              Exploratory QC-inclusive LMM and Tukey family: PLC conditions, hidden reference and anchor. Even
              PLC-to-PLC comparisons may differ from the primary fit. Switch off reference & anchor to view the primary
              PLC-only analysis.
            </p>
          } @else {
            <p class="note">
              These tests compare PLC conditions while accounting for repeated ratings from the same listener. They are
              not another quality score.
            </p>
          }
          @if (!inference.available) {
            <p class="inference-notice">{{ inferenceExplanation(inference.reason) }}</p>
          } @else {
            <p>
              {{ inference.method }} ·
              <code>{{ inference.formula }}</code>
            </p>
            @if (inference.fallback) {
              <p>Documented fallback: random-intercept model; participant-condition deviations could not be fitted.</p>
            }
            @if (inference.condition_test; as test) {
              <p>
                {{ test.test }}: LR {{ format(test.likelihood_ratio) }}, df {{ test.df }}, p {{ probability(test.p) }}
              </p>
            }
            @if (inference.pairwise; as pairs) {
              <div class="scroll">
                <table>
                  <caption>
                    Pairwise contrasts — first minus second,
                    {{ inference.pairwise_correction }} correction across all displayed pairs
                  </caption>
                  <thead>
                    <tr>
                      <th>Pair</th>
                      <th>Effect</th>
                      <th>Simultaneous 95% CI</th>
                      <th>Adjusted p</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (pair of pairs; track pair.first + ':' + pair.second) {
                      <tr>
                        <th>{{ label(pair.first) }} − {{ label(pair.second) }}</th>
                        <td>{{ format(pair.effect) }}</td>
                        <td>{{ interval(pair.ci95) }}</td>
                        <td>{{ probability(pair.p_adjusted ?? null) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
          @if (inference.correction_note) {
            <p class="note">{{ inference.correction_note }}</p>
          }
          @if (inference.assumptions) {
            <p class="note">{{ inference.assumptions }}</p>
          }
          @if (inference.diagnostics?.length) {
            <details>
              <summary>Model diagnostics</summary>
              <ul>
                @for (message of inference.diagnostics; track $index) {
                  <li>{{ message }}</li>
                }
              </ul>
            </details>
          }
        }
        <details class="analysis-details">
          <summary>How results are calculated · technical details</summary>
          <p>
            Each listener has equal weight. Within a listener, observed tracks have equal weight; excerpt and repetition
            ratings are averaged within each track.
          </p>
          <p class="note">Recorded weighting method: {{ result.analysis.weighting }}</p>
          <p>
            SD describes score spread; IQR is the spread of the middle half of scores. The 95% confidence interval
            describes uncertainty in the estimated mean using listener-level resampling, not the range of individual
            ratings.
          </p>
          <dl class="metadata">
            <div>
              <dt>Analysis method version</dt>
              <dd>{{ result.analysis.analysis_version }}</dd>
            </div>
            <div>
              <dt>Data revision</dt>
              <dd>
                {{ result.study_revision }} — identifies the saved study update used for this summary, not a participant
                count.
              </dd>
            </div>
            <div>
              <dt>Analysis scope</dt>
              <dd>
                {{
                  qualityControlScope
                    ? 'Exploratory: QC-inclusive comparison family.'
                    : result.analysis.exploratory
                      ? 'Exploratory: a filtered subset of data.'
                      : 'Predefined: all conditions, without exploratory filtering.'
                }}
              </dd>
            </div>
          </dl>
        </details>
      </section>
    }
  `,
  styles: [
    `
      .results {
        color: var(--p-text-color);
      }
      h2,
      h3,
      h4 {
        font-weight: 700;
        line-height: 1.35;
      }
      h2 {
        font-size: 1.4rem;
        margin: 0;
      }
      h3 {
        font-size: 1.1rem;
        margin: 1.5rem 0 0.5rem;
      }
      h4 {
        font-size: 1rem;
        margin: 0 0 0.5rem;
      }
      p {
        line-height: 1.6;
        margin: 0.6rem 0;
      }
      .results-heading {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .results-badge {
        padding: 0.3rem 0.65rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--p-highlight-color);
        background: var(--p-highlight-background);
      }
      .result-counts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 0.75rem;
        margin: 1rem 0;
      }
      .result-counts > div {
        padding: 1rem;
        border: 1px solid var(--p-content-border-color);
        border-radius: 0.65rem;
      }
      .result-counts dt {
        color: var(--p-text-muted-color);
        font-size: 0.85rem;
      }
      .result-counts dd {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0.35rem 0 0;
      }
      .results-empty {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        margin-top: 1.25rem;
        padding: 1.25rem;
        border: 1px dashed var(--p-content-border-color);
        border-radius: 0.75rem;
        background: var(--p-content-hover-background);
      }
      .results-empty > i {
        font-size: 1.5rem;
        color: var(--p-primary-color);
        margin-top: 0.2rem;
      }
      .results-empty h3 {
        margin-top: 0;
      }
      .inference-notice {
        padding: 1rem;
        background: var(--p-content-hover-background);
        border-radius: 0.65rem;
      }
      .analysis-details {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid var(--p-content-border-color);
      }
      summary {
        cursor: pointer;
        font-weight: 600;
        color: var(--p-primary-color);
      }
      summary:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 4px;
      }
      .metadata {
        font-size: 0.9rem;
      }
      .metadata > div {
        margin-top: 0.75rem;
      }
      .metadata dt {
        font-weight: 600;
      }
      .metadata dd {
        margin: 0.2rem 0 0;
        color: var(--p-text-muted-color);
      }
      .note,
      small {
        color: var(--p-text-muted-color);
      }
      .scroll {
        overflow-x: auto;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 1rem 0;
      }
      th,
      td {
        padding: 0.7rem;
        text-align: left;
        border-bottom: 1px solid var(--p-content-border-color);
        white-space: nowrap;
      }
      caption {
        text-align: left;
        font-weight: 600;
      }
      .descriptive-caption {
        padding: 0.4rem 0 1.25rem;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--p-text-color);
      }
      .descriptive-caption span {
        display: block;
        margin-top: 0.35rem;
        font-size: 0.85rem;
        font-weight: 400;
        color: var(--p-text-muted-color);
      }
      .column-heading {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .distributions {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
        gap: 1rem;
      }
      .distributions article {
        display: grid;
        grid-template-rows: subgrid;
        grid-row: span 5;
        gap: 0.75rem;
        min-width: 0;
        padding: 1rem;
        background: var(--p-content-background);
        border: 1px solid var(--p-content-border-color);
        border-radius: var(--p-content-border-radius, 0.7rem);
      }
      .distributions h4,
      .distributions p {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .mean-bar {
        min-height: 0.5rem;
      }
      .histogram {
        height: 100px;
        display: flex;
        align-items: end;
        gap: 4px;
        padding: 0.75rem 0.5rem 0;
        margin-top: 0.25rem;
        border-bottom: 1px solid var(--p-content-border-color);
        border-radius: var(--p-content-border-radius, 0.4rem) var(--p-content-border-radius, 0.4rem) 0 0;
        background: var(--p-content-hover-background);
      }
      .bin {
        flex: 1;
        background: var(--p-primary-color);
        border-radius: 3px 3px 0 0;
        min-height: 0;
      }
      .bin:hover {
        background: var(--p-primary-hover-color);
      }
      .distributions small {
        display: block;
        padding-top: 0.5rem;
        line-height: 1.5;
      }
      code {
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class StudyResultsComponent {
  public readonly descriptiveColumns = [
    { label: 'Condition', help: 'The PLC condition or quality-control item rated by listeners.' },
    { label: 'Participants', help: 'Number of completed, included listeners contributing scores for this condition.' },
    { label: 'Ratings', help: 'Number of individual answered ratings before averaging within each listener.' },
    {
      label: 'Mean',
      help: 'Average listener score. Each listener has equal weight; observed tracks are weighted equally within each listener.',
    },
    { label: 'Median', help: 'Middle participant score after averaging ratings within each listener.' },
    { label: 'SD', help: 'Standard deviation: how widely participant scores vary around the mean.' },
    { label: 'IQR', help: 'Interquartile range: the width of the middle 50% of participant scores.' },
    {
      label: '95% confidence interval',
      help: 'Uncertainty in the mean, estimated by resampling whole participants. This is not the range of individual ratings.',
    },
  ];
  @Input() public results: StudyResults | null = null;
  @Input() public study: Study | null = null;
  @Input() public showQualityControls = false;
  public get qualityControlScope(): boolean {
    return (
      this.showQualityControls &&
      Boolean(this.results?.analysis.quality_control_analysis?.conditions.some((condition) => condition.role !== 'plc'))
    );
  }
  public get selectedInference() {
    return this.qualityControlScope
      ? this.results!.analysis.quality_control_analysis!.inference
      : this.results!.analysis.inference;
  }
  public get summaries(): ConditionSummary[] {
    const primary = this.results?.analysis.conditions ?? [];
    const orderedPrimary = this.study
      ? this.study.conditions.flatMap((condition) => primary.filter((summary) => summary.id === condition.id))
      : primary;
    if (!this.qualityControlScope) return orderedPrimary;
    const quality = this.results!.analysis.quality_control_analysis!;
    const controls = (role: 'anchor' | 'hidden_reference') =>
      quality.conditions
        .filter((condition) => condition.role === role)
        .flatMap((condition) => (quality.summaries ?? []).filter((summary) => summary.id === condition.id));
    return [...controls('anchor'), ...orderedPrimary, ...controls('hidden_reference')];
  }
  public hasDistributions(_result: StudyResults): boolean {
    return this.summaries.some((condition) => condition.response_count > 0 && !!condition.score_histogram);
  }
  public inferenceExplanation(reason?: string): string {
    if (reason === 'no_included_responses')
      return 'No completed, included responses yet. Comparisons will be assessed as listeners finish.';
    if (!this.qualityControlScope && this.study && this.study.conditions.length < 2)
      return 'This study has only one PLC condition, so there is no pair of PLC conditions to compare. Quality-score summaries are still useful.';
    return `A statistical comparison cannot be reported yet (${this.reason(reason)}). Score summaries above remain available; more participants alone may not resolve every analysis limitation.`;
  }
  public label(id: string): string {
    const role = this.results?.analysis.quality_control_analysis?.conditions.find(
      (condition) => condition.id === id,
    )?.role;
    if (role === 'anchor') return 'Anchor · QC';
    if (role === 'hidden_reference') return 'Hidden reference · QC';
    const condition = this.study?.conditions.find((item) => item.id === id);
    return condition ? `${condition.name} (#${condition.module_index + 1})` : id;
  }
  public format(value: number | null): string {
    return value === null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  public probability(value: number | null): string {
    return value === null ? 'Unavailable' : value < 0.000001 ? '< 0.000001' : value.toFixed(6);
  }
  public interval(value: [number, number] | null): string {
    return value === null ? 'Unavailable' : `${this.format(value[0])}–${this.format(value[1])}`;
  }
  public reason(value?: string): string {
    return (value ?? 'not estimable').replaceAll('_', ' ');
  }
  public height(count: number, counts: number[]): number {
    const maximum = Math.max(0, ...counts);
    return maximum ? (count * 100) / maximum : 0;
  }
}
