import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
//import { ProgressBarModule } from 'primeng/progressbar';
import { CardModule } from 'primeng/card';
import { WsService } from '../shared/services/ws.service';
import { RunsClient } from '../shared/clients/runs.client';
import { Run } from '../shared/interfaces/run.interface';
import { NodeProgress, RunProgressMessage } from '../shared/interfaces/ws.interface';
import { RunStatusBadgeComponent } from '../shared/components/run-status-badge/run-status-badge.component';
import { RunStatus } from '../shared/enums/run-status.enum';
import { ViewEncapsulation } from '@angular/core';
import { ModuleType } from '../shared/enums/module-type.enum';
import { TreeNode } from '../shared/interfaces/ws.interface';

@Component({
  selector: 'plc-run-progress',
  standalone: true,
  imports: [CommonModule, ButtonModule,/* ProgressBarModule,*/ CardModule, RunStatusBadgeComponent],
  templateUrl: './run-progress.component.html',
  styleUrl: './run-progress.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class RunProgressComponent implements OnInit, OnDestroy {
  public run: Run | null = null;
  public nodes: TreeNode[] = [];
  public isCompleted = false;

  private runId!: string;
  private destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly wsService: WsService,
    private readonly runsClient: RunsClient,
  ) { }

  private buildNodesFromRun(run: Run, completed: boolean): TreeNode[] {
    const val = completed ? 1 : 0;
    const tot = completed ? 1 : null;

    return run.tracks.map(track => ({
      description: track,
      current: val,
      total: tot,
      children: run.modules[ModuleType.PacketLossSimulator].map(sim => ({
        description: sim.name,
        current: val,
        total: tot,
        children: run.modules[ModuleType.PLCAlgorithm].map(alg => ({
          description: alg.name,
          current: val,
          total: tot,
          children: run.modules[ModuleType.OutputAnalyser].map(out => ({
            description: out.name,
            current: val,
            total: tot,
            children: [],
          })),
        })),
      })),
    }));
  }

  public ngOnInit(): void {
    this.runId = this.route.snapshot.paramMap.get('id')!;
    this.wsService.sendRunId(this.runId);

    this.runsClient
      .getRun(this.runId)
      .pipe(tap((run: Run) => {
        this.run = run;
        if (run.status === RunStatus.COMPLETED || run.status === RunStatus.FAILED) {
          this.isCompleted = true;
          this.nodes = this.buildNodesFromRun(run, true);
        } else {
          this.nodes = this.buildNodesFromRun(run, false);
        }
      }))
      .subscribe();

    this.wsService
      .getProgressMessages()
      .pipe(
        takeUntil(this.destroy$),
        tap((message: RunProgressMessage) => {
          if (this.run && this.run.status === RunStatus.CREATED) {
            this.run = { ...this.run, status: RunStatus.RUNNING };
          }
          const updated = [...this.nodes];
          message.nodes.forEach(incomingNode => {
            const index = updated.findIndex(n => n.description === incomingNode.description);
            if (index >= 0) {
              updated[index] = { ...updated[index], current: incomingNode.current, total: incomingNode.total };
            } else {
              updated.push({ ...incomingNode, children: [] });
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