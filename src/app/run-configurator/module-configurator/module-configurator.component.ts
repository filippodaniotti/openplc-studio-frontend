import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ModulesClient } from '../../shared/clients/modules.client';
import { BehaviorSubject, filter, map, Observable, Subject, takeUntil, tap } from 'rxjs';
import { StepperModule } from 'primeng/stepper';
import { SplitterModule } from 'primeng/splitter';
import { ListboxModule } from 'primeng/listbox';
import { CommonModule } from '@angular/common';
import { MultiSelectModule } from 'primeng/multiselect';
import { ChipModule } from 'primeng/chip';
import { FormsModule } from '@angular/forms';
import { ModuleParameterSpec } from '../../shared/interfaces/module-parameters.interface';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { KeyFilterModule } from 'primeng/keyfilter';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { Module } from '../../shared/interfaces/module.interface';
import { ModuleType } from '../../shared/enums/module-type.enum';
import { SelectModule } from 'primeng/select';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { RunConfiguratorService } from '../run-configurator.service';
// popup
import { PopupModalComponent } from '../../shared/popup-modal/popup-modal.component';
import { InputTextModule } from 'primeng/inputtext';
//breadcrumbs
import { MenuItem } from 'primeng/api';
import { BreadcrumbModule } from 'primeng/breadcrumb';


const suggestedBands: number[] = [200, 1000, 2000];

const crossfadeNameParameters: string[] = ['crossfade', 'fade_in'];

const bandSettingsOmittedParams: string[] = ['crossfade', 'fade_in', 'crossfade_frequencies', 'crossover_order'];

export type ModuleWithCount = Module & {
  id?: number;
};

type GroupedModules = { label: string; items: Module[] };

@Component({
  selector: 'plc-module-configurator',
  templateUrl: './module-configurator.component.html',
  styleUrls: ['./module-configurator.component.scss'],
  imports: [
    CommonModule,
    ButtonModule,
    StepperModule,
    SplitterModule,
    ListboxModule,
    MultiSelectModule,
    ChipModule,
    FormsModule,
    InputGroupModule,
    InputGroupAddonModule,
    KeyFilterModule,
    InputNumberModule,
    CheckboxModule,
    SelectModule,
    AutoCompleteModule,
    PopupModalComponent, // popup 
    InputTextModule,
    BreadcrumbModule, // breadcrumbs
  ],
})
export class ModuleConfiguratorComponent implements OnInit {
  @Input()
  public moduleType!: ModuleType;

  public crossfadeModulesSelection!: ModuleWithCount[];

  public modules: BehaviorSubject<ModuleWithCount[]> = new BehaviorSubject<ModuleWithCount[]>([]);

  public moduleFocus: ModuleWithCount | null = null;

  public suggestedBands: string[] = [];

  public selectedModuleProxy: ModuleWithCount | null = null;

  public selectedModuleCounter: number = 0;

  public availableModulesFilter: ModuleWithCount[] = [];

  public crossfadeModules: BehaviorSubject<ModuleWithCount[]> = new BehaviorSubject<ModuleWithCount[]>([]);

  public crossfadeModuleFocus!: ModuleWithCount | null;

  public selectedCrossfadeModuleProxy: ModuleWithCount | null = null;

  public selectedCrossfadeModuleCounter: number = 0;

  public availableCrossfadeModulesFilter: ModuleWithCount[] = [];

  public bandSettingModuleFocus!: ModuleWithCount | null;

  public bandSettingsSelectedModuleProxy: ModuleWithCount | null = null;

  public bandSettingsSelectedModuleCounter: number = 0;

  // POPUP LEFT & RIGHT OPTIONS 
  public leftOptionPopupVisible = false;

  public rightOptionPopupVisible = false;

  public channelPopupData: any = null;

  public currentBandSettingsParamName: string = '';

  // BREADCRUMBS
  public leftBreadcrumbs: MenuItem[] = [];

  public rightBreadcrumbs: MenuItem[] = [];

  public openChannelPopup(channel: 'left' | 'right', paramName: string) {
    this.currentBandSettingsParamName = paramName;

    const baseBreadcrumbs: MenuItem[] = [
      { 
        label: 'Advanced PLC', 
      },
      { 
        label: channel === 'left' ? 'Left' : 'Right',
        disabled: true
      }
  ];

  if (channel === 'left') {
    this.leftOptionPopupVisible = true;
    this.leftBreadcrumbs = baseBreadcrumbs;
  } else {
    this.rightOptionPopupVisible = true;
    this.rightBreadcrumbs = baseBreadcrumbs;
  }
  
  this.channelPopupData = { channel };
  }

  public onLeftOptionConfirm() {
    console.log('Confermato per Left:', this.channelPopupData);
    // Logica Left
    this.leftOptionPopupVisible = false;
  }

  public onRightOptionConfirm() {
    console.log('Confermato per Right:', this.channelPopupData);
    // Logica Right
    this.rightOptionPopupVisible = false;
  }

  public onBreadcrumbNavigate(item: MenuItem, fromChannel: 'left' | 'right') {
  if (item.label === 'Advanced PLC') {
    if (fromChannel === 'left') {
      this.leftOptionPopupVisible = false;
    } else {
      this.rightOptionPopupVisible = false;
    }
    console.log('Tornato ad Advanced PLC da:', fromChannel);
  }
}

  private readonly unsubAll$ = new Subject<void>();

  constructor(
    private readonly modulesClient: ModulesClient,
    public runConfigService: RunConfiguratorService,
  ) {}

  get modulesSelection(): ModuleWithCount[] {
    return this.runConfigService.modulesSelection.value[this.moduleType];
  }

  get availableModules(): ModuleWithCount[] {
    return this.modules.value;
  }

  get availableCrossfadeModules(): ModuleWithCount[] {
    return this.crossfadeModules.value;
  }

  get groupedCrossfadeModulesOfSelectedModule(): GroupedModules[] {
    const groupedModules = this.moduleFocus?.settings
      .filter((setting) => crossfadeNameParameters.includes(setting.name))
      .map((setting) => ({ label: setting.name, items: (setting.value ?? []) as Module[] }));
    return groupedModules ?? [];
  }

  get groupedBandSettingsOfSelectedModule(): GroupedModules[] {
    const bandSettingsParam = this.moduleFocus?.settings.find((setting) => setting.name === 'band_settings');
    const bandSettings = bandSettingsParam?.value as Record<string, Module[]> | undefined;
    return bandSettings ? Object.entries(bandSettings).map(([label, items]) => ({ label, items })) : [];
  }

  get isAnyCrossfadeModuleSelected(): boolean {
    return !!this.moduleFocus?.settings.some(
      (setting) =>
        crossfadeNameParameters.includes(setting.name) &&
        (Array.isArray(setting.value) ? setting.value.length > 0 : false),
    );
  }

  get isAnyBandSettingsModuleSelected(): boolean {
    const bandSettingsParam = this.moduleFocus?.settings.find((setting) => setting.name === 'band_settings');
    const bandSettings = bandSettingsParam?.value as Record<string, Module[]> | undefined;
    return (
      !!bandSettings &&
      Object.values(bandSettings).some((values) => (Array.isArray(values) ? values.length > 0 : false))
    );
  }

  ngOnInit(): void {
    const transformModules = (modules: ModuleWithCount[]) =>
      modules.map((module: ModuleWithCount) => ({
        ...module,
        settings: module.settings.map((setting: any) => ({
          ...setting,
          value: setting.default,
          availableValues: setting.values,
        })),
      }));

    this.modulesClient
      .getModuleTypes(this.moduleType)
      .pipe(
        takeUntil(this.unsubAll$),
        map(transformModules),
        tap((modules: ModuleWithCount[]) => this.modules.next(modules)),
      )
      .subscribe();

    if (this.moduleType === ModuleType.PLCAlgorithm) {
      this.modulesClient
        .getModuleTypes(ModuleType.CrossfadeSettings)
        .pipe(
          takeUntil(this.unsubAll$),
          map(transformModules),
          tap((modules: ModuleWithCount[]) => this.crossfadeModules.next(modules)),
        )
        .subscribe();
    }
  }

  public resetDefault(param: ModuleParameterSpec): void {
    param.value = param?.default;
  }

  public searchBands(event: AutoCompleteCompleteEvent) {
    this.suggestedBands = suggestedBands.map((b) => b.toString()).filter((band) => band.includes(event.query));
  }

  public searchModules(event: AutoCompleteCompleteEvent, isBandSettings: boolean = false) {
    this.availableModulesFilter = this.availableModules
      .filter((m) => m.name.toLocaleLowerCase().includes(event.query))
      .filter((m) => !(m.name === 'AdvancedPLC' && isBandSettings));
  }

  public addModule(module: ModuleWithCount | null): void {
    if (!module) {
      return;
    }

    const moduleToAdd = {
      ...module,
      settings: structuredClone(module.settings),
      id: this.selectedModuleCounter++,
    };

    this.modulesSelection.push(moduleToAdd);
    this.moduleFocus = moduleToAdd;

    this.runConfigService.modulesSelection.next({
      ...this.runConfigService.modulesSelection.value,
      [this.moduleType]: this.modulesSelection,
    });

    this.selectedModuleProxy = null;
  }

  public removeFromModulesSelection(moduleIndex: number): void {
    if (this.modulesSelection[moduleIndex]?.id === this.moduleFocus?.id) {
      this.moduleFocus = null;
    }
    this.runConfigService.modulesSelection.next({
      ...this.runConfigService.modulesSelection.value,
      [this.moduleType]: this.modulesSelection.filter((_, idx) => idx !== moduleIndex),
    });
  }

  public searchCrossfadeModules(event: AutoCompleteCompleteEvent) {
    this.availableCrossfadeModulesFilter = this.availableCrossfadeModules.filter((m) =>
      m.name.toLocaleLowerCase().includes(event.query),
    );
  }

  public addCrossfadeModule(crossfadeModule: ModuleWithCount | null, paramName: string): void {
    if (!crossfadeModule) {
      return;
    }

    const parentModuleSetting = this.moduleFocus?.settings.find((setting) => setting.name === paramName);
    if (parentModuleSetting) {
      parentModuleSetting.value = parentModuleSetting.value || [];
      parentModuleSetting.value.push({
        ...crossfadeModule,
        settings: structuredClone(crossfadeModule.settings),
        id: this.selectedCrossfadeModuleCounter++,
      });
    }

    this.selectedCrossfadeModuleProxy = null;
  }

  public removeFromCrossfadeModulesSelection(moduleId: number): void {
    const crossfadeModuleParentList: ModuleWithCount[][] =
      this.moduleFocus?.settings
        .filter((s) => crossfadeNameParameters.includes(s.name) && s.value !== null)
        .map((s) => s.value ?? []) ?? [];

    const crossfadeModuleList = crossfadeModuleParentList.find((s) => s.some((module) => module.id === moduleId)) ?? [];

    const moduleToRemoveIndex: number = crossfadeModuleList.findIndex((module) => module.id === moduleId) ?? -1;

    if (moduleToRemoveIndex === -1 || crossfadeModuleList.length === 0) {
      return;
    }

    if (crossfadeModuleList[moduleToRemoveIndex]?.id === this.crossfadeModuleFocus?.id) {
      this.crossfadeModuleFocus = null;
    }
    crossfadeModuleList.splice(moduleToRemoveIndex, 1);
  }

  public removeFromBandSettingsModulesSelection(moduleId: number): void {
    const bandSettingsParam = this.moduleFocus?.settings.find((setting) => setting.name === 'band_settings');
    const bandSettings = bandSettingsParam?.value as Record<string, ModuleWithCount[]> | undefined;

    if (!bandSettings) {
      return;
    }

    const bandLabel =
      Object.keys(bandSettings).find((label) => bandSettings[label].some((module) => module.id === moduleId)) || '';

    const moduleToRemoveIndex =
      bandLabel !== undefined ? bandSettings[bandLabel].findIndex((module) => module.id === moduleId) : -1;

    if (moduleToRemoveIndex === -1) {
      return;
    }

    if (bandSettings[bandLabel][moduleToRemoveIndex]?.id === this.bandSettingModuleFocus?.id) {
      this.bandSettingModuleFocus = null;
    }

    bandSettings[bandLabel].splice(moduleToRemoveIndex, 1);
  }

  ngOnDestroy(): void {
    this.unsubAll$.next();
    this.unsubAll$.complete();
  }

  public isAdvancedPLCLinked(): boolean {
    if (!this.moduleFocus || !this.moduleFocus.settings) {
      return false;
    }
    const channelLinkSetting = this.moduleFocus.settings.find((setting) => setting.name === 'channel_link');
    return channelLinkSetting ? channelLinkSetting.value : false;
  }

  public getAdvancedPLCStereoImageProcessingValue(): string {
    if (!this.moduleFocus || !this.moduleFocus.settings) {
      return '';
    }
    const channelLinkSetting = this.moduleFocus.settings.find((setting) => setting.name === 'stereo_image_processing');
    return channelLinkSetting ? channelLinkSetting.value : '';
  }

  public addAdvancedPLCBandSettingModule(
    bandSettingModule: ModuleWithCount | null,
    paramName: string,
    bandLabel: string,
  ) {
    if (!bandSettingModule) {
      return;
    }

    const parentModuleSetting = this.moduleFocus?.settings.find((setting) => setting.name === paramName);
    if (parentModuleSetting) {
      parentModuleSetting.value[bandLabel] = parentModuleSetting.value[bandLabel] || [];
      parentModuleSetting.value[bandLabel].push({
        ...bandSettingModule,
        settings: structuredClone(bandSettingModule.settings).filter(
          (param) => !bandSettingsOmittedParams.includes(param.name),
        ),
        id: this.bandSettingsSelectedModuleCounter++,
      });
    }

    this.bandSettingsSelectedModuleProxy = null;
  }
}
