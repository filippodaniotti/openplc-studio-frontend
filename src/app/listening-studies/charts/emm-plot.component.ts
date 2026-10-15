import { Component, Input } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { ChartModule } from 'primeng/chart';
import { TableColumnHelpComponent } from '../table-column-help.component';
import { EstimatedMarginalMean } from '../listening.models';
import { ListeningChartBase } from './listening-chart-base';
import { orderedMeans, conditionTickLabel } from './listening-chart-data';
import { IntervalPoint, indexTicks } from './listening-chart-extensions';

@Component({
  selector: 'plc-emm-plot',
  standalone: true,
  imports: [ChartModule, TableColumnHelpComponent],
  styleUrl: './listening-chart.scss',
  template: `
    <article class="chart-card" aria-label="Estimated marginal means plot">
      <h3>Estimated marginal means</h3>
      @if (showDetails) {
        <p class="help">
          LMM estimates averaged equally over source tracks. Bars are pointwise 95% model intervals, not Tukey-adjusted
          intervals or descriptive bootstrap intervals. CI overlap is not a test of differences.
        </p>
      }
      @if (unavailable || !points.length) {
        <p class="notice">{{ unavailable || 'Model means with confidence intervals are unavailable.' }}</p>
      } @else {
        <div class="canvas-wrap">
          <p-chart
            [type]="$any('lmmInterval')"
            [data]="data"
            [options]="options"
            height="340px"
            ariaLabel="Estimated marginal quality scores and pointwise 95 percent model confidence intervals"
          />
        </div>
        @if (showDetails) {
          <details>
            <summary>Estimated means · data table</summary>
            <div class="table-scroll">
              <table>
                <caption>Pointwise 95% asymptotic normal intervals; not Tukey-adjusted</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <plc-table-column-help
                        label="Condition"
                        help="The rated PLC condition or quality-control item."
                      />
                    </th>
                    <th scope="col">
                      <plc-table-column-help
                        label="EMM"
                        help="Estimated marginal mean: model-estimated quality score, averaged equally over source tracks."
                      />
                    </th>
                    <th scope="col">
                      <plc-table-column-help
                        label="SE"
                        help="Standard error of the model-estimated mean, not the spread of individual listener scores."
                      />
                    </th>
                    <th scope="col">
                      <plc-table-column-help
                        label="95% CI"
                        help="Pointwise 95% asymptotic model interval. Not Tukey-adjusted; overlap is not a test of differences."
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (point of points; track point.id) {
                    <tr>
                      <th>{{ label(point.id) }}</th>
                      <td>{{ format(point.mean) }}</td>
                      <td>{{ format(point.se) }}</td>
                      <td>{{ interval(point.ci95) }}</td>
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
export class EmmPlotComponent extends ListeningChartBase {
  @Input() public means: EstimatedMarginalMean[] = [];
  public points: EstimatedMarginalMean[] = [];
  public data: ChartData<'lmmInterval'> = { datasets: [] };
  public options: ChartOptions<'lmmInterval'> = {};
  protected override rebuild(): void {
    this.points = orderedMeans(this.conditions, this.means);
    const points: IntervalPoint[] = this.points.map((point) => ({
      x: this.conditions.findIndex((condition) => condition.id === point.id),
      y: point.mean,
      lower: point.ci95[0],
      upper: point.ci95[1],
      axis: 'y',
      label: this.label(point.id),
    }));
    this.data = {
      datasets: [
        {
          data: points,
          radius: 5,
          hoverRadius: 7,
          backgroundColor: (context) => this.conditionColor(points[context.dataIndex]?.x ?? 0),
          borderColor: (context) => this.conditionColor(points[context.dataIndex]?.x ?? 0),
          borderWidth: 2,
        },
      ],
    };
    const minimum = Math.min(0, ...points.map((point) => point.lower));
    const maximum = Math.max(100, ...points.map((point) => point.upper));
    this.options = {
      ...this.commonOptions<'lmmInterval'>(),
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => (items[0]?.raw as IntervalPoint | undefined)?.label ?? '',
            label: (item) => {
              const point = this.points[item.dataIndex];
              return [
                `EMM: ${this.format(point.mean)} · SE: ${this.format(point.se)}`,
                `95% CI: ${this.interval(point.ci95)}`,
                'Pointwise asymptotic normal interval',
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
          ticks: {
            color: this.text,
            stepSize: 1,
            includeBounds: false,
            autoSkip: false,
            maxRotation: 40,
            callback: (value) =>
              this.conditions[Number(value)] ? conditionTickLabel(this.conditions[Number(value)]) : '',
          },
          grid: { display: false },
          title: { display: true, text: this.conditionAxisTitle, color: this.text },
        },
        y: {
          type: 'linear',
          min: minimum < 0 ? Math.floor(minimum) - 2 : 0,
          max: maximum > 100 ? Math.ceil(maximum) + 2 : 100,
          ticks: { color: this.text },
          grid: { color: this.grid },
          title: { display: true, text: 'Estimated quality score · higher is better', color: this.text },
        },
      },
    };
  }
}
