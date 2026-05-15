interface BaseWsMessage {
  type: string;
}

export interface RunCompletionMessage extends BaseWsMessage {
  type: 'run.complete';
  run_name: string;
  success: boolean;
}

export interface NodeProgress {
  description: string;
  current: number;
  total: number | null;
}

export interface RunProgressMessage extends BaseWsMessage {
  type: 'run.progress';
  run_name: string;
  nodes: NodeProgress[];
}

export interface TreeNode {
  description: string;
  current: number;
  total: number | null;
  children: TreeNode[];
}

export type WsMessage = RunCompletionMessage | RunProgressMessage | any;