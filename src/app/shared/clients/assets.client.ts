import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { AudioTrackMetadata, AudioTrackMetadataDto } from '../interfaces/audio-track-metadata.interface';
import {
  SortDirection,
  TrackAsset,
  TrackAssetDto,
  TrackPage,
  TrackPageDto,
  TrackRunReferencePage,
  TrackRunReferencePageDto,
  TrackSortField,
} from '../interfaces/track-asset.interface';

@Injectable({ providedIn: 'root' })
export class AssetsClient {
  public readonly api = '/api/assets';
  private readonly headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  constructor(private readonly http: HttpClient) {}

  public uploadFiles(files: File[]): Observable<unknown> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return this.http.post(this.api, formData);
  }

  public uploadTrack(file: File, overwrite = false): Observable<TrackAsset> {
    const formData = new FormData();
    formData.append('files', file);
    const params = new HttpParams().set('overwrite', overwrite);
    return this.http
      .post<TrackAssetDto[]>(`${this.api}/tracks`, formData, { params })
      .pipe(map((tracks) => this.mapTrack(tracks[0])));
  }

  public getFilenames(): Observable<string[]> {
    return this.http.get<string[]>(`${this.api}/original-tracks`, { headers: this.headers });
  }

  public getTrackMetadata(): Observable<AudioTrackMetadata[]> {
    return this.http
      .get<AudioTrackMetadataDto[]>(`${this.api}/original-tracks/metadata`, { headers: this.headers })
      .pipe(map((dtos) => dtos.map((dto) => this.mapAudioMetadata(dto))));
  }

  public getTracksPage(
    page: number,
    pageSize: number,
    search = '',
    sortBy: TrackSortField = 'name',
    sortDirection: SortDirection = 'asc',
  ): Observable<TrackPage> {
    let params = new HttpParams()
      .set('page', page)
      .set('page_size', pageSize)
      .set('sort_by', sortBy)
      .set('sort_direction', sortDirection);
    if (search.trim()) params = params.set('search', search.trim());

    return this.http.get<TrackPageDto>(`${this.api}/tracks`, { params }).pipe(
      map((dto) => ({
        items: dto.items.map((track) => this.mapTrack(track)),
        total: dto.total,
        page: dto.page,
        pageSize: dto.page_size,
      })),
    );
  }

  public getTrack(name: string): Observable<TrackAsset> {
    return this.http
      .get<TrackAssetDto>(`${this.api}/tracks/${this.encodeName(name)}`)
      .pipe(map((track) => this.mapTrack(track)));
  }

  public getTrackUsage(name: string, page: number, pageSize: number): Observable<TrackRunReferencePage> {
    const params = new HttpParams().set('page', page).set('page_size', pageSize);
    return this.http
      .get<TrackRunReferencePageDto>(`${this.api}/tracks/${this.encodeName(name)}/usage`, { params })
      .pipe(map((dto) => ({ items: dto.items, total: dto.total, page: dto.page, pageSize: dto.page_size })));
  }

  public deleteTracks(names: string[]): Observable<string[]> {
    return this.http
      .delete<{ deleted: string[] }>(`${this.api}/tracks`, { body: { names } })
      .pipe(map((response) => response.deleted));
  }

  public getTrackContentUrl(name: string, download = false): string {
    const suffix = download ? '?download=true' : '';
    return `${this.api}/tracks/${this.encodeName(name)}/content${suffix}`;
  }

  private encodeName(name: string): string {
    return encodeURIComponent(name);
  }

  private mapAudioMetadata(dto: AudioTrackMetadataDto): AudioTrackMetadata {
    return {
      name: dto.name,
      sizeBytes: dto.size_bytes,
      durationSeconds: dto.duration_seconds,
      sampleRate: dto.sample_rate,
      channels: dto.channels,
      bitDepth: dto.bit_depth,
    };
  }

  private mapTrack(dto: TrackAssetDto): TrackAsset {
    return {
      ...this.mapAudioMetadata(dto),
      format: dto.format,
      subtype: dto.subtype,
      frames: dto.frames,
      storage: {
        provider: dto.storage.provider,
        key: dto.storage.key,
        contentType: dto.storage.content_type,
        sizeBytes: dto.storage.size_bytes,
        lastModified: dto.storage.last_modified,
      },
      usage: {
        total: dto.usage.total,
        blocking: dto.usage.blocking,
        byStatus: dto.usage.by_status,
      },
    };
  }
}
