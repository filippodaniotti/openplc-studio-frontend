import { Injectable } from '@angular/core';
import { filter, Observable, ReplaySubject, share, switchMap, take } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { RunCompletionMessage, WsMessage, RunProgressMessage } from '../interfaces/ws.interface';

@Injectable({
  providedIn: 'root',
})
export class WsService {
  private wsEndpoint = 'ws://localhost:8000/ws/runs';
  private wsSubject$: WebSocketSubject<WsMessage> = webSocket<WsMessage>(this.wsEndpoint);
  private socket$ = this.wsSubject$.pipe(share({ resetOnRefCountZero: false }));

  private runId$ = new ReplaySubject<string>(1);

  constructor() {
    this.runId$.pipe(
      take(1),
      switchMap(runId => {
        this.wsSubject$.next({ run_id: runId } as any);
        return this.socket$;
      })
    ).subscribe();
  }

  private completionMessages$: Observable<RunCompletionMessage> = this.socket$.pipe(
    filter((msg: WsMessage) => msg.type === 'run.complete'),
  );

  private progressMessages$: Observable<RunProgressMessage> = this.socket$.pipe(
    filter((msg: WsMessage) => msg.type === 'run.progress'),
  );

  public getCompletionMessages(): Observable<RunCompletionMessage> {
    return this.completionMessages$;
  }

  public getProgressMessages(): Observable<RunProgressMessage> {
    return this.progressMessages$;
  }

  public sendRunId(runId: string): void {
    this.runId$.next(runId);
  }
}