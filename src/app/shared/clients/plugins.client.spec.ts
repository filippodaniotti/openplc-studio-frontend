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
