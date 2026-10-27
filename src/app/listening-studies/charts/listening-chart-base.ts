import { Directive, DestroyRef, Input, OnChanges, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartOptions, ChartType } from 'chart.js';
import { ThemeService } from '../../shared/services/theme.service';
import {
  ChartCondition,
  conditionLabel,
  isQualityControl,
  formatNumber,
  formatInterval,
  formatProbability,
} from './listening-chart-data';

/** Shared theme/lifecycle only; each standalone component owns its chart. */
@Directive()
export abstract class ListeningChartBase implements OnChanges, OnInit {
  @Input() public conditions: ChartCondition[] = [];
  @Input() public unavailable = '';
  @Input() public showDetails = true;
  protected readonly theme = inject(ThemeService);
  protected readonly destroyRef = inject(DestroyRef);
  protected get dark(): boolean {
    return this.theme.isDarkMode.value;
  }
  protected get text(): string {
    return (
      getComputedStyle(document.documentElement).getPropertyValue('--p-text-color').trim() ||
      (this.dark ? '#e5e7eb' : '#374151')
    );
  }
  protected get grid(): string {
    return this.dark ? '#374151' : '#e5e7eb';
  }
  protected get colors(): string[] {
    return this.dark
      ? ['#60a5fa', '#34d399', '#fbbf24', '#c084fc', '#fb7185', '#22d3ee', '#fb923c', '#a3e635', '#f472b6', '#94a3b8']
      : ['#2563eb', '#059669', '#b45309', '#9333ea', '#be123c', '#0e7490', '#c2410c', '#4d7c0f', '#be185d', '#475569'];
  }
  protected get conditionAxisTitle(): string {
    return this.conditions.some(isQualityControl) ? 'Rated condition · includes QC' : 'PLC condition';
  }
  protected conditionColor(index: number): string {
    const condition = this.conditions[index];
    if (condition?.role === 'anchor') return this.dark ? '#94a3b8' : '#475569';
    if (condition?.role === 'hidden_reference') return this.dark ? '#fbbf24' : '#b45309';
    const plcIndex = this.conditions.filter((item) => !isQualityControl(item)).indexOf(condition);
    return this.colors[Math.max(0, plcIndex) % this.colors.length];
  }
  public readonly format = formatNumber;
  public readonly interval = formatInterval;
  public readonly probability = formatProbability;
  public label(id: string): string {
    const condition = this.conditions.find((item) => item.id === id);
    return condition ? conditionLabel(condition) : id;
  }
  public ngOnInit(): void {
    this.theme.isDarkMode.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.rebuild());
  }
  public ngOnChanges(): void {
    this.rebuild();
  }
  protected abstract rebuild(): void;
  protected commonOptions<T extends ChartType>(): ChartOptions<T> {
    // Cast is scoped to common options: scales/data remain specialized in each component.
    return {
      responsive: true,
      maintainAspectRatio: false,
      color: this.text,
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 180 },
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      interaction: { mode: 'nearest', intersect: true },
    } as ChartOptions<T>;
  }
}
