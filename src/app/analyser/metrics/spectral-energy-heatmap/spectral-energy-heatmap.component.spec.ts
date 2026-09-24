import { TestBed } from '@angular/core/testing';
import { ModuleType } from '../../../shared/enums/module-type.enum';
import { AnalysisService, MetricRaw } from '../../analysis.service';
import { SpectralEnergyHeatmapComponent } from './spectral-energy-heatmap.component';

describe('SpectralEnergyHeatmapComponent', () => {
  let analysisService: AnalysisService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpectralEnergyHeatmapComponent],
    }).compileComponents();

    analysisService = TestBed.inject(AnalysisService);
    analysisService.selectedTrackPlaybackSampleRate.next(48000);
    analysisService.run.next({
      modules: {
        [ModuleType.PacketLossSimulator]: [],
        [ModuleType.PLCAlgorithm]: [],
        [ModuleType.OutputAnalyser]: [
          {
            name: 'SpectralEnergyCalculator',
            node_ids: [],
            settings: [
              { name: 'N', value: 4 },
              { name: 'hop', value: 2 },
              { name: 'amp_scale', value: 1 },
            ],
          },
        ],
      },
    } as any);
  });

  it('renders a heatmap canvas for mono spectral data', () => {
    const fixture = TestBed.createComponent(SpectralEnergyHeatmapComponent);
    fixture.componentRef.setInput(
      'metric',
      createMetric([
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 5],
        [2, 3, 4],
      ]),
    );
    fixture.componentRef.setInput('fallbackIndex', 0);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('canvas')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('p-selectbutton').length).toBe(1);
    expect(fixture.componentInstance.frequencyScale).toBe('logarithmic');

    fixture.destroy();
  });

  it('shows a channel selector for multichannel spectral data', () => {
    const fixture = TestBed.createComponent(SpectralEnergyHeatmapComponent);
    fixture.componentRef.setInput(
      'metric',
      createMetric([
        [
          [1, 2, 3],
          [2, 3, 4],
          [3, 4, 5],
          [2, 3, 4],
        ],
        [
          [2, 3, 4],
          [3, 4, 5],
          [4, 5, 6],
          [3, 4, 5],
        ],
      ]),
    );
    fixture.componentRef.setInput('fallbackIndex', 0);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('p-selectbutton').length).toBe(2);
    expect(fixture.componentInstance.channelOptions.map((option) => option.label)).toEqual(['Left', 'Right']);

    fixture.destroy();
  });
});

function createMetric(json: any[]): MetricRaw {
  return {
    name: 'track/mask/plc/SpectralEnergyCalculator-hash.json',
    index: 0,
    json,
  } as MetricRaw;
}
