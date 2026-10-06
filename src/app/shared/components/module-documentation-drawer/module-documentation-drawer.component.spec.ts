import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { Drawer } from 'primeng/drawer';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, Subject } from 'rxjs';
import { DocumentationComponent } from '../../../documentation/documentation.component';
import { ThemeService } from '../../services/theme.service';
import { ModuleDocumentationDrawerComponent } from './module-documentation-drawer.component';

describe('ModuleDocumentationDrawerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModuleDocumentationDrawerComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ThemeService, useValue: { isDarkMode: new BehaviorSubject(false) } },
        { provide: Router, useValue: { events: new Subject(), navigateByUrl: jasmine.createSpy('navigateByUrl') } },
      ],
    }).compileComponents();
  });

  it('lazily renders a non-routed contained viewer without a mask and recreates it on Reload', () => {
    const fixture = TestBed.createComponent(ModuleDocumentationDrawerComponent);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(DocumentationComponent))).toBeNull();

    fixture.componentRef.setInput('moduleName', 'BurgPLC');
    fixture.componentRef.setInput('target', { path: 'reference/plc_algorithm/', fragment: 'BurgPLC' });
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    const viewer = fixture.debugElement.query(By.directive(DocumentationComponent))
      .componentInstance as DocumentationComponent;
    expect(viewer.syncWithRouter).toBeFalse();
    expect(viewer.contained).toBeTrue();
    expect(viewer.documentationUrl).toBe('/api/plctestbench-docs/reference/plc_algorithm/#BurgPLC');
    expect(document.querySelector('.p-drawer-mask')).toBeNull();
    expect(document.body.classList.contains('p-overflow-hidden')).toBeFalse();
    expect(document.querySelector('.plc-module-documentation-header')?.textContent).toContain(
      'Documentation — BurgPLC',
    );
    expect(document.querySelector('.plc-module-documentation-drawer iframe')?.getAttribute('title')).toBe(
      'PLCTestbench documentation',
    );
    const theme = TestBed.inject(ThemeService).isDarkMode;
    expect(theme.observers.length).toBe(1);
    fixture.componentInstance.reload();
    fixture.detectChanges();
    expect(theme.observers.length).toBe(1);
    expect(fixture.debugElement.query(By.directive(DocumentationComponent)).componentInstance).not.toBe(viewer);

    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(DocumentationComponent))).toBeNull();
    expect(theme.observed).toBeFalse();
    fixture.destroy();
  });

  it('updates the rendered panel on every pointer move before release without recreating the iframe', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1200);
    const fixture = TestBed.createComponent(ModuleDocumentationDrawerComponent);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    const drawer = fixture.debugElement.query(By.directive(Drawer)).componentInstance as Drawer;
    const panel = drawer.containerViewChild!.nativeElement as HTMLElement;
    const handle = panel.querySelector('.plc-module-documentation-resize-handle') as HTMLElement;
    const iframe = panel.querySelector('iframe');
    spyOn(handle, 'setPointerCapture');
    spyOn(handle, 'hasPointerCapture').and.returnValue(true);
    spyOn(handle, 'releasePointerCapture');
    handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 600 }));
    handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 500 }));
    // No manual change detection or pointerup: the visible edge must move now.
    expect(panel.style.width).toBe('700px');
    handle.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 400 }));
    expect(panel.style.width).toBe('800px');
    expect(fixture.componentInstance.resizing).toBeTrue();
    expect(panel.querySelector('iframe')).toBe(iframe);
    handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 400 }));
    expect(fixture.componentInstance.resizing).toBeFalse();
    fixture.detectChanges();
    expect(panel.style.width).toBe('800px');
    expect(panel.querySelector('iframe')).toBe(iframe);
    fixture.destroy();
  });

  it('resizes from the left edge with pointer capture and clamps the width', () => {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1200);
    const component = new ModuleDocumentationDrawerComponent();
    const handle = {
      setPointerCapture: jasmine.createSpy('setPointerCapture'),
      hasPointerCapture: () => true,
      releasePointerCapture: jasmine.createSpy('releasePointerCapture'),
    };
    const pointer = (clientX: number, button = 0) =>
      ({
        clientX,
        button,
        pointerId: 1,
        currentTarget: handle,
        preventDefault: jasmine.createSpy('preventDefault'),
      }) as unknown as PointerEvent;
    component.startResize(pointer(600, 2));
    expect(component.resizing).toBeFalse();
    component.startResize(pointer(600));
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
    component.resize(pointer(400));
    expect(component.drawerWidth).toBe(800);
    component.resize(pointer(1000));
    expect(component.drawerWidth).toBe(384);
    component.resize(pointer(-1000));
    expect(component.drawerWidth).toBe(1200);
    component.stopResize(pointer(400));
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(component.resizing).toBeFalse();
    component.resize(pointer(500));
    expect(component.drawerWidth).toBe(1200);
  });

  it('supports keyboard sizing and adapts to viewport changes without resetting the viewer', () => {
    const viewport = spyOnProperty(window, 'innerWidth', 'get').and.returnValue(1200);
    const component = new ModuleDocumentationDrawerComponent();
    const viewerKeys = component.viewerKeys;
    component.resizeWithKeyboard(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(component.drawerWidth).toBe(616);
    component.resizeWithKeyboard(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    expect(component.drawerWidth).toBe(552);
    component.drawerWidth = 1100;
    viewport.and.returnValue(900);
    component.onWindowResize();
    expect(component.drawerWidth).toBe(900);
    viewport.and.returnValue(500);
    component.onWindowResize();
    component.resizeWithKeyboard(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(component.effectiveWidth).toBe(500);
    expect(component.drawerWidth).toBe(900);
    expect(component.viewerKeys).toBe(viewerKeys);
  });

  it('closes on Escape and restores trigger focus, but not on a selection-driven close', () => {
    const component = new ModuleDocumentationDrawerComponent();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    component.visible = true;
    component.ngOnChanges({ visible: new SimpleChange(false, true, false) });
    const focus = spyOn(trigger, 'focus');
    const emitted = jasmine.createSpy('visibleChange');
    component.visibleChange.subscribe(emitted);
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.visible).toBeTrue();
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.visible).toBeFalse();
    expect(emitted).toHaveBeenCalledWith(false);
    expect(focus).toHaveBeenCalledTimes(1);
    component.ngOnChanges({ visible: new SimpleChange(true, false, false) });
    expect(focus).toHaveBeenCalledTimes(1);
    trigger.remove();
  });
});
