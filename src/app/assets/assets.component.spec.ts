import { of } from 'rxjs';
import { RunStatus } from '../shared/enums/run-status.enum';
import { TrackAsset } from '../shared/interfaces/track-asset.interface';
import { AssetsComponent } from './assets.component';

const makeTrack = (blocking = 0, total = blocking): TrackAsset => ({
  name: 'track.wav',
  sizeBytes: 1024,
  durationSeconds: 1,
  sampleRate: 48000,
  channels: 2,
  bitDepth: 16,
  format: 'WAV',
  subtype: 'PCM_16',
  frames: 48000,
  storage: {
    provider: 'filesystem',
    key: 'track.wav',
    contentType: 'audio/wav',
    sizeBytes: 1024,
    lastModified: '2026-01-01T12:00:00Z',
  },
  usage: {
    total,
    blocking,
    byStatus: blocking ? { [RunStatus.RUNNING]: blocking } : { [RunStatus.COMPLETED]: total },
  },
});

describe('AssetsComponent', () => {
  let component: AssetsComponent;
  let assetsClient: jasmine.SpyObj<any>;
  let confirmationService: jasmine.SpyObj<any>;
  let messageService: jasmine.SpyObj<any>;

  beforeEach(() => {
    assetsClient = jasmine.createSpyObj('AssetsClient', [
      'getTracksPage',
      'getTrack',
      'getTrackUsage',
      'deleteTracks',
      'getTrackContentUrl',
    ]);
    confirmationService = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    messageService = jasmine.createSpyObj('MessageService', ['add']);
    component = new AssetsComponent(
      assetsClient,
      confirmationService,
      messageService,
      jasmine.createSpyObj('Router', ['navigate']),
    );
  });

  it('loads a sorted page and tracks pagination state', () => {
    assetsClient.getTracksPage.and.returnValue(of({ items: [makeTrack()], total: 1, page: 2, pageSize: 10 }));

    component.loadTracks({ first: 10, rows: 10, sortField: 'size_bytes', sortOrder: -1 });

    expect(assetsClient.getTracksPage).toHaveBeenCalledOnceWith(2, 10, '', 'size_bytes', 'desc');
    expect(component.totalRecords).toBe(1);
    expect(component.first).toBe(10);
    expect(component.sortDirection).toBe('desc');
  });

  it('supports visible-page selection and blocks deletion for active usage', () => {
    const active = makeTrack(1, 1);
    component.tracks = [active];

    component.toggleVisibleSelection(true);

    expect(component.allVisibleSelected).toBeTrue();
    expect(component.bulkDeleteDisabled).toBeTrue();
    component.deleteSelected();
    expect(confirmationService.confirm).not.toHaveBeenCalled();
  });

  it('warns about historical references and deletes after confirmation', () => {
    const historical = makeTrack(0, 2);
    component.tracks = [historical];
    component.selectedTracks = [historical];
    assetsClient.deleteTracks.and.returnValue(of(['track.wav']));
    assetsClient.getTracksPage.and.returnValue(of({ items: [], total: 0, page: 1, pageSize: 25 }));

    component.deleteSelected();
    const confirmation = confirmationService.confirm.calls.mostRecent().args[0];
    expect(confirmation.message).toContain('2 completed or failed run reference(s)');
    confirmation.accept();

    expect(assetsClient.deleteTracks).toHaveBeenCalledOnceWith(['track.wav']);
    expect(component.selectedTracks).toEqual([]);
    expect(messageService.add).toHaveBeenCalledWith(jasmine.objectContaining({ summary: 'Track deleted' }));
  });
});
