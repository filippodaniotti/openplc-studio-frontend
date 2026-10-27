import { Component, Input } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { TableColumnHelpComponent } from '../table-column-help.component';
import { PairwiseComparison } from '../listening.models';
import { ListeningChartBase } from './listening-chart-base';
import {
  conditionTickLabel,
  finite,
  orderedContrasts,
  significance,
  validInterval,
  validProbability,
} from './listening-chart-data';
import { IntervalPoint, zeroReference, indexTicks } from './listening-chart-extensions';

@Component({
  selector: 'plc-tukey-forest-plot',
  standalone: true,
  imports: [ChartModule, TableColumnHelpComponent],
  styleUrl: './listening-chart.scss',
  template: `
    <article class="chart-card" aria-label="Tukey pairwise differences forest plot">
      <h3>Tukey-adjusted pairwise differences</h3>
      @if (showDetails) {
        <p class="help">
          First minus second, in quality-score points. Bars are simultaneous 95% Tukey intervals. The dashed line is
          zero. Filled circles (*) indicate adjusted p &lt; .05; hollow diamonds (ns) do not.
        </p>
      }
      @if (unavailable || !points.length) {
        <p class="notice">{{ unavailable || 'No estimable Tukey pairwise intervals are available.' }}</p>
      } @else {
        <div class="chart-scroll">
          <div class="canvas-wrap" [style.height.px]="height">
            <p-chart
              [type]="$any('lmmInterval')"
              [data]="data"
              [options]="options"
              [plugins]="plugins"
              [height]="height + 'px'"
              ariaLabel="Pairwise quality-score differences with simultaneous Tukey 95 percent intervals and zero reference line"
            />
          </div>
        </div>
        @if (showDetails) {
          <details>
            <summary>Pairwise differences · data table</summary>
            <div class="table-scroll">
              <table>
                <caption>Asymptotic Tukey-adjusted comparisons; alpha .05</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <plc-table-column-help
                        label="First − second"
                        help="The two conditions being compared; effects are first minus second."
                      />
                    </th>
                    <th scope="col">
                      <plc-table-column-help
                        label="Difference"
                        help="Difference in model-estimated quality-score points. Positive values favor the first condition."
                      />
                    </th>
                    <th scope="col">
                      <plc-table-column-help
                        label="Simultaneous 95% CI"
                        help="Tukey-adjusted interval across the selected comparison family, using asymptotic inference."
                      />
                    </th>
                    <th scope="col">
                      <plc-table-column-help
                        label="Adjusted p"
                        help="Tukey-adjusted p-value across the selected comparison family. Not an effect size."
                      />
                    </th>
                    <th scope="col">
                      <plc-table-column-help
                        label="Evidence"
                        help="Stars indicate adjusted p-value thresholds; ns means p ≥ .05, not evidence of equivalence."
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (point of points; track point.first + ':' + point.second) {
                    <tr>
                      <th>{{ pairLabel(point) }}</th>
                      <td>{{ format(point.effect) }}</td>
                      <td>{{ interval(point.ci95) }}</td>
                      <td>{{ probability(point.p_adjusted) }}</td>
                      <td>{{ symbol(point.p_adjusted) }}</td>
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
export class TukeyForestPlotComponent extends ListeningChartBase {
  @Input() public pairs: PairwiseComparison[] = [];
  public points: PairwiseComparison[] = [];
  public data: ChartData<'lmmInterval'> = { datasets: [] };
  public options: ChartOptions<'lmmInterval'> = {};
  public readonly plugins = [zeroReference];
  public readonly symbol = significance;
  public height = 340;
  public pairLabel(pair: PairwiseComparison): string {
    return `${this.label(pair.first)} − ${this.label(pair.second)}`;
  }
  public tickLabel(pair: PairwiseComparison): string {
    const tick = (id: string) => {
      const condition = this.conditions.find((item) => item.id === id);
      return condition ? conditionTickLabel(condition, 10) : id;
    };
    return `${tick(pair.first)} − ${tick(pair.second)} · ${significance(pair.p_adjusted)}`;
  }
  protected override rebuild(): void {
    this.points = orderedContrasts(this.conditions, this.pairs).filter(
      (pair) => finite(pair.effect) && validInterval(pair.ci95) && validProbability(pair.p_adjusted),
    );
    const points: IntervalPoint[] = this.points.map((pair, index) => ({
      x: pair.effect,
      y: index,
      lower: pair.ci95![0],
      upper: pair.ci95![1],
      axis: 'x',
      label: this.pairLabel(pair),
      significant: pair.p_adjusted! < 0.05,
    }));
    const primary = this.colors[0];
    this.data = {
      datasets: [
        {
          data: points,
          radius: 5,
          hoverRadius: 7,
          borderWidth: 2,
          pointStyle: points.map((point) => (point.significant ? 'circle' : 'rectRot')),
          backgroundColor: (context) =>
            points[context.dataIndex]?.significant ? primary : this.dark ? '#111827' : '#ffffff',
          borderColor: (context) => (points[context.dataIndex]?.significant ? primary : this.text),
        },
      ],
    };
    const bound =
      Math.max(1, ...points.flatMap((point) => [Math.abs(point.lower), Math.abs(point.upper), Math.abs(point.x)])) *
      1.1;
    this.height = Math.max(340, this.points.length * 38 + 90);
    this.options = {
      ...this.commonOptions<'lmmInterval'>(),
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => (items[0]?.raw as IntervalPoint | undefined)?.label ?? '',
            label: (item) => {
              const pair = this.points[item.dataIndex];
              return [
                `Difference: ${this.format(pair.effect)}`,
                `Simultaneous 95% CI: ${this.interval(pair.ci95)}`,
                `Tukey adjusted p: ${this.probability(pair.p_adjusted)} (${significance(pair.p_adjusted)})`,
                'Asymptotic studentized range',
              ];
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: -bound,
          max: bound,
          ticks: { color: this.text },
          grid: { color: this.grid },
          title: { display: true, text: 'Quality-score difference · first minus second', color: this.text },
        },
        y: {
          type: 'linear',
          min: -0.5,
          max: Math.max(0.5, this.points.length - 0.5),
          reverse: true,
          afterBuildTicks: indexTicks(this.points.length),
          ticks: {
            color: this.text,
            stepSize: 1,
            includeBounds: false,
            autoSkip: false,
            callback: (value) => (this.points[Number(value)] ? this.tickLabel(this.points[Number(value)]) : ''),
          },
          grid: { display: false },
        },
      },
    };
  }
}
