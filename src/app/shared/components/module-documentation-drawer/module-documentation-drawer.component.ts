import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { DocumentationComponent } from '../../../documentation/documentation.component';
import { ModuleDocumentationTarget } from '../../utils/module-documentation';

@Component({
  selector: 'plc-module-documentation-drawer',
  standalone: true,
  imports: [CommonModule, ButtonModule, DrawerModule, DocumentationComponent],
  templateUrl: './module-documentation-drawer.component.html',
  styleUrl: './module-documentation-drawer.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ModuleDocumentationDrawerComponent implements OnChanges {
  @Input() public visible = false;
  @Input() public target: ModuleDocumentationTarget | null = null;
  @Input() public moduleName = '';
  @Output() public visibleChange = new EventEmitter<boolean>();

  public viewerKeys = [0];
  public drawerWidth: number | null = null;
  public resizing = false;
  public readonly minimumDrawerWidth = 384;
  private resizeStartX = 0;
  private resizeStartWidth = 0;
  private resizePointerId: number | null = null;
  private trigger: HTMLElement | null = null;

  public get effectiveWidth(): number {
    return window.innerWidth < 768 ? window.innerWidth : (this.drawerWidth ?? Math.min(768, window.innerWidth / 2));
  }

  public get maximumDrawerWidth(): number {
    return window.innerWidth;
  }

  public startResize(event: PointerEvent): void {
    if (event.button !== 0 || window.innerWidth < 768) return;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.effectiveWidth;
    this.resizePointerId = event.pointerId;
    this.resizing = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  public resize(event: PointerEvent): void {
    if (!this.resizing || event.pointerId !== this.resizePointerId) return;
    this.applyWidth(this.resizeStartWidth + this.resizeStartX - event.clientX, event.currentTarget);
  }

  public stopResize(event: PointerEvent): void {
    if (event.pointerId !== this.resizePointerId) return;
    this.resizing = false;
    this.resizePointerId = null;
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }

  public resizeWithKeyboard(event: KeyboardEvent): void {
    if (window.innerWidth < 768 || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const step = event.shiftKey ? 64 : 16;
    this.applyWidth(this.effectiveWidth + (event.key === 'ArrowLeft' ? step : -step), event.currentTarget);
    event.preventDefault();
  }

  @HostListener('window:resize')
  public onWindowResize(): void {
    this.resizing = false;
    this.resizePointerId = null;
    if (this.drawerWidth !== null && window.innerWidth >= 768) {
      this.drawerWidth = this.constrainWidth(this.drawerWidth);
    }
  }

  private applyWidth(width: number, handle: EventTarget | null): void {
    this.drawerWidth = this.constrainWidth(width);
    // Update the body-appended overlay immediately, rather than waiting for
    // PrimeNG's OnPush view to refresh the style input on a later interaction.
    if (handle instanceof HTMLElement) {
      const panel = handle.closest<HTMLElement>('.plc-module-documentation-drawer.p-drawer');
      if (panel) panel.style.width = `${this.drawerWidth}px`;
    }
  }

  private constrainWidth(width: number): number {
    return Math.min(window.innerWidth, Math.max(this.minimumDrawerWidth, width));
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && !this.visible) {
      this.resizing = false;
      this.resizePointerId = null;
    }
    if (changes['visible']?.currentValue && !changes['visible'].previousValue) {
      this.trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
  }

  public reload(): void {
    this.viewerKeys = [this.viewerKeys[0] + 1];
  }

  public close(): void {
    this.resizing = false;
    this.resizePointerId = null;
    this.visible = false;
    this.visibleChange.emit(false);
    if (this.trigger?.isConnected) this.trigger.focus();
  }

  public onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }
}
