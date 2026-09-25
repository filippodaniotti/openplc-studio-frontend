import { FileDescription } from 'tarparser';
import { ModuleType } from '../shared/enums/module-type.enum';
import { Module } from '../shared/interfaces/module.interface';
import { SettingValue } from '../shared/interfaces/module-parameters.interface';
import { buildModuleInstancePresentations } from '../shared/utils/module-instance-presentation';
import { TrackSelectionGroup, TrackSelectionLeaf, buildTrackSelectionTree } from './track-selection';

describe('track selection tree', () => {
  const modules = {
    [ModuleType.PacketLossSimulator]: [
      createModule('BinomialPLS', { per: 0.1, packet_size: 32 }),
      createModule('BinomialPLS', { per: 0.2, packet_size: 32 }),
    ],
    [ModuleType.PLCAlgorithm]: [createModule('ZerosPLC', { fade_in: 4 }), createModule('ZerosPLC', { fade_in: 8 })],
  };

  it('builds original track, packet-loss, and PLC selection levels without hashes', () => {
    const tree = buildTrackSelectionTree(
      [createFile('song.wav')],
      [
        createFile('song/BinomialPLS-first/ZerosPLC-first.wav'),
        createFile('song/BinomialPLS-second/ZerosPLC-second.wav'),
      ],
      modules,
    );

    expect(tree[0].label).toBe('song.wav');
    expect(tree[0].children[0]).toEqual(
      jasmine.objectContaining({ kind: 'original-audio', label: 'Original track', contextLabel: 'song.wav' }),
    );
    expect(tree[0].children[1]).toEqual(
      jasmine.objectContaining({ kind: 'packet-loss', label: 'BinomialPLS', discriminator: 'per=0.1' }),
    );
    expect(tree[0].children[2]).toEqual(
      jasmine.objectContaining({ kind: 'packet-loss', label: 'BinomialPLS', discriminator: 'per=0.2' }),
    );

    const firstPlc = (tree[0].children[1] as TrackSelectionGroup).children[0] as TrackSelectionLeaf;
    expect(firstPlc).toEqual(
      jasmine.objectContaining({
        kind: 'reconstructed-track',
        name: 'song/BinomialPLS-first/ZerosPLC-first.wav',
        label: 'ZerosPLC',
        discriminator: 'fade_in=4',
        contextLabel: 'song.wav · BinomialPLS · per=0.1',
        trackIndex: 0,
        packetLossModuleIndex: 0,
        plcModuleIndex: 0,
      }),
    );
  });

  it('keeps source tracks separate and preserves their raw playback names', () => {
    const tree = buildTrackSelectionTree(
      [createFile('first.wav'), createFile('second.wav')],
      [createFile('second/BinomialPLS-first/ZerosPLC-first.wav')],
      modules,
    );

    expect(tree.map((group) => group.label)).toEqual(['first.wav', 'second.wav']);
    expect(((tree[1].children[1] as TrackSelectionGroup).children[0] as TrackSelectionLeaf).name).toBe(
      'second/BinomialPLS-first/ZerosPLC-first.wav',
    );
  });

  it('uses clean fallback labels for unknown worker assets', () => {
    const tree = buildTrackSelectionTree(
      [createFile('song.wav')],
      [createFile('song/PluginPLS-123/PluginPLC-456.wav')],
      {
        [ModuleType.PacketLossSimulator]: [],
        [ModuleType.PLCAlgorithm]: [],
      },
    );

    expect(tree[0].children[1]).toEqual(
      jasmine.objectContaining({ kind: 'packet-loss', label: 'PluginPLS', discriminator: 'Instance 1' }),
    );
    expect((tree[0].children[1] as TrackSelectionGroup).children[0]).toEqual(
      jasmine.objectContaining({ label: 'PluginPLC', discriminator: 'Instance 1' }),
    );
  });
});

describe('module instance presentation', () => {
  it('uses compact flattened nested settings to distinguish duplicate modules', () => {
    const presentations = buildModuleInstancePresentations([
      createModule('AdvancedPLC', {
        settings: [{ name: 'ZerosPLC', settings: [{ name: 'fade_in', value: 2 }] }],
        order: 4,
        mode: 'a',
      }),
      createModule('AdvancedPLC', {
        settings: [{ name: 'ZerosPLC', settings: [{ name: 'fade_in', value: 2 }] }],
        order: 4,
        mode: 'b',
      }),
      createModule('AdvancedPLC', {
        settings: [{ name: 'ZerosPLC', settings: [{ name: 'fade_in', value: 3 }] }],
        order: 4,
        mode: 'b',
      }),
    ]);

    expect(presentations.map((presentation) => presentation.discriminator)).toEqual([
      'settings.fade_in=2 · mode=a',
      'settings.fade_in=2 · mode=b',
      'settings.fade_in=3 · mode=b',
    ]);
  });
});

function createFile(name: string): FileDescription {
  return {
    name,
    type: 'file',
    size: 0,
    data: new Uint8Array(),
    text: '',
    attrs: { mode: '', uid: 0, gid: 0, mtime: 0, user: '', group: '' },
  };
}

function createModule(name: string, settings: Record<string, SettingValue>): Module {
  return {
    name,
    settings: Object.entries(settings).map(([settingName, value]) => ({ name: settingName, value })),
  };
}
