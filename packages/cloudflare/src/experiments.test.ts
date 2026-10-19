import { describe, expect, it } from 'vitest';
import { selectExperimentVariant, type ExperimentDefinition } from './experiments.js';

const definition: ExperimentDefinition = {
  id: 'hero-copy',
  siteId: 'site-1',
  name: 'Hero copy',
  status: 'running',
  variants: [{ id: 'a' }, { id: 'b' }],
  createdAt: '2026-09-19T00:00:00.000Z',
  modifiedAt: '2026-09-19T00:00:00.000Z',
};

describe('D1 experiment primitives', () => {
  it('assigns the same seed to the same variant', () => {
    expect(selectExperimentVariant(definition, 'anonymous-1')).toEqual(
      selectExperimentVariant(definition, 'anonymous-1'),
    );
  });

  it('supports weighted variants and rejects an empty definition', () => {
    const weighted = { ...definition, variants: [{ id: 'control', weight: 0.01 }, { id: 'treatment', weight: 100 }] };
    expect(selectExperimentVariant(weighted, 'anonymous-1').id).toBe('treatment');
    expect(() => selectExperimentVariant({ ...definition, variants: [] }, 'anonymous-1')).toThrow('no variants');
  });
});
