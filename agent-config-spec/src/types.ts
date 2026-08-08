// Agent Config Specification v1 — TypeScript Types
// Source: https://agentconfig.dev/schemas/v1/agent.config.schema.json

export type Framework =
  | "tinkuy"
  | "strands"
  | "langgraph"
  | "openai-agents"
  | "crewai"
  | "pydantic-ai"
  | "autogen"
  | "llamaindex"
  | "vercel-ai"
  | "custom";

export type Provider =
  | "openai"
  | "anthropic"
  | "google"
  | "azure"
  | "bedrock"
  | "ollama"
  | "groq"
  | "mistral"
  | "together"
  | "openrouter"
  | "custom";

export type RoutingStrategy =
  | "priority"
  | "cost-optimized"
  | "latency-optimized"
  | "round-robin"
  | "failover";

export type BudgetAction = "log" | "downgrade-model" | "reduce-capabilities" | "notify" | "reject" | "halt";

export type PrivacyLevel = "none" | "metadata-only" | "full";

export type SpanKind =
  | "agent"
  | "llm_call"
  | "tool_call"
  | "planning"
  | "reasoning"
  | "retrieval"
  | "guardrail"
  | "delegation"
  | "memory";

export type ExporterType =
  | "otel"
  | "console"
  | "file"
  | "datadog"
  | "braintrust"
  | "langfuse"
  | "langsmith"
  | "arize-phoenix"
  | "custom";

export type GuardrailViolationAction = "block" | "warn" | "redact" | "escalate";

export type LoopAction = "halt" | "notify" | "inject-message" | "escalate";

export type PIIMode = "detect" | "redact" | "block";

export type PIIEntity =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "ip_address"
  | "name"
  | "address"
  | "date_of_birth"
  | "passport"
  | "medical";

export type MCPTransport = "stdio" | "sse" | "streamable-http";

export type MemoryType = "sliding-window" | "summary" | "full";

export type VectorBackend =
  | "pinecone"
  | "qdrant"
  | "weaviate"
  | "chroma"
  | "milvus"
  | "redis"
  | "postgres"
  | "memory"
  | "custom";

export type SessionBackend = "memory" | "redis" | "sqlite" | "postgres" | "dynamodb";

export type OrchestrationMode = "single" | "sequential" | "hierarchical" | "swarm" | "graph";

export type SecretSource = "env" | "file" | "aws-secrets-manager" | "gcp-secret-manager" | "azure-keyvault" | "vault";

export type BudgetPersistenceBackend = "memory" | "redis" | "sqlite" | "postgres";

export interface AgentConfig {
  agent: Agent;
  models: Models;
  budget?: Budget;
  guardrails?: Guardrails;
  tracing?: Tracing;
  tools?: Tools;
  memory?: Memory;
  orchestration?: Orchestration;
  runtime?: Runtime;
  extensions?: Partial<Record<Framework, Record<string, unknown>>>;
}

export interface Agent {
  name: string;
  description?: string;
  version?: string;
  framework?: Framework;
  tags?: string[];
}

export interface Models {
  primary: ModelConfig;
  fallbacks?: ModelConfig[];
  routing?: RoutingConfig;
}

export interface ModelConfig {
  model: string;
  provider?: Provider;
  baseUrl?: string;
  apiKey?: string;
  settings?: ModelSettings;
}

export interface ModelSettings {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  maxTokensInput?: number;
  maxTokensOutput?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
  [key: string]: unknown;
}

export interface RoutingConfig {
  strategy?: RoutingStrategy;
  modes?: Record<string, RoutingMode>;
  modelMapping?: Record<string, string>;
}

export interface RoutingMode {
  model?: string;
  provider?: string;
}

export interface Budget {
  enabled?: boolean;
  currency?: string;
  limits?: BudgetLimits;
  softThresholds?: number[];
  onSoftExceeded?: BudgetAction;
  onHardExceeded?: BudgetAction;
  persistence?: BudgetPersistence;
}

export interface BudgetLimits {
  perCall?: BudgetLimit;
  perRun?: BudgetLimit;
  perSession?: BudgetLimit;
  perDay?: BudgetLimit;
  perMonth?: BudgetLimit;
  perUser?: BudgetLimit;
  perTenant?: BudgetLimit;
}

export interface BudgetLimit {
  maxCostUsd?: number;
  maxTokens?: number;
  maxCalls?: number;
  maxRetries?: number;
}

export interface BudgetPersistence {
  backend?: BudgetPersistenceBackend;
  connectionString?: string;
}

export interface Guardrails {
  input?: GuardrailConfig[];
  output?: GuardrailConfig[];
  loopDetection?: LoopDetection;
  pii?: PIIGuardrail;
}

export interface GuardrailConfig {
  type: string;
  enabled?: boolean;
  onViolation?: GuardrailViolationAction;
  config?: Record<string, unknown>;
}

export interface LoopDetection {
  enabled?: boolean;
  maxIterations?: number;
  maxToolCalls?: number;
  maxConsecutiveSameTool?: number;
  onDetected?: LoopAction;
}

export interface PIIGuardrail {
  enabled?: boolean;
  mode?: PIIMode;
  entities?: PIIEntity[];
}

export interface Tracing {
  enabled?: boolean;
  exporter?: ExporterType;
  endpoint?: string;
  headers?: Record<string, string>;
  privacy?: PrivacyLevel;
  sampleRate?: number;
  spanKinds?: SpanKind[];
  resourceAttributes?: Record<string, string>;
}

export interface Tools {
  functions?: ToolFunction[];
  mcp?: MCPServerConfig[];
  maxConcurrent?: number;
  toolChoice?: "auto" | "required" | "none";
}

export interface ToolFunction {
  name: string;
  description?: string;
  enabled?: boolean;
  timeoutMs?: number;
}

export interface MCPServerConfig {
  name: string;
  transport: MCPTransport;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export interface Memory {
  shortTerm?: ShortTermMemory;
  longTerm?: LongTermMemory;
  session?: SessionMemory;
}

export interface ShortTermMemory {
  type?: MemoryType;
  maxMessages?: number;
  maxTokens?: number;
}

export interface LongTermMemory {
  enabled?: boolean;
  backend?: VectorBackend;
  connectionString?: string;
  namespace?: string;
  embeddingModel?: string;
  topK?: number;
}

export interface SessionMemory {
  enabled?: boolean;
  backend?: SessionBackend;
  ttl?: string;
}

export interface Orchestration {
  mode?: OrchestrationMode;
  handoffs?: Handoff[];
  maxAgents?: number;
  coordinator?: string;
}

export interface Handoff {
  agent: string;
  description?: string;
  condition?: string;
}

export interface Runtime {
  timeoutMs?: number;
  maxRetries?: number;
  retryBackoff?: "fixed" | "linear" | "exponential";
  retryInitialDelayMs?: number;
  retryMaxDelayMs?: number;
  concurrency?: number;
  environment?: "development" | "staging" | "production";
  secrets?: SecretRef[];
}

export interface SecretRef {
  name: string;
  source: SecretSource;
  reference: string;
}
