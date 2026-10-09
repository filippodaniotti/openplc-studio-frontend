import { TestBed } from '@angular/core/testing';
import { StudyResultsComponent } from './study-results.component';
import { StudyResults } from './listening.models';

function result(included = 0): StudyResults {
  return {
    kind: 'human-listening-study',
    status: 'collecting',
    study_revision: 34,
    provisional: true,
    counts: { invited: 3, draft: 1, completed: included, included, excluded: 0, flagged: 0 },
    analysis: {
      analysis_version: 'mushra-v1',
      weighting: 'Equal participants',
      exploratory: false,
      participant_count: included,
      response_count: included,
      conditions: [
        {
          id: 'plc-0',
          participant_count: included,
          response_count: included,
          mean: included ? 70 : null,
          median: null,
          sd: null,
          iqr: null,
          ci95: null,
        },
      ],
      inference: { available: false, reason: 'no_included_responses' },
    },
  };
}

describe('Study results during collection', () => {
  async function render(data: StudyResults) {
    await TestBed.configureTestingModule({ imports: [StudyResultsComponent] }).compileComponents();
    const fixture = TestBed.createComponent(StudyResultsComponent);
    fixture.componentInstance.results = data;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a useful waiting state instead of empty statistics and condition cards', async () => {
    const page = await render(result());
    expect(page.textContent).toContain('Waiting for completed responses');
    expect(page.querySelector('table')).toBeNull();
    expect(page.querySelector('article')).toBeNull();
    expect(page.textContent).not.toContain('Unavailable: no included responses');
    expect(page.querySelector('.analysis-details')?.hasAttribute('open')).toBeFalse();
  });

  it('shows live summaries but no empty distribution card when responses arrive', async () => {
    const page = await render(result(1));
    expect(page.querySelector('table')).not.toBeNull();
    expect(page.querySelector('article')).toBeNull();
    expect(page.textContent).toContain('Statistical comparisons');
  });

  it('labels populated distributions as individual rating counts during collection', async () => {
    const data = result(1);
    data.analysis.conditions[0].score_histogram = { edges: [0, 50, 100], counts: [0, 1] };
    const page = await render(data);
    expect(page.querySelector('article')).not.toBeNull();
    expect(page.textContent).toContain('How listeners rated each condition');
    expect(page.textContent).toContain('1 rating');
  });
});
