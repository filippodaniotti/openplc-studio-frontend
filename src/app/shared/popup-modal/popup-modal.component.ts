import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { BreadcrumbModule } from 'primeng/breadcrumb'; // breadcrumb
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-popup-modal',
  standalone: true,
  imports: [CommonModule, ButtonModule, BreadcrumbModule],
  templateUrl: './popup-modal.component.html',
  styleUrls: ['./popup-modal.component.scss'],
})
export class PopupModalComponent {
  @Input() visible = false;
  @Input() header = 'Popup';
  @Input() breadcrumbs: MenuItem[] = [];
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() onConfirm = new EventEmitter<void>();
  @Output() breadcrumbClick = new EventEmitter<MenuItem>(); // breadcrumb click event
  @Output() onCancel = new EventEmitter<void>();

  close() {
    this.visible = false;
    this.visibleChange.emit(false);
    this.onCancel.emit();
  }

  confirm() {
    this.onConfirm.emit();
    this.close();
  }

  onBreadcrumbClick(item: MenuItem) {
    this.breadcrumbClick.emit(item); // Emetti l'evento con l'item cliccato
  }
}
