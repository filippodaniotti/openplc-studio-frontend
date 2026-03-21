import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class WsService {
  private websocket?: WebSocket;
  private messages: Subject<any> = new Subject();

  constructor() {
    this.connect();
  }

  private connect() {
    this.websocket = new WebSocket('/ws');

    this.websocket.onmessage = (event) => {
      console.log(event);

      this.messages.next(event.data);
    };

    this.websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.websocket.onclose = () => {
      console.log('WebSocket connection closed');
    };
  }

  public sendMessage(message: any) {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    }
  }

  public getMessages(): Observable<any> {
    return this.messages.asObservable();
  }
}
