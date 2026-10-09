import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import { Chart, ChartConfiguration } from 'chart.js';
import { HumanListeningDistributionsComponent } from './human-listening-distributions.component';
import { ListeningClient } from '../../listening-studies/listening.client';
import { ThemeService } from '../../shared/services/theme.service';
import { Study } from '../../listening-studies/listening.models';

const study: Study = {
  id: 'study',
  run_id: 'run',
  human_module_index: 0,
  simulator_module_index: 0,
  status: 'finalized',
  revision: 1,
  trial_count: 2,
  instructions: '',
  consent: '',
  consent_version: 1,
  warnings: [],
  conditions: [{ id: 'plc-0', name: 'ZerosPLC', module_index: 0 }],
};

describe('Human distribution charts', () => {
  it('renders overall and track boxplots, supports violin switching and theme changes', async () => {
    const theme = new BehaviorSubject(false);
    await TestBed.configureTestingModule({
      imports: [HumanListeningDistributionsComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ListeningClient, useValue: { exportUrl: () => '/ratings' } },
        { provide: ThemeService, useValue: { isDarkMode: theme } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(HumanListeningDistributionsComponent);
    fixture.componentRef.setInput('study', study);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/ratings')
      .flush(
        [0, 1, 2]
          .flatMap((person) =>
            ['one.wav', 'two.wav'].map((track) => ({
              session_id: `p-${person}`,
              track_id: track,
              excerpt_id: 'excerpt',
              trial_id: 'trial',
              condition_id: 'plc-0',
              included: true,
              answered: true,
              score: 30 + person * 20,
            })),
          )
          .flatMap((row) => [
            row,
            { ...row, condition_id: 'reference', score: 95 },
            { ...row, condition_id: 'anchor35', score: 20 },
          ]),
      );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.panels.length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(1);
    expect(fixture.nativeElement.querySelector('article h4').textContent).toContain('Overall');
    for (const canvas of fixture.nativeElement.querySelectorAll('canvas')) {
      expect((Chart.getChart(canvas)?.config as ChartConfiguration | undefined)?.type).toBe('boxplot');
    }
    expect(Chart.registry.getController('boxplot')).toBeDefined();
    expect(Chart.registry.getController('violin')).toBeDefined();
    (fixture.nativeElement.querySelectorAll('.plot-style button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    for (const canvas of fixture.nativeElement.querySelectorAll('canvas')) {
      expect((Chart.getChart(canvas)?.config as ChartConfiguration | undefined)?.type).toBe('violin');
    }
    expect(fixture.componentInstance.panels[0].data.datasets[0].data).toEqual([[30, 50, 70]]);
    fixture.componentInstance.selectedAggregation = JSON.stringify('two.wav');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(1);
    expect(fixture.nativeElement.querySelector('article h4').textContent).toContain('two.wav');
    expect(fixture.componentInstance.plotType).toBe('violin');
    theme.next(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.panels[0].data.datasets[0].borderColor).toEqual(['#60a5fa']);
    const toggle = fixture.nativeElement.querySelector('.quality-control-toggle input') as HTMLInputElement;
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedPanel?.data.labels).toEqual([
      'Anchor · QC',
      'ZerosPLC (#1)',
      'Hidden reference · QC',
    ]);
    expect(fixture.componentInstance.selectedPanel?.data.datasets[0].data).toEqual([
      [20, 20, 20],
      [30, 50, 70],
      [95, 95, 95],
    ]);
    expect(fixture.componentInstance.selectedAggregation).toBe(JSON.stringify('two.wav'));
    expect(fixture.componentInstance.plotType).toBe('violin');
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(1);
    toggle.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedPanel?.data.labels).toEqual(['ZerosPLC (#1)']);
    TestBed.inject(HttpTestingController).verify();
    fixture.destroy();
  });
});
