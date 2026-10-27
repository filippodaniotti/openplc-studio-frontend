import { Component, Input } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { TableColumnHelpComponent } from '../table-column-help.component';
import { PairwiseComparison } from '../listening.models';
import { ListeningChartBase } from './listening-chart-base';
import {
  MatrixComparison,
  conditionTickLabel,
  matrixComparisons,
  significance,
  validProbability,
} from './listening-chart-data';
import { MatrixPoint, indexTicks } from './listening-chart-extensions';

type HeatmapCell = MatrixPoint & MatrixComparison;
@Component({
  selector: 'plc-significance-heatmap',
  standalone: true,
  imports: [ChartModule, TableColumnHelpComponent],
  styleUrl: './listening-chart.scss',
  template: `
    <article class="chart-card" aria-label="Pairwise significance heatmap">
      <h3>Pairwise significance heatmap</h3>
      @if (showDetails) {
        <p class="help">
          Tukey-adjusted p-values, alpha .05. Symbols show statistical evidence, not effect size. “ns” does not
          establish equivalence. Diagonal cells are not tests; “?” means unavailable.
        </p>
      }
      @if (unavailable || !hasComparisons) {
        <p class="notice">{{ unavailable || 'Tukey-adjusted comparisons are unavailable.' }}</p>
      } @else {
        <div class="legend" aria-label="Adjusted p-value legend">
          @for (band of bands; track band.symbol) {
            <span>
              <i class="swatch" [style.background]="band.color" aria-hidden="true"></i>
              {{ band.symbol }} {{ band.label }}
            </span>
          }
        </div>
        <div class="chart-scroll">
          <div class="canvas-wrap matrix-wrap">
            <p-chart
              [type]="$any('significanceMatrix')"
              [data]="data"
              [options]="options"
              height="430px"
              ariaLabel="Symmetric matrix of Tukey-adjusted pairwise significance, with condition rows and columns"
            />
          </div>
        </div>
        @if (showDetails) {
          <details>
            <summary>Significance matrix · data table</summary>
            <div class="table-scroll">
              <table>
                <caption>Tukey-adjusted p-values; diagonal — is not a comparison</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <plc-table-column-help
                        label="Row / column"
                        help="Each cell compares its row and column conditions. The diagonal is not a comparison."
                      />
                    </th>
                    @for (condition of conditions; track condition.id) {
                      <th scope="col">
                        <plc-table-column-help
                          [label]="label(condition.id)"
                          help="Tukey-adjusted p-value comparing this column condition with the row condition. Not an effect size."
                        />
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (condition of conditions; track condition.id; let row = $index) {
                    <tr>
                      <th>{{ label(condition.id) }}</th>
                      @for (
                        cell of cells.slice(row * conditions.length, (row + 1) * conditions.length);
                        track cell.column
                      ) {
                        <td>{{ cell.diagonal ? '—' : probability(cell.pair?.p_adjusted) }}</td>
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
export class SignificanceHeatmapComponent extends ListeningChartBase {
  @Input() public pairs: PairwiseComparison[] = [];
  public cells: HeatmapCell[] = [];
  public hasComparisons = false;
  public bands: { symbol: string; label: string; color: string }[] = [];
  public data: ChartData<'significanceMatrix'> = { datasets: [] };
  public options: ChartOptions<'significanceMatrix'> = {};
  protected override rebuild(): void {
    const palette = this.dark
      ? ['#93c5fd', '#60a5fa', '#1d4ed8', '#374151', '#1f2937']
      : ['#1e3a8a', '#2563eb', '#bfdbfe', '#f1f5f9', '#e2e8f0'];
    this.bands = [
      { symbol: '***', label: 'p < .001', color: palette[0] },
      { symbol: '**', label: '.001 ≤ p < .01', color: palette[1] },
      { symbol: '*', label: '.01 ≤ p < .05', color: palette[2] },
      { symbol: 'ns', label: 'p ≥ .05', color: palette[3] },
    ];
    this.cells = matrixComparisons(this.conditions, this.pairs).map((cell) => {
      const symbol = cell.diagonal ? '—' : significance(cell.pair?.p_adjusted);
      const band = this.bands.findIndex((item) => item.symbol === symbol);
      return {
        ...cell,
        x: cell.column,
        y: cell.row,
        label: `${this.label(this.conditions[cell.row].id)} − ${this.label(this.conditions[cell.column].id)}`,
        symbol: symbol === 'Unavailable' ? '?' : symbol,
        fill: palette[band < 0 ? 4 : band],
        textColor: this.dark
          ? band === 0 || band === 1
            ? '#111827'
            : '#f9fafb'
          : band === 0 || band === 1
            ? '#ffffff'
            : '#111827',
      };
    });
    this.hasComparisons = this.cells.some((cell) => !cell.diagonal && validProbability(cell.pair?.p_adjusted));
    this.data = { datasets: [{ data: this.cells, pointRadius: 1, pointHoverRadius: 1 }] };
    const ticks = {
      color: this.text,
      stepSize: 1,
      includeBounds: false,
      autoSkip: false,
      callback: (value: number | string) =>
        this.conditions[Number(value)] ? conditionTickLabel(this.conditions[Number(value)], 16) : '',
    };
    this.options = {
      ...this.commonOptions<'significanceMatrix'>(),
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: (items) => (items[0]?.raw as HeatmapCell | undefined)?.label ?? '',
            label: (item) => {
              const cell = item.raw as HeatmapCell;
              if (cell.diagonal) return 'Same condition · no comparison';
              if (!validProbability(cell.pair?.p_adjusted)) return 'Comparison unavailable';
              return [
                `Tukey adjusted p: ${this.probability(cell.pair?.p_adjusted)} (${cell.symbol})`,
                `Row − column difference: ${this.format(cell.pair?.effect)}`,
                `Simultaneous 95% CI: ${this.interval(cell.pair?.ci95)}`,
                'Asymptotic studentized range',
              ];
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: -0.5,
          max: Math.max(0.5, this.conditions.length - 0.5),
          afterBuildTicks: indexTicks(this.conditions.length),
          ticks: { ...ticks, maxRotation: 45 },
          grid: { display: false },
          title: { display: true, text: 'Column condition', color: this.text },
        },
        y: {
          type: 'linear',
          min: -0.5,
          max: Math.max(0.5, this.conditions.length - 0.5),
          reverse: true,
          afterBuildTicks: indexTicks(this.conditions.length),
          ticks,
          grid: { display: false },
          title: { display: true, text: 'Row condition', color: this.text },
        },
      },
    };
  }
}
