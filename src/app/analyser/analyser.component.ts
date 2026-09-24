import { Component, ElementRef, ViewChild } from '@angular/core';
import { WavesurferWrapperComponent } from './wavesurfer-wrapper/wavesurfer-wrapper.component';
import { RunsClient } from '../shared/clients/runs.client';
import {
  combineLatest,
  filter,
  from,
  map,
  Observable,
  of,
  ReplaySubject,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs';
import { FileDescription, parseTar } from 'tarparser';
import { AnalysisService, FileDescriptionWithJson, MetricRaw, ReconstructedTrackRaw } from './analysis.service';
import { FormsModule } from '@angular/forms';
import { CascadeSelectModule } from 'primeng/cascadeselect';
import { ActivatedRoute } from '@angular/router';
import Chart from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import { CommonModule } from '@angular/common';
import { SkeletonModule } from 'primeng/skeleton';
import { extractSampleRateFromWavHeader } from '../shared/utils/wavUtils';
import { decodeJson } from './utils';
import { ZoomLensComponent } from './zoom-lens/zoom-lens.component';
import { MetricsComponent } from './metrics/metrics.component';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { RunConfigurationDrawerComponent } from '../shared/components/run-configuration-drawer/run-configuration-drawer.component';
import { RunStatus } from '../shared/enums/run-status.enum';

Chart.register(zoomPlugin);

enum AccordionPanels {
  SPECTROGRAM = 'spectrogram',
  ZOOM_LENS = 'zoomLens',
  METRICS = 'metrics',
}

@Component({
  selector: 'plc-analyser',
  imports: [
    WavesurferWrapperComponent,
    ZoomLensComponent,
    MetricsComponent,
    FormsModule,
    CascadeSelectModule,
    CommonModule,
    SkeletonModule,
    AccordionModule,
    ButtonModule,
    RunConfigurationDrawerComponent,
  ],
  templateUrl: './analyser.component.html',
  styleUrls: ['./analyser.component.scss'],
})
export class AnalyserComponent {
  public runId?: string;

  public originalTracks: FileDescription[] = [];

  public reconstructedTracks: ReconstructedTrackRaw[] = [];

  public sampleMasks: FileDescriptionWithJson[] = [];

  public runFetchDone = new ReplaySubject<void>();

  public originalTracksFetchDone = new ReplaySubject<void>();

  public reconstructedTracksFetchDone = new ReplaySubject<void>();

  public activePanels: string[] = [];

  public AccordionPanels: typeof AccordionPanels = AccordionPanels;

  public configDrawerVisible = false;

  private destroy$ = new Subject<void>();

  public isSpectrogramReady: boolean = false;

  private _spectrogramRef?: ElementRef;

  @ViewChild('spectrogram', { static: false })
  set spectrogramRef(ref: ElementRef | undefined) {
    this._spectrogramRef = ref;
  }

  get spectrogramRef() {
    return this._spectrogramRef;
  }

  constructor(
    private readonly runsClient: RunsClient,
    private readonly route: ActivatedRoute,
    public readonly analysisService: AnalysisService,
  ) {}

  public ngOnInit(): void {
    const runId = this.route.snapshot.paramMap.get('id') || '';

    this.runsClient
      .getRun(runId)
      .pipe(
        tap((run) => this.analysisService.run.next(run)),
        tap(() => this.runFetchDone.next()),
      )
      .subscribe();

    // FETCH ORIGINAL TRACKS
    this.getCompletedRunAssets(runId, 0)
      .pipe(
        take(1),
        switchMap((buf: ArrayBuffer) => from(parseTar(buf))),
        switchMap((files: FileDescription[]) => of(files.filter((f) => f.name !== '././@PaxHeader'))),
        tap((files: FileDescription[]) => {
          this.originalTracks = files;
          this.originalTracks.forEach((t) => {
            const currentMaps = this.analysisService.trackMaps.value;
            this.analysisService.trackMaps.next({ ...currentMaps, [t.name]: t.data });
          });

          this.analysisService.originalTrackSampleRates.next(
            this.originalTracks.map((t) => extractSampleRateFromWavHeader(t.data)),
          );
        }),
        tap(() => this.originalTracksFetchDone.next()),
      )
      .subscribe();

    // FETCH SAMPLE MASKS
    combineLatest([
      this.getCompletedRunAssets(runId, 1).pipe(
        take(1),
        switchMap((buf) => from(parseTar(buf))),
        switchMap((files: FileDescription[]) => of(files.filter((f) => f.name !== '././@PaxHeader'))),
        map((files: FileDescription[]) => files.map(decodeJson)),
      ),
      this.originalTracksFetchDone.asObservable(),
    ])
      .pipe(
        map(([files]: [FileDescriptionWithJson[], void]) =>
          files.map(({ json, ...rest }, index: number) => ({
            json: json.filter(
              (value: any) =>
                value %
                  this.analysisService.sampleMaskPacketSizes[
                    index % (this.analysisService.run.value?.tracks.length ?? 0)
                  ] ===
                0,
            ),
            ...rest,
          })),
        ),
        tap((files: FileDescriptionWithJson[]) => (this.sampleMasks = files)),
        tap((files: FileDescriptionWithJson[]) => {
          const sampleMaskMaps: Record<string, number[]> = {};
          files.forEach((m: FileDescriptionWithJson) => {
            sampleMaskMaps[m.name.split('.')[0]] = m.json;
          });
          this.analysisService.sampleMaskMaps.next(sampleMaskMaps);
        }),
        tap(() => {
          const leftBoundsArr: number[][] = [];
          const rightBoundsArr: number[][] = [];

          this.sampleMasks.forEach((maskPacket, i) => {
            const json = maskPacket?.json;
            const packetSize = this.analysisService.sampleMaskPacketSizes[i];
            const [left, right] = this.analysisService.calculatePacketBurstBounds(json, packetSize);
            leftBoundsArr.push(left);
            rightBoundsArr.push(right);
          });

          this.analysisService.packetBurstsLeftBounds.next(leftBoundsArr);
          this.analysisService.packetBurstsRightBounds.next(rightBoundsArr);
        }),
      )
      .subscribe();

    // FETCH RECONSTRUCTED TRACKS
    combineLatest([
      this.getCompletedRunAssets(runId, 2).pipe(
        take(1),
        switchMap((buf: ArrayBuffer) => from(parseTar(buf))),
        switchMap((files: FileDescription[]) => of(files.filter((f) => f.name !== '././@PaxHeader'))),
      ),
      this.originalTracksFetchDone.asObservable(),
    ])
      .pipe(
        tap(([files]: [FileDescription[], void]) => {
          this.reconstructedTracks = files.map((f, i) => ({ ...f, index: i }));
          this.reconstructedTracks.forEach((t) => {
            const currentMaps = this.analysisService.trackMaps.value;
            this.analysisService.trackMaps.next({ ...currentMaps, [t.name]: t.data });
          });

          const tracks = this.originalTracks.reduce(
            (acc, { name }) => {
              acc[name.split('.')[0]] = { reconstructedTracks: [{ name }] };
              return acc;
            },
            {} as Record<string, { reconstructedTracks: { name: string }[] }>,
          );

          this.reconstructedTracks.forEach((t: FileDescription) => {
            const originalTrackStem = t.name.split('/')[0];
            if (Object.keys(tracks).includes(originalTrackStem)) {
              tracks[originalTrackStem].reconstructedTracks.push({ name: t.name });
            }
          });

          this.analysisService.trackGroups.next(
            Object.keys(tracks).map((key) => ({
              originalTrack: key,
              reconstructedTracks: tracks[key].reconstructedTracks,
            })),
          );
        }),
        tap(() => this.onTrackChange(this.originalTracks[0])),
        tap(() => this.reconstructedTracksFetchDone.next()),
      )
      .subscribe();

    // FETCH METRICS
    combineLatest([
      this.getCompletedRunAssets(runId, 3).pipe(
        take(1),
        switchMap((buf) => from(parseTar(buf))),
        switchMap((files: FileDescription[]) => of(files.filter((f) => f.name !== '././@PaxHeader'))),
        map((files: FileDescription[]) => files.map(decodeJson)),
      ),
      this.reconstructedTracksFetchDone.asObservable(),
    ])
      .pipe(
        map(([parsedFiles]: [FileDescriptionWithJson[], void]) => parsedFiles.map((m, i) => ({ ...m, index: i }))),
        tap((parsedFiles: MetricRaw[]) => {
          const trackGroups = this.analysisService.trackGroups.value;
          const trackToMetricsMap: Record<string, MetricRaw[]> = {};

          trackGroups.forEach((group) => {
            group.reconstructedTracks.forEach((reconstructedTrack) => {
              const reconstructedTrackName = reconstructedTrack.name.split('.')[0];

              const matchingMetrics = parsedFiles.filter((file) => {
                const parts = file.name.split('/');
                parts.pop();
                const parentReconstructedTrackName = parts.join('/');
                return parentReconstructedTrackName === reconstructedTrackName;
              });

              if (Array.isArray(matchingMetrics) && matchingMetrics.length > 0)
                trackToMetricsMap[reconstructedTrackName] = matchingMetrics;
            });
          });
          this.analysisService.playbaleTrackToMetricsMap.next(trackToMetricsMap);
        }),
        tap((parsedFiles: MetricRaw[]) => this.analysisService.metrics.next(parsedFiles)),
      )
      .subscribe();

    this.analysisService.selectedTrackPlayback
      .asObservable()
      .pipe(
        takeUntil(this.destroy$),
        filter((track): track is { name: string } => !!track && !!track.name),
        tap((track) => this.onTrackChange(track)),
      )
      .subscribe();

    this.analysisService.selectedPacketBounds
      .asObservable()
      .pipe(
        takeUntil(this.destroy$),
        filter((bounds: number[]) => Array.isArray(bounds) && bounds.length === 2),
        tap(() => this.openPanel(AccordionPanels.ZOOM_LENS)),
      )
      .subscribe();
  }

  private getCompletedRunAssets(runId: string, depth: number): Observable<ArrayBuffer> {
    return this.runFetchDone.pipe(
      take(1),
      filter(() => this.analysisService.run.value?.status === RunStatus.COMPLETED),
      switchMap(() => this.runsClient.getRunAssets(runId, depth)),
    );
  }

  public ngAfterViewInit() {
    this.analysisService.spectrogramWrapper
      .asObservable()
      .pipe(
        takeUntil(this.destroy$),
        filter((wrapper: HTMLElement | null) => !!wrapper),
        tap((wrapper: HTMLElement) => this.spectrogramRef?.nativeElement.appendChild(wrapper)),
        tap(() => (this.isSpectrogramReady = true)),
      )
      .subscribe();
  }

  public onTrackChange(track: { name: string } | null): void {
    if (!track || !track.name) {
      return;
    }

    this.isSpectrogramReady = false;

    this.analysisService.selectedPacketBounds.next([]);

    const trackNameSplit = track.name.split('.')[0].split('/');
    const trackNameStem = trackNameSplit[0];
    this.analysisService.selectedOriginalTrack.next(trackNameStem);

    const trackData = this.analysisService.trackMaps.value[track.name];
    this.analysisService.selectedTrackPlaybackSampleRate.next(extractSampleRateFromWavHeader(trackData));

    const audioBuffer = new Uint8Array(trackData);
    const blob = new Blob([audioBuffer], { type: 'audio/wave' });
    this.analysisService.setAudioBlob(blob);

    if (trackNameSplit.length > 1) {
      const sampleMaskName = trackNameSplit[1];
      const sampleMaskIndex = Object.keys(this.analysisService.sampleMaskMaps.value ?? {}).indexOf(sampleMaskName);
      this.analysisService.selectedSampleMaskIndex.next(sampleMaskIndex);
    }
  }

  public openPanel(value: AccordionPanels): void {
    if (!this.activePanels.includes(value)) {
      this.activePanels = [...this.activePanels, value];
    }
  }

  public openOnly(value: AccordionPanels): void {
    this.activePanels = [value];
  }

  public closePanel(value: AccordionPanels): void {
    this.activePanels = this.activePanels.filter((v) => v !== value);
  }

  public ngOnDestroy(): void {
    this.analysisService.resetAnalyzerData();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
