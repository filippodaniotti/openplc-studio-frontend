import { RunStatus } from '../enums/run-status.enum';

interface BaseWsMessage {
  type: string;
}

export interface RunSubscriptionMessage extends BaseWsMessage {
  type: 'run.subscribe';
  run_id: string;
}

export interface RunCompletionMessage extends BaseWsMessage {
  type: 'run.complete';
  run_id: string;
  run_name: string;
  success: boolean;
}

export interface NodeProgress {
  description: string;
  node_id: string | null;
  current: number;
  total: number | null;
}

export interface RunProgressMessage extends BaseWsMessage {
  type: 'run.progress';
  run_id: string;
  run_name: string;
  nodes: NodeProgress[];
}

export interface RunStateChangeMessage extends BaseWsMessage {
  type: 'run.state_change';
  run_id: string;
  run_name: string;
  previous_status: RunStatus;
  new_status: RunStatus;
}

export interface TreeNode {
  description: string;
  node_ids: string[];
  current: number;
  total: number | null;
  children: TreeNode[];
}

export type WsMessage = RunSubscriptionMessage | RunCompletionMessage | RunProgressMessage | RunStateChangeMessage;
