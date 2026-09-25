import { Component, Input, OnInit } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ModulesClient } from '../../shared/clients/modules.client';
import { BehaviorSubject, map, Subject, takeUntil, tap } from 'rxjs';
import { StepperModule } from 'primeng/stepper';
import { SplitterModule } from 'primeng/splitter';
import { ListboxModule } from 'primeng/listbox';
import { CommonModule } from '@angular/common';
import { MultiSelectModule } from 'primeng/multiselect';
import { ChipModule } from 'primeng/chip';
import { FormsModule } from '@angular/forms';
import { ModuleParameterSpec, ModuleValues, SettingValue } from '../../shared/interfaces/module-parameters.interface';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { ParameterFieldComponent } from '../../shared/components/parameter-field/parameter-field.component';
import { moduleConstraintErrors, parameterError } from '../../shared/utils/parameter-validation';
import { Module } from '../../shared/interfaces/module.interface';
import { ModuleType } from '../../shared/enums/module-type.enum';
import { buildModuleInstancePresentations } from '../../shared/utils/module-instance-presentation';

import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { RunConfiguratorService } from '../run-configurator.service';
// popup
import { PopupModalComponent } from '../../shared/popup-modal/popup-modal.component';
//breadcrumbs
import { MenuItem, MessageService } from 'primeng/api';
import { BreadcrumbModule } from 'primeng/breadcrumb';

const suggestedBands: number[] = [100, 200, 2000];

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
    AutoCompleteModule,
    PopupModalComponent,
    ParameterFieldComponent,
    BreadcrumbModule,
  ],
})
export class ModuleConfiguratorComponent implements OnInit {
  @Input()
  public moduleType!: ModuleType;

  public crossfadeModulesSelection!: ModuleWithCount[];

  public modules: BehaviorSubject<ModuleWithCount[]> = new BehaviorSubject<ModuleWithCount[]>([]);

  private _moduleFocus: ModuleWithCount | null = null;

  public suggestedBands: number[] = [...suggestedBands];

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

  //VIEW CONTROL popup band settings
  public popupView: 'list' | 'detail' = 'list';

  public popupSelectedModule: ModuleWithCount | null = null;

  public currentPopupChannel: 'left' | 'right' | 'mid' | 'side' | 'linked' = 'left';

  // POPUP MID & SIDE & LINKED
  public midOptionPopupVisible = false;

  public sideOptionPopupVisible = false;

  public linkedOptionPopupVisible = false;

  // BREADCRUMBS
  public midBreadcrumbs: MenuItem[] = [];

  public sideBreadcrumbs: MenuItem[] = [];

  public linkedBreadcrumbs: MenuItem[] = [];

  // POPUP CROSSFADE & FADE_IN
  public crossfadePopupVisible = false;

  public fadeInPopupVisible = false;

  // BREADCRUMBS
  public crossfadeBreadcrumbs: MenuItem[] = [];

  public fadeInBreadcrumbs: MenuItem[] = [];

  // VIEW CONTROL crossfade popup
  public crossfadePopupView: 'list' | 'detail' = 'list';

  public crossfadePopupSelectedModule: ModuleWithCount | null = null;

  public currentCrossfadeParamName: string = '';

  // CROSSFADE ANNIDATO IN ADVANCED PLC
  public isNestedCrossfade = false;

  public nestedCrossfadeChannel: 'left' | 'right' | 'mid' | 'side' | 'linked' | null = null;

  //metodo per aprire il popup di configurazione del canale selezionato
  public openChannelPopup(channel: 'left' | 'right' | 'mid' | 'side' | 'linked', paramName: string) {
    this.currentBandSettingsParamName = paramName;
    this.popupView = 'list';
    this.popupSelectedModule = null;

    const channelLabel = {
      left: 'Left',
      right: 'Right',
      mid: 'Mid',
      side: 'Side',
      linked: 'Linked',
    }[channel];

    const baseBreadcrumbs: MenuItem[] = [{ label: 'Advanced PLC' }, { label: channelLabel, disabled: true }];

    switch (channel) {
      case 'left':
        this.leftOptionPopupVisible = true;
        this.leftBreadcrumbs = baseBreadcrumbs;
        break;
      case 'right':
        this.rightOptionPopupVisible = true;
        this.rightBreadcrumbs = baseBreadcrumbs;
        break;
      case 'mid':
        this.midOptionPopupVisible = true;
        this.midBreadcrumbs = baseBreadcrumbs;
        break;
      case 'side':
        this.sideOptionPopupVisible = true;
        this.sideBreadcrumbs = baseBreadcrumbs;
        break;
      case 'linked':
        this.linkedOptionPopupVisible = true;
        this.linkedBreadcrumbs = baseBreadcrumbs;
        break;
    }

    this.channelPopupData = { channel };
  }

  get moduleFocus(): ModuleWithCount | null {
    return this._moduleFocus;
  }

  set moduleFocus(value: ModuleWithCount | null) {
    this._moduleFocus = value;
    this.closeAllPopups();
  }

  //metodo per verificare se è aperto un popup di configurazione
  public isAnyPopupOpen(): boolean {
    return (
      this.crossfadePopupVisible ||
      this.fadeInPopupVisible ||
      this.linkedOptionPopupVisible ||
      this.midOptionPopupVisible ||
      this.sideOptionPopupVisible ||
      this.leftOptionPopupVisible ||
      this.rightOptionPopupVisible
    );
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

  // Gestione navigazione breadcrumbs all'interno del popup
  public onBreadcrumbNavigate(item: MenuItem, fromChannel: 'left' | 'right' | 'mid' | 'side' | 'linked') {
    if (item.label === 'Advanced PLC') {
      switch (fromChannel) {
        case 'left':
          this.leftOptionPopupVisible = false;
          break;
        case 'right':
          this.rightOptionPopupVisible = false;
          break;
        case 'mid':
          this.midOptionPopupVisible = false;
          break;
        case 'side':
          this.sideOptionPopupVisible = false;
          break;
        case 'linked':
          this.linkedOptionPopupVisible = false;
          break;
      }
    } else {
      this.backToChannelList(fromChannel);
    }
  }

  //metodo per ottenere i moduli di band settings in base al canale
  public getChannelModules(channel: string): ModuleWithCount[] {
    const bandSettingsParam = this.moduleFocus?.settings.find((s) => s.name === 'band_settings');
    const bandSettings = bandSettingsParam?.value as Record<string, ModuleWithCount[]> | undefined;
    return bandSettings?.[channel] ?? [];
  }

  //metodo per aprire il dettaglio del modulo cliccato, con gestione breadcrumbs e canale di riferimento nel popup
  public openModuleDetail(module: ModuleWithCount, channel: 'left' | 'right' | 'mid' | 'side' | 'linked') {
    this.popupSelectedModule = module;
    this.popupView = 'detail';
    this.currentPopupChannel = channel;

    const breadcrumbs = {
      left: this.leftBreadcrumbs,
      right: this.rightBreadcrumbs,
      mid: this.midBreadcrumbs,
      side: this.sideBreadcrumbs,
      linked: this.linkedBreadcrumbs,
    }[channel];

    const updated = [breadcrumbs[0], { ...breadcrumbs[1], disabled: false }, { label: module.name, disabled: true }];

    switch (channel) {
      case 'left':
        this.leftBreadcrumbs = updated;
        break;
      case 'right':
        this.rightBreadcrumbs = updated;
        break;
      case 'mid':
        this.midBreadcrumbs = updated;
        break;
      case 'side':
        this.sideBreadcrumbs = updated;
        break;
      case 'linked':
        this.linkedBreadcrumbs = updated;
        break;
    }
  }

  //metodo per tornare alla lista dei moduli all'interno del popup, resettando il modulo selezionato e aggiornando le breadcrumbs
  public backToChannelList(channel: 'left' | 'right' | 'mid' | 'side' | 'linked') {
    this.popupView = 'list';
    this.popupSelectedModule = null;

    const channelLabel = {
      left: 'Left',
      right: 'Right',
      mid: 'Mid',
      side: 'Side',
      linked: 'Linked',
    }[channel];

    const baseBreadcrumbs: MenuItem[] = [{ label: 'Advanced PLC' }, { label: channelLabel, disabled: true }];

    switch (channel) {
      case 'left':
        this.leftBreadcrumbs = baseBreadcrumbs;
        break;
      case 'right':
        this.rightBreadcrumbs = baseBreadcrumbs;
        break;
      case 'mid':
        this.midBreadcrumbs = baseBreadcrumbs;
        break;
      case 'side':
        this.sideBreadcrumbs = baseBreadcrumbs;
        break;
      case 'linked':
        this.linkedBreadcrumbs = baseBreadcrumbs;
        break;
    }
  }
  //metodo di conferma per i popup mid, side e linked
  public onMidOptionConfirm() {
    this.midOptionPopupVisible = false;
  }

  public onSideOptionConfirm() {
    this.sideOptionPopupVisible = false;
  }

  public onLinkedOptionConfirm() {
    this.linkedOptionPopupVisible = false;
  }

  //metodo per aprire il popup di configurazione dei crossfade modules, con gestione breadcrumbs
  public openCrossfadePopup(paramName: 'crossfade' | 'fade_in') {
    this.currentCrossfadeParamName = paramName;
    this.crossfadePopupView = 'list';
    this.crossfadePopupSelectedModule = null;

    const baseBreadcrumbs: MenuItem[] = [
      { label: this.moduleFocus?.name ?? 'Module' },
      { label: paramName, disabled: true },
    ];

    if (paramName === 'crossfade') {
      this.crossfadePopupVisible = true;
      this.crossfadeBreadcrumbs = baseBreadcrumbs;
    } else {
      this.fadeInPopupVisible = true;
      this.fadeInBreadcrumbs = baseBreadcrumbs;
    }
  }

  //metodo per aprire il dettaglio del crossfade module cliccato, con gestione breadcrumbs
  public openCrossfadeModuleDetail(module: ModuleWithCount, paramName: 'crossfade' | 'fade_in') {
    this.crossfadePopupSelectedModule = module;
    this.crossfadePopupView = 'detail';

    const currentBreadcrumbs = paramName === 'crossfade' ? this.crossfadeBreadcrumbs : this.fadeInBreadcrumbs;

    const updated: MenuItem[] = [
      ...currentBreadcrumbs.slice(0, -1).map((b) => ({ ...b, disabled: false })),
      { ...currentBreadcrumbs[currentBreadcrumbs.length - 1], disabled: false },
      { label: module.name, disabled: true },
    ];

    if (paramName === 'crossfade') {
      this.crossfadeBreadcrumbs = updated;
    } else {
      this.fadeInBreadcrumbs = updated;
    }
  }

  //metodo per tornare alla lista dei crossfade modules all'interno del popup
  public backToCrossfadeList(paramName: 'crossfade' | 'fade_in') {
    this.crossfadePopupView = 'list';
    this.crossfadePopupSelectedModule = null;
    if (this.isNestedCrossfade && this.nestedCrossfadeChannel) {
      const channelBreadcrumbs = {
        left: this.leftBreadcrumbs,
        right: this.rightBreadcrumbs,
        mid: this.midBreadcrumbs,
        side: this.sideBreadcrumbs,
        linked: this.linkedBreadcrumbs,
      }[this.nestedCrossfadeChannel];

      const nestedBreadcrumbs = [...channelBreadcrumbs.slice(0, -1), { label: paramName, disabled: true }];

      if (paramName === 'crossfade') {
        this.crossfadeBreadcrumbs = nestedBreadcrumbs;
      } else {
        this.fadeInBreadcrumbs = nestedBreadcrumbs;
      }
    } else {
      const baseBreadcrumbs: MenuItem[] = [
        { label: this.moduleFocus?.name ?? 'Module' },
        { label: paramName, disabled: true },
      ];

      if (paramName === 'crossfade') {
        this.crossfadeBreadcrumbs = baseBreadcrumbs;
      } else {
        this.fadeInBreadcrumbs = baseBreadcrumbs;
      }
    }
  }

  //metodo per gestire la navigazione tramite breadcrumbs all'interno del popup dei crossfade modules
  public onCrossfadeBreadcrumbNavigate(item: MenuItem, paramName: 'crossfade' | 'fade_in') {
    // click su nome algoritmo
    if (item.label === (this.moduleFocus?.name ?? 'Module')) {
      if (paramName === 'crossfade') {
        this.crossfadePopupVisible = false;
      } else {
        this.fadeInPopupVisible = false;
      }
      this.currentCrossfadeParamName = '';
      this.crossfadePopupView = 'list';
      this.crossfadePopupSelectedModule = null;
      this.isNestedCrossfade = false;
      this.nestedCrossfadeChannel = null;
      return;
    }

    // click su "Advanced PLC" (primo breadcrumb nel caso nested)
    if (item.label === 'Advanced PLC') {
      if (paramName === 'crossfade') {
        this.crossfadePopupVisible = false;
      } else {
        this.fadeInPopupVisible = false;
      }
      this.currentCrossfadeParamName = '';
      this.crossfadePopupView = 'list';
      this.crossfadePopupSelectedModule = null;

      if (this.nestedCrossfadeChannel) {
        switch (this.nestedCrossfadeChannel) {
          case 'left':
            this.leftOptionPopupVisible = false;
            break;
          case 'right':
            this.rightOptionPopupVisible = false;
            break;
          case 'mid':
            this.midOptionPopupVisible = false;
            break;
          case 'side':
            this.sideOptionPopupVisible = false;
            break;
          case 'linked':
            this.linkedOptionPopupVisible = false;
            break;
        }
      }

      this.popupView = 'list';
      this.popupSelectedModule = null;

      this.isNestedCrossfade = false;
      this.nestedCrossfadeChannel = null;
      return;
    }

    // click su nome canale
    const channelLabels = ['Left', 'Right', 'Mid', 'Side', 'Linked'];
    if (channelLabels.includes(item.label ?? '')) {
      if (paramName === 'crossfade') {
        this.crossfadePopupVisible = false;
      } else {
        this.fadeInPopupVisible = false;
      }
      this.currentCrossfadeParamName = '';
      this.crossfadePopupView = 'list';
      this.crossfadePopupSelectedModule = null;
      this.isNestedCrossfade = false;
      this.nestedCrossfadeChannel = null;

      if (this.currentPopupChannel) {
        this.backToChannelList(this.currentPopupChannel);
      }
      return;
    }

    // click su nome modulo
    if (this.isNestedCrossfade) {
      if (paramName === 'crossfade') {
        this.crossfadePopupVisible = false;
      } else {
        this.fadeInPopupVisible = false;
      }
      this.currentCrossfadeParamName = '';
      this.crossfadePopupView = 'list';
      this.crossfadePopupSelectedModule = null;
      this.isNestedCrossfade = false;
      this.nestedCrossfadeChannel = null;
      return;
    }

    this.backToCrossfadeList(paramName);
  }

  //metodo di conferma per i popup crossfade e fade_in
  public onCrossfadeConfirm(paramName: 'crossfade' | 'fade_in') {
    if (paramName === 'crossfade') {
      this.crossfadePopupVisible = false;
    } else {
      this.fadeInPopupVisible = false;
    }
    this.currentCrossfadeParamName = '';
    this.crossfadePopupView = 'list';
    this.crossfadePopupSelectedModule = null;
    this.isNestedCrossfade = false;
    this.nestedCrossfadeChannel = null;
  }

  //metodo per ottenere i moduli di crossfade o fade_in in base al parametro
  public getCrossfadeModules(paramName: string): ModuleWithCount[] {
    const moduleSource = this.isNestedCrossfade ? this.popupSelectedModule : this.moduleFocus;

    const crossfadeParam = moduleSource?.settings.find((s) => s.name === paramName);

    return Array.isArray(crossfadeParam?.value) ? crossfadeParam.value : [];
  }

  //metodo di cancellazione per i popup crossfade e fade_in, con reset del modulo selezionato e gestione breadcrumbs
  public onCrossfadeCancel(paramName: 'crossfade' | 'fade_in') {
    if (paramName === 'crossfade') {
      this.crossfadePopupVisible = false;
    } else {
      this.fadeInPopupVisible = false;
    }
    this.currentCrossfadeParamName = '';
    this.crossfadePopupView = 'list';
    this.crossfadePopupSelectedModule = null;
    this.isNestedCrossfade = false;
    this.nestedCrossfadeChannel = null;
  }

  //metodo per aprire il popup di configurazione dei crossfade modules annidati in Advanced PLC
  public openNestedCrossfadePopup(
    paramName: 'crossfade' | 'fade_in',
    channel: 'left' | 'right' | 'mid' | 'side' | 'linked',
  ) {
    this.isNestedCrossfade = true;
    this.nestedCrossfadeChannel = channel;
    this.currentCrossfadeParamName = paramName;
    this.crossfadePopupView = 'list';
    this.crossfadePopupSelectedModule = null;

    // breadcrumb del canale + modulo selezionato + paramName
    const channelBreadcrumbs = {
      left: this.leftBreadcrumbs,
      right: this.rightBreadcrumbs,
      mid: this.midBreadcrumbs,
      side: this.sideBreadcrumbs,
      linked: this.linkedBreadcrumbs,
    }[channel];

    const nestedBreadcrumbs: MenuItem[] = [
      ...channelBreadcrumbs.map((b) => ({ ...b, disabled: false })), //cliccabili
      { label: paramName, disabled: true }, //ultimo breadcrumb, non cliccabile
    ];

    if (paramName === 'crossfade') {
      this.crossfadePopupVisible = true;
      this.crossfadeBreadcrumbs = nestedBreadcrumbs;
    } else {
      this.fadeInPopupVisible = true;
      this.fadeInBreadcrumbs = nestedBreadcrumbs;
    }
  }

  private closeAllPopups(): void {
    this.crossfadePopupVisible = false;
    this.fadeInPopupVisible = false;
    this.linkedOptionPopupVisible = false;
    this.midOptionPopupVisible = false;
    this.sideOptionPopupVisible = false;
    this.leftOptionPopupVisible = false;
    this.rightOptionPopupVisible = false;
    this.currentCrossfadeParamName = '';
    this.crossfadePopupView = 'list';
    this.crossfadePopupSelectedModule = null;
    this.popupView = 'list';
    this.popupSelectedModule = null;
    this.isNestedCrossfade = false;
    this.nestedCrossfadeChannel = null;
  }

  private readonly unsubAll$ = new Subject<void>();

  constructor(
    private readonly modulesClient: ModulesClient,
    private readonly messageService: MessageService,
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

  public moduleDiscriminator(module: ModuleWithCount, siblings: ModuleWithCount[]): string | null {
    const moduleIndex = siblings.indexOf(module);
    if (moduleIndex < 0) return null;
    return buildModuleInstancePresentations(siblings)[moduleIndex]?.discriminator ?? null;
  }

  public isParameterFieldType(param: { type: string }): boolean {
    return ['int', 'float', 'str', 'bool', 'Enum', 'list_int'].includes(param.type);
  }

  public complexParameterError(param: ModuleParameterSpec): string | null {
    return ['dict_str_list_int', 'dict_str_list_PLCSettings'].includes(param.type) ? parameterError(param) : null;
  }

  public constraintErrorsFor(module: ModuleWithCount | null | undefined): string[] {
    if (!module) {
      return [];
    }

    const values: ModuleValues = {};
    for (const setting of module.settings) {
      if (setting.value !== undefined) {
        values[setting.name] = setting.value as SettingValue;
      }
    }
    return moduleConstraintErrors(values, module.constraints);
  }

  get selectedModuleConstraintErrors(): string[] {
    return this.constraintErrorsFor(this.moduleFocus);
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

  public searchBands(event: AutoCompleteCompleteEvent): void {
    this.suggestedBands = suggestedBands.filter((band) => band.toString().includes(event.query));
  }

  public coerceFrequencyList(param: ModuleParameterSpec, channel: string, value: unknown): void {
    if (!Array.isArray(value) || !param.value || typeof param.value !== 'object' || Array.isArray(param.value)) {
      return;
    }

    param.value = {
      ...param.value,
      [channel]: value.map((item) => (typeof item === 'number' ? item : Number(item))),
    };
    this.reconcileAdvancedBandSettings(channel, param.value[channel]);
  }

  public onParameterValueChange(param: ModuleParameterSpec): void {
    if (param.name === 'crossfade_frequencies') {
      this.reconcileCrossfadeSettings(this.moduleFocus);
      return;
    }

    if (
      this.moduleFocus?.name === 'AdvancedPLC' &&
      (param.name === 'channel_link' || param.name === 'stereo_image_processing')
    ) {
      this.normalizeAdvancedPLCChannelMappings(this.moduleFocus);
    }
  }

  private createNoCrossfadeSettings(): ModuleWithCount {
    return {
      ...this.hydrateModuleConfig({ name: 'NoCrossfadeSettings', settings: [] }, this.availableCrossfadeModules),
      id: this.selectedCrossfadeModuleCounter++,
    };
  }

  private createDefaultBandAlgorithm(): ModuleWithCount {
    const module = this.hydrateModuleConfig({ name: 'ZerosPLC', settings: [] }, this.availableModules);
    return {
      ...module,
      id: this.bandSettingsSelectedModuleCounter++,
      settings: module.settings.filter((setting) => !bandSettingsOmittedParams.includes(setting.name)),
    };
  }

  private showNestedUpdate(location: string): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Nested settings updated',
      detail: `Frequency changes updated ${location}. Open its configuration to review it.`,
    });
  }

  private reconcileCrossfadeSettings(module: ModuleWithCount | null): void {
    const crossfade = module?.settings.find((setting) => setting.name === 'crossfade');
    const frequencies = module?.settings.find((setting) => setting.name === 'crossfade_frequencies');
    if (!crossfade || !frequencies || !Array.isArray(crossfade.value) || !Array.isArray(frequencies.value)) {
      return;
    }

    const requiredBands = frequencies.value.length + 1;
    if (crossfade.value.length > requiredBands) {
      crossfade.value = crossfade.value.slice(0, requiredBands);
      this.showNestedUpdate('crossfade settings');
    } else if (crossfade.value.length < requiredBands) {
      crossfade.value = [
        ...crossfade.value,
        ...Array.from({ length: requiredBands - crossfade.value.length }, () => this.createNoCrossfadeSettings()),
      ];
      this.showNestedUpdate('crossfade settings');
    }
  }

  private reconcileAdvancedBandSettings(channel: string, frequencies: unknown): void {
    if (this.moduleFocus?.name !== 'AdvancedPLC' || !Array.isArray(frequencies)) {
      return;
    }

    const bandSettings = this.moduleFocus.settings.find((setting) => setting.name === 'band_settings');
    if (
      !bandSettings ||
      !bandSettings.value ||
      typeof bandSettings.value !== 'object' ||
      Array.isArray(bandSettings.value)
    ) {
      return;
    }

    const currentBands = Array.isArray(bandSettings.value[channel]) ? bandSettings.value[channel] : [];
    const requiredBands = frequencies.length + 1;
    if (currentBands.length === requiredBands) {
      return;
    }

    bandSettings.value = {
      ...bandSettings.value,
      [channel]:
        currentBands.length > requiredBands
          ? currentBands.slice(0, requiredBands)
          : [
              ...currentBands,
              ...Array.from({ length: requiredBands - currentBands.length }, () => this.createDefaultBandAlgorithm()),
            ],
    };
    this.showNestedUpdate(`Advanced PLC ${channel} band settings`);
  }

  private normalizeAdvancedPLCChannelMappings(module: ModuleWithCount): void {
    if (module.name !== 'AdvancedPLC') {
      return;
    }

    const bandSettings = module.settings.find((setting) => setting.name === 'band_settings');
    const frequencies = module.settings.find((setting) => setting.name === 'frequencies');
    if (!bandSettings || !frequencies) {
      return;
    }

    const channelLink = module.settings.find((setting) => setting.name === 'channel_link')?.value === true;
    const stereoMode = module.settings.find((setting) => setting.name === 'stereo_image_processing')?.value;
    const channels = channelLink ? ['linked'] : stereoMode === 'mid_side' ? ['mid', 'side'] : ['left', 'right'];

    const copyChannelValues = (source: unknown, candidates: string[]): unknown[] => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return [];
      }
      const values = source as Record<string, unknown>;
      for (const candidate of candidates) {
        if (Array.isArray(values[candidate])) {
          return structuredClone(values[candidate]);
        }
      }
      return [];
    };

    const sourceCandidates: Record<string, string[]> = {
      linked: ['linked', 'left', 'mid', 'right', 'side'],
      left: ['left', 'linked', 'mid', 'right', 'side'],
      right: ['right', 'linked', 'side', 'left', 'mid'],
      mid: ['mid', 'linked', 'left', 'side', 'right'],
      side: ['side', 'linked', 'right', 'mid', 'left'],
    };

    bandSettings.value = Object.fromEntries(
      channels.map((channel) => [channel, copyChannelValues(bandSettings.value, sourceCandidates[channel])]),
    );
    frequencies.value = Object.fromEntries(
      channels.map((channel) => [channel, copyChannelValues(frequencies.value, sourceCandidates[channel])]),
    );
  }

  private hydrateModuleConfig(module: ModuleWithCount, availableSpecs: ModuleWithCount[]): ModuleWithCount {
    const spec = availableSpecs.find((candidate) => candidate.name === module.name);
    if (!spec) {
      return module;
    }

    const configuredSettings = new Map(module.settings.map((setting) => [setting.name, setting]));
    return {
      ...spec,
      ...module,
      settings: spec.settings.map((setting) => {
        const specSetting = setting as ModuleParameterSpec;
        const configured = configuredSettings.get(setting.name) as ModuleParameterSpec | undefined;
        let value = structuredClone(configured?.value ?? configured?.default ?? specSetting.default);

        if (specSetting.type === 'dict_str_list_PLCSettings' && value && typeof value === 'object') {
          value = Object.fromEntries(
            Object.entries(value).map(([channel, modules]) => [
              channel,
              Array.isArray(modules)
                ? modules.map((nestedModule) => {
                    const hydratedModule = this.hydrateModuleConfig(
                      nestedModule as ModuleWithCount,
                      this.availableModules,
                    );
                    return {
                      ...hydratedModule,
                      settings: hydratedModule.settings.filter(
                        (nestedSetting) => !bandSettingsOmittedParams.includes(nestedSetting.name),
                      ),
                    };
                  })
                : modules,
            ]),
          );
        }
        if (specSetting.type === 'list_CrossfadeSettings' && Array.isArray(value)) {
          value = value.map((nestedModule) =>
            this.hydrateModuleConfig(nestedModule as ModuleWithCount, this.availableCrossfadeModules),
          );
        }

        return {
          ...specSetting,
          value,
          availableValues: specSetting.availableValues,
        };
      }),
    };
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

    const moduleToAdd = this.hydrateModuleConfig(
      {
        ...module,
        settings: structuredClone(module.settings),
        id: this.selectedModuleCounter++,
      },
      this.availableModules,
    );

    this.normalizeAdvancedPLCChannelMappings(moduleToAdd);
    this.moduleFocus = moduleToAdd;

    // Replace the array instead of mutating it in place: `p-listbox` is
    // OnPush and stores its options in a signal, so it only re-renders when
    // the `options` reference changes.
    this.runConfigService.modulesSelection.next({
      ...this.runConfigService.modulesSelection.value,
      [this.moduleType]: [...this.modulesSelection, moduleToAdd],
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

  //metodo per aggiungere un modulo di crossfade o fade_in alla configurazione
  public addCrossfadeModule(crossfadeModule: ModuleWithCount | null, paramName: string): void {
    if (!crossfadeModule) {
      return;
    }

    const source = this.isNestedCrossfade ? this.popupSelectedModule : this.moduleFocus;
    const parentModuleSetting = source?.settings.find((setting) => setting.name === paramName);
    if (parentModuleSetting) {
      const currentCrossfadeModules: ModuleWithCount[] = Array.isArray(parentModuleSetting.value)
        ? parentModuleSetting.value
        : [];
      // New array reference so the OnPush `p-listbox` re-renders immediately.
      parentModuleSetting.value = [
        ...currentCrossfadeModules,
        {
          ...crossfadeModule,
          settings: structuredClone(crossfadeModule.settings),
          id: this.selectedCrossfadeModuleCounter++,
        },
      ];
    }

    this.selectedCrossfadeModuleProxy = null;
  }

  //metodo per rimuovere un modulo di crossfade o fade_in dalla configurazione
  public removeFromCrossfadeModulesSelection(moduleId: number): void {
    const source = this.isNestedCrossfade ? this.popupSelectedModule : this.moduleFocus;
    const crossfadeSetting = source?.settings.find(
      (setting) =>
        crossfadeNameParameters.includes(setting.name) &&
        Array.isArray(setting.value) &&
        setting.value.some((module: ModuleWithCount) => module.id === moduleId),
    );

    if (!crossfadeSetting || !Array.isArray(crossfadeSetting.value)) {
      return;
    }

    const crossfadeModuleList = crossfadeSetting.value as ModuleWithCount[];
    const moduleToRemoveIndex = crossfadeModuleList.findIndex((module) => module.id === moduleId);

    if (moduleToRemoveIndex === -1) {
      return;
    }
    if (crossfadeModuleList[moduleToRemoveIndex]?.id === this.crossfadeModuleFocus?.id) {
      this.crossfadeModuleFocus = null;
    }
    // New array reference so the OnPush `p-listbox` re-renders immediately.
    crossfadeSetting.value = crossfadeModuleList.filter((_, idx) => idx !== moduleToRemoveIndex);
  }

  public removeFromBandSettingsModulesSelection(moduleId: number): void {
    const bandSettingsParam = this.moduleFocus?.settings.find((setting) => setting.name === 'band_settings');
    const bandSettings = bandSettingsParam?.value as Record<string, ModuleWithCount[]> | undefined;

    if (!bandSettingsParam || !bandSettings) {
      return;
    }

    const bandLabel = Object.keys(bandSettings).find((label) =>
      bandSettings[label].some((module) => module.id === moduleId),
    );

    if (bandLabel === undefined) {
      return;
    }

    const moduleToRemoveIndex = bandSettings[bandLabel].findIndex((module) => module.id === moduleId);

    if (moduleToRemoveIndex === -1) {
      return;
    }

    if (bandSettings[bandLabel][moduleToRemoveIndex]?.id === this.bandSettingModuleFocus?.id) {
      this.bandSettingModuleFocus = null;
    }

    // New array/object references so the OnPush `p-listbox` re-renders immediately.
    bandSettingsParam.value = {
      ...bandSettings,
      [bandLabel]: bandSettings[bandLabel].filter((_, idx) => idx !== moduleToRemoveIndex),
    };
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
      const currentBandSettings = parentModuleSetting.value ?? {};
      const currentBand: ModuleWithCount[] = Array.isArray(currentBandSettings[bandLabel])
        ? currentBandSettings[bandLabel]
        : [];
      // New array/object references so the OnPush `p-listbox` re-renders immediately.
      parentModuleSetting.value = {
        ...currentBandSettings,
        [bandLabel]: [
          ...currentBand,
          {
            ...bandSettingModule,
            settings: structuredClone(bandSettingModule.settings).filter(
              (param) => !bandSettingsOmittedParams.includes(param.name),
            ),
            id: this.bandSettingsSelectedModuleCounter++,
          },
        ],
      };
    }

    this.bandSettingsSelectedModuleProxy = null;
  }
}
