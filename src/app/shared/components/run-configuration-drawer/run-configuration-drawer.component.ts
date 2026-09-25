import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { catchError, of } from 'rxjs';
import { AssetsClient } from '../../clients/assets.client';
import { DrawerModule } from 'primeng/drawer';
import { ModuleType } from '../../enums/module-type.enum';
import { Module } from '../../interfaces/module.interface';
import { Run } from '../../interfaces/run.interface';
import { AudioTrackMetadata } from '../../interfaces/audio-track-metadata.interface';
import { AudioTrackMetadataView, toAudioTrackMetadataView } from '../../utils/audio-track-metadata';
import { buildModuleInstancePresentations } from '../../utils/module-instance-presentation';
import { ParameterTreeComponent } from '../parameter-tree/parameter-tree.component';
import { RunStatusBadgeComponent } from '../run-status-badge/run-status-badge.component';

export type RunModuleType = Exclude<ModuleType, ModuleType.CrossfadeSettings>;

export interface FocusedRunModule {
  type: RunModuleType;
  index: number;
}

interface ModuleSection {
  type: RunModuleType;
  label: string;
}

@Component({
  selector: 'plc-run-configuration-drawer',
  standalone: true,
  imports: [CommonModule, DrawerModule, ParameterTreeComponent, RunStatusBadgeComponent],
  templateUrl: './run-configuration-drawer.component.html',
  styleUrl: './run-configuration-drawer.component.scss',
})
export class RunConfigurationDrawerComponent implements OnChanges {
  @Input() public run: Run | null = null;
  @Input() public visible = false;
  @Input() public focusedModule: FocusedRunModule | null = null;
  @Input() public focusedModules: FocusedRunModule[] = [];
  @Input() public focusedTrackIndex: number | null = null;
  @Output() public visibleChange = new EventEmitter<boolean>();

  private trackMetadataByName = new Map<string, AudioTrackMetadataView>();

  public readonly moduleSections: ModuleSection[] = [
    { type: ModuleType.PacketLossSimulator, label: 'Packet Loss Simulators' },
    { type: ModuleType.PLCAlgorithm, label: 'PLC Algorithms' },
    { type: ModuleType.OutputAnalyser, label: 'Output Analysers' },
  ];

  constructor(private readonly assetsClient: AssetsClient) {}

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['run'] && this.run) {
      this.assetsClient
        .getTrackMetadata()
        .pipe(catchError(() => of([] as AudioTrackMetadata[])))
        .subscribe((tracks) => {
          this.trackMetadataByName = new Map(tracks.map((track) => [track.name, toAudioTrackMetadataView(track)]));
        });
    }
  }

  public getTrackMetadata(trackName: string): AudioTrackMetadataView | null {
    return this.trackMetadataByName.get(trackName) ?? null;
  }

  public getModules(type: RunModuleType): Module[] {
    return this.run?.modules[type] ?? [];
  }

  public moduleDiscriminator(module: Module, type: RunModuleType): string | null {
    const modules = this.getModules(type);
    const moduleIndex = modules.indexOf(module);
    if (moduleIndex < 0) return null;
    return buildModuleInstancePresentations(modules)[moduleIndex]?.discriminator ?? null;
  }

  public isFocused(type: RunModuleType, index: number): boolean {
    return (
      (this.focusedModule?.type === type && this.focusedModule.index === index) ||
      this.focusedModules.some((module) => module.type === type && module.index === index)
    );
  }

  public isTrackFocused(index: number): boolean {
    return this.focusedTrackIndex === index;
  }

  public isInitiallyOpen(type: RunModuleType, index: number): boolean {
    return (this.focusedModule === null && this.focusedModules.length === 0) || this.isFocused(type, index);
  }

  public onVisibleChange(visible: boolean): void {
    this.visibleChange.emit(visible);
  }
}
