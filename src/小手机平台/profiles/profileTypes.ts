export type ProfileEvidenceRef =
  | 'fixed-profile'
  | 'previous-dynamic'
  | `mvu:${string}`
  | `story:${string}`
  | `wechat:${string}`;

export interface ProfileStoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface ProfileWechatMessage {
  id: string;
  sender: string;
  content: string;
  isNew: boolean;
}

export interface ProfileAnalysisSource {
  sessionKey: string;
  personId: string;
  personName: string;
  fixedProfile: string;
  mvuFacts: Readonly<Record<string, unknown>>;
  story: readonly ProfileStoryMessage[];
  wechatContext: readonly ProfileWechatMessage[];
  wechatNew: readonly ProfileWechatMessage[];
  previous: DynamicProfileDocument | null;
}

export interface ProfilePerson {
  id: string;
  name: string;
  aliases: readonly string[];
  temporary: boolean;
}

export interface ProfileAnalysisState {
  sessionKey: string;
  personId: string;
  lastWechatMessageId?: string;
  lastWechatCreatedAt?: number;
  lastSuccessfulRefreshAt?: number;
  status: 'idle' | 'refreshing' | 'success' | 'failed';
  lastError?: string;
  lastFallbackReason?: string;
}

export type ProfileRefreshTrigger = 'auto' | 'person-manual' | 'all-manual' | 'retry-failed';

export interface ProfileRefreshRunResult {
  runId: string;
  trigger: ProfileRefreshTrigger;
  people: readonly { personId: string; status: 'success' | 'failed'; error?: string }[];
}

export interface ProfileAnalysisOutput {
  basicInfoAdditions: readonly string[];
  personalityTuning: string;
  currentSituationSummary: string;
  relationshipInterpretation: string;
  storyInteractionSummary: string;
  chatInteractionSummary: string;
  playerActionAdvice: string;
  evidenceRefs: readonly ProfileEvidenceRef[];
}

export interface DynamicProfileDocument {
  version: 1;
  sessionKey: string;
  personId: string;
  personName: string;
  fixedBaseline: string;
  hardFacts: Readonly<Record<string, unknown>>;
  basicInfoAdditions: readonly string[];
  personalityTuning: string;
  currentSituationSummary: string;
  relationshipInterpretation: string;
  storyInteractionSummary: string;
  chatInteractionSummary: string;
  lastWechatRound: readonly string[];
  evidenceRefs: readonly ProfileEvidenceRef[];
  updatedAt: number;
}

export interface ProfileViewRecordData {
  document: DynamicProfileDocument;
  playerActionAdvice: string;
  sourceStoryIds: readonly string[];
  newWechatMessageIds: readonly string[];
}
