import { Injectable } from '@angular/core';
import { filter, Observable, ReplaySubject, share } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import {
  RunCompletionMessage,
  RunProgressMessage,
  RunStateChangeMessage,
  RunSubscriptionMessage,
  WsMessage,
} from '../interfaces/ws.interface';

@Injectable({
  providedIn: 'root',
})
export class WsService {
  private wsEndpoint = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/runs`;
  private wsSubject$: WebSocketSubject<WsMessage> = webSocket<WsMessage>(this.wsEndpoint);
  private socket$ = this.wsSubject$.pipe(share({ resetOnRefCountZero: false }));

  private runId$ = new ReplaySubject<string>(1);

  constructor() {
    this.runId$.subscribe((runId) => {
      const subscription: RunSubscriptionMessage = {
        type: 'run.subscribe',
        run_id: runId,
      };
      this.wsSubject$.next(subscription);
    });
  }

  private completionMessages$: Observable<RunCompletionMessage> = this.socket$.pipe(
    filter((msg: WsMessage) => msg.type === 'run.complete'),
  );

  private progressMessages$: Observable<RunProgressMessage> = this.socket$.pipe(
    filter((msg: WsMessage) => msg.type === 'run.progress'),
  );

  private stateChangeMessages$: Observable<RunStateChangeMessage> = this.socket$.pipe(
    filter((msg: WsMessage) => msg.type === 'run.state_change'),
  );

  public getCompletionMessages(): Observable<RunCompletionMessage> {
    return this.completionMessages$;
  }

  public getProgressMessages(): Observable<RunProgressMessage> {
    return this.progressMessages$;
  }

  public getStateChangeMessages(): Observable<RunStateChangeMessage> {
    return this.stateChangeMessages$;
  }

  public sendRunId(runId: string): void {
    this.runId$.next(runId);
  }
}
