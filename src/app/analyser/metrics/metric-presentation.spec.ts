import { ModuleType } from '../../shared/enums/module-type.enum';
import { Module } from '../../shared/interfaces/module.interface';
import { ThemeService } from '../../shared/services/theme.service';
import { AnalysisService, MetricRaw } from '../analysis.service';
import { metricLabelTransform } from './metric-label.pipe';
import { buildMetricPresentations } from './metric-presentation';
import { MetricsComponent } from './metrics.component';

describe('metric presentation', () => {
  it('shows only the calculator name for a unique metric', () => {
    const modules = [createModule('MSECalculator', { N: 1024, hop: 512 })];

    const presentations = buildPresentations([createMetric('MSECalculator-38759128395632.json', 0)], modules);

    expect(presentations[0].calculatorName).toBe('MSECalculator');
    expect(presentations[0].discriminator).toBeNull();
    expect(presentations[0].displayName).toBe('MSECalculator');
    expect(presentations[0].moduleIndex).toBe(0);
  });

  it('uses the first differing setting that uniquely identifies duplicate calculators', () => {
    const modules = [
      createModule('MSECalculator', { N: 1024, hop: 512, amp_scale: 1 }),
      createModule('MSECalculator', { N: 2048, hop: 512, amp_scale: 1 }),
    ];

    const presentations = buildPresentations(
      [createMetric('MSECalculator-first.json', 0), createMetric('MSECalculator-second.json', 1)],
      modules,
    );

    expect(presentations.map((metric) => metric.discriminator)).toEqual(['N=1024', 'N=2048']);
    expect(presentations.map((metric) => metric.displayName)).toEqual([
      'MSECalculator · N=1024',
      'MSECalculator · N=2048',
    ]);
  });

  it('adds settings until every duplicate configuration has a unique signature', () => {
    const modules = [
      createModule('MSECalculator', { N: 1024, hop: 256 }),
      createModule('MSECalculator', { N: 1024, hop: 512 }),
      createModule('MSECalculator', { N: 2048, hop: 512 }),
    ];

    const presentations = buildPresentations(
      [
        createMetric('MSECalculator-first.json', 0),
        createMetric('MSECalculator-second.json', 1),
        createMetric('MSECalculator-third.json', 2),
      ],
      modules,
    );

    expect(presentations.map((metric) => metric.discriminator)).toEqual([
      'N=1024 · hop=256',
      'N=1024 · hop=512',
      'N=2048 · hop=512',
    ]);
  });

  it('uses stable instance numbers when settings are identical', () => {
    const modules = [
      createModule('MSECalculator', { N: 1024, hop: 512 }),
      createModule('MSECalculator', { N: 1024, hop: 512 }),
    ];

    const presentations = buildPresentations(
      [createMetric('MSECalculator-first.json', 0), createMetric('MSECalculator-second.json', 1)],
      modules,
    );

    expect(presentations.map((metric) => metric.discriminator)).toEqual(['Instance 1', 'Instance 2']);
  });

  it('falls back to instance numbers when configured modules cannot be resolved', () => {
    const metrics = [createMetric('PluginCalculator-first.json', 4), createMetric('PluginCalculator-second.json', 9)];

    const presentations = buildMetricPresentations(metrics, [], () => null);

    expect(presentations.map((metric) => metric.calculatorName)).toEqual(['PluginCalculator', 'PluginCalculator']);
    expect(presentations.map((metric) => metric.discriminator)).toEqual(['Instance 1', 'Instance 2']);
    expect(presentations.map((metric) => metric.index)).toEqual([4, 9]);
  });
});

describe('metricLabelTransform', () => {
  it('removes the asset path, extension, and final hash suffix', () => {
    expect(metricLabelTransform('track/mask/plc/MSECalculator-38759128395632.json')).toBe('MSECalculator');
    expect(metricLabelTransform('track/mask/plc/Custom-Metric-123.json')).toBe('Custom-Metric');
  });
});

describe('MetricsComponent metric configuration focus', () => {
  it('focuses the output analyser instance associated with the clicked metric', () => {
    const component = new MetricsComponent(new AnalysisService(), new ThemeService());
    const metric = buildPresentations(
      [createMetric('MSECalculator-first.json', 0), createMetric('MSECalculator-second.json', 1)],
      [createModule('MSECalculator', { N: 1024 }), createModule('MSECalculator', { N: 2048 })],
    )[1];

    component.openMetricConfiguration(metric);

    expect(component.focusedOutputAnalyserModule).toEqual({ type: ModuleType.OutputAnalyser, index: 1 });
    expect(component.configDrawerVisible).toBeTrue();
  });
});

function buildPresentations(metrics: MetricRaw[], modules: Module[]) {
  return buildMetricPresentations(metrics, modules, (_metric, fallbackIndex) => modules[fallbackIndex] ?? null);
}

function createMetric(fileName: string, index: number): MetricRaw {
  return {
    name: `track/mask/plc/${fileName}`,
    type: 'file',
    size: 0,
    attrs: { mode: '', uid: 0, gid: 0, mtime: 0, user: '', group: '' },
    index,
    json: [],
  };
}

function createModule(name: string, settings: Record<string, string | number | boolean | null>): Module {
  return {
    name,
    settings: Object.entries(settings).map(([settingName, value]) => ({ name: settingName, value })),
  };
}
