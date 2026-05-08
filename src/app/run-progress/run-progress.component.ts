import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { CardModule } from 'primeng/card';
import { WsService } from '../shared/services/ws.service';
import { RunsClient } from '../shared/clients/runs.client';
import { Run } from '../shared/interfaces/run.interface';
import { NodeProgress, RunProgressMessage } from '../shared/interfaces/ws.interface';
import { RunStatusBadgeComponent } from '../shared/components/run-status-badge/run-status-badge.component';
import { RunStatus } from '../shared/enums/run-status.enum';

@Component({
  selector: 'plc-run-progress',
  standalone: true,
  imports: [CommonModule, ButtonModule, ProgressBarModule, CardModule, RunStatusBadgeComponent],
  templateUrl: './run-progress.component.html',
  styleUrl: './run-progress.component.scss',
})
export class RunProgressComponent implements OnInit, OnDestroy {
  public run: Run | null = null;
  public nodes: NodeProgress[] = [];
  public isCompleted = false;

  private runId!: string;
  private destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly wsService: WsService,
    private readonly runsClient: RunsClient,
  ) { }

  public ngOnInit(): void {
    this.runId = this.route.snapshot.paramMap.get('id')!;

    this.runsClient
      .getRun(this.runId)
      .pipe(tap((run: Run) => (this.run = run)))
      .subscribe();

    this.wsService
      .getProgressMessages()
      .pipe(
        takeUntil(this.destroy$),
        tap((message: RunProgressMessage) => {
          const updated = [...this.nodes];
          message.nodes.forEach(incomingNode => {
            const index = updated.findIndex(n => n.description === incomingNode.description);
            if (index >= 0) {
              updated[index] = { ...incomingNode };
            } else {
              updated.push({ ...incomingNode });
            }
          });
          this.nodes = updated;
        }),
      )
      .subscribe();

    this.wsService
      .getCompletionMessages()
      .pipe(
        takeUntil(this.destroy$),
        tap(() => {
          this.isCompleted = true;
          if (this.run) {
            this.run = { ...this.run, status: RunStatus.COMPLETED };
          }
          this.nodes = this.nodes.map(node => ({
            ...node,
            current: node.total ?? node.current,
          }));
        }),
      )
      .subscribe();
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public getPercentage(node: NodeProgress): number {
    if (!node.total || node.total === 0) return 0;
    return Math.round((node.current / node.total) * 100);
  }

  public onGoToAnalysis(): void {
    this.router.navigate(['/analyzer', this.runId]);
  }
}