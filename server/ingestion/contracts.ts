export type Source = "saramin" | "jobkorea" | "incruit";
export type Quality = "text" | "mixed" | "image" | "unavailable";
export type SourceStatus = "open" | "closed" | "scheduled";
export type Availability = SourceStatus | "deadline_elapsed" | "unknown";
export interface DateValue {
  value: string;
  precision: "day" | "minute";
}
export interface PostingRef {
  tenantKey?: string;
  source: Source;
  id: string;
  url: string;
  title?: string;
  company?: string;
  hints?: string[];
}
export interface HtmlPage {
  html: string;
  url: string;
  pageNumber?: number;
}
export interface DetailDocument extends HtmlPage {
  body?: HtmlPage;
  bodyError?: string;
  assetHashes?: Record<string, string>;
  assetIssues?: string[];
}
export interface DiscoveryPage {
  items: PostingRef[];
  next: string | null;
  complete: boolean;
  issues: string[];
}
export interface PostingFields {
  title: string;
  company: string;
  conditions: Record<string, string>;
  bodyText: string;
  bodyImages: string[];
  bodyAssets: Record<string, string>;
  startsAt: DateValue | null;
  endsAt: DateValue | null;
  sourceStatus: SourceStatus;
}
export interface Snapshot {
  ref: PostingRef;
  observedAt: string;
  fields: Partial<PostingFields>;
  quality: Quality;
  issues: string[];
}
export interface SourceClient {
  list(cursor?: string): Promise<HtmlPage>;
  detail(ref: PostingRef): Promise<DetailDocument>;
  close(): Promise<void>;
}
export interface SourceAdapter {
  source: Source;
  scope: string;
  discover(cursor?: string): Promise<DiscoveryPage>;
  read(ref: PostingRef, observedAt: string): Promise<Snapshot>;
  close(): Promise<void>;
}
export interface RunLimits {
  maxPages: number;
  maxDetails: number;
}
export interface RunReport {
  id: string;
  source: Source;
  mode: "discover" | "refresh";
  scope: string;
  status: "complete" | "partial" | "failed";
  pages: number;
  discovered: number;
  created: number;
  changed: number;
  unchanged: number;
  failed: number;
  next: string | null;
  errors: string[];
}
