import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, switchMap } from 'rxjs';
import { Run, RunPage } from '../interfaces/run.interface';
import { RunMapper } from '../mappers/run.mapper';
import { RunDto, RunPageDto } from '../dtos/run.dto';

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

  public getRun(runId: string): Observable<Run> {
    return this.http
      .get<RunDto>(`${this.api}/${runId}`, { headers: this.headers })
      .pipe(switchMap((dto: RunDto) => of(RunMapper.dtoToModel(dto))));
  }

  public getRunsPage(page: number, pageSize: number): Observable<RunPage> {
    const params = new HttpParams().set('page', page).set('page_size', pageSize);
    return this.http
      .get<RunPageDto>(this.api, { headers: this.headers, params })
      .pipe(switchMap((dto: RunPageDto) => of(RunMapper.pageDtoToModel(dto))));
  }

  public deleteRun(runId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/${runId}`);
  }

  public getRunAssets(runId: string, depth: number): Observable<ArrayBuffer> {
    return this.http.get(`${this.api}/${runId}/assets/${depth}`, { responseType: 'arraybuffer' });
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
