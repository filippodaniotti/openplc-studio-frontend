import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { RunStatus } from '../shared/enums/run-status.enum';
import { Run } from '../shared/interfaces/run.interface';
import { BacklogComponent } from './backlog.component';

const completedRun = {
  id: 'run-1',
  name: 'Completed run',
  status: RunStatus.COMPLETED,
} as Run;

describe('BacklogComponent run deletion', () => {
  let component: BacklogComponent;
  let runsClient: jasmine.SpyObj<any>;
  let confirmationService: jasmine.SpyObj<any>;
  let messageService: jasmine.SpyObj<any>;
  let router: jasmine.SpyObj<any>;
  let stateChanges$: Subject<any>;

  beforeEach(() => {
    runsClient = jasmine.createSpyObj('RunsClient', ['getRunsPage', 'deleteRun']);
    confirmationService = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    messageService = jasmine.createSpyObj('MessageService', ['add']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    stateChanges$ = new Subject();

    component = new BacklogComponent(runsClient, confirmationService, messageService, router, {
      getStateChangeMessages: () => stateChanges$.asObservable(),
    } as any);
    component.ngOnInit();
  });

  it('loads server-side search, status filters, and sorting', () => {
    runsClient.getRunsPage.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 25 }));
    component.searchTerm = 'alice';
    component.selectedStatuses = [RunStatus.RUNNING, RunStatus.COMPLETED];

    component.loadRuns({ first: 0, rows: 25, sortField: 'name', sortOrder: 1 });

    expect(runsClient.getRunsPage).toHaveBeenCalledOnceWith(
      1,
      25,
      'alice',
      [RunStatus.RUNNING, RunStatus.COMPLETED],
      'name',
      'asc',
    );
    expect(component.sortField).toBe('name');
    expect(component.sortDirection).toBe('asc');
  });

  it('allows analysis only for completed runs', () => {
    expect(component.isRunAnalyzable(completedRun)).toBeTrue();

    for (const status of [RunStatus.CREATED, RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.FAILED]) {
      const run = { ...completedRun, status };
      expect(component.isRunAnalyzable(run)).toBeFalse();
      component.onAnalyse(run);
    }

    expect(router.navigate).not.toHaveBeenCalled();
    component.onAnalyse(completedRun);
    expect(router.navigate).toHaveBeenCalledOnceWith(['analyzer', completedRun.id]);
  });

  it('allows deletion for deferred or finished runs', () => {
    expect(component.isRunDeletable(completedRun)).toBeTrue();
    expect(component.isRunDeletable({ ...completedRun, status: RunStatus.FAILED })).toBeTrue();
    expect(component.isRunDeletable({ ...completedRun, status: RunStatus.CREATED })).toBeTrue();
    expect(component.isRunDeletable({ ...completedRun, status: RunStatus.QUEUED })).toBeFalse();
    expect(component.isRunDeletable({ ...completedRun, status: RunStatus.RUNNING })).toBeFalse();
  });

  it('updates the displayed run state from a websocket message', () => {
    component.runs = [completedRun];

    stateChanges$.next({ run_id: completedRun.id, new_status: RunStatus.RUNNING });

    expect(component.runs[0].status).toBe(RunStatus.RUNNING);
    expect(component.isRunDeletable(component.runs[0])).toBeFalse();
  });

  it('ignores a websocket state change for a run outside the current page', () => {
    component.runs = [completedRun];

    stateChanges$.next({ run_id: 'other-run', new_status: RunStatus.RUNNING });

    expect(component.runs).toEqual([completedRun]);
  });

  it('unsubscribes from websocket state changes when destroyed', () => {
    component.runs = [completedRun];
    component.ngOnDestroy();

    stateChanges$.next({ run_id: completedRun.id, new_status: RunStatus.RUNNING });

    expect(component.runs[0].status).toBe(RunStatus.COMPLETED);
  });

  it('confirms and deletes a finished run', () => {
    runsClient.deleteRun.and.returnValue(of(undefined));
    runsClient.getRunsPage.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 10 }));
    component.runs = [completedRun];

    component.onDelete(completedRun);
    const confirmation = confirmationService.confirm.calls.mostRecent().args[0];
    confirmation.accept();

    expect(runsClient.deleteRun).toHaveBeenCalledOnceWith(completedRun.id);
    expect(runsClient.getRunsPage).toHaveBeenCalledOnceWith(1, 10, '', [], 'created', 'desc');
    expect(messageService.add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'success', summary: 'Run deleted' }),
    );
    expect(component.deletingRunId).toBeNull();
  });

  it('moves to the previous page after deleting its only row', () => {
    runsClient.deleteRun.and.returnValue(of(undefined));
    runsClient.getRunsPage.and.returnValue(of({ items: [], total: 10, page: 1, pageSize: 10 }));
    component.runs = [completedRun];
    component.first = 10;
    component.rows = 10;

    component.onDelete(completedRun);
    confirmationService.confirm.calls.mostRecent().args[0].accept();

    expect(runsClient.getRunsPage).toHaveBeenCalledOnceWith(1, 10, '', [], 'created', 'desc');
    expect(component.first).toBe(0);
  });

  it('shows the API error and clears the loading state', () => {
    runsClient.deleteRun.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { detail: 'Run cannot be deleted while running' },
          }),
      ),
    );

    component.onDelete(completedRun);
    confirmationService.confirm.calls.mostRecent().args[0].accept();

    expect(messageService.add).toHaveBeenCalledWith(
      jasmine.objectContaining({
        severity: 'error',
        detail: 'Run cannot be deleted while running',
      }),
    );
    expect(component.deletingRunId).toBeNull();
  });
});
