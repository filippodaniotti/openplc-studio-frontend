import { RunStatus } from '../enums/run-status.enum';
import { ModuleType } from '../enums/module-type.enum';
import { Module } from './module.interface';

export interface Run {
  id: string;
  created: string;
  updated: string;
  author: string;
  name: string;
  testbenchInternalId: string | null;
  status: RunStatus;
  tracks: string[];
  modules: {
    [ModuleType.PacketLossSimulator]: Module[];
    [ModuleType.PLCAlgorithm]: Module[];
    [ModuleType.OutputAnalyser]: Module[];
  };
}

export interface RunPage {
  items: Run[];
  total: number;
  page: number;
  pageSize: number;
}
