import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { debounceTime, distinctUntilChanged, Subject, takeUntil, tap } from 'rxjs';
import { RunsClient } from '../shared/clients/runs.client';
import { RunConfigurationDrawerComponent } from '../shared/components/run-configuration-drawer/run-configuration-drawer.component';
import { RunStatusBadgeComponent } from '../shared/components/run-status-badge/run-status-badge.component';
import { RunStatus } from '../shared/enums/run-status.enum';
import { Run, RunPage, RunSortDirection, RunSortField } from '../shared/interfaces/run.interface';
import { WsService } from '../shared/services/ws.service';

@Component({
  selector: 'plc-backlog',
  imports: [
    TableModule,
    ButtonModule,
    FormsModule,
    InputTextModule,
    MultiSelectModule,
    TagModule,
    CommonModule,
    RunStatusBadgeComponent,
    TooltipModule,
    ConfirmDialogModule,
    RunConfigurationDrawerComponent,
  ],
  providers: [ConfirmationService],
  standalone: true,
  templateUrl: './backlog.component.html',
  styleUrl: './backlog.component.scss',
})
export class BacklogComponent implements OnInit, OnDestroy {
  public runs: Run[] = [];
  public totalRecords = 0;
  public rows = 10;
  public first = 0;
  public loading = false;
  public loaded = false;
  public searchTerm = '';
  public selectedStatuses: RunStatus[] = [];
  public sortField: RunSortField = 'created';
  public sortDirection: RunSortDirection = 'desc';
  public readonly statusOptions = [
    { label: 'Created', value: RunStatus.CREATED },
    { label: 'Queued', value: RunStatus.QUEUED },
    { label: 'Running', value: RunStatus.RUNNING },
    { label: 'Completed', value: RunStatus.COMPLETED },
    { label: 'Failed', value: RunStatus.FAILED },
  ];

  public configDrawerVisible = false;
  public selectedRun: Run | null = null;
  public deletingRunId: string | null = null;

  private readonly destroy$ = new Subject<void>();
  private readonly searchChanges = new Subject<string>();

  constructor(
    private runsClient: RunsClient,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    public router: Router,
    private readonly wsService: WsService,
  ) {}

  ngOnInit(): void {
    // The lazy p-table emits its initial `onLazyLoad` when it renders, which
    // triggers the first fetch. Fetching here as well would duplicate it.
    this.searchChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.reloadFromFirstPage());

    this.wsService
      .getStateChangeMessages()
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        if (this.selectedStatuses.length > 0 || this.sortField === 'status') {
          this.reloadCurrentPage();
          return;
        }
        this.runs = this.runs.map((run) => (run.id === message.run_id ? { ...run, status: message.new_status } : run));
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public loadRuns(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.rows;
    const first = event.first ?? 0;
    const page = Math.floor(first / rows) + 1;
    const requestedSort = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    const sortField = this.isSortField(requestedSort) ? requestedSort : this.sortField;
    const sortDirection: RunSortDirection = event.sortOrder === 1 ? 'asc' : 'desc';

    this.loading = true;
    this.runsClient
      .getRunsPage(page, rows, this.searchTerm, this.selectedStatuses, sortField, sortDirection)
      .subscribe({
        next: (pageResult: RunPage) => {
          this.runs = pageResult.items;
          this.totalRecords = pageResult.total;
          this.rows = rows;
          this.first = first;
          this.sortField = sortField;
          this.sortDirection = sortDirection;
          this.loaded = true;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  public onSearchChange(value: string): void {
    this.searchChanges.next(value);
  }

  public onStatusesChange(): void {
    this.reloadFromFirstPage();
  }

  public clearFilters(): void {
    this.searchTerm = '';
    this.selectedStatuses = [];
    this.reloadFromFirstPage();
  }

  public get hasActiveFilters(): boolean {
    return this.searchTerm.trim().length > 0 || this.selectedStatuses.length > 0;
  }

  public sortIcon(field: RunSortField): string {
    if (this.sortField !== field) return 'pi pi-sort-alt plc-sort-icon';
    return this.sortDirection === 'asc'
      ? 'pi pi-sort-amount-up-alt plc-sort-icon'
      : 'pi pi-sort-amount-down plc-sort-icon';
  }

  public onAnalyse(run: Run): void {
    if (!this.isRunAnalyzable(run)) return;
    this.router.navigate(['analyzer', run.id]);
  }

  public isRunAnalyzable(run: Run): boolean {
    return run.status === RunStatus.COMPLETED;
  }

  public onViewProgress(run: Run): void {
    this.router.navigate(['run-progress', run.id]);
  }

  public onViewConfig(run: Run): void {
    this.selectedRun = run;
    this.configDrawerVisible = true;
  }

  public isRunDeletable(run: Run): boolean {
    return run.status === RunStatus.CREATED || run.status === RunStatus.COMPLETED || run.status === RunStatus.FAILED;
  }

  public onDelete(run: Run): void {
    if (!this.isRunDeletable(run) || this.deletingRunId !== null) {
      return;
    }

    this.confirmationService.confirm({
      header: 'Delete run',
      icon: 'pi pi-exclamation-triangle',
      message: `Delete “${run.name}”? This action cannot be undone.`,
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      accept: () => this.deleteRun(run),
    });
  }

  private deleteRun(run: Run): void {
    this.deletingRunId = run.id;
    this.runsClient.deleteRun(run.id).subscribe({
      next: () => {
        const nextFirst = this.runs.length === 1 && this.first > 0 ? Math.max(0, this.first - this.rows) : this.first;
        this.deletingRunId = null;
        this.messageService.add({
          severity: 'success',
          summary: 'Run deleted',
          detail: `Run ${run.name} was deleted`,
        });
        this.loadRuns({
          first: nextFirst,
          rows: this.rows,
          sortField: this.sortField,
          sortOrder: this.sortDirection === 'asc' ? 1 : -1,
        });
      },
      error: (error: HttpErrorResponse) => {
        this.deletingRunId = null;
        this.messageService.add({
          severity: 'error',
          summary: 'Could not delete run',
          detail: error.error?.detail ?? 'Please try again.',
        });
      },
    });
  }

  private reloadFromFirstPage(): void {
    this.first = 0;
    this.loadRuns({
      first: 0,
      rows: this.rows,
      sortField: this.sortField,
      sortOrder: this.sortDirection === 'asc' ? 1 : -1,
    });
  }

  private reloadCurrentPage(): void {
    this.loadRuns({
      first: this.first,
      rows: this.rows,
      sortField: this.sortField,
      sortOrder: this.sortDirection === 'asc' ? 1 : -1,
    });
  }

  private isSortField(value: string | null | undefined): value is RunSortField {
    return value === 'name' || value === 'created' || value === 'updated' || value === 'status';
  }

  // Download the run configuration as a JSON file
  public onDownloadConfig(run: Run): void {
    this.runsClient
      .exportRunConfig(run.id)
      .pipe(
        tap((blob: Blob) => {
          const url = URL.createObjectURL(blob); // Create a temporary URL for the blob
          const a = document.createElement('a');
          a.href = url;
          a.download = `${run.name}_config.json`;
          a.click();
          URL.revokeObjectURL(url);
        }),
      )
      .subscribe();
  }
}
