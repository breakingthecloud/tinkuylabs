import type { AgentConfig, Framework } from "./types.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "schemas", "v1", "agent.config.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as Record<string, unknown>;

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
}

interface AjvValidator {
  compile: (s: unknown) => void;
  validate: (s: unknown, c: unknown) => boolean;
  errors: Array<{ instancePath: string; message?: string; keyword: string }>;
}

let ajvInstance: AjvValidator | null = null;

function getAjv(): AjvValidator {
  if (!ajvInstance) {
    const AjvClass = Ajv2020 as unknown as new (opts?: object) => AjvValidator;
    ajvInstance = new AjvClass({ allErrors: true, strict: false });
    ajvInstance.compile(schema);
  }
  return ajvInstance;
}

export function validate(config: unknown): ValidationResult {
  const validator = getAjv();
  const valid = validator.validate(schema, config) as boolean;

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = (validator.errors || []).map((err: { instancePath: string; message?: string; keyword: string }) => ({
    path: err.instancePath || "/",
    message: err.message || "Unknown error",
    keyword: err.keyword,
  }));

  return { valid: false, errors };
}

export function assertValid(config: unknown): asserts config is AgentConfig {
  const result = validate(config);
  if (!result.valid) {
    const msgs = result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Invalid agent config:\n${msgs}`);
  }
}

export function detectFramework(config: AgentConfig): Framework {
  if (config.agent.framework) return config.agent.framework;

  // Heuristic detection from extensions or model provider
  const exts = config.extensions ?? {};
  if (exts.strands) return "strands";
  if (exts.langgraph) return "langgraph";
  if (exts["openai-agents"]) return "openai-agents";
  if (exts.crewai) return "crewai";
  if (exts.tinkuy) return "tinkuy";

  return "custom";
}
