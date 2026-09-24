import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { finalize, Subject, takeUntil } from 'rxjs';
import { RunsClient } from '../shared/clients/runs.client';
import { WsService } from '../shared/services/ws.service';
import {
  RunConfigurationDrawerComponent,
  FocusedRunModule,
  RunModuleType,
} from '../shared/components/run-configuration-drawer/run-configuration-drawer.component';
import { RunStatusBadgeComponent } from '../shared/components/run-status-badge/run-status-badge.component';
import { ModuleType } from '../shared/enums/module-type.enum';
import { Module } from '../shared/interfaces/module.interface';
import { Run } from '../shared/interfaces/run.interface';
import { NodeProgress, RunCompletionMessage, RunProgressMessage } from '../shared/interfaces/ws.interface';
import { RunStatus } from '../shared/enums/run-status.enum';
import { MessageService } from 'primeng/api';

type ProgressKind = 'track' | 'packet-loss' | 'plc' | 'output';
type ProgressState = 'waiting' | 'running' | 'complete' | 'interrupted';

interface ProgressTreeNode {
  key: string;
  label: string;
  kind: ProgressKind;
  nodeIds: string[];
  children: ProgressTreeNode[];
  moduleType?: RunModuleType;
  moduleIndex?: number;
  trackIndex?: number;
}

interface DisplayProgress {
  state: ProgressState;
  percentage: number | null;
}

@Component({
  selector: 'plc-run-progress',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, RunStatusBadgeComponent, RunConfigurationDrawerComponent],
  templateUrl: './run-progress.component.html',
  styleUrl: './run-progress.component.scss',
})
export class RunProgressComponent implements OnInit, OnDestroy {
  public run: Run | null = null;
  public nodes: ProgressTreeNode[] = [];
  public loading = true;
  public loadError = false;
  public expandedKeys = new Set<string>();
  public configDrawerVisible = false;
  public focusedModule: FocusedRunModule | null = null;
  public focusedTrackIndex: number | null = null;
  public executing = false;

  private runId = '';
  private readonly progressByNodeId = new Map<string, NodeProgress>();
  private readonly manuallyCollapsed = new Set<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly wsService: WsService,
    private readonly runsClient: RunsClient,
    private readonly messageService: MessageService,
  ) {}

  public ngOnInit(): void {
    this.runId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.runId) {
      this.loading = false;
      this.loadError = true;
      return;
    }

    this.wsService.sendRunId(this.runId);
    this.loadRun();
    this.subscribeToLiveProgress();
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public get packetLossSimulatorCount(): number {
    return this.run?.modules[ModuleType.PacketLossSimulator].length ?? 0;
  }

  public get plcAlgorithmCount(): number {
    return this.run?.modules[ModuleType.PLCAlgorithm].length ?? 0;
  }

  public get outputAnalyserCount(): number {
    return this.run?.modules[ModuleType.OutputAnalyser].length ?? 0;
  }

  public get overallProgress(): DisplayProgress {
    return this.getProgressForIds(this.getAllNodeIds());
  }

  public get isAnalysisAvailable(): boolean {
    return this.run?.status === RunStatus.COMPLETED;
  }

  public get canExecute(): boolean {
    return this.run?.status === RunStatus.CREATED;
  }

  public getNodeProgress(node: ProgressTreeNode): DisplayProgress {
    return this.getProgressForIds(node.kind === 'track' ? this.getDescendantNodeIds(node) : node.nodeIds);
  }

  public getStateLabel(state: ProgressState): string {
    return { waiting: 'Waiting', running: 'Running', complete: 'Complete', interrupted: 'Interrupted' }[state];
  }

  public getStateIcon(state: ProgressState): string {
    return {
      waiting: 'pi pi-clock',
      running: 'pi pi-spin pi-spinner',
      complete: 'pi pi-check-circle',
      interrupted: 'pi pi-exclamation-circle',
    }[state];
  }

  public getKindIcon(kind: ProgressKind): string {
    return { track: 'pi pi-wave-pulse', 'packet-loss': 'pi pi-sliders-h', plc: 'pi pi-cog', output: 'pi pi-chart-bar' }[
      kind
    ];
  }

  public isExpanded(node: ProgressTreeNode): boolean {
    return this.expandedKeys.has(node.key);
  }

  public toggleNode(node: ProgressTreeNode): void {
    if (node.children.length === 0) return;
    if (this.expandedKeys.has(node.key)) {
      this.expandedKeys.delete(node.key);
      this.manuallyCollapsed.add(node.key);
    } else {
      this.expandedKeys.add(node.key);
      this.manuallyCollapsed.delete(node.key);
    }
    this.expandedKeys = new Set(this.expandedKeys);
  }

  public expandAll(): void {
    this.manuallyCollapsed.clear();
    this.expandedKeys = new Set(this.collectBranchKeys(this.nodes));
  }

  public collapseAll(): void {
    this.expandedKeys = new Set();
    this.collectBranchKeys(this.nodes).forEach((key) => this.manuallyCollapsed.add(key));
  }

  public onModuleClick(node: ProgressTreeNode): void {
    if (node.moduleType === undefined || node.moduleIndex === undefined) return;
    this.focusedModule = { type: node.moduleType, index: node.moduleIndex };
    this.focusedTrackIndex = null;
    this.configDrawerVisible = true;
  }

  public onTrackClick(node: ProgressTreeNode): void {
    if (node.trackIndex === undefined) return;
    this.focusedModule = null;
    this.focusedTrackIndex = node.trackIndex;
    this.configDrawerVisible = true;
  }

  public onGoToAnalysis(): void {
    this.router.navigate(['/analyzer', this.runId]);
  }

  public onExecute(): void {
    if (!this.canExecute || this.executing) return;

    this.executing = true;
    this.runsClient
      .executeRun(this.runId)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.executing = false)),
      )
      .subscribe({
        next: (run) => {
          this.run = run;
          this.messageService.add({
            severity: 'success',
            summary: 'Queued',
            detail: `Run ${run.name} was queued for execution`,
          });
        },
        error: (error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Could not execute run',
            detail: error.error?.detail ?? 'Please try again.',
          });
        },
      });
  }

  private loadRun(): void {
    this.runsClient
      .getRun(this.runId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (run) => {
          this.run = run;
          this.loading = false;
          this.nodes = this.buildNodesFromRun(run);
          this.expandedKeys = new Set(this.nodes.map((node) => node.key));
        },
        error: () => {
          this.loading = false;
          this.loadError = true;
        },
      });
  }

  private subscribeToLiveProgress(): void {
    this.wsService
      .getProgressMessages()
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => this.applyProgressMessage(message));

    this.wsService
      .getCompletionMessages()
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => this.applyCompletionMessage(message));
  }

  private applyProgressMessage(message: RunProgressMessage): void {
    if (message.run_id !== this.runId) return;
    if (this.run?.status === RunStatus.CREATED || this.run?.status === RunStatus.QUEUED) {
      this.run = { ...this.run, status: RunStatus.RUNNING };
    }

    message.nodes.forEach((node) => {
      if (node.node_id) this.progressByNodeId.set(node.node_id, node);
    });
    this.expandActivePaths();
  }

  private applyCompletionMessage(message: RunCompletionMessage): void {
    if (message.run_id !== this.runId || !this.run) return;
    this.run = { ...this.run, status: message.success ? RunStatus.COMPLETED : RunStatus.FAILED };
  }

  private buildNodesFromRun(run: Run): ProgressTreeNode[] {
    const plsModules = run.modules[ModuleType.PacketLossSimulator] ?? [];
    const plcModules = run.modules[ModuleType.PLCAlgorithm] ?? [];
    const outputModules = run.modules[ModuleType.OutputAnalyser] ?? [];
    const plsCount = plsModules.length;
    const plcCount = plcModules.length;

    return run.tracks.map((trackName, trackIndex) => ({
      key: `track:${trackIndex}`,
      label: trackName,
      kind: 'track' as const,
      nodeIds: [],
      trackIndex,
      children: plsModules.map((plsModule, plsIndex) =>
        this.buildPlsNode(plsModule, plsIndex, trackIndex, plsCount, plcModules, plcCount, outputModules),
      ),
    }));
  }

  private buildPlsNode(
    module: Module,
    moduleIndex: number,
    trackIndex: number,
    plsCount: number,
    plcModules: Module[],
    plcCount: number,
    outputModules: Module[],
  ): ProgressTreeNode {
    return {
      key: `track:${trackIndex}:pls:${moduleIndex}`,
      label: module.name,
      kind: 'packet-loss',
      nodeIds: this.sliceNodeId(module, trackIndex),
      moduleType: ModuleType.PacketLossSimulator,
      moduleIndex,
      children: plcModules.map((plcModule, plcIndex) => ({
        key: `track:${trackIndex}:pls:${moduleIndex}:plc:${plcIndex}`,
        label: plcModule.name,
        kind: 'plc',
        nodeIds: this.sliceNodeId(plcModule, trackIndex * plsCount + moduleIndex),
        moduleType: ModuleType.PLCAlgorithm,
        moduleIndex: plcIndex,
        children: outputModules.map((outputModule, outputIndex) => ({
          key: `track:${trackIndex}:pls:${moduleIndex}:plc:${plcIndex}:output:${outputIndex}`,
          label: outputModule.name,
          kind: 'output',
          nodeIds: this.sliceNodeId(outputModule, trackIndex * plsCount * plcCount + plcIndex * plsCount + moduleIndex),
          moduleType: ModuleType.OutputAnalyser,
          moduleIndex: outputIndex,
          children: [],
        })),
      })),
    };
  }

  private sliceNodeId(module: Module, index: number): string[] {
    const nodeId = module.node_ids?.[index];
    return nodeId ? [nodeId] : [];
  }

  private getProgressForIds(ids: string[]): DisplayProgress {
    const uniqueIds = [...new Set(ids)];
    if (this.run?.status === RunStatus.COMPLETED) return { state: 'complete', percentage: 100 };

    const entries = uniqueIds.map((id) => this.progressByNodeId.get(id));
    const complete = entries.length > 0 && entries.every((entry) => this.isEntryComplete(entry));
    if (complete) return { state: 'complete', percentage: 100 };

    if (this.run?.status === RunStatus.FAILED) return { state: 'interrupted', percentage: this.getPercentage(entries) };
    const hasProgress = entries.some((entry) => (entry?.current ?? 0) > 0);
    return { state: hasProgress ? 'running' : 'waiting', percentage: this.getPercentage(entries) };
  }

  private getPercentage(entries: Array<NodeProgress | undefined>): number | null {
    if (entries.length === 0 || entries.some((entry) => !entry?.total || entry.total <= 0)) return null;
    const total = entries.reduce((sum, entry) => sum + (entry?.total ?? 0), 0);
    if (total === 0) return null;
    return Math.round((entries.reduce((sum, entry) => sum + (entry?.current ?? 0), 0) / total) * 100);
  }

  private isEntryComplete(entry: NodeProgress | undefined): boolean {
    if (!entry || !entry.total || entry.total <= 0) return false;
    return entry.current >= entry.total;
  }

  private getAllNodeIds(): string[] {
    return this.nodes.flatMap((node) => this.getDescendantNodeIds(node));
  }

  private getDescendantNodeIds(node: ProgressTreeNode): string[] {
    return [...node.nodeIds, ...node.children.flatMap((child) => this.getDescendantNodeIds(child))];
  }

  private collectBranchKeys(nodes: ProgressTreeNode[]): string[] {
    return nodes.flatMap((node) => (node.children.length ? [node.key, ...this.collectBranchKeys(node.children)] : []));
  }

  private expandActivePaths(): void {
    const activeKeys = new Set<string>();
    const visit = (node: ProgressTreeNode, ancestors: string[]): void => {
      if (node.nodeIds.some((id) => this.getProgressForIds([id]).state === 'running')) {
        [...ancestors, node.key].forEach((key) => activeKeys.add(key));
      }
      node.children.forEach((child) => visit(child, [...ancestors, node.key]));
    };
    this.nodes.forEach((node) => visit(node, []));
    activeKeys.forEach((key) => {
      if (!this.manuallyCollapsed.has(key)) this.expandedKeys.add(key);
    });
    this.expandedKeys = new Set(this.expandedKeys);
  }
}
