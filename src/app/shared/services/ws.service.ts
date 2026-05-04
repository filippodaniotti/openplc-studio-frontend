import { Injectable } from '@angular/core';
import { filter, Observable, share } from 'rxjs';
import { webSocket } from 'rxjs/webSocket';
import { RunCompletionMessage, WsMessage } from '../interfaces/ws.interface';

@Injectable({
  providedIn: 'root',
})
export class WsService {
  private wsEndpoint = '/ws/runs';
  private socket$ = webSocket<WsMessage>(this.wsEndpoint).pipe(share());
  private completionMessages$: Observable<RunCompletionMessage> = this.socket$.pipe(
    filter((msg: WsMessage) => msg.type == 'run.complete'),
  );

  public getCompletionMessages(): Observable<RunCompletionMessage> {
    return this.completionMessages$;
  }
}
