import { RunCreateDto, RunDto, RunPageDto } from '../dtos/run.dto';
import { ModuleType } from '../enums/module-type.enum';
import { Run, RunPage } from '../interfaces/run.interface';

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
}
