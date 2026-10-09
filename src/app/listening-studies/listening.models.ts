export type StudyStatus = 'collecting' | 'closed' | 'finalized';
export interface Study {
  id: string;
  run_id: string;
  human_module_index: number;
  simulator_module_index: number;
  status: StudyStatus;
  revision: number;
  trial_count: number;
  instructions: string;
  consent: string;
  consent_version: number;
  invitations_created?: boolean;
  warnings: string[];
  conditions: { id: string; module_index: number; name: string }[];
}
export interface SessionHead {
  session_id: string;
  revision: number;
  status: 'invited' | 'draft' | 'completed';
  revoked: boolean;
  excluded: boolean;
  exclusion_reason: string | null;
  exclusion_audit?: unknown[];
  flags: string[];
}
export interface Rating {
  trial_id: string;
  condition_id: string;
  score: number | null;
  answered: boolean;
}
export interface ParticipantCheckpoint {
  study_id: string;
  study_status: StudyStatus;
  session_id: string;
  status: 'draft' | 'completed';
  revision: number;
  instructions: string;
  consent: string;
  consent_version: number;
  consent_acknowledged: boolean;
  trial_order: string[];
  condition_orders: Record<string, string[]>;
  current_trial_id: string;
  responses: Rating[];
}
export interface ConditionSummary {
  id: string;
  mean: number | null;
  median: number | null;
  sd: number | null;
  iqr: number | null;
  ci95: [number, number] | null;
  participant_count: number;
  response_count: number;
  ci_unavailable_reason?: string | null;
  score_histogram?: { edges: number[]; counts: number[] };
}
export interface PairwiseComparison {
  first: string;
  second: string;
  effect: number;
  ci95: [number, number] | null;
  p: number | null;
  p_adjusted?: number;
  reason?: string;
}
export interface StudyResults {
  kind: 'human-listening-study';
  status: StudyStatus;
  study_revision: number;
  provisional: boolean;
  counts: Record<'invited' | 'draft' | 'completed' | 'excluded' | 'flagged' | 'included', number>;
  analysis: {
    analysis_version: string;
    weighting: string;
    exploratory: boolean;
    participant_count: number;
    response_count: number;
    conditions: ConditionSummary[];
    inference: {
      available: boolean;
      reason?: string;
      method?: string;
      formula?: string;
      diagnostics?: string[];
      fallback?: boolean;
      correction_note?: string;
      assumptions?: string;
      effects?: {
        effect: string;
        F: number;
        df1: number;
        df2: number;
        p_uncorrected: number;
        p_greenhouse_geisser: number | null;
        epsilon: number | null;
        partial_eta_squared: number | null;
      }[];
      condition_test?: { test: string; likelihood_ratio: number; df: number; p: number };
      pairwise?: PairwiseComparison[];
    };
  };
}
