import { RunStatus } from '../enums/run-status.enum';
import { ModuleType } from '../enums/module-type.enum';
import { Module } from './module.interface';

export interface RunFailure {
  code: 'human_no_eligible_excerpts' | 'execution_failed';
  message: string;
  guidance: string;
}

export interface Run {
  id: string;
  created: string;
  updated: string;
  author: string;
  name: string;
  testbenchInternalId: string | null;
  status: RunStatus;
  failure?: RunFailure | null;
  tracks: string[];
  modules: {
    [ModuleType.PacketLossSimulator]: Module[];
    [ModuleType.PLCAlgorithm]: Module[];
    [ModuleType.OutputAnalyser]: Module[];
  };
}

export type RunSortField = 'name' | 'created' | 'updated' | 'status';
export type RunSortDirection = 'asc' | 'desc';

export interface RunPage {
  items: Run[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RunDashboardSummary {
  generatedAt: string;
  recentWindowDays: number;
  counts: {
    running: number;
    queued: number;
    completedRecent: number;
    failedRecent: number;
  };
  activeRuns: Run[];
  recentRuns: Run[];
  failedRuns: Run[];
}
