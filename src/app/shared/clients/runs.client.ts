import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, switchMap } from 'rxjs';
import { Run, RunDashboardSummary, RunPage, RunSortDirection, RunSortField } from '../interfaces/run.interface';
import { RunStatus } from '../enums/run-status.enum';
import { RunArtifactKind } from '../enums/run-artifact-kind.enum';
import { RunMapper } from '../mappers/run.mapper';
import { RunDashboardSummaryDto, RunDto, RunPageDto } from '../dtos/run.dto';

@Injectable({
  providedIn: 'root',
})
export class RunsClient {
  private api: string = '/api/runs';
  private headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  constructor(private http: HttpClient) {}

  public createRun(run: Pick<Run, 'author' | 'name' | 'tracks' | 'modules'>): Observable<Run> {
    return this.http
      .post<RunDto>(this.api, RunMapper.modelToCreateDto(run), { headers: this.headers })
      .pipe(switchMap((dto: RunDto) => of(RunMapper.dtoToModel(dto))));
  }

  public executeRun(runId: string): Observable<Run> {
    return this.http
      .post<RunDto>(`${this.api}/${runId}/execute`, {}, { headers: this.headers })
      .pipe(switchMap((dto: RunDto) => of(RunMapper.dtoToModel(dto))));
  }

  public retryRun(runId: string): Observable<Run> {
    return this.http
      .post<RunDto>(`${this.api}/${runId}/retry`, {}, { headers: this.headers })
      .pipe(switchMap((dto: RunDto) => of(RunMapper.dtoToModel(dto))));
  }

  public getRun(runId: string): Observable<Run> {
    return this.http
      .get<RunDto>(`${this.api}/${runId}`, { headers: this.headers })
      .pipe(switchMap((dto: RunDto) => of(RunMapper.dtoToModel(dto))));
  }

  public getRunsPage(
    page: number,
    pageSize: number,
    search = '',
    statuses: RunStatus[] = [],
    sortBy: RunSortField = 'created',
    sortDirection: RunSortDirection = 'desc',
  ): Observable<RunPage> {
    let params = new HttpParams()
      .set('page', page)
      .set('page_size', pageSize)
      .set('sort_by', sortBy)
      .set('sort_direction', sortDirection);
    if (search.trim()) params = params.set('search', search.trim());
    for (const status of statuses) params = params.append('status', status);
    return this.http
      .get<RunPageDto>(this.api, { headers: this.headers, params })
      .pipe(switchMap((dto: RunPageDto) => of(RunMapper.pageDtoToModel(dto))));
  }

  public getDashboardSummary(): Observable<RunDashboardSummary> {
    return this.http
      .get<RunDashboardSummaryDto>(`${this.api}/dashboard/summary`, { headers: this.headers })
      .pipe(switchMap((dto: RunDashboardSummaryDto) => of(RunMapper.dashboardDtoToModel(dto))));
  }

  public deleteRun(runId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/${runId}`);
  }

  public getRunArtifactsArchive(runId: string, kind: RunArtifactKind, readyOnly = false): Observable<ArrayBuffer> {
    return this.http.get(`${this.api}/${runId}/artifacts/${kind}/archive`, {
      responseType: 'arraybuffer',
      params: readyOnly ? { ready_only: 'true' } : {},
    });
  }

  //method to export run config as a blob(Binary Large Object)
  public exportRunConfig(runId: string): Observable<Blob> {
    return this.http.get(`${this.api}/${runId}/config/export`, { responseType: 'blob' });
  }

  //method to validate run config
  public validateRunConfig(config: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${this.api}/config/validate`, config, {
      headers: this.headers,
    });
  }
}
