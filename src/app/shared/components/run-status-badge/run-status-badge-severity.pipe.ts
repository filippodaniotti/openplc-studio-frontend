import { Pipe, PipeTransform } from '@angular/core';
import { RunStatus } from '../../enums/run-status.enum';

type PrimeNgTypeSeverity = 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' | undefined;

@Pipe({
  name: 'runStatusBadgeSeverity',
})
export class RunStatusBadgeSeverityPipe implements PipeTransform {
  transform(value: RunStatus): PrimeNgTypeSeverity {
    switch (value) {
      case RunStatus.CREATED:
        return 'info';
      case RunStatus.QUEUED:
        return 'secondary';
      case RunStatus.RUNNING:
        return 'warn';
      case RunStatus.FAILED:
        return 'danger';
      case RunStatus.COMPLETED:
        return 'success';
      default:
        return undefined;
    }
  }
}
