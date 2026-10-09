import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Run } from '../shared/interfaces/run.interface';
import { FileDescription } from 'tarparser';
import { Module } from '../shared/interfaces/module.interface';
import { ModuleParameter } from '../shared/interfaces/module-parameters.interface';
import { ModuleType } from '../shared/enums/module-type.enum';
import { extractWorkerName } from '../shared/utils/module-instance-presentation';

export interface HumanMetricPayload {
  kind: 'human-listening';
  schema_version: number;
  status: 'prepared' | 'finalized';
  study_id: string | null;
  condition_id: string;
  excerpts: { response_count: number; mean: number | null; std: number | null }[];
}

export function isHumanMetricPayload(value: unknown): value is HumanMetricPayload {
  if (typeof value !== 'object' || value === null || !('kind' in value) || value.kind !== 'human-listening')
    return false;
  return (
    'schema_version' in value &&
    value.schema_version === 1 &&
    'status' in value &&
    (value.status === 'prepared' || value.status === 'finalized') &&
    'study_id' in value &&
    (value.study_id === null || typeof value.study_id === 'string') &&
    'condition_id' in value &&
    typeof value.condition_id === 'string' &&
    'excerpts' in value &&
    Array.isArray(value.excerpts)
  );
}

export type JsonPayload = number | number[] | number[][] | HumanMetricPayload;

export type FileDescriptionWithJson<T = JsonPayload> = Omit<FileDescription, 'data' | 'text'> & { json: T };

export type MetricRaw = FileDescriptionWithJson<JsonPayload> & { index: number };

export type ReconstructedTrackRaw = FileDescription & { index: number };

export type TrackGroup = { originalTrack: string; reconstructedTracks: { name: string }[] };

export type PlaybackTrack = {
  name: string;
  kind?: 'original-audio' | 'reconstructed-track';
  sampleMaskKey?: string | null;
};

type RunModuleType = Exclude<ModuleType, ModuleType.CrossfadeSettings>;

@Injectable({
  providedIn: 'root',
})
export class AnalysisService {
  public run = new BehaviorSubject<Run | null>(null);

  public metrics = new BehaviorSubject<MetricRaw[]>([]);

  public selectedOriginalTrack = new BehaviorSubject<string>('');

  public trackGroups = new BehaviorSubject<TrackGroup[]>([]);

  public trackMaps = new BehaviorSubject<Record<string, Uint8Array>>({});

  public playbaleTrackToMetricsMap = new BehaviorSubject<Record<string, MetricRaw[]>>({});

  private currentAudioBlobSubject = new BehaviorSubject<Blob | null>(null);

  public packetBurstsLeftBounds = new BehaviorSubject<number[][]>([]);

  public packetBurstsRightBounds = new BehaviorSubject<number[][]>([]);

  public originalTrackSampleRates = new BehaviorSubject<number[]>([]);

  public selectedSampleMaskIndex = new BehaviorSubject<number>(-1);

  public selectedPacketBounds = new BehaviorSubject<number[]>([]);

  public selectedTrackPlayback = new BehaviorSubject<PlaybackTrack | null>(null);

  public selectedTrackPlaybackSampleRate = new BehaviorSubject<number>(-1);

  public sampleMaskMaps = new BehaviorSubject<Record<string, number[]> | null>(null);

  public wsZoomBounds = new BehaviorSubject<number[]>([]);

  public spectrogramWrapper = new BehaviorSubject<HTMLElement | null>(null);

  public get audioBlob$(): Observable<Blob | null> {
    return this.currentAudioBlobSubject.asObservable();
  }

  public get currentAudioBlob(): Blob | null {
    return this.currentAudioBlobSubject.value;
  }

  /**
   * Resolve the configured module that produced a given asset. Asset file names
   * embed the producing worker name (`<Worker>-<hash>`). Match on the worker
   * name first; disambiguate duplicates (or plugins with unexpected names) with
   * the position of the asset within its track group, then fall back to the sole
   * configured module. Note: the hash cannot be matched against `node_ids`
   * because paths hash the settings before parent inheritance while node ids
   * hash them after.
   */
  public resolveModule(
    moduleType: RunModuleType,
    assetKey: string,
    fallbackIndex: number | null = null,
  ): Module | null {
    const modules = this.run.value?.modules?.[moduleType] ?? [];
    if (!assetKey) {
      return modules.length === 1 ? modules[0] : null;
    }

    const workerName = extractWorkerName(assetKey);
    const byName = modules.filter((module) => module.name === workerName);
    if (byName.length === 1) {
      return byName[0];
    }

    if (fallbackIndex !== null && fallbackIndex >= 0 && fallbackIndex < modules.length) {
      return modules[fallbackIndex];
    }

    return modules.length === 1 ? modules[0] : null;
  }

  public resolvePacketLossModuleForTrack(trackName: string, fallbackIndex: number | null = null): Module | null {
    return this.resolveModule(
      ModuleType.PacketLossSimulator,
      this.parseTrackName(trackName).sampleMaskKey,
      fallbackIndex,
    );
  }

  public resolvePlcModuleForTrack(trackName: string, fallbackIndex: number | null = null): Module | null {
    return this.resolveModule(ModuleType.PLCAlgorithm, this.parseTrackName(trackName).plcKey, fallbackIndex);
  }

  public resolveOutputAnalyserModuleForMetric(metricName: string, fallbackIndex: number | null = null): Module | null {
    const segments = metricName.split('/');
    const assetKey = (segments.at(-1) ?? '').split('.')[0];
    return this.resolveModule(ModuleType.OutputAnalyser, assetKey, fallbackIndex);
  }

  public getModuleSettingValue(module: Module | null, settingName: string): any {
    return module?.settings.find((setting) => setting.name === settingName)?.value;
  }

  public parseTrackName(name: string): {
    originalTrack: string;
    sampleMaskKey: string;
    plcKey: string;
  } {
    const segments = name.split('.')[0].split('/');
    return {
      originalTrack: segments[0] ?? '',
      sampleMaskKey: segments[1] ?? '',
      plcKey: segments[2] ?? '',
    };
  }

  public resolveSampleMaskIndexForTrack(track: PlaybackTrack | null): number {
    if (track?.kind !== 'reconstructed-track' || !track.sampleMaskKey) return -1;
    return Object.keys(this.sampleMaskMaps.value ?? {}).indexOf(track.sampleMaskKey);
  }

  public setAudioBlob(blob: Blob | null): void {
    this.currentAudioBlobSubject.next(blob);
  }

  public clearAudioBlob(): void {
    this.currentAudioBlobSubject.next(null);
  }

  get sampleMaskPacketSizes(): number[] {
    return (
      this.run.value?.modules[ModuleType.PacketLossSimulator].map(
        (m: Module) => m.settings.filter((mp: ModuleParameter) => mp.name === 'packet_size')[0].value,
      ) ?? []
    );
  }

  public calculatePacketBurstBounds(sampleMask: number[], packetSize: number): number[][] {
    if (!sampleMask || sampleMask.length === 0) {
      return [[], []];
    }

    const leftBounds: number[] = [];
    const rightBounds: number[] = [];

    sampleMask.forEach((packetPosition: number, index: number) => {
      const isFirstPacket = index === 0;
      const isLastPacket = index === sampleMask.length - 1;
      const previousPacket = sampleMask[index - 1];
      const nextPacket = sampleMask[index + 1];

      if (isFirstPacket) {
        leftBounds.push(packetPosition);
      }

      if (isLastPacket) {
        rightBounds.push(packetPosition + packetSize);
      }

      if (!isFirstPacket && this.isPacketGap(packetPosition, previousPacket, packetSize)) {
        leftBounds.push(packetPosition);
      }

      if (!isLastPacket && this.isPacketGap(packetPosition, nextPacket, packetSize)) {
        rightBounds.push(packetPosition + packetSize);
      }
    });

    return [leftBounds, rightBounds];
  }

  private isPacketGap(currentPacket: number, otherPacket: number, packetSize: number): boolean {
    return Math.abs(currentPacket - otherPacket) > packetSize;
  }

  public resetAnalyzerData() {
    this.run.next(null);
    this.selectedOriginalTrack.next('');
    this.trackGroups.next([]);
    this.trackMaps.next({});
    this.packetBurstsLeftBounds.next([]);
    this.packetBurstsRightBounds.next([]);
    this.originalTrackSampleRates.next([]);
    this.selectedSampleMaskIndex.next(-1);
    this.selectedPacketBounds.next([]);
    this.selectedTrackPlayback.next(null);
    this.selectedTrackPlaybackSampleRate.next(-1);
    this.sampleMaskMaps.next(null);
    this.metrics.next([]);
    this.wsZoomBounds.next([]);
    this.playbaleTrackToMetricsMap.next({});
    this.spectrogramWrapper.next(null);
    this.setAudioBlob(null);
  }
}
