import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AssetsClient } from '../shared/clients/assets.client';
import { RunsClient } from '../shared/clients/runs.client';
import { WsService } from '../shared/services/ws.service';
import { RunProgressComponent } from './run-progress.component';
import { RunStatus } from '../shared/enums/run-status.enum';
import { ModuleType } from '../shared/enums/module-type.enum';
import { MessageService } from 'primeng/api';

const run = {
  id: 'run-1',
  name: 'Progress test',
  created: '2026-01-01T12:00:00Z',
  updated: '2026-01-01T12:00:00Z',
  author: 'test',
  testbenchInternalId: 'test',
  status: RunStatus.RUNNING,
  tracks: ['one.wav', 'two.wav'],
  modules: {
    [ModuleType.PacketLossSimulator]: [{ name: 'PLS', node_ids: ['pls-1', 'pls-2'], settings: [] }],
    [ModuleType.PLCAlgorithm]: [{ name: 'PLC', node_ids: ['plc-1', 'plc-2'], settings: [] }],
    [ModuleType.OutputAnalyser]: [{ name: 'Output', node_ids: ['out-1', 'out-2'], settings: [] }],
  },
};

describe('RunProgressComponent', () => {
  let component: RunProgressComponent;
  let fixture: ComponentFixture<RunProgressComponent>;
  let runsClient: jasmine.SpyObj<RunsClient>;
  let messageService: jasmine.SpyObj<MessageService>;
  let router: jasmine.SpyObj<Router>;
  const progress$ = new Subject<any>();
  const completion$ = new Subject<any>();
  const state$ = new Subject<any>();

  beforeEach(async () => {
    runsClient = jasmine.createSpyObj<RunsClient>('RunsClient', ['getRun', 'executeRun', 'retryRun']);
    runsClient.getRun.and.returnValue(of(run));
    runsClient.executeRun.and.returnValue(of({ ...run, status: RunStatus.QUEUED }));
    messageService = jasmine.createSpyObj<MessageService>('MessageService', ['add']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [RunProgressComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'run-1' } } } },
        { provide: Router, useValue: router },
        { provide: RunsClient, useValue: runsClient },
        { provide: MessageService, useValue: messageService },
        {
          provide: AssetsClient,
          useValue: {
            getTrackMetadata: () =>
              of([
                { name: 'one.wav', sizeBytes: 1024, durationSeconds: 12, sampleRate: 48000, channels: 2, bitDepth: 16 },
              ]),
          },
        },
        {
          provide: WsService,
          useValue: {
            sendRunId: jasmine.createSpy('sendRunId'),
            getProgressMessages: () => progress$.asObservable(),
            getCompletionMessages: () => completion$.asObservable(),
            getStateChangeMessages: () => state$.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RunProgressComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps prepared human nodes pending while allowing ready automated analysis', () => {
    component.run = {
      ...run,
      status: RunStatus.AWAITING_INPUT,
      modules: {
        ...run.modules,
        [ModuleType.OutputAnalyser]: [{ name: 'HumanCalculator', node_ids: ['out-1', 'out-2'], settings: [] }],
      },
    };
    expect(component.overallProgress.state).toBe('awaiting-input');
    expect(component.isAnalysisAvailable).toBeTrue();
    expect(component.requiresListeningInput).toBeTrue();
    expect(component.getNodeProgress(component.nodes[0].children[0].children[0].children[0]).state).toBe(
      'awaiting-input',
    );
  });

  it('shows actionable failure guidance and notifies the user on completion', () => {
    const failure = {
      code: 'human_no_eligible_excerpts' as const,
      message: 'Every excerpt contains multiple loss bursts.',
      guidance: 'Disable single_loss_per_stimulus or increase burst spacing.',
    };
    completion$.next({ run_id: 'run-1', success: false, failure });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(failure.message);
    expect(fixture.nativeElement.textContent).toContain(failure.guidance);
    expect(messageService.add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'error', summary: 'Run failed' }),
    );
  });

  it('renders the run summary without track metadata in the execution tree', () => {
    expect(fixture.nativeElement.textContent).toContain('Progress test');
    expect(fixture.nativeElement.textContent).toContain('one.wav');
    expect(fixture.nativeElement.textContent).not.toContain('48 kHz · Stereo · 16-bit · 1.0 KB');
  });

  it('maps each module occurrence to its exact execution node', () => {
    const nodes = component.nodes;
    expect(nodes[1].children[0].nodeIds).toEqual(['pls-2']);
    expect(nodes[1].children[0].children[0].nodeIds).toEqual(['plc-2']);
    expect(nodes[1].children[0].children[0].children[0].nodeIds).toEqual(['out-2']);
  });

  it('shows settings subtitles only for duplicate module names', () => {
    const duplicateRun = {
      ...run,
      tracks: ['one.wav'],
      modules: {
        ...run.modules,
        [ModuleType.PacketLossSimulator]: [
          { name: 'PLS', node_ids: ['pls-1'], settings: [{ name: 'rate', value: 0.1 }] },
          { name: 'PLS', node_ids: ['pls-2'], settings: [{ name: 'rate', value: 0.2 }] },
        ],
      },
    };

    component.nodes = (component as any).buildNodesFromRun(duplicateRun);
    component.expandedKeys = new Set(component.nodes.map((node) => node.key));
    fixture.detectChanges();

    expect(component.nodes[0].children.map((node) => node.discriminator)).toEqual(['rate=0.1', 'rate=0.2']);
    expect(
      [...fixture.nativeElement.querySelectorAll('.plc-module-label small')].map((element: HTMLElement) =>
        element.textContent?.trim(),
      ),
    ).toEqual(['rate=0.1', 'rate=0.2']);
  });

  it('focuses the selected track in the configuration drawer', () => {
    const trackButton = fixture.nativeElement.querySelectorAll('.plc-track-name')[1] as HTMLButtonElement;
    trackButton.click();

    expect(component.configDrawerVisible).toBeTrue();
    expect(component.focusedTrackIndex).toBe(1);
    expect(component.focusedModule).toBeNull();
  });

  it('queues a deferred run only once', () => {
    component.run = { ...run, status: RunStatus.CREATED };

    component.onExecute();
    component.onExecute();

    expect(runsClient.executeRun).toHaveBeenCalledOnceWith(run.id);
    expect(component.run?.status).toBe(RunStatus.QUEUED);
    expect(messageService.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Queued' }));
  });

  it('creates and opens a new attempt for a failed run', () => {
    const retriedRun = { ...run, id: 'run-2', status: RunStatus.QUEUED };
    component.run = { ...run, status: RunStatus.FAILED };
    runsClient.retryRun.and.returnValue(of(retriedRun));

    component.onRetry();

    expect(runsClient.retryRun).toHaveBeenCalledOnceWith(run.id);
    expect(router.navigate).toHaveBeenCalledWith(['/run-progress', retriedRun.id]);
    expect(messageService.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Retry queued' }));
  });

  it('opens the failed run in the configurator for adjustment', () => {
    component.run = { ...run, status: RunStatus.FAILED };

    component.onAdjustAndRetry();

    expect(router.navigate).toHaveBeenCalledOnceWith(['/run-configurator'], {
      queryParams: { retryRunId: run.id },
    });
  });

  it('moves queued runs to running when progress arrives', () => {
    component.run = { ...run, status: RunStatus.QUEUED };

    progress$.next({ run_id: 'run-1', nodes: [] });

    expect(component.run.status).toBe(RunStatus.RUNNING);
  });

  it('ignores unrelated progress and marks successful completion as analysable', () => {
    progress$.next({ run_id: 'other', nodes: [{ node_id: 'pls-1', current: 1, total: 1 }] });
    expect(component.getNodeProgress(component.nodes[0].children[0]).state).toBe('waiting');

    progress$.next({ run_id: 'run-1', nodes: [{ node_id: 'pls-1', current: 1, total: 1 }] });
    expect(component.getNodeProgress(component.nodes[0].children[0]).state).toBe('complete');

    completion$.next({ run_id: 'run-1', success: true });
    expect(component.isAnalysisAvailable).toBeTrue();
  });
});
