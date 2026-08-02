import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  handler,
  OntologyViolationException,
  loadSchema,
} from '../src/handler.js';
import { validateResponse } from '@carloscortezcloud/tinkuy-agent/ontology';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ontologyYaml = readFileSync(join(__dirname, '..', 'ontology.yaml'), 'utf8');

const CLIENT_UUID = '11111111-1111-1111-1111-111111111111';
const INVOICE_UUID = '22222222-2222-2222-2222-222222222222';

/** A response that satisfies the v1.1 contract (required id/status/currency). */
function validResponse() {
  return {
    entities: [
      { type: 'Client', id: CLIENT_UUID, status: 'ACTIVE' },
      { type: 'Invoice', id: INVOICE_UUID, amount: 100.5, currency: 'USD' },
    ],
    relations: [{ origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' }],
  };
}

describe('loadSchema', () => {
  it('parses the bundled tokenops ontology YAML (v1.1)', async () => {
    const schema = await loadSchema();
    expect(schema.domain).toBe('customer_operations');
    expect(schema.ontology.entities.map((e) => e.name)).toEqual(['Client', 'Invoice']);
    expect(schema.version).toBe('1.1');
    expect(schema.harness_constraints.fail_on_unknown_relation).toBe(true);
    expect(schema.ontology.allowed_relations.find((r) => r.relation === 'BELONGS_TO')?.cardinality).toBe('1:1');
  });
});

describe('handler — ontology verification layer', () => {
  it('accepts a valid relation and compresses the payload', async () => {
    const result = await handler({
      agentOutput: validResponse(),
      neptuneEndpoint: 'arn:aws:neptune:us-east-1:123456789012:cluster:ontology-core',
    });
    expect(result.valid).toBe(true);
    expect(result.compressedPayload).toBeDefined();
    expect(result.neptuneEndpoint).toContain('ontology-core');
  });

  it('throws OntologyViolationException on structural hallucination', async () => {
    await expect(
      handler({
        agentOutput: {
          entities: [{ type: 'Teleporter', id: CLIENT_UUID, status: 'ACTIVE' }],
          relations: [{ origin: 'Teleporter', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' }],
        },
      }),
    ).rejects.toThrow(OntologyViolationException);
  });

  it('throw name matches the ASL ErrorEquals matcher', async () => {
    try {
      await handler({
        agentOutput: {
          entities: [{ type: 'Ghost', id: CLIENT_UUID, status: 'ACTIVE' }],
          relations: [{ origin: 'Ghost', relation: 'OWNS_THE_BANK', target: 'Client' }],
        },
      });
    } catch (err) {
      expect((err as Error).name).toBe('OntologyViolationException');
    }
  });

  it('grounds against the same T-Box contract as tinkuy', async () => {
    const schema = await loadSchema();
    const result = validateResponse(validResponse(), schema);
    expect(result.valid).toBe(true);
  });

  it('enforces v1.1 required properties and enums', async () => {
    const bad = validResponse();
    // Drop the required Client.status and set an out-of-enum currency
    (bad.entities[0] as Record<string, unknown>).status = 'FLYING';
    await expect(handler({ agentOutput: bad })).rejects.toThrow(OntologyViolationException);
  });
});
