import { of, throwError } from 'rxjs';
import { PluginsComponent } from './plugins.component';

describe('PluginsComponent', () => {
  it('uploads the selected plugin and refreshes the inventory', () => {
    const client = jasmine.createSpyObj('PluginsClient', ['getPlugins', 'uploadPlugin']);
    client.getPlugins.and.returnValue(of({ scannedAt: null, items: [] }));
    client.uploadPlugin.and.returnValue(of({}));
    const component = new PluginsComponent(client);
    const file = new File(['plugin'], 'DemoAlgorithm.py');
    const input = { files: [file], value: 'selected' } as unknown as HTMLInputElement;
    component.upload(input);
    expect(client.uploadPlugin).toHaveBeenCalledWith(file);
    expect(client.getPlugins).toHaveBeenCalled();
    expect(component.uploading).toBeFalse();
    expect(component.uploadSuccess).toContain(file.name);
    expect(input.value).toBe('');
  });

  it('shows upload failures without refreshing', () => {
    const client = jasmine.createSpyObj('PluginsClient', ['getPlugins', 'uploadPlugin']);
    client.uploadPlugin.and.returnValue(throwError(() => ({ error: { detail: 'Already exists' } })));
    const component = new PluginsComponent(client);
    component.upload({ files: [new File(['plugin'], 'DemoAlgorithm.py')], value: '' } as unknown as HTMLInputElement);
    expect(component.uploadError).toBe('Already exists');
    expect(component.uploading).toBeFalse();
    expect(client.getPlugins).not.toHaveBeenCalled();
  });

  it('rejects unsupported files before uploading', () => {
    const client = jasmine.createSpyObj('PluginsClient', ['uploadPlugin']);
    const component = new PluginsComponent(client);
    component.upload({ files: [new File(['plugin'], 'plugin.zip')], value: '' } as unknown as HTMLInputElement);
    expect(component.uploadError).toContain('.py');
    expect(client.uploadPlugin).not.toHaveBeenCalled();
  });
  it('loads and counts available and invalid plugins', () => {
    const client = jasmine.createSpyObj('PluginsClient', ['getPlugins']);
    client.getPlugins.and.returnValue(
      of({
        scannedAt: '2026-01-01T12:00:00Z',
        items: [
          { filename: 'Good.py', status: 'available', moduleType: 'PLCAlgorithm', spec: null, error: null },
          { filename: 'Bad.py', status: 'invalid', moduleType: 'PLCAlgorithm', spec: null, error: 'Broken' },
        ],
      }),
    );
    const component = new PluginsComponent(client);

    component.ngOnInit();

    expect(component.plugins.length).toBe(2);
    expect(component.availableCount).toBe(1);
    expect(component.invalidCount).toBe(1);
    expect(component.loading).toBeFalse();
    expect(component.loadError).toBeFalse();
  });

  it('supports refresh and reports API failures', () => {
    const client = jasmine.createSpyObj('PluginsClient', ['getPlugins']);
    client.getPlugins.and.returnValue(throwError(() => new Error('offline')));
    const component = new PluginsComponent(client);

    component.refresh();

    expect(component.loadError).toBeTrue();
    expect(component.loaded).toBeTrue();
    expect(component.loading).toBeFalse();
  });
});
