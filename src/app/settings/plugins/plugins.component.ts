import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { finalize } from 'rxjs';
import { PluginsClient } from '../../shared/clients/plugins.client';
import { PluginInventoryItem } from '../../shared/interfaces/plugin.interface';

@Component({
  selector: 'plc-plugins',
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule, RouterLink],
  templateUrl: './plugins.component.html',
  styleUrl: './plugins.component.scss',
})
export class PluginsComponent implements OnInit {
  public plugins: PluginInventoryItem[] = [];
  public scannedAt: string | null = null;
  public loading = false;
  public loaded = false;
  public loadError = false;
  public uploading = false;
  public uploadError: string | null = null;
  public uploadSuccess: string | null = null;

  constructor(private readonly pluginsClient: PluginsClient) {}

  public ngOnInit(): void {
    this.refresh();
  }

  public get availableCount(): number {
    return this.plugins.filter((plugin) => plugin.status === 'available').length;
  }

  public get invalidCount(): number {
    return this.plugins.filter((plugin) => plugin.status === 'invalid').length;
  }

  public refresh(): void {
    this.loading = true;
    this.loadError = false;
    this.pluginsClient
      .getPlugins()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (inventory) => {
          this.plugins = inventory.items;
          this.scannedAt = inventory.scannedAt;
          this.loaded = true;
        },
        error: () => {
          this.loadError = true;
          this.loaded = true;
        },
      });
  }

  public upload(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploading) return;
    this.uploadError = null;
    this.uploadSuccess = null;
    if (!file.name.endsWith('.py') || file.size === 0 || file.size > 5 * 1024 * 1024) {
      this.uploadError = 'Choose a non-empty Python plugin file (.py), 5 MB or smaller.';
      return;
    }
    this.uploading = true;
    this.pluginsClient.uploadPlugin(file)
      .pipe(finalize(() => (this.uploading = false)))
      .subscribe({
        next: () => {
          this.uploadSuccess = `${file.name} uploaded successfully.`;
          this.refresh();
        },
        error: (error) => {
          this.uploadError = typeof error.error?.detail === 'string'
            ? error.error.detail : 'Unable to upload the plugin. Please try again.';
        },
      });
  }

  public formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }
}
