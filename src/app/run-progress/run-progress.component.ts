import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, tap, timer, switchMap, combineLatest } from 'rxjs';
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
  private runRetchDone = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly wsService: WsService,
    private readonly runsClient: RunsClient,
  ) { }

  //function to fill the tree nodes as completed
  private fillNodesAsCompleted(node: TreeNode): TreeNode {
    return {
      ...node,
      current: 1,
      total: 1,
      children: node.children.map(child => this.fillNodesAsCompleted(child)),
    };
  }

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


  public ngOnInit(): void {
    this.runId = this.route.snapshot.paramMap.get('id')!;
    this.wsService.sendRunId(this.runId);

    timer(400)
      .pipe(
        switchMap(() => this.runsClient.getRun(this.runId)),
        tap((run: Run) => {
          this.run = run;
          if (run.status === RunStatus.COMPLETED || run.status === RunStatus.FAILED) {
            this.isCompleted = true;
            this.nodes = this.buildNodesFromRun(run, true);
          } else {
            this.nodes = this.buildNodesFromRun(run, false);
          }
        }),
        tap(() => this.runRetchDone.next()),
      )
      .subscribe();

    combineLatest([this.wsService.getProgressMessages(), this.runRetchDone.asObservable()])
      .pipe(
        tap(([message, blank]: [RunProgressMessage, void]) => {
          if (this.run && this.run.status === RunStatus.CREATED) {
            this.run = { ...this.run, status: RunStatus.RUNNING };
          }
          let updated = structuredClone(this.nodes);
          message.nodes.forEach((incomingNode) => {
            if (incomingNode.node_id) {
              updated = updated.map((node) => this.updateNodeByNodeId(node, incomingNode));
            }
          });
          this.nodes = updated;
        }),
        takeUntil(this.destroy$),
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
          /*this.nodes = this.nodes.map(node => ({
            ...node,
            current: node.total ?? node.current,
          }));*/
          this.nodes = this.nodes.map(node => this.fillNodesAsCompleted(node));
        }),
      )
      .subscribe();
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public getPercentage(node: TreeNode, isRoot = false): number {
    if (isRoot) {
      const leafPercentages = this.collectLeafPercentages(node);
      if (leafPercentages.length === 0) return 0;
      const avg = leafPercentages.reduce((sum, p) => sum + p, 0) / leafPercentages.length;
      return Math.round(avg);
    }
    if (!node.total || node.total === 0) return 0;
    return Math.round((node.current / node.total) * 100);
  }

  private collectLeafPercentages(node: TreeNode): number[] {
    if (node.children.length === 0) {
      if (!node.total || node.total === 0) return [0];
      return [Math.round((node.current / node.total) * 100)];
    }
    return node.children.flatMap(child => this.collectLeafPercentages(child));
  }

  public onGoToAnalysis(): void {
    this.router.navigate(['/analyzer', this.runId]);
  }
}