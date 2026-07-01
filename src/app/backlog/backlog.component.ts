import { Component, OnInit } from '@angular/core';
import { RunsClient } from '../shared/clients/runs.client';
import { Run } from '../shared/interfaces/run.interface';
import { tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { RunStatusBadgeComponent } from '../shared/components/run-status-badge/run-status-badge.component';
import { Router } from '@angular/router';

@Component({
  selector: 'plc-backlog',
  imports: [TableModule, ButtonModule, TagModule, CommonModule, RunStatusBadgeComponent, TooltipModule],
  standalone: true,
  templateUrl: './backlog.component.html',
  styleUrl: './backlog.component.scss',
})
export class BacklogComponent implements OnInit {
  public runs!: Run[];

  constructor(
    private runsClient: RunsClient,
    public router: Router,
  ) { }

  ngOnInit() {
    this.getAllRuns();
  }

  public getAllRuns(): void {
    this.runsClient
      .getAllRuns()
      .pipe(tap((runs) => (this.runs = runs)))
      .subscribe();
  }

  public onAnalyse(run: Run) {
    this.router.navigate(['analyzer', run.id]);
  }

  public onViewProgress(run: Run) {
    this.router.navigate(['run-progress', run.id]);
  }

  // Download the run configuration as a JSON file
  public onDownloadConfig(run: Run): void {
  this.runsClient.exportRunConfig(run.id).pipe(
    tap((blob: Blob) => {
      const url = URL.createObjectURL(blob); // Create a temporary URL for the blob
      const a = document.createElement('a');
      a.href = url;
      a.download = `${run.name}_config.json`;
      a.click();
      URL.revokeObjectURL(url);
    })
  ).subscribe();
}
}
