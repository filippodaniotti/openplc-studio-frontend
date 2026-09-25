import { FileDescription } from 'tarparser';
import { ModuleType } from '../shared/enums/module-type.enum';
import { Module } from '../shared/interfaces/module.interface';
import {
  extractWorkerName,
  buildModuleInstancePresentations,
  ModuleInstancePresentation,
} from '../shared/utils/module-instance-presentation';

export type TrackSelectionGroup = {
  kind: 'original-track' | 'packet-loss';
  label: string;
  discriminator: string | null;
  children: Array<TrackSelectionGroup | TrackSelectionLeaf>;
};

export type TrackSelectionLeaf = {
  kind: 'original-audio' | 'reconstructed-track';
  name: string;
  label: string;
  discriminator: string | null;
  contextLabel: string;
  trackIndex: number;
  packetLossModuleIndex: number | null;
  plcModuleIndex: number | null;
};

export type TrackSelectionNode = TrackSelectionGroup | TrackSelectionLeaf;

type ParsedReconstructedTrack = {
  track: FileDescription;
  packetLossKey: string;
  plcKey: string;
};

export function buildTrackSelectionTree(
  originalTracks: FileDescription[],
  reconstructedTracks: FileDescription[],
  modules: Pick<Record<ModuleType, Module[]>, ModuleType.PacketLossSimulator | ModuleType.PLCAlgorithm>,
): TrackSelectionGroup[] {
  const packetLossPresentations = buildModuleInstancePresentations(modules[ModuleType.PacketLossSimulator] ?? []);
  const plcPresentations = buildModuleInstancePresentations(modules[ModuleType.PLCAlgorithm] ?? []);
  const reconstructedByOriginalTrack = groupReconstructedTracks(reconstructedTracks);

  return originalTracks.map((originalTrack, trackIndex) => {
    const originalTrackStem = getFileStem(originalTrack.name);
    const reconstructedForTrack = reconstructedByOriginalTrack.get(originalTrackStem) ?? [];
    const packetLossByKey = resolveAssetPresentations(
      reconstructedForTrack.map(({ packetLossKey }) => packetLossKey),
      packetLossPresentations,
    );
    const plcByKey = resolveAssetPresentations(
      reconstructedForTrack.map(({ plcKey }) => plcKey),
      plcPresentations,
    );
    const packetLossGroups = new Map<string, ParsedReconstructedTrack[]>();

    reconstructedForTrack.forEach((reconstructedTrack) => {
      const group = packetLossGroups.get(reconstructedTrack.packetLossKey) ?? [];
      group.push(reconstructedTrack);
      packetLossGroups.set(reconstructedTrack.packetLossKey, group);
    });

    const children: TrackSelectionNode[] = [
      {
        kind: 'original-audio',
        name: originalTrack.name,
        label: 'Original track',
        discriminator: null,
        contextLabel: getFileName(originalTrack.name),
        trackIndex,
        packetLossModuleIndex: null,
        plcModuleIndex: null,
      },
    ];

    packetLossGroups.forEach((reconstructedForPacketLoss, packetLossKey) => {
      const packetLoss = packetLossByKey.get(packetLossKey) ?? fallbackPresentation(packetLossKey, 1);
      const plcLeaves = reconstructedForPacketLoss.map(({ track, plcKey }, plcIndex) => {
        const plc = plcByKey.get(plcKey) ?? fallbackPresentation(plcKey, plcIndex + 1);
        return {
          kind: 'reconstructed-track' as const,
          name: track.name,
          label: plc.name,
          discriminator: plc.discriminator,
          contextLabel: `${getFileName(originalTrack.name)} · ${packetLoss.displayName}`,
          trackIndex,
          packetLossModuleIndex: packetLoss.moduleIndex,
          plcModuleIndex: plc.moduleIndex,
        };
      });

      children.push({
        kind: 'packet-loss',
        label: packetLoss.name,
        discriminator: packetLoss.discriminator,
        children: plcLeaves,
      });
    });

    return {
      kind: 'original-track',
      label: getFileName(originalTrack.name),
      discriminator: null,
      children,
    };
  });
}

function groupReconstructedTracks(reconstructedTracks: FileDescription[]): Map<string, ParsedReconstructedTrack[]> {
  const groups = new Map<string, ParsedReconstructedTrack[]>();

  reconstructedTracks.forEach((track) => {
    const [originalTrack = '', packetLossKey = '', plcKey = ''] = getFileStem(track.name).split('/');
    const group = groups.get(originalTrack) ?? [];
    group.push({ track, packetLossKey, plcKey });
    groups.set(originalTrack, group);
  });

  return groups;
}

function resolveAssetPresentations(
  assetKeys: string[],
  presentations: ModuleInstancePresentation[],
): Map<string, ModuleInstancePresentation> {
  const keysByWorkerName = new Map<string, string[]>();
  assetKeys.forEach((assetKey) => {
    if (!assetKey || keysByWorkerName.get(extractWorkerName(assetKey))?.includes(assetKey)) return;
    const workerName = extractWorkerName(assetKey);
    const keys = keysByWorkerName.get(workerName) ?? [];
    keys.push(assetKey);
    keysByWorkerName.set(workerName, keys);
  });

  const resolved = new Map<string, ModuleInstancePresentation>();
  keysByWorkerName.forEach((keys, workerName) => {
    const candidates = presentations.filter((presentation) => presentation.name === workerName);
    keys.forEach((key, index) => {
      const presentation = candidates[index] ?? (candidates.length === 1 ? candidates[0] : null);
      if (presentation) resolved.set(key, presentation);
    });
  });

  return resolved;
}

function fallbackPresentation(
  assetKey: string,
  index: number,
): Pick<ModuleInstancePresentation, 'name' | 'discriminator' | 'displayName'> & { moduleIndex: number | null } {
  const name = extractWorkerName(assetKey) || 'Unknown module';
  const discriminator = assetKey ? `Instance ${index}` : null;
  return {
    name,
    discriminator,
    displayName: discriminator ? `${name} · ${discriminator}` : name,
    moduleIndex: null,
  };
}

function getFileStem(name: string): string {
  const extensionIndex = name.lastIndexOf('.');
  return extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
}

function getFileName(name: string): string {
  return name.split('/').pop() ?? name;
}
