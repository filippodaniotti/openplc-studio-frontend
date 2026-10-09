import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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
        { provide: ListeningClient, useValue: {} },
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
    fixture.componentInstance.displayMetrics = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Human listening study results"]')).toBeNull();
  });
});
