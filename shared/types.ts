export type Mode = "demo" | "live";
export type DocumentType = "invoice" | "po" | "grn" | "bank";
export type TestName =
  | "amount"
  | "date"
  | "vat"
  | "approval"
  | "quantity"
  | "duplicate"
  | "vendor"
  | "invoice_no"
  | "price";
export type Result = "match" | "exception" | "unverified";
export type BBox = [number, number, number, number]; // x, y, width, height in pixels
export interface ProviderCall {
  provider: "meta" | "baseten";
  operation: "plan" | "extract" | "segment" | "verify" | "transcribe";
  requestedModel: string;
  returnedModel?: string;
  responseId?: string;
  requestId?: string;
  startedAt: string;
  durationMs: number;
  outcome: "success" | "failed";
  httpStatus?: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}
export interface LedgerLine {
  id: string;
  date: string;
  vendor: string;
  invoice_no: string;
  amount: number;
  vat: number;
  account: string;
  currency: string;
  quantity?: number;
  po_no?: string;
  assertion?: string;
}
export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  sha256: string;
  imageSha256?: string;
  pages: number;
  sourcePath: string;
  imagePath: string;
  width: number;
  height: number;
  ledgerId?: string;
  synthetic: boolean;
}
export interface Field {
  id: string;
  docId: string;
  name: string;
  value: string | number | boolean;
  page: number;
  bbox: BBox;
  confidence: number;
  model: string;
}
export interface EvidenceCrop {
  id: string;
  fieldId: string;
  docId: string;
  field: string;
  value: string | number | boolean;
  path: string;
  sha256: string;
  bbox: BBox;
  confidence: number;
  method: "sam" | "box" | "fixture";
  maskPath?: string;
  maskSha256?: string;
  verification?: Verification;
}
export interface Verification {
  model: string;
  agrees: boolean;
  value: string | number | boolean | null;
  confidence: number;
  timestamp: string;
  mode: Mode;
  reason?: string;
}
export interface Claim {
  id: string;
  ledgerId: string;
  test: TestName;
  result: Result;
  expected: string | number | boolean | null;
  observed: string | number | boolean | null;
  reasons: string[];
  cropIds: string[];
  confidence: number;
  verification?: Verification;
  attempts: number;
}
export interface AgentEvent {
  id: string;
  timestamp: string;
  stage:
    | "plan"
    | "extract"
    | "segment"
    | "match"
    | "verify"
    | "retry"
    | "escalate"
    | "complete"
    | "error"
    | "review"
    | "note";
  message: string;
  ledgerId?: string;
  model?: string;
  providerCall?: ProviderCall;
  previousHash: string;
  hash: string;
}
export interface Note {
  id: string;
  ledgerId: string;
  text: string;
  createdAt: string;
  source: "typed" | "voice";
  turns?: { start: number; end: number; text: string }[];
}
export interface Review {
  id: string;
  claimId: string;
  decision: "accepted" | "follow_up";
  reviewer: string;
  note: string;
  createdAt: string;
}
export interface Engagement {
  id: string;
  name: string;
  client: string;
  period: string;
  createdAt: string;
  mode: Mode;
  status: "ready" | "running" | "complete" | "failed";
  ledger: LedgerLine[];
  documents: Document[];
  fields: Field[];
  crops: EvidenceCrop[];
  claims: Claim[];
  events: AgentEvent[];
  notes: Note[];
  reviews: Review[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
}
export interface Settings {
  mode: Mode;
  metaConfigured: boolean;
  basetenConfigured: boolean;
  sparkModel: string;
  verifierModel: string;
  samModel: string;
  voiceModel: string;
  threshold: number;
}
export interface Fixture {
  ledger: LedgerLine[];
  documents: Document[];
  fields: Field[];
  expected: { ledgerId: string; test: TestName; result: Result }[];
}
export interface EngineOptions {
  mode: Mode;
  dataDir: string;
  threshold?: number;
  onUpdate?: (engagement: Engagement) => void | Promise<void>;
  signal?: AbortSignal;
}
