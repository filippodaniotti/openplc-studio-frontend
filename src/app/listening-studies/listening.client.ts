import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { map } from 'rxjs';
import { ParticipantCheckpoint, SessionHead, Study, StudyResults } from './listening.models';

export function listeningError(error: unknown): string {
  if (error instanceof HttpErrorResponse && typeof error.error?.detail === 'string') return error.error.detail;
  return 'Request failed. Check the connection, reload, and try again.';
}

@Injectable({ providedIn: 'root' })
export class ListeningClient {
  constructor(private readonly http: HttpClient) {}
  public studies(runId: string) {
    return this.http.get<Study[]>(`/api/runs/${encodeURIComponent(runId)}/listening-studies`);
  }
  public study(id: string) {
    return this.http.get<Study>(this.url(id));
  }
  public sessions(id: string) {
    return this.http
      .get<{ revision: number; status: string; sessions: SessionHead[] }>(`${this.url(id)}/sessions`)
      .pipe(map((result) => result.sessions));
  }
  public results(id: string) {
    return this.http.get<StudyResults>(`${this.url(id)}/results`);
  }
  public invitations(id: string, count: number) {
    return this.http.post<{ invitation_id: string; path: string }[]>(`${this.url(id)}/invitations`, { count });
  }
  public exclude(study: Study, head: SessionHead, reason: string) {
    return this.http.put<void>(`${this.url(study.id)}/sessions/${head.session_id}/exclusion`, {
      expected_study_revision: study.revision,
      excluded: !head.excluded,
      reason,
    });
  }
  public revoke(studyId: string, sessionId: string) {
    return this.http.delete<void>(`${this.url(studyId)}/invitations/${sessionId}`);
  }
  public deleteUnusedInvitation(studyId: string, sessionId: string) {
    return this.http.delete<void>(`${this.url(studyId)}/invitations/${sessionId}/unused`);
  }
  public instructions(study: Study, instructions: string, consent: string) {
    return this.http.patch<void>(`${this.url(study.id)}/instructions`, {
      expected_revision: study.revision,
      instructions,
      consent,
    });
  }
  public close(study: Study, confirmEmpty: boolean) {
    return this.http.post<{ finalization_queued: boolean }>(`${this.url(study.id)}/close`, {
      expected_revision: study.revision,
      confirm_empty: confirmEmpty,
    });
  }
  public finalize(runId: string) {
    return this.http.post(`/api/runs/${encodeURIComponent(runId)}/listening-studies/finalize`, {});
  }
  public exchange(token: string) {
    return this.http.post<ParticipantCheckpoint>('/api/listening-participant/exchange', { token });
  }
  public checkpoint(sessionId: string) {
    return this.http.get<ParticipantCheckpoint>(
      `/api/listening-participant/${encodeURIComponent(sessionId)}/checkpoint`,
    );
  }
  public consent(checkpoint: ParticipantCheckpoint, requestId: string) {
    return this.http.post<ParticipantCheckpoint>(`/api/listening-participant/${checkpoint.session_id}/consent`, {
      request_id: requestId,
      expected_revision: checkpoint.revision,
      consent_version: checkpoint.consent_version,
      accepted: true,
    });
  }
  public exportUrl(id: string, file: 'responses.csv' | 'responses.json' | 'sessions.json') {
    return `${this.url(id)}/exports/${file}`;
  }
  private url(id: string) {
    return `/api/listening-studies/${encodeURIComponent(id)}`;
  }
}
