import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, switchMap } from 'rxjs';
import { Run } from '../interfaces/run.interface';
import { RunMapper } from '../mappers/run.mapper';
import { RunDto } from '../dtos/run.dto';

@Injectable({
  providedIn: 'root',
})
export class RunsClient {
  private api: string = '/api/runs';
  private headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  constructor(private http: HttpClient) { }

  public createRun(run: Omit<Run, 'id' | 'created' | 'updated'>): Observable<Run> {
    return this.http
      .post<RunDto>(this.api, RunMapper.modelToCreateDto(run), { headers: this.headers })
      .pipe(switchMap((dto: RunDto) => of(RunMapper.dtoToModel(dto))));
  }

  public getRun(runId: string): Observable<Run> {
    return this.http
      .get<RunDto>(`${this.api}/${runId}`, { headers: this.headers })
      .pipe(switchMap((dto: RunDto) => of(RunMapper.dtoToModel(dto))));
  }

  public getAllRuns(): Observable<Run[]> {
    return this.http
      .get<RunDto[]>(this.api, { headers: this.headers })
      .pipe(switchMap((dtos: RunDto[]) => of(dtos.map((dto) => RunMapper.dtoToModel(dto)))));
  }

  public getRunAssets(runId: string, depth: number): Observable<ArrayBuffer> {
    return this.http.get(`${this.api}/${runId}/assets/${depth}`, { responseType: 'arraybuffer' });
  }

  //method to export run config as a blob(Binary Large Object)
  public exportRunConfig(runId: string): Observable<Blob> {
    return this.http.get(`${this.api}/${runId}/config/export`, { responseType: 'blob' });
  }

  //method to validate run config
  public validateRunConfig(config: object): Observable<object> {
    return this.http.post(`${this.api}/config/validate`, config, { headers: this.headers });
  }
}
