import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { Table, TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { AssetsClient } from '../shared/clients/assets.client';
import { TrackUploadComponent } from '../shared/components/track-upload/track-upload.component';
import {
  SortDirection,
  TrackAsset,
  TrackRunReference,
  TrackSortField,
} from '../shared/interfaces/track-asset.interface';
import { formatChannels, formatDuration, formatSampleRate, formatSize } from '../shared/utils/audio-track-metadata';

@Component({
  selector: 'plc-assets',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    TooltipModule,
    TagModule,
    DialogModule,
    DrawerModule,
    ConfirmDialogModule,
    CheckboxModule,
    TrackUploadComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: './assets.component.html',
  styleUrl: './assets.component.scss',
})
export class AssetsComponent implements OnInit, OnDestroy {
  @ViewChild('tracksTable') private tracksTable?: Table;

  public tracks: TrackAsset[] = [];
  public selectedTracks: TrackAsset[] = [];
  public totalRecords = 0;
  public rows = 25;
  public first = 0;
  public loading = false;
  public loaded = false;
  public searchTerm = '';
  public sortField: TrackSortField = 'name';
  public sortDirection: SortDirection = 'asc';

  public uploadDialogVisible = false;
  public detailsVisible = false;
  public selectedTrack: TrackAsset | null = null;
  public usage: TrackRunReference[] = [];
  public usageTotal = 0;
  public usageRows = 10;
  public usageLoading = false;
  public deleting = false;

  private readonly searchChanges = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly assetsClient: AssetsClient,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
    private readonly router: Router,
  ) {}

  public ngOnInit(): void {
    this.searchChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$)).subscribe(() => {
      this.first = 0;
      this.loadTracks({
        first: 0,
        rows: this.rows,
        sortField: this.sortField,
        sortOrder: this.sortDirection === 'asc' ? 1 : -1,
      });
    });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public loadTracks(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.rows;
    const first = event.first ?? this.first;
    const page = Math.floor(first / rows) + 1;
    const requestedSort = Array.isArray(event.sortField) ? event.sortField[0] : event.sortField;
    const sortField = this.isSortField(requestedSort) ? requestedSort : this.sortField;
    const sortDirection: SortDirection = event.sortOrder === -1 ? 'desc' : 'asc';

    this.loading = true;
    this.assetsClient.getTracksPage(page, rows, this.searchTerm, sortField, sortDirection).subscribe({
      next: (result) => {
        this.tracks = result.items;
        this.totalRecords = result.total;
        this.rows = rows;
        this.first = first;
        this.sortField = sortField;
        this.sortDirection = sortDirection;
        this.loaded = true;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.loaded = true;
        this.messageService.add({
          severity: 'error',
          summary: 'Could not load tracks',
          detail: 'Please refresh and try again.',
        });
      },
    });
  }

  public onSearchChange(value: string): void {
    this.searchChanges.next(value);
  }

  public refresh(): void {
    this.loadTracks({
      first: this.first,
      rows: this.rows,
      sortField: this.sortField,
      sortOrder: this.sortDirection === 'asc' ? 1 : -1,
    });
  }

  public onUploaded(): void {
    this.uploadDialogVisible = false;
    this.first = 0;
    this.refreshFromFirstPage();
  }

  public showDetails(track: TrackAsset): void {
    this.assetsClient.getTrack(track.name).subscribe({
      next: (freshTrack) => {
        this.selectedTrack = freshTrack;
        this.detailsVisible = true;
      },
      error: () => {
        this.messageService.add({
          severity: 'warn',
          summary: 'Track unavailable',
          detail: 'The track no longer exists. The list has been refreshed.',
        });
        this.refresh();
      },
    });
  }

  public loadUsage(event: TableLazyLoadEvent): void {
    if (!this.selectedTrack) return;
    const rows = event.rows ?? this.usageRows;
    const first = event.first ?? 0;
    this.usageLoading = true;
    this.assetsClient.getTrackUsage(this.selectedTrack.name, Math.floor(first / rows) + 1, rows).subscribe({
      next: (result) => {
        this.usage = result.items;
        this.usageTotal = result.total;
        this.usageRows = rows;
        this.usageLoading = false;
      },
      error: () => {
        this.usageLoading = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Could not load run usage',
          detail: 'Please try again.',
        });
      },
    });
  }

  public onDetailsVisibleChange(visible: boolean): void {
    this.detailsVisible = visible;
    if (!visible) {
      this.selectedTrack = null;
      this.usage = [];
      this.usageTotal = 0;
    }
  }

  public deleteTrack(track: TrackAsset): void {
    this.confirmDelete([track]);
  }

  public deleteSelected(): void {
    this.confirmDelete(this.selectedTracks);
  }

  public get bulkDeleteDisabled(): boolean {
    return this.selectedTracks.length === 0 || this.selectedTracks.some((track) => track.usage.blocking > 0);
  }

  public get allVisibleSelected(): boolean {
    return this.tracks.length > 0 && this.tracks.every((track) => this.isSelected(track));
  }

  public isSelected(track: TrackAsset): boolean {
    return this.selectedTracks.some((selected) => selected.name === track.name);
  }

  public toggleTrackSelection(track: TrackAsset, selected: boolean): void {
    this.selectedTracks = selected
      ? [...this.selectedTracks.filter((item) => item.name !== track.name), track]
      : this.selectedTracks.filter((item) => item.name !== track.name);
  }

  public toggleVisibleSelection(selected: boolean): void {
    const visibleNames = new Set(this.tracks.map((track) => track.name));
    this.selectedTracks = selected
      ? [...this.selectedTracks.filter((track) => !visibleNames.has(track.name)), ...this.tracks]
      : this.selectedTracks.filter((track) => !visibleNames.has(track.name));
  }

  public download(track: TrackAsset): void {
    const anchor = document.createElement('a');
    anchor.href = this.assetsClient.getTrackContentUrl(track.name, true);
    anchor.download = track.name;
    anchor.click();
  }

  public openRun(reference: TrackRunReference): void {
    this.router.navigate(['/run-progress', reference.id]);
  }

  public contentUrl(track: TrackAsset): string {
    return this.assetsClient.getTrackContentUrl(track.name);
  }

  public formatDuration(seconds: number | null): string {
    return formatDuration(seconds);
  }

  public formatSampleRate(sampleRate: number | null): string {
    return formatSampleRate(sampleRate);
  }

  public formatChannels(channels: number | null): string {
    return formatChannels(channels);
  }

  public formatSize(bytes: number): string {
    return formatSize(bytes);
  }

  public hasBlockingUsage(track: TrackAsset): boolean {
    return track.usage.blocking > 0;
  }

  public hasUsage(track: TrackAsset): boolean {
    return track.usage.total > 0;
  }

  private confirmDelete(tracks: TrackAsset[]): void {
    if (tracks.length === 0 || tracks.some((track) => track.usage.blocking > 0) || this.deleting) return;
    const historicalReferences = tracks.reduce((sum, track) => sum + track.usage.total, 0);
    const noun = tracks.length === 1 ? `“${tracks[0].name}”` : `${tracks.length} tracks`;
    const warning = historicalReferences
      ? ` ${historicalReferences} completed or failed run reference(s) will keep the filename but lose source metadata.`
      : '';

    this.confirmationService.confirm({
      header: tracks.length === 1 ? 'Delete track' : 'Delete tracks',
      icon: 'pi pi-exclamation-triangle',
      message: `Delete ${noun}? This action cannot be undone.${warning}`,
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', outlined: true },
      accept: () => this.performDelete(tracks),
    });
  }

  private performDelete(tracks: TrackAsset[]): void {
    this.deleting = true;
    const names = tracks.map((track) => track.name);
    this.assetsClient.deleteTracks(names).subscribe({
      next: () => {
        this.deleting = false;
        this.selectedTracks = [];
        if (this.selectedTrack && names.includes(this.selectedTrack.name)) this.onDetailsVisibleChange(false);
        if (this.tracks.length <= names.length && this.first > 0) this.first = Math.max(0, this.first - this.rows);
        this.messageService.add({
          severity: 'success',
          summary: names.length === 1 ? 'Track deleted' : 'Tracks deleted',
          detail: `${names.length} track(s) removed.`,
        });
        this.refresh();
      },
      error: (error: HttpErrorResponse) => {
        this.deleting = false;
        const detail = error.error?.detail;
        this.messageService.add({
          severity: 'error',
          summary: 'Could not delete tracks',
          detail:
            typeof detail === 'string'
              ? detail
              : error.status === 409
                ? 'One or more tracks are now referenced by an active run. Refresh and try again.'
                : 'Please try again.',
        });
        this.refresh();
      },
    });
  }

  private refreshFromFirstPage(): void {
    this.first = 0;
    if (this.tracksTable) {
      this.tracksTable.reset();
    } else {
      this.refresh();
    }
  }

  private isSortField(value: string | null | undefined): value is TrackSortField {
    return value === 'name' || value === 'size_bytes' || value === 'duration_seconds' || value === 'last_modified';
  }
}
