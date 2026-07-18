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

  //function to update the tree nodes with the incoming node progress
  private updateNodeByNodeId(node: TreeNode, incoming: NodeProgress): TreeNode {
    if (node.node_ids.includes(incoming.node_id!)) {
      return { ...node, current: incoming.current, total: incoming.total };
    }
    if (node.children.length === 0) {
      return node;
    }
    return {
      ...node,
      children: node.children.map(child => this.updateNodeByNodeId(child, incoming)),
    };
  }

  //function to build the tree nodes from the run object using slice to get the correct node_ids for each module type
  private buildNodesFromRun(run: Run, completed: boolean): TreeNode[] {
    const val = completed ? 1 : 0;
    const tot = completed ? 1 : null;

    const plsModules = run.modules[ModuleType.PacketLossSimulator];
    const plcModules = run.modules[ModuleType.PLCAlgorithm];
    const oaModules = run.modules[ModuleType.OutputAnalyser];

    const nPls = plsModules.length;
    const nPlc = plcModules.length;

    return run.tracks.map((track, trackIndex) => ({
      description: track,
      node_ids: [],
      current: val,
      total: tot,
      children: plsModules.map(sim => ({
        description: sim.name,
        node_ids: (sim.node_ids ?? []).slice(trackIndex, trackIndex + 1),
        current: val,
        total: tot,
        children: plcModules.map(alg => ({
          description: alg.name,
          node_ids: (alg.node_ids ?? []).slice(trackIndex * nPls, (trackIndex + 1) * nPls),
          current: val,
          total: tot,
          children: oaModules.map(out => ({
            description: out.name,
            node_ids: (out.node_ids ?? []).slice(
              trackIndex * nPls * nPlc,
              (trackIndex + 1) * nPls * nPlc,
            ),
            current: val,
            total: tot,
            children: [],
          })),
        })),
      })),
    }));
  }

  //function to update the tree nodes with the incoming node progress
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
          let updated = this.nodes;
          message.nodes.forEach(incomingNode => {
            if (incomingNode.node_id) {
              updated = updated.map(node => this.updateNodeByNodeId(node, incomingNode));
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

  public getPercentage(node: TreeNode): number {
    if (!node.total || node.total === 0) return 0;
    return Math.round((node.current / node.total) * 100);
  }

  public onGoToAnalysis(): void {
    this.router.navigate(['/analyzer', this.runId]);
  }
}