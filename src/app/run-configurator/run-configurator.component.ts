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
import { forkJoin, switchMap, tap } from 'rxjs';
import { AudioTrackPickerComponent } from './audio-track-picker/audio-track-picker.component';
import { Router } from '@angular/router';
import { ModuleParameter, ModuleParameterSpec } from '../shared/interfaces/module-parameters.interface';
import { InputGroupModule } from 'primeng/inputgroup';
import { RunConfiguratorService } from './run-configurator.service';
import { ModulesClient } from '../shared/clients/modules.client';

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
    private readonly modulesClient: ModulesClient, 
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

  //sends config file to the backend for validation, 
  //if valid, preloads the config into the configurator

  public onUploadConfig(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const config = JSON.parse(reader.result as string);
        this.runsClient.validateRunConfig(config).pipe(
          switchMap((validatedConfig: any) =>
            forkJoin({
              [ModuleType.PacketLossSimulator]: this.modulesClient.getModuleTypes(ModuleType.PacketLossSimulator),
              [ModuleType.PLCAlgorithm]: this.modulesClient.getModuleTypes(ModuleType.PLCAlgorithm),
              [ModuleType.OutputAnalyser]: this.modulesClient.getModuleTypes(ModuleType.OutputAnalyser),
              [ModuleType.CrossfadeSettings]: this.modulesClient.getModuleTypes(ModuleType.CrossfadeSettings),
            }).pipe(
              tap((specs: any) => {
                const enriched: any = {};
                for (const moduleType of Object.values(ModuleType)) {
                  const configModules = validatedConfig.modules[moduleType] ?? [];
                  const availableSpecs = specs[moduleType] ?? [];
                  enriched[moduleType] = configModules.map((m: any) => {
                    const spec = availableSpecs.find((s: any) => s.name === m.name);
                    if (!spec) return m;
                    return {
                      ...spec,
                      settings: spec.settings.map((specParam: any) => {
                        const configParam = m.settings.find((p: any) => p.name === specParam.name);
                        return {
                          ...specParam,
                          value: configParam?.value ?? specParam.default,
                          availableValues: specParam.values,
                        };
                      }),
                    };
                  });
                }
                this.runName = validatedConfig.name;
                this.audioTracksConfig = validatedConfig.tracks;
                this.runConfigService.preloadConfig({ ...validatedConfig, modules: enriched });
                this.messageService.add({
                  severity: 'success',
                  summary: 'Config loaded',
                  detail: `Configuration "${validatedConfig.name}" loaded successfully`,
                });
              })
            )
          ),
        ).subscribe({
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: 'Invalid config',
              detail: 'The configuration file is invalid or contains unknown modules',
            });
          }
        });
      } catch {
        this.messageService.add({
          severity: 'error',
          summary: 'Invalid file',
          detail: 'The file is not a valid JSON',
        });
      }
    };
    reader.readAsText(file);
  }
}
