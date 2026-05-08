import { Injectable } from '@angular/core';
import { filter, Observable, share} from 'rxjs';
import { webSocket } from 'rxjs/webSocket';
import { RunCompletionMessage, WsMessage, RunProgressMessage } from '../interfaces/ws.interface';

@Injectable({
  providedIn: 'root',
})
export class WsService {
  private wsEndpoint = 'ws://localhost:8000/ws/runs';
  private socket$ = webSocket<WsMessage>(this.wsEndpoint).pipe(share({ resetOnRefCountZero: false }));

  private completionMessages$: Observable<RunCompletionMessage> = this.socket$.pipe(
    filter((msg: WsMessage) => msg.type == 'run.complete'),
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
}
