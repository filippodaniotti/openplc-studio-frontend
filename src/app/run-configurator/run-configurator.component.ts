import { Component, OnInit } from '@angular/core';
import { ModuleConfiguratorComponent, ModuleWithCount } from './module-configurator/module-configurator.component';
import { ModuleType } from '../shared/enums/module-type.enum';
import { StepperModule } from 'primeng/stepper';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { Module } from '../shared/interfaces/module.interface';
import { RunStatus } from '../shared/enums/run-status.enum';
import { Run } from '../shared/interfaces/run.interface';
import { RunsClient } from '../shared/clients/runs.client';
import { InputTextModule } from 'primeng/inputtext';
import { LEFT, RIGHT } from './run-names-blueprint';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { tap } from 'rxjs';
import { AudioTrackPickerComponent } from './audio-track-picker/audio-track-picker.component';
import { Router } from '@angular/router';
import { ModuleParameter, ModuleParameterSpec } from '../shared/interfaces/module-parameters.interface';
import { InputGroupModule } from 'primeng/inputgroup';
import { RunConfiguratorService } from './run-configurator.service';

@Component({
  selector: 'plc-run-configurator',
  templateUrl: './run-configurator.component.html',
  styleUrls: ['./run-configurator.component.scss'],
  imports: [
    ModuleConfiguratorComponent,
    CommonModule,
    FormsModule,
    StepperModule,
    ButtonModule,
    InputTextModule,
    AudioTrackPickerComponent,
    InputGroupModule,
  ],
  providers: [],
})
export class RunConfiguratorComponent implements OnInit {
  public ModuleType: typeof ModuleType = ModuleType;

  public runName: string = this.generateRandomRunName();

  private _audioTracksConfig: string[] = [];

  constructor(
    private readonly runsClient: RunsClient,
    private readonly messageService: MessageService,
    private readonly router: Router,
    public runConfigService: RunConfiguratorService,
  ) { }

  get packetLossSimulatorConfig(): ModuleWithCount[] {
    return this.runConfigService.modulesSelection.value[ModuleType.PacketLossSimulator];
  }

  get PLCAlgorithmConfig(): ModuleWithCount[] {
    return this.runConfigService.modulesSelection.value[ModuleType.PLCAlgorithm];
  }

  get outputAnalyserConfig(): ModuleWithCount[] {
    return this.runConfigService.modulesSelection.value[ModuleType.OutputAnalyser];
  }

  public get audioTracksConfig(): string[] {
    return this._audioTracksConfig;
  }

  public set audioTracksConfig(value: string[]) {
    this._audioTracksConfig = value;
  }

  public updateAudioTracksConfig(tracks: string[]): void {
    this.audioTracksConfig = tracks;
  }

  get isConfigurationValid(): boolean {
    if (
      this.audioTracksConfig.length < 1 ||
      this.packetLossSimulatorConfig.length < 1 ||
      this.PLCAlgorithmConfig.length < 1 ||
      this.outputAnalyserConfig.length < 1
    ) {
      return false;
    }

    return true;
  }

  ngOnInit(): void { }

  private isModuleArray(val: unknown): val is Module[] {
    return Array.isArray(val) && val.every((v) => v && typeof v === 'object' && 'name' in v && 'settings' in v);
  }

  private isSpecArray(val: unknown): val is ModuleParameterSpec[] {
    return (
      Array.isArray(val) &&
      val.every((v) => v && typeof v === 'object' && 'name' in v && ('default' in v || 'value' in v))
    );
  }

  private toParameter = (s: ModuleParameterSpec | ModuleParameter): ModuleParameter => ({
    name: s.name,
    value: (s as ModuleParameter).value ?? (s as ModuleParameterSpec).default,
  });

  private mapSpecToConfig(modules: Module[]): Module[] {
    return modules.map((m: Module) => ({
      ...m,
      settings: m.settings.map((s: ModuleParameter | ModuleParameterSpec) => {
        const val = (s as any).value;
        if (this.isModuleArray(val)) {
          return {
            name: s.name,
            value: val.map((xf: Module) => ({
              name: xf.name,
              settings: xf.settings.map(this.toParameter),
            })),
          };
        }
        if (this.isSpecArray(val)) {
          return {
            name: s.name,
            value: val.map(this.toParameter),
          };
        }
        return this.toParameter(s);
      }),
    }));
  }

  public createRun(): void {
    const run = {
      author: 'default',
      name: this.runName,
      testbenchInternalId: '',
      status: RunStatus.CREATED,
      tracks: this.audioTracksConfig,
      modules: {
        [ModuleType.PacketLossSimulator]: this.mapSpecToConfig(this.packetLossSimulatorConfig),
        [ModuleType.PLCAlgorithm]: this.mapSpecToConfig(this.PLCAlgorithmConfig),
        [ModuleType.OutputAnalyser]: this.mapSpecToConfig(this.outputAnalyserConfig),
      },
    };

    this.runsClient
      .createRun(run)
      .pipe(
        tap((createdRun: Run) =>
          this.messageService.add({
            severity: 'info',
            summary: 'Created',
            detail: `Run ${createdRun.name} was created`,
          }),
        ),
        tap(() => this.runConfigService.resetModuleSelection()),
        tap((createdRun) => this.router.navigate(['/run-progress', createdRun.id])),
      )
      .subscribe();
  }

  public generateRandomRunName(): string {
    return `${LEFT[Math.floor(Math.random() * LEFT.length)]} ${RIGHT[Math.floor(Math.random() * RIGHT.length)]}`;
  }
}
