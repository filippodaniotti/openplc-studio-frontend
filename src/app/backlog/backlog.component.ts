import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { tap } from 'rxjs';
import { RunsClient } from '../shared/clients/runs.client';
import { RunConfigurationDrawerComponent } from '../shared/components/run-configuration-drawer/run-configuration-drawer.component';
import { RunStatusBadgeComponent } from '../shared/components/run-status-badge/run-status-badge.component';
import { RunStatus } from '../shared/enums/run-status.enum';
import { Run, RunPage } from '../shared/interfaces/run.interface';

@Component({
  selector: 'plc-backlog',
  imports: [
    TableModule,
    ButtonModule,
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
export class BacklogComponent implements OnInit {
  public runs: Run[] = [];
  public totalRecords = 0;
  public rows = 10;
  public first = 0;
  public loading = false;
  public loaded = false;

  public configDrawerVisible = false;
  public selectedRun: Run | null = null;
  public deletingRunId: string | null = null;

  constructor(
    private runsClient: RunsClient,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    public router: Router,
  ) {}

  ngOnInit(): void {
    // The lazy p-table emits its initial `onLazyLoad` when it renders, which
    // triggers the first fetch. Fetching here as well would duplicate it.
  }

  public loadRuns(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.rows;
    const first = event.first ?? 0;
    const page = Math.floor(first / rows) + 1;

    this.loading = true;
    this.runsClient.getRunsPage(page, rows).subscribe({
      next: (pageResult: RunPage) => {
        this.runs = pageResult.items;
        this.totalRecords = pageResult.total;
        this.rows = rows;
        this.first = first;
        this.loaded = true;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  public onAnalyse(run: Run): void {
    this.router.navigate(['analyzer', run.id]);
  }

  public onViewProgress(run: Run): void {
    this.router.navigate(['run-progress', run.id]);
  }

  public onViewConfig(run: Run): void {
    this.selectedRun = run;
    this.configDrawerVisible = true;
  }

  public isRunDeletable(run: Run): boolean {
    return run.status === RunStatus.COMPLETED || run.status === RunStatus.FAILED;
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
        this.loadRuns({ first: nextFirst, rows: this.rows });
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
