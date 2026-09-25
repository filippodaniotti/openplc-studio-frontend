import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AssetsClient } from './assets.client';
import { RunStatus } from '../enums/run-status.enum';

const trackDto = {
  name: 'test track.wav',
  size_bytes: 2048,
  duration_seconds: 2,
  sample_rate: 48000,
  channels: 2,
  bit_depth: 16,
  format: 'WAV',
  subtype: 'PCM_16',
  frames: 96000,
  storage: {
    provider: 'filesystem',
    key: 'test track.wav',
    content_type: 'audio/wav',
    size_bytes: 2048,
    last_modified: '2026-01-01T12:00:00Z',
  },
  usage: { total: 2, blocking: 1, by_status: { [RunStatus.RUNNING]: 1, [RunStatus.COMPLETED]: 1 } },
};

describe('AssetsClient', () => {
  let client: AssetsClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    client = TestBed.inject(AssetsClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps paginated track and storage metadata', () => {
    let result: any;
    client.getTracksPage(2, 25, 'test', 'last_modified', 'desc').subscribe((page) => (result = page));

    const request = http.expectOne(
      (candidate) => candidate.url === '/api/assets/tracks' && candidate.params.get('page') === '2',
    );
    expect(request.request.params.get('search')).toBe('test');
    expect(request.request.params.get('sort_by')).toBe('last_modified');
    expect(request.request.params.get('sort_direction')).toBe('desc');
    request.flush({ items: [trackDto], total: 1, page: 2, page_size: 25 });

    expect(result.pageSize).toBe(25);
    expect(result.items[0].storage.contentType).toBe('audio/wav');
    expect(result.items[0].usage.blocking).toBe(1);
  });

  it('URL-encodes content names and sends bulk delete bodies', () => {
    expect(client.getTrackContentUrl('test track.wav', true)).toBe(
      '/api/assets/tracks/test%20track.wav/content?download=true',
    );

    client.deleteTracks(['test track.wav']).subscribe();
    const request = http.expectOne('/api/assets/tracks');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ names: ['test track.wav'] });
    request.flush({ deleted: ['test track.wav'] });
  });
});
