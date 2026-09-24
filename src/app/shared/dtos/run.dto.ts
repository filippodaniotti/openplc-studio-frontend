import { RunStatus } from '../enums/run-status.enum';
import { ModuleType } from '../enums/module-type.enum';
import { Module } from '../interfaces/module.interface';

export interface RunDto {
  id: string;
  created: string;
  updated: string;
  author: string;
  name: string;
  testbench_internal_id: string | null;
  status: RunStatus;
  tracks: string[];
  modules: {
    [ModuleType.PacketLossSimulator]: Module[];
    [ModuleType.PLCAlgorithm]: Module[];
    [ModuleType.OutputAnalyser]: Module[];
  };
}
export interface RunCreateDto {
  author: string;
  name: string;
  tracks: string[];
  modules: {
    [ModuleType.PacketLossSimulator]: Module[];
    [ModuleType.PLCAlgorithm]: Module[];
    [ModuleType.OutputAnalyser]: Module[];
  };
}

export interface RunPageDto {
  items: RunDto[];
  total: number;
  page: number;
  page_size: number;
}
