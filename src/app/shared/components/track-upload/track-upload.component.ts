import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import {
  FileRemoveEvent,
  FileSelectEvent,
  FileUpload,
  FileUploadHandlerEvent,
  FileUploadModule,
} from 'primeng/fileupload';
import { TooltipModule } from 'primeng/tooltip';
import { firstValueFrom } from 'rxjs';
import { AssetsClient } from '../../clients/assets.client';
import { parseWavInfo, WavInfo } from '../../utils/wavUtils';
import { formatChannels, formatDuration, formatSampleRate, formatSize } from '../../utils/audio-track-metadata';

export interface QueuedTrackView {
  sizeLabel: string;
  durationLabel: string;
  sampleRateLabel: string;
  channelLabel: string;
  bitDepthLabel: string;
  available: boolean;
  pending: boolean;
}

@Component({
  selector: 'plc-track-upload',
  standalone: true,
  imports: [CommonModule, FileUploadModule, ButtonModule, TooltipModule, ConfirmDialogModule],
  providers: [ConfirmationService],
  templateUrl: './track-upload.component.html',
  styleUrl: './track-upload.component.scss',
})
export class TrackUploadComponent {
  @ViewChild('fileUpload') public fileUpload!: FileUpload;
  @Output() public uploaded = new EventEmitter<string[]>();

  public readonly maxFileSize = 100_000_000;
  public readonly queuedFileViews = new Map<string, QueuedTrackView>();
  public uploading = false;

  constructor(
    private readonly assetsClient: AssetsClient,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
  ) {}

  public onSelect(event: FileSelectEvent): void {
    for (const file of event.files) {
      this.queuedFileViews.set(this.fileKey(file), this.toQueuedView(file, null, true));
      this.inspectFile(file);
    }
  }

  public onRemove(event: FileRemoveEvent): void {
    this.queuedFileViews.delete(this.fileKey(event.file));
  }

  public onClear(): void {
    this.queuedFileViews.clear();
  }

  public getView(file: File): QueuedTrackView {
    return this.queuedFileViews.get(this.fileKey(file)) ?? this.toQueuedView(file, null, true);
  }

  public async upload(event: FileUploadHandlerEvent): Promise<void> {
    if (this.uploading || event.files.length === 0) return;
    this.uploading = true;

    try {
      const existing = new Set(await firstValueFrom(this.assetsClient.getFilenames()));
      const conflicts = event.files.filter((file) => existing.has(file.name)).map((file) => file.name);
      const overwrite = conflicts.length === 0 ? true : await this.confirmOverwrite(conflicts);
      const files = overwrite ? event.files : event.files.filter((file) => !existing.has(file.name));
      const uploadedNames: string[] = [];
      let failed = 0;

      for (const file of files) {
        try {
          await firstValueFrom(this.assetsClient.uploadTrack(file, overwrite && existing.has(file.name)));
          uploadedNames.push(file.name);
        } catch (error) {
          failed += 1;
          this.showUploadError(file.name, error);
        }
      }

      if (uploadedNames.length > 0) {
        this.messageService.add({
          severity: 'success',
          summary: 'Upload complete',
          detail: `${uploadedNames.length} track(s) uploaded${failed ? `, ${failed} failed` : ''}.`,
        });
        this.uploaded.emit(uploadedNames);
      }
      if (!overwrite && conflicts.length > 0) {
        this.messageService.add({
          severity: 'info',
          summary: 'Existing tracks skipped',
          detail: `${conflicts.length} conflicting track(s) were not overwritten.`,
        });
      }
      this.fileUpload.clear();
    } catch (error) {
      this.showUploadError('tracks', error);
    } finally {
      this.uploading = false;
    }
  }

  private confirmOverwrite(conflicts: string[]): Promise<boolean> {
    const shown = conflicts.slice(0, 5).join(', ');
    const remainder = conflicts.length > 5 ? ` and ${conflicts.length - 5} more` : '';
    return new Promise((resolve) => {
      this.confirmationService.confirm({
        key: 'track-upload-overwrite',
        header: 'Overwrite existing tracks?',
        icon: 'pi pi-exclamation-triangle',
        message: `${shown}${remainder} already exist. Replace them with the selected files?`,
        acceptButtonProps: { label: 'Overwrite', severity: 'danger' },
        rejectButtonProps: { label: 'Skip existing', severity: 'secondary', outlined: true },
        accept: () => resolve(true),
        reject: () => resolve(false),
      });
    });
  }

  private showUploadError(filename: string, error: unknown): void {
    const response = error instanceof HttpErrorResponse ? error : null;
    const detail = response?.error?.detail;
    this.messageService.add({
      severity: 'error',
      summary: `Could not upload ${filename}`,
      detail: typeof detail === 'string' ? detail : 'Please verify the WAV file and try again.',
    });
  }

  private fileKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  private inspectFile(file: File): void {
    file
      .slice(0, Math.min(file.size, 65536))
      .arrayBuffer()
      .then((buffer) => {
        this.queuedFileViews.set(this.fileKey(file), this.toQueuedView(file, parseWavInfo(new Uint8Array(buffer))));
      })
      .catch(() => this.queuedFileViews.set(this.fileKey(file), this.toQueuedView(file, null)));
  }

  private toQueuedView(file: File, info: WavInfo | null, pending = false): QueuedTrackView {
    const dataSize = info?.dataSize && info.dataSize !== 0xffffffff ? info.dataSize : Math.max(file.size - 44, 0);
    const duration = info && info.byteRate > 0 ? dataSize / info.byteRate : null;
    return {
      pending,
      available: info !== null,
      sizeLabel: formatSize(file.size),
      durationLabel: formatDuration(duration),
      sampleRateLabel: info ? formatSampleRate(info.sampleRate) : '—',
      channelLabel: info ? formatChannels(info.channels) : '—',
      bitDepthLabel: info ? `${info.bitDepth}-bit` : '—',
    };
  }
}
