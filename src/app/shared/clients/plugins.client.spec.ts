import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PluginsClient } from './plugins.client';

describe('PluginsClient', () => {
  let client: PluginsClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    client = TestBed.inject(PluginsClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and maps plugin source with an encoded filename', () => {
    let result: any;
    client.getSource('Demo Plugin.py').subscribe((source) => (result = source));
    const request = http.expectOne('/api/plugins/Demo%20Plugin.py/source');
    request.flush({
      filename: 'Demo Plugin.py',
      content: 'code',
      revision: 'hash',
      plugin: {
        filename: 'Demo Plugin.py',
        status: 'invalid',
        module_type: 'PLCAlgorithm',
        error: 'Broken',
        spec: null,
      },
    });
    expect(result.content).toBe('code');
    expect(result.revision).toBe('hash');
    expect(result.plugin.moduleType).toBe('PLCAlgorithm');
  });

  it('validates source without saving', () => {
    client.validateSource('Demo.py', 'draft').subscribe();
    const request = http.expectOne('/api/plugins/Demo.py/validate');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ content: 'draft' });
    request.flush({ valid: false, diagnostics: [{ message: 'Invalid', line: 1, column: 1 }] });
  });

  it('saves source with its revision and maps the updated plugin', () => {
    let result: any;
    client.saveSource('Demo.py', 'edited', 'old-hash').subscribe((source) => (result = source));
    const request = http.expectOne('/api/plugins/Demo.py/source');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ content: 'edited', revision: 'old-hash' });
    request.flush({
      filename: 'Demo.py',
      content: 'edited',
      revision: 'new-hash',
      plugin: { filename: 'Demo.py', status: 'available', module_type: 'PLCAlgorithm', error: null, spec: null },
    });
    expect(result.revision).toBe('new-hash');
    expect(result.plugin.status).toBe('available');
  });

  it('uploads a plugin as multipart form data', () => {
    const file = new File(['plugin'], 'DemoAlgorithm.py');
    client.uploadPlugin(file).subscribe();
    const request = http.expectOne('/api/plugins');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.get('file')).toBe(file);
    request.flush({});
  });

  it('maps the plugin inventory into frontend models', () => {
    let result: any;
    client.getPlugins().subscribe((inventory) => (result = inventory));

    const request = http.expectOne('/api/plugins');
    request.flush({
      scanned_at: '2026-01-01T12:00:00Z',
      items: [
        {
          filename: 'DemoAlgorithm.py',
          status: 'available',
          module_type: 'PLCAlgorithm',
          error: null,
          spec: {
            name: 'Demo',
            settings: [{ name: 'strength', type: 'float', default: 0.5, values: null }],
            constraints: [
              {
                type: 'less_than',
                setting: 'start',
                related_setting: 'end',
                message: 'Start must be lower than end',
              },
            ],
          },
        },
      ],
    });

    expect(result.scannedAt).toBe('2026-01-01T12:00:00Z');
    expect(result.items[0].moduleType).toBe('PLCAlgorithm');
    expect(result.items[0].spec.constraints[0].relatedSetting).toBe('end');
  });
});
