import { ModuleType } from '../enums/module-type.enum';

export const DOCUMENTATION_BASE_URL = '/api/plctestbench-docs/';

export interface ModuleDocumentationTarget {
  path: string;
  fragment: string;
}

export function documentationTargetUrl(target: ModuleDocumentationTarget | null): string {
  if (!target) return DOCUMENTATION_BASE_URL;

  const segments = target.path ? target.path.replace(/\/$/, '').split('/') : [];
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[:\\?#%]/.test(segment))) {
    throw new Error('Invalid documentation path');
  }
  const path = segments.map(encodeURIComponent).join('/');
  const fragment = target.fragment ? `#${encodeURIComponent(target.fragment)}` : '';
  return `${DOCUMENTATION_BASE_URL}${path ? `${path}/` : ''}${fragment}`;
}

const referencePageByModuleType: Record<ModuleType, string> = {
  [ModuleType.PacketLossSimulator]: 'loss_simulator',
  [ModuleType.PLCAlgorithm]: 'plc_algorithm',
  [ModuleType.OutputAnalyser]: 'output_analyser',
  [ModuleType.CrossfadeSettings]: 'settings',
};

export function moduleDocumentationTarget(moduleType: ModuleType, moduleName: string): ModuleDocumentationTarget {
  const referencePage = referencePageByModuleType[moduleType];
  return {
    path: `reference/${referencePage}/`,
    fragment: `plctestbench.${referencePage}.${moduleName}`,
  };
}
