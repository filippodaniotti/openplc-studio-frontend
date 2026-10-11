import { fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { PluginSource, PluginValidation } from '../../../shared/interfaces/plugin.interface';
import { PluginEditorComponent } from './plugin-editor.component';

const source: PluginSource = {
  filename: 'DemoAlgorithm.py',
  content: 'original',
  revision: 'revision-1',
  plugin: { filename: 'DemoAlgorithm.py', status: 'invalid', moduleType: 'PLCAlgorithm', error: 'Broken', spec: null },
};

describe('PluginEditorComponent', () => {
  let client: jasmine.SpyObj<any>;
  let component: PluginEditorComponent;

  beforeEach(() => {
    client = jasmine.createSpyObj('PluginsClient', ['getSource', 'validateSource', 'saveSource']);
    client.getSource.and.returnValue(of(source));
    client.validateSource.and.returnValue(of({ valid: true, diagnostics: [] }));
    const route = { paramMap: of(convertToParamMap({ filename: source.filename })) } as unknown as ActivatedRoute;
    component = new PluginEditorComponent(client, route);
    component.ngOnInit();
  });
  afterEach(() => component.ngOnDestroy());

  it('opens invalid source for repair and validates it', () => {
    expect(component.content).toBe(source.content);
    expect(component.source?.plugin.status).toBe('invalid');
    expect(component.dirty).toBeFalse();
    expect(client.validateSource).toHaveBeenCalledWith(source.filename, source.content);
  });

  it('debounces edits and ignores an obsolete validation response', fakeAsync(() => {
    const pending = new Subject<PluginValidation>();
    client.validateSource.and.returnValue(pending);
    component.validate();
    component.edit('draft');
    pending.next({ valid: false, diagnostics: [{ message: 'obsolete', line: 1, column: 1 }] });
    expect(component.diagnostics).toEqual([]);
    expect(component.valid).toBeNull();
    client.validateSource.and.returnValue(of({ valid: true, diagnostics: [] }));
    const count = client.validateSource.calls.count();
    tick(749);
    expect(client.validateSource.calls.count()).toBe(count);
    tick(1);
    expect(client.validateSource).toHaveBeenCalledWith(source.filename, 'draft');
    expect(component.valid).toBeTrue();
  }));

  it('saves with the loaded revision and resets dirty state', () => {
    component.edit('repaired');
    client.saveSource.and.returnValue(
      of({ ...source, content: 'repaired', revision: 'revision-2', plugin: { ...source.plugin, status: 'available' } }),
    );
    component.save();
    expect(client.saveSource).toHaveBeenCalledWith(source.filename, 'repaired', source.revision);
    expect(component.dirty).toBeFalse();
    expect(component.source?.revision).toBe('revision-2');
    expect(component.source?.plugin.status).toBe('available');
    expect(component.notice).toContain('Plugin saved');
    expect(component.saving).toBeFalse();
  });

  it('keeps the draft and displays server diagnostics when save is invalid', () => {
    const diagnostics = [{ message: 'Syntax error', line: 3, column: 2 }];
    client.saveSource.and.returnValue(
      throwError(() => ({ status: 400, error: { detail: { message: 'Fix errors', diagnostics } } })),
    );
    component.edit('broken');
    component.save();
    expect(component.content).toBe('broken');
    expect(component.dirty).toBeTrue();
    expect(component.diagnostics).toEqual(diagnostics);
    expect(component.valid).toBeFalse();
    expect(component.saving).toBeFalse();
  });

  it('preserves edits after network and validation failures', () => {
    component.edit('draft');
    client.validateSource.and.returnValue(throwError(() => new Error('offline')));
    component.validate();
    expect(component.validating).toBeFalse();
    expect(component.error).toContain('Unable to validate');
    client.saveSource.and.returnValue(throwError(() => new Error('offline')));
    component.save();
    expect(component.content).toBe('draft');
    expect(component.dirty).toBeTrue();
    expect(component.error).toContain('Unable to save');
  });

  it('requires explicit reload after a conflict and confirms discarding the draft', () => {
    client.saveSource.and.returnValue(throwError(() => ({ status: 409, error: { detail: 'Changed on server' } })));
    component.edit('draft');
    component.save();
    component.save();
    expect(client.saveSource).toHaveBeenCalledTimes(1);
    expect(component.conflict).toBeTrue();
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    component.load();
    expect(component.content).toBe('draft');
    expect(client.getSource).toHaveBeenCalledTimes(1);
    confirm.and.returnValue(true);
    client.getSource.and.returnValue(of({ ...source, content: 'external', revision: 'revision-2' }));
    component.load();
    expect(component.content).toBe('external');
    expect(component.conflict).toBeFalse();
    expect(component.dirty).toBeFalse();
  });

  it('guards unsaved changes and restores the saved baseline on discard', () => {
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    expect(component.canDeactivate()).toBeTrue();
    component.edit('draft');
    expect(component.canDeactivate()).toBeFalse();
    component.discard();
    expect(component.content).toBe('draft');
    const unload = { preventDefault: jasmine.createSpy('preventDefault'), returnValue: undefined };
    component.beforeUnload(unload as unknown as BeforeUnloadEvent);
    expect(unload.preventDefault).toHaveBeenCalled();
    confirm.and.returnValue(true);
    component.discard();
    expect(component.content).toBe(source.content);
    expect(component.dirty).toBeFalse();
  });

  it('blocks duplicate saves and leaving while a save is in progress', () => {
    client.saveSource.and.returnValue(new Subject<PluginSource>());
    component.edit('draft');
    component.save();
    component.save();
    expect(client.saveSource).toHaveBeenCalledTimes(1);
    expect(component.canDeactivate()).toBeFalse();
  });

  it('reports missing source without opening a blank editable document', () => {
    component.source = null;
    client.getSource.and.returnValue(throwError(() => ({ status: 404, error: { detail: 'Plugin not found' } })));
    component.load();
    expect(component.source).toBeNull();
    expect(component.loading).toBeFalse();
    expect(component.error).toBe('Plugin not found');
  });

  it('cancels pending automatic validation when destroyed', fakeAsync(() => {
    component.edit('draft');
    const count = client.validateSource.calls.count();
    component.ngOnDestroy();
    tick(750);
    expect(client.validateSource.calls.count()).toBe(count);
  }));
});
