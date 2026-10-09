import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChartData, ChartOptions, LineElement, Plugin } from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { ListeningChartBase } from './listening-chart-base';
import { ListenerProfile, conditionTickLabel } from './listening-chart-data';
import './listening-chart-extensions';

const listenerEmphasis: Plugin<'line'> = {
  id: 'listenerHoverEmphasis',
  beforeDatasetDraw(chart, args) {
    const selected = chart.getActiveElements()[0]?.datasetIndex;
    const line = chart.getDatasetMeta(args.index).dataset as LineElement | undefined;
    if (!line) return;
    const dataset = chart.data.datasets[args.index];
    line.options.borderWidth = selected === args.index ? 3 : 1;
    const color = selected === args.index ? dataset.pointHoverBackgroundColor : dataset.borderColor;
    if (typeof color === 'string') line.options.borderColor = color;
  },
};
@Component({
  selector: 'plc-participant-spaghetti-plot',
  standalone: true,
  imports: [ChartModule],
  styleUrl: './listening-chart.scss',
  template: `
    <article class="chart-card" aria-label="Participant-level spaghetti plot">
      <h3>Participant-level scores</h3>
      @if (showDetails) {
        <p class="help">
          Each line is one completed, included listener. Repetitions are averaged within excerpts, excerpts within
          tracks, and tracks equally within each listener. Descriptive scores, not LMM predictions or Tukey inference.
          Missing scores leave gaps. Hover to identify a pseudonymous listener.
        </p>
      }
      @if (loading) {
        <p role="status">Loading frozen listener ratings…</p>
      } @else if (error) {
        <p class="notice" role="alert">{{ error }}</p>
        <button type="button" (click)="retry.emit()">Retry listener ratings</button>
      } @else if (!profiles.length) {
        <p class="notice">No included listener scores are available.</p>
      } @else {
        @if (showDetails) {
          <p class="help">
            {{ profiles.length }} included {{ profiles.length === 1 ? 'listener' : 'listeners' }} · all source tracks
          </p>
        }
        <div class="canvas-wrap">
          <p-chart
            type="line"
            [data]="data"
            [options]="options"
            [plugins]="plugins"
            height="340px"
            ariaLabel="One descriptive quality-score line per included listener across PLC conditions, with missing values left as gaps"
          />
        </div>
        @if (showDetails) {
          <details>
            <summary>Listener scores · data table</summary>
            <div class="table-scroll">
              <table>
                <caption>Listener track-balanced means (0–100); not model estimates</caption>
                <thead>
                  <tr>
                    <th>Pseudonymous listener</th>
                    @for (condition of conditions; track condition.id) {
                      <th>{{ label(condition.id) }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (person of profiles; track person.sessionId) {
                    <tr>
                      <th>{{ person.sessionId }}</th>
                      @for (score of person.scores; track $index) {
                        <td>{{ format(score) }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        }
      }
    </article>
  `,
})
export class ParticipantSpaghettiPlotComponent extends ListeningChartBase {
  @Input() public profiles: ListenerProfile[] = [];
  @Input() public loading = false;
  @Input() public error = '';
  @Output() public readonly retry = new EventEmitter<void>();
  public readonly plugins = [listenerEmphasis];
  public data: ChartData<'line', (number | null)[]> = { datasets: [] };
  public options: ChartOptions<'line'> = {};
  protected override rebuild(): void {
    this.data = {
      labels: this.conditions.map((condition) => conditionTickLabel(condition)),
      datasets: this.profiles.map((person, index) => ({
        label: person.sessionId,
        data: person.scores,
        spanGaps: false,
        tension: 0,
        borderColor: this.colors[index % this.colors.length] + '80',
        borderWidth: 1,
        pointBackgroundColor: this.colors[index % this.colors.length] + '80',
        pointRadius: 2,
        pointHoverBackgroundColor: this.colors[index % this.colors.length],
        pointHoverRadius: 5,
      })),
    };
    this.options = {
      ...this.commonOptions<'line'>(),
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.dataset.label ?? '',
            label: (item) => `${this.label(this.conditions[item.dataIndex].id)}: ${this.format(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: this.text, autoSkip: false, maxRotation: 40 },
          grid: { display: false },
          title: { display: true, text: this.conditionAxisTitle, color: this.text },
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: this.text },
          grid: { color: this.grid },
          title: { display: true, text: 'Listener average quality score', color: this.text },
        },
      },
    };
  }
}
