import { ModuleType } from '../../shared/enums/module-type.enum';
import { Module } from '../../shared/interfaces/module.interface';
import { BehaviorSubject } from 'rxjs';
import { AnalysisService, JsonPayload, MetricRaw } from '../analysis.service';
import { metricLabelTransform } from './metric-label.pipe';
import { addPendingHumanMetric, buildMetricPresentations } from './metric-presentation';
import { MetricsComponent } from './metrics.component';
import { ListeningClient } from '../../listening-studies/listening.client';

describe('metric presentation', () => {
  it('keeps a pending HumanCalculator selectable when ready-only exports omit its artifact', () => {
    const modules = [createModule('HumanCalculator', {})];
    const options = addPendingHumanMetric([], modules);
    expect(options.length).toBe(1);
    expect(options[0].calculatorName).toBe('HumanCalculator');
    expect(options[0].moduleIndex).toBe(0);
    expect(addPendingHumanMetric(options, modules).length).toBe(1);
    expect(addPendingHumanMetric([], [])).toEqual([]);
  });
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
    expect(metricLabelTransform('track/mask/plc/MSECalculator--38759128395632.json')).toBe('MSECalculator');
    expect(metricLabelTransform('track/mask/plc/Custom-Metric-123.json')).toBe('Custom-Metric');
  });
});

describe('MetricsComponent scalar metric visualization', () => {
  function createComponent(): MetricsComponent {
    return new MetricsComponent(
      new AnalysisService(),
      {
        isDarkMode: new BehaviorSubject(false),
      } as any,
      {} as ListeningClient,
    );
  }

  it('shows human analysis only while HumanCalculator is selected', () => {
    const component = createComponent();
    expect(component.humanMetricSelected).toBeFalse();
    component.displayMetrics = addPendingHumanMetric([], [createModule('HumanCalculator', {})]);
    expect(component.humanMetricSelected).toBeTrue();
    component.displayMetrics = [];
    expect(component.humanMetricSelected).toBeFalse();
  });

  it('shows a completion notice instead of visualizing pending human ratings', () => {
    const metric = addPendingHumanMetric([], [createModule('HumanCalculator', {})])[0];
    const visualization = (createComponent() as any).buildVisualization(metric, 0);
    expect(visualization.kind).toBe('unsupported');
    expect(visualization.message).toContain('listening study is not completed');
    expect(visualization.message).toContain('Study Hub');
  });

  it('builds a PLCMOS score card on the MOS scale', () => {
    const metric = buildPresentations(
      [createMetric('PLCMOSCalculator-score.json', 0, 3.875)],
      [createModule('PLCMOSCalculator', { plcmos_model: '2', request_intrusive: true })],
    )[0];
    const visualization = (createComponent() as any).buildVisualization(metric, 0);

    expect(visualization.kind).toBe('scalar');
    expect(visualization.scores[0].formattedValue).toBe('3.875');
    expect(visualization.scores[0].scoreLabel).toBe('MOS');
    expect(visualization.scores[0].rangeLabel).toBe('1–5');
    expect(visualization.options.scales.x.min).toBe(1);
    expect(visualization.options.scales.x.max).toBe(5);
  });

  it('builds a PESQ score card on the MOS-LQO scale', () => {
    const metric = buildPresentations(
      [createMetric('PESQCalculator-score.json', 0, 4.1254)],
      [createModule('PESQCalculator', { pesq_mode: 'wb' })],
    )[0];
    const visualization = (createComponent() as any).buildVisualization(metric, 0);

    expect(visualization.kind).toBe('scalar');
    expect(visualization.scores[0].formattedValue).toBe('4.125');
    expect(visualization.scores[0].scoreLabel).toBe('MOS-LQO');
    expect(visualization.scores[0].rangeLabel).toBe('-0.5–4.5');
  });

  it('builds a combined, colour-coded PEAQ DI and ODG graph', () => {
    const metric = buildPresentations(
      [createMetric('PEAQCalculator-score.json', 0, [0.125, -1.75])],
      [createModule('PEAQCalculator', { peaq_mode: 'basic' })],
    )[0];
    const visualization = (createComponent() as any).buildVisualization(metric, 0);

    expect(visualization.kind).toBe('scalar');
    expect(visualization.scores.map((score: any) => score.scoreLabel)).toEqual(['DI', 'ODG']);
    expect(visualization.scores.map((score: any) => score.formattedValue)).toEqual(['0.125', '-1.75']);
    expect(visualization.scores.map((score: any) => score.rangeLabel)).toEqual(['-12–3', '-4–0']);
    expect(visualization.data.labels).toEqual(['DI', 'ODG']);
    expect(visualization.data.datasets[0].data).toEqual([0.125, -1.75]);
    expect(visualization.data.datasets[0].backgroundColor[0]).not.toBe(
      visualization.data.datasets[0].backgroundColor[1],
    );
    expect(visualization.options.indexAxis).toBe('y');
    expect(visualization.options.scales.y.display).not.toBeFalse();
  });

  it('labels a single-channel time series Mono and preserves stereo labels', () => {
    const component = createComponent();
    const mono = buildPresentations(
      [createMetric('MSECalculator-mono.json', 0, [[0.1, 0.2]])],
      [createModule('MSECalculator', {})],
    )[0];
    const stereo = buildPresentations(
      [createMetric('MSECalculator-stereo.json', 0, [[0.1], [0.2]])],
      [createModule('MSECalculator', {})],
    )[0];

    expect((component as any).buildVisualization(mono, 0).data.datasets.map((dataset: any) => dataset.label)).toEqual([
      'Mono',
    ]);
    expect((component as any).buildVisualization(stereo, 0).data.datasets.map((dataset: any) => dataset.label)).toEqual(
      ['Left', 'Right'],
    );
  });

  it('builds WindowedPEAQ as DI and ODG time series', () => {
    const metric = buildPresentations(
      [
        createMetric('WindowedPEAQCalculator-score.json', 0, [
          [-4.25, -3],
          [-1.5, -0.5],
        ]),
      ],
      [createModule('WindowedPEAQCalculator', { peaq_mode: 'basic', intorno_length: 300 })],
    )[0];
    const visualization = (createComponent() as any).buildVisualization(metric, 0);

    expect(visualization.kind).toBe('chart');
    expect(visualization.data.datasets.map((dataset: any) => dataset.label)).toEqual(['DI', 'ODG']);
    expect(visualization.data.datasets.map((dataset: any) => dataset.data)).toEqual([
      [-4.25, -3],
      [-1.5, -0.5],
    ]);
  });

  it('rejects malformed scalar metric values', () => {
    const metric = buildPresentations(
      [createMetric('PEAQCalculator-score.json', 0, [1])],
      [createModule('PEAQCalculator', { peaq_mode: 'basic' })],
    )[0];
    const visualization = (createComponent() as any).buildVisualization(metric, 0);

    expect(visualization.kind).toBe('unsupported');
  });
});

describe('MetricsComponent metric configuration focus', () => {
  it('focuses the output analyser instance associated with the clicked metric', () => {
    const component = new MetricsComponent(
      new AnalysisService(),
      {
        isDarkMode: new BehaviorSubject(false),
      } as any,
      {} as ListeningClient,
    );
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

function createMetric(fileName: string, index: number, json: JsonPayload = []): MetricRaw {
  return {
    name: `track/mask/plc/${fileName}`,
    type: 'file',
    size: 0,
    attrs: { mode: '', uid: 0, gid: 0, mtime: 0, user: '', group: '' },
    index,
    json,
  };
}

function createModule(name: string, settings: Record<string, string | number | boolean | null>): Module {
  return {
    name,
    settings: Object.entries(settings).map(([settingName, value]) => ({ name: settingName, value })),
  };
}
