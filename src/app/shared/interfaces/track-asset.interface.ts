import { RunStatus } from '../enums/run-status.enum';
import { AudioTrackMetadata, AudioTrackMetadataDto } from './audio-track-metadata.interface';

export interface TrackStorageMetadata {
  provider: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  lastModified: string;
}

export interface TrackUsageSummary {
  total: number;
  blocking: number;
  byStatus: Partial<Record<RunStatus, number>>;
}

export interface TrackAsset extends AudioTrackMetadata {
  format: string | null;
  subtype: string | null;
  frames: number | null;
  storage: TrackStorageMetadata;
  usage: TrackUsageSummary;
}

export interface TrackStorageMetadataDto {
  provider: string;
  key: string;
  content_type: string;
  size_bytes: number;
  last_modified: string;
}

export interface TrackUsageSummaryDto {
  total: number;
  blocking: number;
  by_status: Partial<Record<RunStatus, number>>;
}

export interface TrackAssetDto extends AudioTrackMetadataDto {
  format: string | null;
  subtype: string | null;
  frames: number | null;
  storage: TrackStorageMetadataDto;
  usage: TrackUsageSummaryDto;
}

export interface TrackPage {
  items: TrackAsset[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TrackPageDto {
  items: TrackAssetDto[];
  total: number;
  page: number;
  page_size: number;
}

export interface TrackRunReference {
  id: string;
  name: string;
  status: RunStatus;
  created: string;
}

export interface TrackRunReferencePage {
  items: TrackRunReference[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TrackRunReferencePageDto {
  items: TrackRunReference[];
  total: number;
  page: number;
  page_size: number;
}

export type TrackSortField = 'name' | 'size_bytes' | 'duration_seconds' | 'last_modified';
export type SortDirection = 'asc' | 'desc';
