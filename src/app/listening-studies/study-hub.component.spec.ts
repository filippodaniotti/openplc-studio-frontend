import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { StudyHubComponent } from './study-hub.component';
import { ListeningClient } from './listening.client';
import { RunsClient } from '../shared/clients/runs.client';
import { WsService } from '../shared/services/ws.service';
import { Study } from './listening.models';

const study: Study = {
  id: 'study',
  run_id: 'run',
  human_module_index: 0,
  simulator_module_index: 0,
  status: 'collecting',
  revision: 0,
  trial_count: 20,
  instructions: 'Listen',
  consent: 'I agree',
  consent_version: 1,
  warnings: [],
  conditions: [],
};

describe('Study hub participants', () => {
  let activeFixture: ComponentFixture<StudyHubComponent>;
  async function render(withSession = false, sessionCount = 1) {
    await TestBed.configureTestingModule({
      imports: [StudyHubComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: ListeningClient, useValue: { exportUrl: (id: string, file: string) => `/exports/${id}/${file}` } },
        { provide: RunsClient, useValue: {} },
        { provide: WsService, useValue: {} },
      ],
    }).compileComponents();
    spyOn(StudyHubComponent.prototype, 'ngOnInit').and.stub();
    const fixture = TestBed.createComponent(StudyHubComponent);
    activeFixture = fixture;
    fixture.componentInstance.loading = false;
    fixture.componentInstance.selected = study;
    fixture.componentInstance.studies = [study];
    if (withSession)
      fixture.componentInstance.heads = Array.from({ length: sessionCount }, (_, index) => ({
        session_id: `listener-${index}`,
        revision: 0,
        status: 'draft',
        revoked: false,
        excluded: false,
        exclusion_reason: null,
        flags: [],
      }));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows an empty state instead of table headers when there are no participants', async () => {
    const page = await render();
    expect(page.querySelector('.participants-empty')?.textContent).toContain('No participants yet');
    expect(page.querySelector('.participant-table')).toBeNull();
    expect(page.querySelector('.participant-count')?.textContent).toContain('0 sessions');
  });

  it('shows the table and session count when invitations exist', async () => {
    const page = await render(true);
    expect(page.querySelector('.participants-empty')).toBeNull();
    expect(page.querySelector('.participant-table')?.textContent).toContain('listener');
    expect(page.querySelector('.participant-count')?.textContent).toContain('1 session');
  });

  it('offers deletion only for untouched invitations without exclusion history', async () => {
    const page = await render(true);
    const component = activeFixture.componentInstance;
    const head = component.heads[0];
    expect(component.canDeleteInvitation(head)).toBeFalse();
    head.status = 'invited';
    activeFixture.detectChanges();
    expect(component.canDeleteInvitation(head)).toBeTrue();
    expect(page.querySelector('.participant-table')?.textContent).not.toContain('Delete invitation');
    expect(page.querySelector('.participant-table textarea')).toBeNull();
    (page.querySelector('button[aria-label="Manage participant listener-0"]') as HTMLButtonElement).click();
    activeFixture.detectChanges();
    expect(component.participantActionsVisible).toBeTrue();
    expect(document.body.querySelector('.p-dialog')?.textContent).toContain('Delete invitation');
    head.revision = 1;
    expect(component.canDeleteInvitation(head)).toBeFalse();
    head.revision = 0;
    head.exclusion_audit = [{}];
    expect(component.canDeleteInvitation(head)).toBeFalse();
    head.exclusion_audit = [];
    head.status = 'completed';
    expect(component.canDeleteInvitation(head)).toBeFalse();
  });

  it('pages participants without changing the total session count', async () => {
    const page = await render(true, 26);
    expect(page.querySelectorAll('.participant-table tbody tr').length).toBe(5);
    expect(page.querySelector('.participant-count')?.textContent).toContain('26 sessions');
    activeFixture.componentInstance.pageParticipants({ first: 10, rows: 10 });
    activeFixture.detectChanges();
    expect(page.querySelector('.participant-table tbody tr code')?.textContent).toContain('listener-10');
    activeFixture.componentInstance.pageParticipants({ first: 20, rows: 20 });
    activeFixture.detectChanges();
    expect(page.querySelectorAll('.participant-table tbody tr').length).toBe(6);
    expect(page.querySelector('.participant-table tbody tr code')?.textContent).toContain('listener-20');
  });

  it('clamps paging when the participant list becomes shorter and retains draft reasons', async () => {
    await render(true, 26);
    const component = activeFixture.componentInstance;
    component.reasons['listener-0'] = 'Review required';
    component.pageParticipants({ first: 20, rows: 10 });
    component.heads = component.heads.slice(0, 3);
    expect(component.participantFirst).toBe(0);
    expect(component.visibleParticipants.length).toBe(3);
    expect(component.reasons['listener-0']).toBe('Review required');
  });

  it('groups rating formats under one export control and labels session details concisely', async () => {
    const page = await render();
    expect(page.querySelector('.export-options summary')?.textContent).toContain('Export ratings');
    expect(page.querySelector('.export-menu a[href$="responses.csv"]')).not.toBeNull();
    expect(page.querySelector('.export-menu a[href$="responses.json"]')).not.toBeNull();
    expect(page.querySelector('a[href$="sessions.json"]')?.textContent).toContain('Session details');
  });
});
