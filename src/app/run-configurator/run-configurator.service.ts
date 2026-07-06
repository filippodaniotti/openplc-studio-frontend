import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ModuleWithCount } from './module-configurator/module-configurator.component';
import { ModuleType } from '../shared/enums/module-type.enum';
import { Module } from '../shared/interfaces/module.interface';


@Injectable({ providedIn: 'root' })
export class RunConfiguratorService {
  public modulesSelection = new BehaviorSubject<Record<ModuleType, ModuleWithCount[]>>({
    [ModuleType.PacketLossSimulator]: [],
    [ModuleType.PLCAlgorithm]: [],
    [ModuleType.OutputAnalyser]: [],
    [ModuleType.CrossfadeSettings]: [],
  });

  public resetModuleSelection(): void {
    this.modulesSelection.next({
      [ModuleType.PacketLossSimulator]: [],
      [ModuleType.PLCAlgorithm]: [],
      [ModuleType.OutputAnalyser]: [],
      [ModuleType.CrossfadeSettings]: [],
    });
  }

  // Preload the configuration with the provided config object, 
  // mapping the modules from JSON to the ModuleWithCount format and updating the modulesSelection BehaviorSubject
  public preloadConfig(config: { name: string; tracks: string[]; modules: Record<string, Module[]> }): void {
    const toModuleWithCount = (modules: Module[]): ModuleWithCount[] =>
      modules.map((m, index) => ({ ...m, id: index }));

    this.modulesSelection.next({
      [ModuleType.PacketLossSimulator]: toModuleWithCount(config.modules['PacketLossSimulator'] ?? []),
      [ModuleType.PLCAlgorithm]: toModuleWithCount(config.modules['PLCAlgorithm'] ?? []),
      [ModuleType.OutputAnalyser]: toModuleWithCount(config.modules['OutputAnalyser'] ?? []),
      [ModuleType.CrossfadeSettings]: toModuleWithCount(config.modules['CrossfadeSettings'] ?? []),
    });
  }
}
