import { Routes } from '@angular/router';
import { AnalyserComponent } from './analyser/analyser.component';
import { RunConfiguratorComponent } from './run-configurator/run-configurator.component';
import { BacklogComponent } from './backlog/backlog.component';
import { RunProgressComponent } from './run-progress/run-progress.component';

export const routes: Routes = [
  { path: '', redirectTo: 'backlog', pathMatch: 'full' },
  { path: 'analyzer', redirectTo: 'backlog' },
  {
    path: 'analyzer/:id',
    component: AnalyserComponent,
  },
  {
    path: 'run-configurator',
    component: RunConfiguratorComponent,
  },
  {
    path: 'backlog',
    component: BacklogComponent,
  },
  {
    path: 'run-progress/:id',
    component: RunProgressComponent,
  },
  { path: '**', redirectTo: 'backlog' },
];
