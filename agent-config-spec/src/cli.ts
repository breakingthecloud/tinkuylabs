#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml, stringify } from "yaml";
import { validate, detectFramework, createDefaultRegistry } from "./index.js";
import type { AgentConfig, Framework } from "./types.js";

interface CliOptions {
  configPath: string;
  target?: string;
  format?: "json" | "yaml" | "table";
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { configPath: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target" || arg === "-t") {
      opts.target = argv[++i];
    } else if (arg === "--format" || arg === "-f") {
      opts.format = argv[++i] as "json" | "yaml" | "table";
    } else if (!arg.startsWith("-") && !opts.configPath) {
      opts.configPath = arg;
    }
  }
  return opts;
}

function loadConfig(path: string): unknown {
  const fullPath = resolve(path);
  const content = readFileSync(fullPath, "utf-8");

  if (path.endsWith(".yaml") || path.endsWith(".yml")) {
    return parseYaml(content);
  }
  return JSON.parse(content);
}

function printUsage(): void {
  console.log(`
agent-config — Universal Agent Config CLI

Usage:
  agent-config <config.yaml> [commands] [options]

Commands (default: validate + show):
  validate    Validate config against schema
  translate   Translate to target framework config
  detect      Auto-detect framework
  diff        Compare two configs

Options:
  -t, --target <framework>   Target framework for translate (tinkuy, strands, langgraph, openai-agents, crewai)
  -f, --format <format>      Output format: json, yaml, table (default: table)

Examples:
  agent-config agent.yaml
  agent-config agent.yaml translate --target strands
  agent-config agent.yaml detect
`);
}

export function runCli(argv: string[]): number {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    printUsage();
    return 0;
  }

  const opts = parseArgs(argv);
  if (!opts.configPath) {
    console.error("Error: config path required");
    printUsage();
    return 1;
  }

  const rawConfig = loadConfig(opts.configPath);
  const command = argv.find((a) => !a.startsWith("-") && a !== opts.configPath) || "validate";

  switch (command) {
    case "validate":
      return cmdValidate(rawConfig, opts);
    case "detect":
      return cmdDetect(rawConfig, opts);
    case "translate":
      return cmdTranslate(rawConfig, opts);
    default:
      console.error(`Unknown command: ${command}`);
      return 1;
  }
}

function cmdValidate(rawConfig: unknown, _opts: CliOptions): number {
  const result = validate(rawConfig);

  if (result.valid) {
    console.log("✅ Config is valid");
    const config = rawConfig as AgentConfig;
    console.log(`   Agent: ${config.agent.name}`);
    console.log(`   Model: ${config.models.primary.model}`);
    const detected = detectFramework(config);
    console.log(`   Detected framework: ${detected}`);
    return 0;
  }

  console.error("❌ Config is invalid:");
  for (const err of result.errors) {
    console.error(`   ${err.path}: ${err.message}`);
  }
  return 1;
}

function cmdDetect(rawConfig: unknown, _opts: CliOptions): number {
  const result = validate(rawConfig);
  if (!result.valid) {
    console.error("❌ Cannot detect framework: config is invalid");
    return 1;
  }

  const config = rawConfig as AgentConfig;
  const framework = detectFramework(config);
  console.log(`Detected framework: ${framework}`);
  console.log(`Agent: ${config.agent.name}`);
  console.log(`Model: ${config.models.primary.model} (${config.models.primary.provider || "default"})`);

  // Show which adapters are available
  const registry = createDefaultRegistry();
  const adapter = registry.get(framework);
  if (adapter) {
    const caps = adapter.capabilities();
    console.log(`\nAdapter capabilities for ${framework}:`);
    for (const [key, supported] of Object.entries(caps)) {
      console.log(`  ${supported ? "✅" : "❌"} ${key}`);
    }
  }

  return 0;
}

function cmdTranslate(rawConfig: unknown, opts: CliOptions): number {
  const result = validate(rawConfig);
  if (!result.valid) {
    console.error("❌ Cannot translate: config is invalid");
    for (const err of result.errors) {
      console.error(`   ${err.path}: ${err.message}`);
    }
    return 1;
  }

  const config = rawConfig as AgentConfig;
  const registry = createDefaultRegistry();
  const target: Framework = (opts.target as Framework) || detectFramework(config);

  const adapter = registry.get(target);
  if (!adapter) {
    console.error(`❌ No adapter for framework: ${target}`);
    console.error(`   Available: ${registry.list().join(", ")}`);
    return 1;
  }

  const translated = adapter.translate(config);

  if (opts.format === "json") {
    console.log(JSON.stringify(translated.config, null, 2));
  } else {
    console.log(stringify(translated.config));
  }

  if (translated.warnings.length > 0) {
    console.error(`\n⚠️  Warnings (${translated.warnings.length}):`);
    for (const w of translated.warnings) {
      console.error(`   - ${w}`);
    }
  }

  return 0;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runCli(process.argv.slice(2)));
}
