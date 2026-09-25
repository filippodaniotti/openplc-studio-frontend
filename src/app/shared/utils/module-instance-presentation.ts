import { Module } from '../interfaces/module.interface';
import { ModuleParameter, ModuleParameterSpec, SettingValue } from '../interfaces/module-parameters.interface';

export type ModuleInstancePresentation = {
  module: Module;
  moduleIndex: number;
  name: string;
  discriminator: string | null;
  displayName: string;
};

type FlatSetting = {
  path: string;
  value: SettingValue | undefined;
};

const MAX_DISPLAY_SETTINGS = 2;
const MAX_DISPLAY_VALUE_LENGTH = 32;

export function buildModuleInstancePresentations(modules: Module[]): ModuleInstancePresentation[] {
  const discriminatorByIndex = new Map<number, string | null>();
  const groups = new Map<string, Array<{ module: Module; moduleIndex: number }>>();

  modules.forEach((module, moduleIndex) => {
    const group = groups.get(module.name) ?? [];
    group.push({ module, moduleIndex });
    groups.set(module.name, group);
  });

  groups.forEach((group) => {
    if (group.length === 1) {
      discriminatorByIndex.set(group[0].moduleIndex, null);
      return;
    }

    buildDiscriminators(group.map(({ module }) => module)).forEach((discriminator, index) => {
      discriminatorByIndex.set(group[index].moduleIndex, discriminator);
    });
  });

  return modules.map((module, moduleIndex) => {
    const discriminator = discriminatorByIndex.get(moduleIndex) ?? null;
    return {
      module,
      moduleIndex,
      name: module.name,
      discriminator,
      displayName: discriminator ? `${module.name} · ${discriminator}` : module.name,
    };
  });
}

export function extractWorkerName(assetKey: string): string {
  const leaf = assetKey.split('/').pop() ?? '';
  const extensionIndex = leaf.lastIndexOf('.');
  const stem = extensionIndex > 0 ? leaf.slice(0, extensionIndex) : leaf;
  const separatorIndex = stem.lastIndexOf('-');
  return separatorIndex > 0 ? stem.slice(0, separatorIndex) : stem;
}

function buildDiscriminators(modules: Module[]): string[] {
  const flattenedSettings = modules.map(flattenModuleSettings);
  const paths = getOrderedPaths(flattenedSettings);
  const varyingPaths = paths.filter((path) => {
    const values = flattenedSettings.map((settings) => serializeSettingValue(findValue(settings, path)));
    return new Set(values).size > 1;
  });
  const selectedPaths = varyingPaths.slice(0, MAX_DISPLAY_SETTINGS);
  const rawSignatures = flattenedSettings.map((settings) => buildSignature(settings, selectedPaths));
  const formattedSignatures = flattenedSettings.map((settings) =>
    selectedPaths.map((path) => `${path}=${formatSettingValue(findValue(settings, path))}`).join(' · '),
  );
  const collisionCounts = countValues(rawSignatures);
  const collisionIndexes = new Map<string, number>();

  return rawSignatures.map((signature, index) => {
    if ((collisionCounts.get(signature) ?? 0) === 1) return formattedSignatures[index];

    const instance = (collisionIndexes.get(signature) ?? 0) + 1;
    collisionIndexes.set(signature, instance);
    return [formattedSignatures[index], `Instance ${instance}`].filter(Boolean).join(' · ');
  });
}

function flattenModuleSettings(module: Module): FlatSetting[] {
  return module.settings.flatMap((setting) => flattenValue(setting.name, getSettingValue(setting)));
}

function flattenValue(path: string, value: SettingValue | undefined): FlatSetting[] {
  if (value === undefined || value === null || typeof value !== 'object') return [{ path, value }];

  if (Array.isArray(value)) {
    if (value.length === 0 || value.every((item) => item === null || typeof item !== 'object')) {
      return [{ path, value }];
    }

    return value.flatMap((item, index) => flattenValue(value.length === 1 ? path : `${path}[${index}]`, item));
  }

  if (isModuleValue(value)) {
    const flattened: FlatSetting[] = [{ path, value: value.name }];
    return [
      ...flattened,
      ...value.settings.flatMap((setting) => flattenValue(`${path}.${setting.name}`, getSettingValue(setting))),
    ];
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return [{ path, value }];
  return entries.flatMap(([key, child]) => flattenValue(`${path}.${key}`, child));
}

function isModuleValue(value: Record<string, SettingValue>): value is Record<string, SettingValue> & {
  name: string;
  settings: Array<ModuleParameter | ModuleParameterSpec>;
} {
  return typeof value['name'] === 'string' && Array.isArray(value['settings']);
}

function getSettingValue(setting: ModuleParameter | ModuleParameterSpec): SettingValue | undefined {
  if ('default' in setting) return setting.value ?? (setting.default as SettingValue);
  return setting.value as SettingValue | undefined;
}

function getOrderedPaths(settings: FlatSetting[][]): string[] {
  const paths = new Set<string>();
  settings.forEach((items) => items.forEach(({ path }) => paths.add(path)));
  return [...paths];
}

function findValue(settings: FlatSetting[], path: string): SettingValue | undefined {
  return settings.find((setting) => setting.path === path)?.value;
}

function buildSignature(settings: FlatSetting[], paths: string[]): string {
  return paths.map((path) => serializeSettingValue(findValue(settings, path))).join('|');
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
}

function serializeSettingValue(value: SettingValue | undefined): string {
  return stableStringify(value);
}

function formatSettingValue(value: SettingValue | undefined): string {
  let formatted: string;
  if (value === null) formatted = 'default';
  else if (value === undefined) formatted = 'unset';
  else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    formatted = String(value);
  } else {
    formatted = stableStringify(value);
  }

  return formatted.length > MAX_DISPLAY_VALUE_LENGTH
    ? `${formatted.slice(0, MAX_DISPLAY_VALUE_LENGTH - 1)}…`
    : formatted;
}

function stableStringify(value: SettingValue | undefined): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(',')}}`;
}
