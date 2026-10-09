import { RunCreateDto, RunDashboardSummaryDto, RunDto, RunPageDto } from '../dtos/run.dto';
import { ModuleType } from '../enums/module-type.enum';
import { Run, RunDashboardSummary, RunPage } from '../interfaces/run.interface';

export class RunMapper {
  static modelToCreateDto(run: Pick<Run, 'author' | 'name' | 'tracks' | 'modules'>): RunCreateDto {
    return {
      author: run.author,
      name: run.name,
      tracks: run.tracks,
      modules: {
        [ModuleType.PacketLossSimulator]: run.modules[ModuleType.PacketLossSimulator],
        [ModuleType.PLCAlgorithm]: run.modules[ModuleType.PLCAlgorithm],
        [ModuleType.OutputAnalyser]: run.modules[ModuleType.OutputAnalyser],
      },
    };
  }

  static dtoToModel(runDto: RunDto): Run {
    return {
      id: runDto.id,
      created: runDto.created,
      updated: runDto.updated,
      author: runDto.author,
      name: runDto.name,
      testbenchInternalId: runDto.testbench_internal_id,
      status: runDto.status,
      failure: runDto.failure ?? null,
      tracks: runDto.tracks,
      modules: {
        [ModuleType.PacketLossSimulator]: runDto.modules[ModuleType.PacketLossSimulator],
        [ModuleType.PLCAlgorithm]: runDto.modules[ModuleType.PLCAlgorithm],
        [ModuleType.OutputAnalyser]: runDto.modules[ModuleType.OutputAnalyser],
      },
    };
  }

  static pageDtoToModel(pageDto: RunPageDto): RunPage {
    return {
      items: pageDto.items.map((dto) => RunMapper.dtoToModel(dto)),
      total: pageDto.total,
      page: pageDto.page,
      pageSize: pageDto.page_size,
    };
  }

  static dashboardDtoToModel(dto: RunDashboardSummaryDto): RunDashboardSummary {
    return {
      generatedAt: dto.generated_at,
      recentWindowDays: dto.recent_window_days,
      counts: {
        running: dto.counts.running,
        queued: dto.counts.queued,
        completedRecent: dto.counts.completed_recent,
        failedRecent: dto.counts.failed_recent,
      },
      activeRuns: dto.active_runs.map((run) => RunMapper.dtoToModel(run)),
      recentRuns: dto.recent_runs.map((run) => RunMapper.dtoToModel(run)),
      failedRuns: dto.failed_runs.map((run) => RunMapper.dtoToModel(run)),
    };
  }
}
