import { NgTemplateOutlet } from '@angular/common';
import { Component, Input } from '@angular/core';
import { ModuleParameter, ModuleParameterSpec } from '../../interfaces/module-parameters.interface';

type SettingLike = ModuleParameter | ModuleParameterSpec;

const advancedNestedAlgorithmOmittedFields = new Set([
  'crossfade',
  'fade_in',
  'crossfade_frequencies',
  'crossover_order',
]);
const optionalChannelFields = new Set(['left', 'right', 'mid', 'side', 'linked']);
const linkedChannelFields = new Set(['linked']);
const midSideChannelFields = new Set(['mid', 'side']);
const leftRightChannelFields = new Set(['left', 'right']);

@Component({
  selector: 'plc-parameter-tree',
  imports: [NgTemplateOutlet],
  templateUrl: './parameter-tree.component.html',
  styleUrl: './parameter-tree.component.scss',
})
export class ParameterTreeComponent {
  @Input() public settings: SettingLike[] | null = null;
  @Input() public filterAdvancedChannels = false;
  @Input() public omitNestedAlgorithmDetails = false;

  public visibleSettings(items: SettingLike[] | null | undefined, nestedAlgorithm: boolean): SettingLike[] {
    if (!Array.isArray(items)) return [];
    if (!this.omitNestedAlgorithmDetails || !nestedAlgorithm) return items;
    return items.filter((setting) => !advancedNestedAlgorithmOmittedFields.has(setting.name));
  }

  public displayValue(setting: SettingLike | null | undefined): any {
    if (!setting) {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(setting, 'value')) {
      return (setting as ModuleParameter).value;
    }
    return (setting as ModuleParameterSpec).default;
  }

  public isArray(value: any): boolean {
    return Array.isArray(value);
  }

  public isModuleLike(value: any): boolean {
    return (
      !!value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value.name === 'string' &&
      Array.isArray(value.settings)
    );
  }

  public isPlainObject(value: any): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value) && !this.isModuleLike(value);
  }

  public isScalarArray(value: any): boolean {
    return Array.isArray(value) && value.every((item) => item === null || typeof item !== 'object');
  }

  public entries(value: any): { key: string; value: any }[] {
    if (!value || typeof value !== 'object') {
      return [];
    }
    const selectedChannels = this.selectedAdvancedChannels();
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !selectedChannels || !optionalChannelFields.has(key) || selectedChannels.has(key))
      .map(([key, entryValue]) => ({
        key,
        value: entryValue as any,
      }));
  }

  public formatScalar(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private selectedAdvancedChannels(): ReadonlySet<string> | null {
    if (!this.filterAdvancedChannels) return null;

    const channelLink = this.displayValue(this.settings?.find((setting) => setting.name === 'channel_link'));
    if (channelLink === true || channelLink === 'true') return linkedChannelFields;

    const stereoImageProcessing = this.displayValue(
      this.settings?.find((setting) => setting.name === 'stereo_image_processing'),
    );
    if (stereoImageProcessing === 'mid_side') return midSideChannelFields;
    if (stereoImageProcessing === 'left_right' || stereoImageProcessing === 'dual_mono') {
      return leftRightChannelFields;
    }
    return null;
  }
}
