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

describe('loadSchema', () => {
  it('parses the bundled tokenops ontology YAML', async () => {
    const schema = await loadSchema();
    expect(schema.domain).toBe('customer_operations');
    expect(schema.ontology.entities.map((e) => e.name)).toEqual(['Client', 'Invoice']);
    expect(schema.harness_constraints.fail_on_unknown_relation).toBe(true);
  });
});

describe('handler — ontology verification layer', () => {
  it('accepts a valid relation and compresses the payload', async () => {
    const result = await handler({
      agentOutput: {
        entities: [{ type: 'Client' }, { type: 'Invoice' }],
        relations: [{ origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' }],
      },
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
          entities: [{ type: 'Teleporter' }, { type: 'Invoice' }],
          relations: [{ origin: 'Teleporter', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' }],
        },
      }),
    ).rejects.toThrow(OntologyViolationException);
  });

  it('throw name matches the ASL ErrorEquals matcher', async () => {
    try {
      await handler({
        agentOutput: {
          entities: [{ type: 'Ghost' }],
          relations: [{ origin: 'Ghost', relation: 'OWNS_THE_BANK', target: 'Client' }],
        },
      });
    } catch (err) {
      expect((err as Error).name).toBe('OntologyViolationException');
    }
  });

  it('grounds against the same T-Box contract as tinkuy', async () => {
    const schema = await loadSchema();
    const result = validateResponse(
      {
        entities: [{ type: 'Client' }, { type: 'Invoice' }],
        relations: [{ origin: 'Client', relation: 'HAS_BILLING_DISPUTE', target: 'Invoice' }],
      },
      schema,
    );
    expect(result.valid).toBe(true);
  });
});
