export interface RunCompletionMessage {
  type: 'run.complete';
  run_name: string;
  success: boolean;
}