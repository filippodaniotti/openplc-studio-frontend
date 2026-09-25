import { Pipe, PipeTransform } from '@angular/core';
import { MetricRaw } from '../analysis.service';
import { extractWorkerName } from '../../shared/utils/module-instance-presentation';

export function metricLabelTransform(name: string): string {
  return extractWorkerName(name);
}

@Pipe({ name: 'metricLabel' })
export class MetricLabelPipe implements PipeTransform {
  transform(metric: MetricRaw): string {
    return metricLabelTransform(metric.name);
  }
}
