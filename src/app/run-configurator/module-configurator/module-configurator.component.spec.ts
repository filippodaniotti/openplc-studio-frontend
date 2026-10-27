import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ParameterFieldComponent } from '../../shared/components/parameter-field/parameter-field.component';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { ModulesClient } from '../../shared/clients/modules.client';
import { ThemeService } from '../../shared/services/theme.service';
import { AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ModuleConfiguratorComponent, ModuleWithCount } from './module-configurator.component';
import { RunConfiguratorService } from '../run-configurator.service';
import { ModuleType } from '../../shared/enums/module-type.enum';

function createComponent(): ModuleConfiguratorComponent {
  return new ModuleConfiguratorComponent(
    jasmine.createSpyObj('ModulesClient', ['getModuleTypes']),
    jasmine.createSpyObj('MessageService', ['add']),
    new RunConfiguratorService(),
  );
}

describe('Human listening run limits', () => {
  it('blocks a second HumanCalculator', () => {
    const component = createComponent();
    component.moduleType = ModuleType.OutputAnalyser;
    component.addModule({ name: 'HumanCalculator', settings: [] });
    component.addModule({ name: 'HumanCalculator', settings: [] });
    expect(component.modulesSelection.length).toBe(1);
  });

  it('blocks a second simulator when HumanCalculator is present', () => {
    const component = createComponent();
    component.moduleType = ModuleType.OutputAnalyser;
    component.addModule({ name: 'HumanCalculator', settings: [] });
    component.moduleType = ModuleType.PacketLossSimulator;
    component.addModule({ name: 'BinomialPLS', settings: [] });
    component.addModule({ name: 'BinomialPLS', settings: [] });
    expect(component.modulesSelection.length).toBe(1);
  });

  it('requires removing extra simulators before adding HumanCalculator', () => {
    const component = createComponent();
    component.moduleType = ModuleType.PacketLossSimulator;
    component.addModule({ name: 'BinomialPLS', settings: [] });
    component.addModule({ name: 'BinomialPLS', settings: [] });
    expect(component.modulesSelection.length).toBe(2);
    component.moduleType = ModuleType.OutputAnalyser;
    component.addModule({ name: 'HumanCalculator', settings: [] });
    expect(component.modulesSelection.length).toBe(0);
  });
});

describe('HumanCalculator full-track configuration', () => {
  const humanSpec: ModuleWithCount = {
    name: 'HumanCalculator',
    settings: [
      { name: 'use_full_track', type: 'bool', default: true },
      { name: 'stimulus_length', type: 'int', default: 3000 },
      { name: 'single_loss_per_stimulus', type: 'bool', default: false },
      { name: 'trials_per_track', type: 'int', default: 20 },
      { name: 'choose_seed', type: 'int', default: 1 },
      { name: 'loudness_threshold_db', type: 'float', default: -10 },
      { name: 'iterations', type: 'int', default: 1 },
    ],
  };

  it('hydrates defaults and preserves imported excerpt settings and explicit false', () => {
    const component = createComponent();
    component.moduleType = ModuleType.OutputAnalyser;
    component.modules.next([humanSpec]);
    component.addModule({
      name: 'HumanCalculator',
      settings: [
        { name: 'use_full_track', value: false },
        { name: 'stimulus_length', value: 5000 },
      ],
    });
    const selected = component.moduleFocus!;
    expect(component.usesFullTrack(selected)).toBeFalse();
    expect(component.visibleParameters(selected).length).toBe(7);
    expect(selected.settings.find((setting) => setting.name === 'single_loss_per_stimulus')!.value).toBeFalse();
    selected.settings[0].value = true;
    expect(component.visibleParameters(selected).map((setting) => setting.name)).toEqual([
      'use_full_track',
      'iterations',
    ]);
    selected.settings[0].value = false;
    expect(selected.settings.find((setting) => setting.name === 'stimulus_length')!.value).toBe(5000);
    expect(component.visibleParameters({ name: 'OtherModule', settings: selected.settings }).length).toBe(7);
  });

  it('renders a default-on checkbox and restores excerpt fields when unchecked', async () => {
    await TestBed.configureTestingModule({
      imports: [ModuleConfiguratorComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ModulesClient, useValue: { getModuleTypes: () => of([]) } },
        { provide: MessageService, useValue: jasmine.createSpyObj('MessageService', ['add']) },
        { provide: ThemeService, useValue: { isDarkMode: new BehaviorSubject(false) } },
        { provide: Router, useValue: { events: new Subject() } },
        RunConfiguratorService,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ModuleConfiguratorComponent);
    fixture.componentRef.setInput('moduleType', ModuleType.OutputAnalyser);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.modules.next([humanSpec]);
    component.addModule(humanSpec);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const fields = () => fixture.debugElement.queryAll(By.directive(ParameterFieldComponent));
    expect(fields().map((field) => field.componentInstance.param.name)).toEqual(['use_full_track', 'iterations']);
    expect(fixture.nativeElement.textContent).toContain('Use full track');
    const checkbox = fields()[0].nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBeTrue();
    checkbox.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fields().length).toBe(7);
    expect(
      component.moduleFocus!.settings.find((setting) => setting.name === 'single_loss_per_stimulus')!.value,
    ).toBeFalse();
    checkbox.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fields().length).toBe(2);
    fixture.destroy();
  });
});

function search(component: ModuleConfiguratorComponent, query = ''): void {
  component.searchModules({ query } as AutoCompleteCompleteEvent);
}

describe('ModuleConfiguratorComponent documentation', () => {
  it('opens documentation without replacing or editing the selection', () => {
    const component = createComponent();
    component.moduleType = ModuleType.PLCAlgorithm;
    const module: ModuleWithCount = { name: 'BurgPLC', settings: [] };
    component.moduleFocus = module;

    component.openDocumentation(module);

    expect(component.documentationVisible).toBeTrue();
    expect(component.documentationModuleName).toBe('BurgPLC');
    expect(component.documentationTarget).toEqual({
      path: 'reference/plc_algorithm/',
      fragment: 'plctestbench.plc_algorithm.BurgPLC',
    });
    expect(component.moduleFocus).toBe(module);
    expect(module.settings).toEqual([]);
    component.moduleFocus = module;
    expect(component.documentationVisible).toBeTrue();
    component.moduleFocus = null;
    expect(component.documentationVisible).toBeFalse();
  });

  it('preserves documentation during parameter edits and closes it on removal', () => {
    const component = createComponent();
    component.moduleType = ModuleType.PLCAlgorithm;
    component.addModule({ name: 'BurgPLC', settings: [{ name: 'order', value: 10 }] });
    component.openDocumentation(component.moduleFocus!);
    const param = { name: 'order', type: 'int', default: 5, value: 10 };
    component.onParameterValueChange(param);
    component.resetDefault(param);
    expect(param.value).toBe(5);
    expect(component.documentationVisible).toBeTrue();
    component.removeFromModulesSelection(0);
    expect(component.documentationVisible).toBeFalse();
  });

  it('closes documentation when the selected module changes', () => {
    const component = createComponent();
    component.moduleType = ModuleType.PLCAlgorithm;
    const module: ModuleWithCount = { name: 'BurgPLC', settings: [] };
    component.moduleFocus = module;
    component.openDocumentation(module);
    component.moduleFocus = { name: 'ZerosPLC', settings: [] };
    expect(component.documentationVisible).toBeFalse();
  });
});

describe('ModuleConfiguratorComponent documentation button', () => {
  it('opens the drawer for built-ins without routing and hides the button for plugins', async () => {
    const router = { events: new Subject(), navigateByUrl: jasmine.createSpy('navigateByUrl') };
    await TestBed.configureTestingModule({
      imports: [ModuleConfiguratorComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ModulesClient, useValue: { getModuleTypes: () => of([]) } },
        { provide: MessageService, useValue: jasmine.createSpyObj('MessageService', ['add']) },
        { provide: ThemeService, useValue: { isDarkMode: new BehaviorSubject(false) } },
        { provide: Router, useValue: router },
        RunConfiguratorService,
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ModuleConfiguratorComponent);
    fixture.componentRef.setInput('moduleType', ModuleType.PLCAlgorithm);
    fixture.detectChanges();
    fixture.componentInstance.addModule({ name: 'BurgPLC', settings: [] });
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '[aria-label="Open documentation for BurgPLC"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.documentationVisible).toBeTrue();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    fixture.componentInstance.addModule({ name: 'Demo', settings: [], is_plugin: true });
    fixture.detectChanges();
    expect(fixture.componentInstance.documentationVisible).toBeFalse();
    expect(fixture.nativeElement.querySelector('[aria-label="Open documentation for Demo"]')).toBeNull();
    fixture.destroy();
  });
});

describe('ModuleConfiguratorComponent module suggestions', () => {
  it('leaves built-in-only suggestions ungrouped', () => {
    const component = createComponent();
    const builtIn: ModuleWithCount = { name: 'AdvancedPLC', settings: [] };
    component.modules.next([builtIn]);

    search(component);

    expect(component.availableModulesFilter).toEqual([builtIn]);
  });

  it('separates built-in algorithms from marked plugins', () => {
    const component = createComponent();
    const builtIn: ModuleWithCount = { name: 'AdvancedPLC', settings: [] };
    const plugin: ModuleWithCount = { name: 'Demo', settings: [], is_plugin: true };
    component.modules.next([builtIn, plugin]);

    search(component);

    expect(component.availableModulesFilter).toEqual([
      { label: 'Built-in algorithms', items: [builtIn] },
      { label: 'Plugins', items: [plugin] },
    ]);
  });
});
