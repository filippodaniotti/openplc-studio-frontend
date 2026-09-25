import { animate, style, transition, trigger } from '@angular/animations';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { PickListModule } from 'primeng/picklist';
import { SkeletonModule } from 'primeng/skeleton';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { catchError, map } from 'rxjs';
import { AssetsClient } from '../../shared/clients/assets.client';
import { AudioTrackMetadata } from '../../shared/interfaces/audio-track-metadata.interface';
import { TrackUploadComponent } from '../../shared/components/track-upload/track-upload.component';
import {
  AudioTrackMetadataView,
  formatDuration,
  toAudioTrackMetadataView,
} from '../../shared/utils/audio-track-metadata';

export type AudioTrackView = AudioTrackMetadataView;

const fallbackMetadata = (name: string): AudioTrackMetadata => ({
  name,
  sizeBytes: 0,
  durationSeconds: null,
  sampleRate: null,
  channels: null,
  bitDepth: null,
});

@Component({
  selector: 'plc-audio-track-picker',
  templateUrl: './audio-track-picker.component.html',
  styleUrls: ['./audio-track-picker.component.scss'],
  imports: [
    CommonModule,
    ToastModule,
    PickListModule,
    ButtonModule,
    TooltipModule,
    SkeletonModule,
    TrackUploadComponent,
  ],
  providers: [MessageService],
  animations: [
    trigger('uploadPanel', [
      transition(':enter', [
        style({ height: 0, opacity: 0, overflow: 'hidden' }),
        animate('200ms ease-out', style({ height: '*', opacity: 1 })),
      ]),
      transition(':leave', [
        style({ height: '*', opacity: 1, overflow: 'hidden' }),
        animate('180ms ease-in', style({ height: 0, opacity: 0 })),
      ]),
    ]),
  ],
})
export class AudioTrackPickerComponent implements OnInit, OnChanges {
  @Input()
  public audioTracksSelection: string[] = [];

  @Output()
  public audioTracksSelectionChange = new EventEmitter<string[]>();

  public sourceTracks: AudioTrackView[] = [];

  public targetTracks: AudioTrackView[] = [];

  public uploadPanelVisible = false;

  public loading = false;

  private metadata: AudioTrackMetadata[] = [];

  private metadataLoaded = false;

  constructor(
    public readonly filesClient: AssetsClient,
    private readonly messageService: MessageService,
  ) {}

  public ngOnInit(): void {
    this.loadTracks();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    // Ignore the change caused by our own selection emit; only re-partition when
    // the selection was changed from the outside (e.g. loading a saved config).
    if (changes['audioTracksSelection'] && this.metadataLoaded) {
      const current = this.targetTracks.map((track) => track.name).join('\u0000');
      const incoming = (this.audioTracksSelection ?? []).join('\u0000');
      if (current !== incoming) {
        this.partitionTracks();
      }
    }
  }

  public loadTracks(): void {
    this.loading = true;
    this.filesClient
      .getTrackMetadata()
      .pipe(
        catchError(() =>
          this.filesClient
            .getFilenames()
            .pipe(map((filenames: string[]) => filenames.map((name) => fallbackMetadata(name)))),
        ),
      )
      .subscribe({
        next: (tracks: AudioTrackMetadata[]) => {
          this.metadata = tracks;
          this.metadataLoaded = true;
          this.loading = false;
          this.partitionTracks();
        },
        error: () => {
          this.loading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Could not load tracks',
            detail: 'Track information is unavailable. Please try again.',
          });
        },
      });
  }

  public refreshTracks(): void {
    this.loadTracks();
  }

  public toggleUploadPanel(): void {
    this.uploadPanelVisible = !this.uploadPanelVisible;
  }

  public openUploadPanel(): void {
    this.uploadPanelVisible = true;
  }

  public onTracksUploaded(): void {
    this.uploadPanelVisible = false;
    this.loadTracks();
  }

  // PickList mutates `source`/`target` in place, so the arrays are already up to
  // date; we only need to propagate the resulting filename selection.
  public onTracksChanged(): void {
    this.emitSelection();
  }

  public clearSelection(): void {
    this.sourceTracks = [...this.sourceTracks, ...this.targetTracks].sort((a, b) => a.name.localeCompare(b.name));
    this.targetTracks = [];
    this.emitSelection();
  }

  public get selectedTotalDurationLabel(): string {
    const totalSeconds = this.targetTracks.reduce((sum, track) => sum + (track.durationSeconds ?? 0), 0);
    return formatDuration(totalSeconds);
  }

  private emitSelection(): void {
    this.audioTracksSelectionChange.emit(this.targetTracks.map((track) => track.name));
  }

  private partitionTracks(): void {
    const selection = this.audioTracksSelection ?? [];
    const viewsByName = new Map(this.metadata.map((track) => [track.name, this.toView(track)]));

    const target: AudioTrackView[] = [];
    for (const name of selection) {
      target.push(viewsByName.get(name) ?? this.toView(fallbackMetadata(name)));
      viewsByName.delete(name);
    }

    this.targetTracks = target;
    this.sourceTracks = [...viewsByName.values()];
  }

  private toView(track: AudioTrackMetadata): AudioTrackView {
    return toAudioTrackMetadataView(track);
  }
}
