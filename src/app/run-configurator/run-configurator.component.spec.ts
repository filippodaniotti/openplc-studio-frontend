import { of, throwError } from 'rxjs';
import { ModuleType } from '../shared/enums/module-type.enum';
import { RunStatus } from '../shared/enums/run-status.enum';
import { RunConfiguratorComponent } from './run-configurator.component';
import { RunConfiguratorService } from './run-configurator.service';

const createdRun = {
  id: 'run-1',
  created: '2026-01-01T12:00:00Z',
  updated: '2026-01-01T12:00:00Z',
  author: 'default',
  name: 'Deferred run',
  testbenchInternalId: 'internal-1',
  status: RunStatus.CREATED,
  tracks: ['track.wav'],
  modules: {
    [ModuleType.PacketLossSimulator]: [{ name: 'PLS', node_ids: ['pls-1'], settings: [] }],
    [ModuleType.PLCAlgorithm]: [{ name: 'PLC', node_ids: ['plc-1'], settings: [] }],
    [ModuleType.OutputAnalyser]: [{ name: 'Output', node_ids: ['out-1'], settings: [] }],
  },
};

describe('RunConfiguratorComponent submission', () => {
  let component: RunConfiguratorComponent;
  let runsClient: jasmine.SpyObj<any>;
  let messageService: jasmine.SpyObj<any>;
  let router: jasmine.SpyObj<any>;
  let runConfigService: RunConfiguratorService;

  beforeEach(() => {
    runsClient = jasmine.createSpyObj('RunsClient', ['createRun', 'executeRun']);
    messageService = jasmine.createSpyObj('MessageService', ['add']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    runConfigService = new RunConfiguratorService();
    runConfigService.modulesSelection.next({
      [ModuleType.PacketLossSimulator]: [{ id: 0, name: 'PLS', settings: [] }],
      [ModuleType.PLCAlgorithm]: [{ id: 0, name: 'PLC', settings: [] }],
      [ModuleType.OutputAnalyser]: [{ id: 0, name: 'Output', settings: [] }],
      [ModuleType.CrossfadeSettings]: [],
    });

    component = new RunConfiguratorComponent(
      runsClient,
      jasmine.createSpyObj('ModulesClient', ['getModuleTypes']),
      messageService,
      router,
      runConfigService,
    );
    component.runName = createdRun.name;
    component.audioTracksConfig = createdRun.tracks;
  });

  it('saves without executing', () => {
    runsClient.createRun.and.returnValue(of(createdRun));

    component.createRun(false);

    expect(runsClient.createRun).toHaveBeenCalledTimes(1);
    expect(runsClient.executeRun).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/run-progress', createdRun.id]);
  });

  it('saves and then executes', () => {
    runsClient.createRun.and.returnValue(of(createdRun));
    runsClient.executeRun.and.returnValue(of({ ...createdRun, status: RunStatus.QUEUED }));

    component.createRun(true);

    expect(runsClient.executeRun).toHaveBeenCalledOnceWith(createdRun.id);
    expect(router.navigate).toHaveBeenCalledOnceWith(['/run-progress', createdRun.id]);
  });

  it('navigates to the saved run when queueing fails', () => {
    runsClient.createRun.and.returnValue(of(createdRun));
    runsClient.executeRun.and.returnValue(throwError(() => new Error('broker unavailable')));

    component.createRun(true);

    expect(router.navigate).toHaveBeenCalledOnceWith(['/run-progress', createdRun.id]);
    expect(messageService.add).toHaveBeenCalledWith(
      jasmine.objectContaining({ summary: 'Run saved', severity: 'warn' }),
    );
  });
});
