import { Injectable } from '@angular/core';
import { filter, Observable, share } from 'rxjs';
import { webSocket } from 'rxjs/webSocket';

interface BaseWsMessage {
  type: string;
}

export interface RunCompleteMessage extends BaseWsMessage {
  type: 'run.complete';
  // ...
}

export type WsMessage = RunCompleteMessage | any;

@Injectable({
  providedIn: 'root',
})
export class WsService {
  private wsEndpoint = '/ws';
  private socket$ = webSocket<WsMessage>(this.wsEndpoint).pipe(share());
  private completionMessages$: Observable<RunCompleteMessage> = this.socket$.pipe(
    filter((msg: WsMessage) => msg.type == 'run.complete'),
  );

  public getCompletionMessages(): Observable<RunCompleteMessage> {
    return this.completionMessages$;
  }
}
