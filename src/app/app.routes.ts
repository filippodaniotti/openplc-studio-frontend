import { Routes } from '@angular/router';
import { AnalyserComponent } from './analyser/analyser.component';
import { RunConfiguratorComponent } from './run-configurator/run-configurator.component';
import { BacklogComponent } from './backlog/backlog.component';
import { RunProgressComponent } from './run-progress/run-progress.component';

const loadDocumentationComponent = () =>
  import('./documentation/documentation.component').then((module) => module.DocumentationComponent);

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then((module) => module.DashboardComponent),
  },
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
    path: 'listening-studies/:runId',
    loadComponent: () => import('./listening-studies/study-hub.component').then((module) => module.StudyHubComponent),
  },
  {
    path: 'listening-participant',
    loadComponent: () =>
      import('./listening-studies/participant.component').then((module) => module.ParticipantComponent),
  },
  {
    path: 'listening-participant/:sessionId',
    loadComponent: () =>
      import('./listening-studies/participant.component').then((module) => module.ParticipantComponent),
  },
  {
    path: 'docs',
    children: [
      { path: '', pathMatch: 'full', loadComponent: loadDocumentationComponent },
      { path: '**', loadComponent: loadDocumentationComponent },
    ],
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.component').then((module) => module.SettingsComponent),
    children: [
      { path: '', redirectTo: 'configs', pathMatch: 'full' },
      {
        path: 'configs',
        loadComponent: () => import('./settings/configs/configs.component').then((module) => module.ConfigsComponent),
      },
      {
        path: 'assets',
        loadComponent: () => import('./assets/assets.component').then((module) => module.AssetsComponent),
      },
      {
        path: 'plugins/:filename/edit',
        loadComponent: () => import('./settings/plugins/plugin-editor/plugin-editor.component').then((module) => module.PluginEditorComponent),
        canDeactivate: [(component: { canDeactivate(): boolean }) => component.canDeactivate()],
      },
      {
        path: 'plugins',
        loadComponent: () => import('./settings/plugins/plugins.component').then((module) => module.PluginsComponent),
      },
    ],
  },
  { path: 'assets', redirectTo: 'settings/assets', pathMatch: 'full' },
  {
    path: 'run-progress/:id',
    component: RunProgressComponent,
  },
  { path: '**', redirectTo: 'dashboard' },
];
