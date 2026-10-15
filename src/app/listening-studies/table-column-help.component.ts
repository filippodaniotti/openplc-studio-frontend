import { Component, Input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'plc-table-column-help',
  standalone: true,
  imports: [ButtonModule, TooltipModule],
  template: `
    <span class="column-heading">
      {{ label }}
      <p-button
        icon="pi pi-info-circle"
        severity="info"
        size="small"
        [text]="true"
        [rounded]="true"
        [ariaLabel]="label + ': more information'"
        [pTooltip]="help"
        tooltipEvent="both"
        tooltipPosition="top"
        appendTo="body"
      />
    </span>
  `,
  styles: [
    `
      .column-heading {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
    `,
  ],
})
export class TableColumnHelpComponent {
  @Input({ required: true }) public label = '';
  @Input({ required: true }) public help = '';
}
