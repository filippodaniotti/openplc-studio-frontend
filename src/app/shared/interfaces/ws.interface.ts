interface BaseWsMessage {
  type: string;
}

export interface RunCompletionMessage extends BaseWsMessage {
  type: 'run.complete';
  run_name: string;
  success: boolean;
}

export type WsMessage = RunCompletionMessage | any;
