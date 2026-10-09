import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MetricsComponent } from './metrics.component';
import { AnalysisService } from '../analysis.service';
import { ThemeService } from '../../shared/services/theme.service';
import { ListeningClient } from '../../listening-studies/listening.client';
import { addPendingHumanMetric } from './metric-presentation';
import { ModuleType } from '../../shared/enums/module-type.enum';
import { RunStatus } from '../../shared/enums/run-status.enum';

describe('HumanCalculator metric layout', () => {
  it('places selected human content after the metric heading and hides it on deselection', async () => {
    await TestBed.configureTestingModule({
      imports: [MetricsComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        AnalysisService,
        { provide: ThemeService, useValue: { isDarkMode: new BehaviorSubject(false) } },
        { provide: ListeningClient, useValue: { exportUrl: (id: string) => `/ratings/${id}` } },
      ],
    }).compileComponents();
    spyOn(MetricsComponent.prototype, 'ngOnInit').and.stub();
    const service = TestBed.inject(AnalysisService);
    service.run.next({
      id: 'run',
      name: 'Run',
      status: RunStatus.COMPLETED,
      author: 'test',
      created: '',
      updated: '',
      testbenchInternalId: null,
      tracks: [],
      modules: {
        [ModuleType.OutputAnalyser]: [{ name: 'HumanCalculator', settings: [] }],
        [ModuleType.PacketLossSimulator]: [],
        [ModuleType.PLCAlgorithm]: [],
      },
    });
    const fixture = TestBed.createComponent(MetricsComponent);
    const metric = addPendingHumanMetric([], [{ name: 'HumanCalculator', settings: [] }])[0];
    fixture.componentInstance.metrics = [metric];
    fixture.componentInstance.metricOptions = [metric];
    fixture.componentInstance.displayMetrics = [metric];
    fixture.componentInstance.visualizations = [{ kind: 'unsupported', metric, message: '' }];
    fixture.detectChanges();
    const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
    const content = fixture.nativeElement.querySelector('[aria-label="Human listening study results"]') as HTMLElement;
    expect(heading.textContent).toContain('HumanCalculator');
    expect(heading.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fixture.componentInstance.humanPanels = [
      {
        study: {
          id: 'study',
          run_id: 'run',
          status: 'finalized',
          revision: 1,
          human_module_index: 0,
          simulator_module_index: 0,
          instructions: '',
          consent: '',
          consent_version: 1,
          trial_count: 1,
          warnings: [],
          conditions: [
            { id: 'a', name: 'A', module_index: 0 },
            { id: 'b', name: 'B', module_index: 1 },
          ],
        },
        results: {
          kind: 'human-listening-study',
          study_id: 'study',
          status: 'finalized',
          provisional: false,
          study_revision: 1,
          counts: { invited: 1, draft: 0, completed: 1, included: 1, excluded: 0, flagged: 0 },
          analysis: {
            analysis_version: 'test',
            weighting: 'Equal tracks',
            exploratory: false,
            participant_count: 1,
            response_count: 2,
            conditions: [],
            inference: {
              available: true,
              estimated_marginal_means: [
                { id: 'a', mean: 70, se: 2, ci95: [66, 74] },
                { id: 'b', mean: 60, se: 2, ci95: [56, 64] },
              ],
              pairwise: [{ first: 'a', second: 'b', effect: 10, ci95: [5, 15], p: 0.01, p_adjusted: 0.02 }],
            },
          },
        },
      },
    ];
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((request) => request.url === '/api/assets/tracks')
      .flush({ items: [], total: 0, page: 1, page_size: 100 });
    http.expectOne('/ratings/study').flush(
      ['a', 'b'].map((condition_id, index) => ({
        session_id: 'p1',
        track_id: 'track',
        trial_id: 'trial',
        condition_id,
        included: true,
        answered: true,
        score: 70 - index * 10,
      })),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(content.querySelectorAll('canvas').length).toBe(5);
    expect(content.querySelector('table, details, plc-study-results')).toBeNull();
    expect(content.textContent).not.toContain('Study-wide results across tracks');
    http.verify();
    fixture.componentInstance.displayMetrics = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Human listening study results"]')).toBeNull();
  });
});
