import type { AgentConfig, Framework, Models, Budget, Tracing, Guardrails, Tools, Memory, Runtime } from "./types.js";

export interface AdapterResult<T> {
  framework: Framework;
  config: T;
  warnings: string[];
}

export interface Adapter<T = unknown> {
  readonly framework: Framework;
  readonly version: string;
  translate(config: AgentConfig): AdapterResult<T>;
  /** Return what features of the universal config this adapter supports */
  capabilities(): AdapterCapabilities;
}

export interface AdapterCapabilities {
  models: boolean;
  budget: boolean;
  guardrails: boolean;
  tracing: boolean;
  tools: boolean;
  memory: boolean;
  orchestration: boolean;
  runtime: boolean;
}

// ─── Strands Adapter ───────────────────────────────────────────────

export interface StrandsConfig {
  agent: {
    name: string;
    description?: string;
  };
  model: {
    model_id: string;
    provider?: string;
    config?: Record<string, unknown>;
  };
  budget?: {
    max_cost_usd?: number;
    max_tokens?: number;
    soft_thresholds?: number[];
  };
  tracing?: {
    enabled: boolean;
    exporter?: string;
  };
  tools?: string[];
  system_prompt?: string;
}

export class StrandsAdapter implements Adapter<StrandsConfig> {
  readonly framework = "strands" as const;
  readonly version = "1.0.0";

  capabilities(): AdapterCapabilities {
    return {
      models: true,
      budget: true,
      guardrails: true,
      tracing: true,
      tools: true,
      memory: false,
      orchestration: false,
      runtime: true,
    };
  }

  translate(config: AgentConfig): AdapterResult<StrandsConfig> {
    const warnings: string[] = [];
    const models = config.models;

    const strandsConfig: StrandsConfig = {
      agent: {
        name: config.agent.name,
        description: config.agent.description,
      },
      model: {
        model_id: models.primary.model,
        provider: models.primary.provider,
        config: models.primary.settings as Record<string, unknown>,
      },
    };

    if (config.budget?.limits) {
      strandsConfig.budget = {
        max_cost_usd: config.budget.limits.perRun?.maxCostUsd,
        max_tokens: config.budget.limits.perRun?.maxTokens,
        soft_thresholds: config.budget.softThresholds,
      };
    }

    if (config.tracing) {
      strandsConfig.tracing = {
        enabled: config.tracing.enabled !== false,
        exporter: config.tracing.exporter,
      };
    }

    if (config.tools?.functions) {
      strandsConfig.tools = config.tools.functions.map((t) => t.name);
    }

    if (config.memory?.longTerm?.enabled) {
      warnings.push("Strands adapter: longTerm memory not natively supported. Use extensions.strands for custom config.");
    }

    if (config.orchestration?.mode && config.orchestration.mode !== "single") {
      warnings.push(`Strands adapter: orchestration mode '${config.orchestration.mode}' requires manual setup.`);
    }

    return { framework: this.framework, config: strandsConfig, warnings };
  }
}

// ─── LangGraph Adapter ─────────────────────────────────────────────

export interface LangGraphConfig {
  name: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  tools: string[];
  checkpointer?: string;
  recursion_limit?: number;
  metadata?: Record<string, unknown>;
}

export class LangGraphAdapter implements Adapter<LangGraphConfig> {
  readonly framework = "langgraph" as const;
  readonly version = "1.0.0";

  capabilities(): AdapterCapabilities {
    return {
      models: true,
      budget: false,
      guardrails: false,
      tracing: true,
      tools: true,
      memory: true,
      orchestration: true,
      runtime: true,
    };
  }

  translate(config: AgentConfig): AdapterResult<LangGraphConfig> {
    const warnings: string[] = [];

    const langgraphConfig: LangGraphConfig = {
      name: config.agent.name,
      model: config.models.primary.model,
      temperature: config.models.primary.settings?.temperature,
      max_tokens: config.models.primary.settings?.maxTokens,
      tools: config.tools?.functions?.map((t) => t.name) || [],
      recursion_limit: config.guardrails?.loopDetection?.maxIterations || 25,
      metadata: {
        version: config.agent.version,
        description: config.agent.description,
      },
    };

    if (config.memory?.session?.backend) {
      langgraphConfig.checkpointer = config.memory.session.backend;
    }

    if (config.budget?.enabled) {
      warnings.push("LangGraph adapter: budget limits require custom middleware. Consider extensions.langgraph.");
    }

    if (config.guardrails?.input?.length || config.guardrails?.output?.length) {
      warnings.push("LangGraph adapter: guardrails require custom node implementation.");
    }

    return { framework: this.framework, config: langgraphConfig, warnings };
  }
}

// ─── OpenAI Agents SDK Adapter ─────────────────────────────────────

export interface OpenAIAgentsConfig {
  name: string;
  instructions?: string;
  model?: string;
  model_settings?: Record<string, unknown>;
  input_guardrails?: string[];
  output_guardrails?: string[];
  handoffs?: string[];
  tools?: string[];
  tracing_disabled?: boolean;
}

export class OpenAIAgentsAdapter implements Adapter<OpenAIAgentsConfig> {
  readonly framework = "openai-agents" as const;
  readonly version = "1.0.0";

  capabilities(): AdapterCapabilities {
    return {
      models: true,
      budget: false,
      guardrails: true,
      tracing: true,
      tools: true,
      memory: false,
      orchestration: true,
      runtime: true,
    };
  }

  translate(config: AgentConfig): AdapterResult<OpenAIAgentsConfig> {
    const warnings: string[] = [];

    const openaiConfig: OpenAIAgentsConfig = {
      name: config.agent.name,
      instructions: config.agent.description,
      model: config.models.primary.model,
      model_settings: config.models.primary.settings as Record<string, unknown>,
      input_guardrails: config.guardrails?.input?.map((g) => g.type),
      output_guardrails: config.guardrails?.output?.map((g) => g.type),
      handoffs: config.orchestration?.handoffs?.map((h) => h.agent),
      tools: config.tools?.functions?.map((t) => t.name),
      tracing_disabled: config.tracing?.enabled === false,
    };

    if (config.budget?.enabled) {
      warnings.push("OpenAI Agents SDK adapter: budget requires custom RunHooks. See extensions.openai-agents.");
    }

    if (config.memory?.longTerm?.enabled) {
      warnings.push("OpenAI Agents SDK adapter: longTerm memory not native. Use tools for retrieval.");
    }

    return { framework: this.framework, config: openaiConfig, warnings };
  }
}

// ─── CrewAI Adapter ────────────────────────────────────────────────

export interface CrewAIConfig {
  role: string;
  goal: string;
  backstory: string;
  llm: string;
  tools: string[];
  max_iter: number;
  verbose: boolean;
}

export class CrewAIAdapter implements Adapter<CrewAIConfig> {
  readonly framework = "crewai" as const;
  readonly version = "1.0.0";

  capabilities(): AdapterCapabilities {
    return {
      models: true,
      budget: false,
      guardrails: false,
      tracing: false,
      tools: true,
      memory: true,
      orchestration: true,
      runtime: true,
    };
  }

  translate(config: AgentConfig): AdapterResult<CrewAIConfig> {
    const warnings: string[] = [];

    const crewConfig: CrewAIConfig = {
      role: config.agent.name,
      goal: config.agent.description || `${config.agent.name} agent`,
      backstory: config.agent.description || `AI agent: ${config.agent.name}`,
      llm: config.models.primary.model,
      tools: config.tools?.functions?.map((t) => t.name) || [],
      max_iter: config.guardrails?.loopDetection?.maxIterations || 5,
      verbose: config.tracing?.enabled !== false,
    };

    if (config.budget?.enabled) {
      warnings.push("CrewAI adapter: budget limits not supported natively.");
    }

    if (config.orchestration?.mode === "graph") {
      warnings.push("CrewAI adapter: graph mode not supported. Use 'hierarchical' or 'sequential'.");
    }

    return { framework: this.framework, config: crewConfig, warnings };
  }
}

// ─── Tinkuy Adapter ────────────────────────────────────────────────

export interface TinkuyConfig {
  name: string;
  description?: string;
  framework: "tinkuy";
  llm: {
    model: string;
    provider?: string;
    baseUrl?: string;
    settings?: Record<string, unknown>;
  };
  budgetGuard?: {
    monthlyUsd?: number;
    perRunUsd?: number;
    softThresholds?: number[];
    onExceeded: string;
  };
  trace?: {
    enabled: boolean;
    exporter?: string;
    privacy?: string;
  };
  guardrails?: {
    pii?: { enabled: boolean; mode?: string };
    loop?: { maxIterations?: number; maxToolCalls?: number };
  };
  tools?: {
    functions?: string[];
    mcp?: Array<{ name: string; transport: string; url?: string; command?: string }>;
  };
  memory?: {
    retriever?: { backend?: string; topK?: number };
    session?: { backend?: string; ttl?: string };
  };
}

export class TinkuyAdapter implements Adapter<TinkuyConfig> {
  readonly framework = "tinkuy" as const;
  readonly version = "1.0.0";

  capabilities(): AdapterCapabilities {
    return {
      models: true,
      budget: true,
      guardrails: true,
      tracing: true,
      tools: true,
      memory: true,
      orchestration: true,
      runtime: true,
    };
  }

  translate(config: AgentConfig): AdapterResult<TinkuyConfig> {
    const warnings: string[] = [];

    const tinkuyConfig: TinkuyConfig = {
      name: config.agent.name,
      description: config.agent.description,
      framework: "tinkuy",
      llm: {
        model: config.models.primary.model,
        provider: config.models.primary.provider,
        baseUrl: config.models.primary.baseUrl,
        settings: config.models.primary.settings as Record<string, unknown>,
      },
      budgetGuard: {
        monthlyUsd: config.budget?.limits?.perMonth?.maxCostUsd,
        perRunUsd: config.budget?.limits?.perRun?.maxCostUsd,
        softThresholds: config.budget?.softThresholds,
        onExceeded: config.budget?.onHardExceeded || "reject",
      },
      trace: {
        enabled: config.tracing?.enabled !== false,
        exporter: config.tracing?.exporter,
        privacy: config.tracing?.privacy,
      },
      guardrails: {
        pii: {
          enabled: config.guardrails?.pii?.enabled || false,
          mode: config.guardrails?.pii?.mode,
        },
        loop: {
          maxIterations: config.guardrails?.loopDetection?.maxIterations,
          maxToolCalls: config.guardrails?.loopDetection?.maxToolCalls,
        },
      },
      tools: {
        functions: config.tools?.functions?.map((t) => t.name),
        mcp: config.tools?.mcp?.map((m) => ({
          name: m.name,
          transport: m.transport,
          url: m.url,
          command: m.command,
        })),
      },
      memory: {
        retriever: {
          backend: config.memory?.longTerm?.backend,
          topK: config.memory?.longTerm?.topK,
        },
        session: {
          backend: config.memory?.session?.backend,
          ttl: config.memory?.session?.ttl,
        },
      },
    };

    if (config.orchestration?.handoffs?.length) {
      warnings.push("Tinkuy adapter: handoffs require extensions.tinkuy.orchestration setup.");
    }

    return { framework: this.framework, config: tinkuyConfig, warnings };
  }
}

// ─── Adapter Registry ──────────────────────────────────────────────

export class AdapterRegistry {
  private adapters = new Map<Framework, Adapter>();

  register(adapter: Adapter): void {
    this.adapters.set(adapter.framework, adapter);
  }

  get(framework: Framework): Adapter | undefined {
    return this.adapters.get(framework);
  }

  list(): Framework[] {
    return [...this.adapters.keys()];
  }
}

export function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(new StrandsAdapter());
  registry.register(new LangGraphAdapter());
  registry.register(new OpenAIAgentsAdapter());
  registry.register(new CrewAIAdapter());
  registry.register(new TinkuyAdapter());
  return registry;
}
