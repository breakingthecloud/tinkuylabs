/**
 * tinkuy-neptune-validator — Ontology Verification Layer Lambda
 *
 * Tokenops-002 blueprint. Validates the raw Bedrock AgentCore / Strands
 * output against the strict T-Box ontology using the Tinkuy `ontology`
 * module (@carloscortezcloud/tinkuy-agent@0.5.0) — zero-token, pure CPU.
 *
 * - Valid response → compress to pure data relations (payload compression,
 *   feeds prompt caching) and return for the next step.
 * - Structural hallucination → throw `OntologyViolationException` so the
 *   Step Functions Catch block escalates to `HandleHallucinationError`
 *   (reasoning tier re-loop) instead of persisting corrupt data.
 *
 * The Neptune endpoint is part of the event (per the ASL) and reserved for
 * a future SPARQL/Gremlin graph lookup; the in-memory validator is the
 * fast-path referee (Grounding Ledger).
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseOntologyYaml,
  validateResponse,
  OntologyViolationException,
  type OntologySchema,
  type ValidationResult,
} from '@carloscortezcloud/tinkuy-agent/ontology';

export { OntologyViolationException };

export interface ValidateEvent {
  agentOutput: unknown;
  neptuneEndpoint?: string;
}

export interface ValidateResult extends ValidationResult {
  neptuneEndpoint?: string;
  compressedPayload: unknown;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load the bundled tokenops_ontology.yaml (fail-fast on malformed schema). */
export async function loadSchema(path = join(__dirname, '..', 'ontology.yaml')): Promise<OntologySchema> {
  const raw = await readFile(path, 'utf8');
  return parseOntologyYaml(raw);
}

/** Lambda handler entry point */
export async function handler(
  event: ValidateEvent,
  _env: Record<string, string> = process.env as Record<string, string>,
): Promise<ValidateResult> {
  const schema = await loadSchema();
  const validation = validateResponse(event.agentOutput, schema);

  return {
    ...validation,
    neptuneEndpoint: event.neptuneEndpoint,
    compressedPayload: validation.extracted,
  };
}
