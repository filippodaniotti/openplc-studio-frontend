import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ThemeService } from '../../shared/services/theme.service';
import { RunsClient } from '../../shared/clients/runs.client';
import { WsService } from '../../shared/services/ws.service';
import { ListeningClient } from '../listening.client';
import { Study, StudyResults, StudyStatus } from '../listening.models';
import { StudyHubComponent } from '../study-hub.component';
import { StudyLmmVisualizationsComponent } from './study-lmm-visualizations.component';
import { EmmPlotComponent } from './emm-plot.component';
import { TukeyForestPlotComponent } from './tukey-forest-plot.component';
import { SignificanceHeatmapComponent } from './significance-heatmap.component';
import { ParticipantSpaghettiPlotComponent } from './participant-spaghetti-plot.component';

const study: Study = {
  id: 's1',
  run_id: 'run',
  status: 'finalized',
  revision: 2,
  human_module_index: 0,
  simulator_module_index: 0,
  trial_count: 3,
  instructions: '',
  consent: '',
  consent_version: 1,
  warnings: [],
  conditions: [
    { id: 'a', name: 'A', module_index: 0 },
    { id: 'b', name: 'B', module_index: 1 },
  ],
};
function result(status: StudyStatus = 'finalized', id = 's1'): StudyResults {
  return {
    kind: 'human-listening-study',
    status,
    provisional: status === 'collecting',
    study_id: id,
    study_revision: 2,
    analysis_input_digest: `digest-${id}`,
    included_sessions: ['p1'],
    counts: { invited: 1, completed: 1, included: 1, excluded: 0, flagged: 0, draft: 0 },
    analysis: {
      analysis_version: 'mushra-v3-lmm-tukey-emm-ci',
      weighting: 'Equal tracks',
      exploratory: false,
      participant_count: 1,
      response_count: 2,
      conditions: [],
      inference: {
        available: true,
        method: 'mixed_effects_ml',
        formula: 'score ~ C(condition)',
        estimated_marginal_means: [
          { id: 'a', mean: 50, se: 2, ci95: [46, 54] },
          { id: 'b', mean: 40, se: 2, ci95: [36, 44] },
        ],
        pairwise: [{ first: 'a', second: 'b', effect: 10, ci95: [5, 15], p: 0.001, p_adjusted: 0.003 }],
        pairwise_correction: 'Tukey',
        pairwise_ci_correction: 'Tukey',
      },
    },
  };
}
const rows = [
  {
    session_id: 'p1',
    session_status: 'completed',
    included: true,
    answered: true,
    track_id: 'track',
    excerpt_id: 'excerpt',
    trial_id: 'trial',
    condition_id: 'a',
    score: 0,
  },
];

function qualityResult(id = 's1'): StudyResults {
  const data = result('finalized', id);
  const ids = ['a', 'b', 'actual-ref-id', 'actual-anchor-id'];
  const summaries = ids.map((id, index) => ({
    id,
    mean: [50, 40, 100, 0][index],
    median: [50, 40, 100, 0][index],
    sd: null,
    iqr: null,
    ci95: null,
    participant_count: 1,
    response_count: 1,
  }));
  data.analysis.conditions = summaries.slice(0, 2);
  data.analysis.quality_control_analysis = {
    analysis_version: 'mushra-v4-lmm-tukey-qc-exploratory',
    exploratory: true,
    scope: 'Separate exploratory QC-inclusive fit',
    comparison_family: 'All pairs including QC',
    summaries,
    conditions: [
      { id: 'a', role: 'plc' },
      { id: 'b', role: 'plc' },
      { id: 'actual-ref-id', role: 'hidden_reference' },
      { id: 'actual-anchor-id', role: 'anchor' },
    ],
    inference: {
      available: true,
      estimated_marginal_means: ids.map((id, index) => ({
        id,
        mean: [55, 45, 100, 0][index],
        se: 1,
        ci95: [
          [53, 57],
          [43, 47],
          [98, 102],
          [-2, 2],
        ][index] as [number, number],
      })),
      pairwise: ids.flatMap((first, index) =>
        ids.slice(index + 1).map((second) => ({
          first,
          second,
          effect: 10,
          ci95: [-5, 25] as [number, number],
          p: 0.03,
          p_adjusted: 0.4,
        })),
      ),
    },
  };
  return data;
}
const qcRows = [
  ...rows,
  { ...rows[0], condition_id: 'b', score: 40 },
  { ...rows[0], condition_id: 'actual-anchor-id', score: 0 },
  { ...rows[0], condition_id: 'actual-ref-id', score: 100 },
];

describe('Finalized Study Hub visualization data flow', () => {
  let http: HttpTestingController;
  let theme: BehaviorSubject<boolean>;
  beforeEach(async () => {
    theme = new BehaviorSubject(false);
    await TestBed.configureTestingModule({
      imports: [StudyLmmVisualizationsComponent, StudyHubComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ThemeService, useValue: { isDarkMode: theme } },
        { provide: ListeningClient, useValue: { exportUrl: (id: string) => `/ratings/${id}` } },
        { provide: RunsClient, useValue: {} },
        { provide: WsService, useValue: {} },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function render(data = result(), selected = study) {
    const fixture = TestBed.createComponent(StudyLmmVisualizationsComponent);
    fixture.componentRef.setInput('study', selected);
    fixture.componentRef.setInput('results', data);
    fixture.detectChanges();
    return fixture;
  }
  it('renders four cards with one ratings request and deduplicates refresh/theme changes', async () => {
    const fixture = render();
    expect(fixture.nativeElement.querySelectorAll('.chart-card').length).toBe(4);
    http.expectOne('/ratings/s1').flush(rows);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.profiles[0].scores).toEqual([0, null]);
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(4);
    theme.next(true);
    fixture.componentRef.setInput('results', result());
    fixture.detectChanges();
    http.expectNone('/ratings/s1');
  });
  it('defaults QC on in all four charts and switches complete inference families without mutation or refetching', async () => {
    const data = qualityResult();
    const original = JSON.stringify(data);
    const fixture = render(data);
    http
      .expectOne('/ratings/s1')
      .flush([
        ...qcRows,
        { ...qcRows[2], included: false, score: 80 },
        { ...qcRows[3], session_id: 'not-in-snapshot', score: 50 },
      ]);
    fixture.detectChanges();
    await fixture.whenStable();
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const emm = fixture.debugElement.query(By.directive(EmmPlotComponent)).componentInstance as EmmPlotComponent;
    const forest = fixture.debugElement.query(By.directive(TukeyForestPlotComponent))
      .componentInstance as TukeyForestPlotComponent;
    const heatmap = fixture.debugElement.query(By.directive(SignificanceHeatmapComponent))
      .componentInstance as SignificanceHeatmapComponent;
    const spaghetti = fixture.debugElement.query(By.directive(ParticipantSpaghettiPlotComponent))
      .componentInstance as ParticipantSpaghettiPlotComponent;
    expect(checkbox.checked).toBeTrue();
    expect(checkbox.disabled).toBeFalse();
    const expectedOrder = ['actual-anchor-id', 'a', 'b', 'actual-ref-id'];
    for (const chart of [emm, forest, heatmap, spaghetti])
      expect(chart.conditions.map((condition) => condition.id)).toEqual(expectedOrder);
    expect(emm.points.map((point) => point.id)).toEqual(expectedOrder);
    expect(emm.points.find((point) => point.id === 'a')?.mean).toBe(55);
    expect(forest.pairs).toBe(data.analysis.quality_control_analysis!.inference.pairwise!);
    expect(heatmap.cells.length).toBe(16);
    expect(spaghetti.profiles).toEqual([{ sessionId: 'p1', scores: [0, 0, 40, 100] }]);
    expect(fixture.nativeElement.textContent).toContain('Exploratory QC-inclusive analysis');
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(4);
    checkbox.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(emm.points.map((point) => point.id)).toEqual(['a', 'b']);
    expect(emm.points[0].mean).toBe(50);
    expect(forest.pairs).toBe(data.analysis.inference.pairwise!);
    expect(heatmap.cells.length).toBe(4);
    expect(spaghetti.profiles[0].scores).toEqual([0, 40]);
    expect(fixture.nativeElement.querySelector('.scope-notice')).toBeNull();
    checkbox.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(emm.points.map((point) => point.id)).toEqual(expectedOrder);
    expect(spaghetti.profiles[0].scores).toEqual([0, 0, 40, 100]);
    expect(JSON.stringify(data)).toBe(original);
    http.expectNone('/ratings/s1');
  });
  it('shares the QC toggle with both Hub tables and all five plots without changing frozen data', async () => {
    const data = qualityResult();
    const original = JSON.stringify(data);
    const fixture = render(data);
    fixture.componentRef.setInput('showResults', true);
    fixture.componentRef.setInput('includeDistributions', true);
    fixture.detectChanges();
    http.expectOne('/ratings/s1').flush(qcRows);
    fixture.detectChanges();
    await fixture.whenStable();
    const tables = () =>
      fixture.nativeElement.querySelectorAll('plc-study-results table') as NodeListOf<HTMLTableElement>;
    expect(tables().length).toBe(2);
    expect(tables()[0].querySelectorAll('tbody tr').length).toBe(4);
    expect(tables()[0].querySelector('tbody th')?.textContent).toContain('Anchor · QC');
    expect(tables()[1].querySelectorAll('tbody tr').length).toBe(6);
    expect(tables()[1].textContent).toContain('0.400000');
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(5);
    const checkbox = fixture.nativeElement.querySelector('.quality-control-toggle input') as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(tables()[0].querySelectorAll('tbody tr').length).toBe(2);
    expect(tables()[0].textContent).not.toContain('QC');
    expect(tables()[1].querySelectorAll('tbody tr').length).toBe(1);
    expect(tables()[1].textContent).toContain('0.003000');
    expect(fixture.nativeElement.querySelector('plc-human-listening-distributions')).not.toBeNull();
    checkbox.click();
    fixture.detectChanges();
    expect(tables()[0].querySelectorAll('tbody tr').length).toBe(4);
    expect(tables()[1].querySelectorAll('tbody tr').length).toBe(6);
    expect(JSON.stringify(data)).toBe(original);
    http.expectNone('/ratings/s1');
  });
  it('renders all five plots in analyzer mode without any tables, diagnostics or narrative details', async () => {
    const fixture = render(qualityResult());
    fixture.componentRef.setInput('plotsOnly', true);
    fixture.componentRef.setInput('showResults', true);
    fixture.componentRef.setInput('includeDistributions', true);
    fixture.detectChanges();
    http.expectOne('/ratings/s1').flush(qcRows);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(5);
    expect(fixture.nativeElement.querySelector('plc-study-results')).toBeNull();
    expect(fixture.nativeElement.querySelector('table, details, .help')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Only completed, non-excluded sessions');
    expect(fixture.nativeElement.textContent).not.toContain('Each observation');
    expect(fixture.nativeElement.textContent).toContain('Exploratory QC-inclusive');
    expect(fixture.nativeElement.querySelectorAll('.quality-control-toggle').length).toBe(1);
  });
  it('preserves an explicit off choice across refreshes but defaults back on for a new study', () => {
    const fixture = render(qualityResult());
    http.expectOne('/ratings/s1').flush(qcRows);
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();
    fixture.componentRef.setInput('results', qualityResult());
    theme.next(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.showQualityControls).toBeFalse();
    http.expectNone('/ratings/s1');
    fixture.componentRef.setInput('study', { ...study, id: 's2' });
    fixture.componentRef.setInput('results', qualityResult('s2'));
    fixture.detectChanges();
    expect(fixture.componentInstance.showQualityControls).toBeTrue();
    http.expectOne('/ratings/s2').flush(qcRows);
  });
  it('allows toggling during the single ratings request and aggregates the eventual response in the current mode', () => {
    const fixture = render(qualityResult());
    const request = http.expectOne('/ratings/s1');
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.loading).toBeTrue();
    request.flush(qcRows);
    fixture.detectChanges();
    expect(fixture.componentInstance.profiles[0].scores).toEqual([0, 40]);
    checkbox.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.profiles[0].scores).toEqual([0, 0, 40, 100]);
    http.expectNone('/ratings/s1');
  });
  it('shows descriptive QC scores when the separate model is unavailable, never substituting primary inference', async () => {
    const data = qualityResult();
    data.analysis.quality_control_analysis!.inference = {
      available: false,
      reason: 'some_selected_conditions_or_tracks_have_no_observations',
    };
    const fixture = render(data);
    http.expectOne('/ratings/s1').flush(qcRows.filter((row) => row.condition_id !== 'actual-ref-id'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.showQualityControls).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.notice').length).toBe(3);
    expect(fixture.componentInstance.profiles[0].scores).toEqual([0, 0, 40, null]);
    expect(data.analysis.inference.available).toBeTrue();
  });
  it('keeps legacy/no-QC snapshots usable with the control disabled and primary data intact', () => {
    const fixture = render();
    http.expectOne('/ratings/s1').flush(rows);
    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.disabled).toBeTrue();
    expect(fixture.componentInstance.showQualityControls).toBeFalse();
    expect(fixture.componentInstance.visibleConditions).toBe(study.conditions);
  });
  for (const status of ['collecting', 'closed'] as StudyStatus[]) {
    it(`does not render or fetch ratings for ${status} studies`, () => {
      const fixture = render(result(status), { ...study, status });
      expect(fixture.nativeElement.querySelector('section')).toBeNull();
      http.expectNone('/ratings/s1');
    });
  }
  it('rejects mismatched identities and provisional finalized payloads', () => {
    const fixture = render(result('finalized', 'other'));
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    fixture.componentRef.setInput('results', { ...result(), provisional: true });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    http.expectNone('/ratings/s1');
  });
  it('cancels old requests and clears old profiles on selection changes/destruction', () => {
    const fixture = render();
    const first = http.expectOne('/ratings/s1');
    fixture.componentRef.setInput('study', { ...study, id: 's2' });
    fixture.componentRef.setInput('results', result('finalized', 's2'));
    fixture.detectChanges();
    expect(first.cancelled).toBeTrue();
    expect(fixture.componentInstance.profiles).toEqual([]);
    const second = http.expectOne('/ratings/s2');
    second.flush([{ ...rows[0], score: 80 }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.profiles[0].scores[0]).toBe(80);
    fixture.componentRef.setInput('results', { ...result('finalized', 's2'), analysis_input_digest: 'new-digest' });
    fixture.detectChanges();
    const pending = http.expectOne('/ratings/s2');
    fixture.destroy();
    expect(pending.cancelled).toBeTrue();
  });
  it('isolates export failure to spaghetti and supports retry without altering model charts', async () => {
    const fixture = render();
    http.expectOne('/ratings/s1').flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(3);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    (fixture.nativeElement.querySelector('plc-participant-spaghetti-plot button') as HTMLButtonElement).click();
    http.expectOne('/ratings/s1').flush(rows);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(4);
  });
  it('retains spaghetti when inference is unavailable and checks frozen inclusion membership', async () => {
    const data = result();
    data.analysis.inference = { available: false, reason: 'too_few_participants' };
    const fixture = render(data);
    http.expectOne('/ratings/s1').flush([...rows, { ...rows[0], session_id: 'not-in-snapshot', score: 100 }]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.profiles.length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('canvas').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.notice').length).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('too few participants');
  });
  it('mounts charts after the unchanged results tables in the hub only after finalization', async () => {
    spyOn(StudyHubComponent.prototype, 'ngOnInit').and.stub();
    const fixture = TestBed.createComponent(StudyHubComponent);
    fixture.componentInstance.loading = false;
    fixture.componentInstance.selected = { ...study, status: 'closed' };
    fixture.componentInstance.studies = [fixture.componentInstance.selected];
    fixture.componentInstance.results = result('closed');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('plc-study-results')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('plc-study-lmm-visualizations')).toBeNull();
    fixture.componentInstance.selected = study;
    fixture.componentInstance.results = result();
    fixture.detectChanges();
    http.expectOne('/ratings/s1').flush(rows);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.chart-card').length).toBe(4);
    expect(fixture.nativeElement.querySelector('plc-study-results table')).not.toBeNull();
    const text = fixture.nativeElement.textContent;
    expect(text.indexOf('Statistical comparisons')).toBeLessThan(
      text.indexOf('Finalized listening-study visualizations'),
    );
  });
});
