import { Module } from '../../shared/interfaces/module.interface';
import { MetricRaw } from '../analysis.service';
import { buildModuleInstancePresentations, extractWorkerName } from '../../shared/utils/module-instance-presentation';

export type MetricPresentation = MetricRaw & {
  calculatorName: string;
  discriminator: string | null;
  displayName: string;
  moduleIndex: number | null;
};

export function buildMetricPresentations(
  metrics: MetricRaw[],
  modules: Module[],
  resolveModule: (metric: MetricRaw, fallbackIndex: number) => Module | null,
): MetricPresentation[] {
  const modulePresentations = buildModuleInstancePresentations(modules);
  const groupedMetrics = new Map<string, MetricRaw[]>();

  metrics.forEach((metric) => {
    const calculatorName = extractWorkerName(metric.name);
    const group = groupedMetrics.get(calculatorName) ?? [];
    group.push(metric);
    groupedMetrics.set(calculatorName, group);
  });

  return metrics.map((metric, fallbackIndex) => {
    const module = resolveModule(metric, fallbackIndex);
    const modulePresentation = module
      ? (modulePresentations.find((presentation) => presentation.module === module) ?? null)
      : null;
    const calculatorName = modulePresentation?.name ?? extractWorkerName(metric.name);
    const unresolvedGroup = groupedMetrics.get(calculatorName) ?? [];
    const unresolvedIndex = unresolvedGroup.findIndex((candidate) => candidate.index === metric.index);
    const discriminator =
      modulePresentation?.discriminator ?? (unresolvedGroup.length > 1 ? `Instance ${unresolvedIndex + 1}` : null);

    return {
      ...metric,
      calculatorName,
      discriminator,
      displayName: discriminator ? `${calculatorName} · ${discriminator}` : calculatorName,
      moduleIndex: modulePresentation?.moduleIndex ?? null,
    };
  });
}
