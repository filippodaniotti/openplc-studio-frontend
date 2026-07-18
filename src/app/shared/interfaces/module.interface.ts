import { ModuleParameter, ModuleParameterSpec } from './module-parameters.interface';

export interface Module {
  name: string;
  node_ids?: string[];
  settings: (ModuleParameter | ModuleParameterSpec)[];
}
