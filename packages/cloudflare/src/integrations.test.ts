import { describe, expect, it } from 'vitest';
import type { ExperimentAssignmentRequest, SocialPostDraft } from '@alneas/sitekit';
import { createHttpExperimentProvider, createHttpSocialPublisher } from './integrations.js';

const assignmentRequest: ExperimentAssignmentRequest = {
  siteId: 'site-1',
  experimentId: 'hero-copy',
  anonymousId: 'anon-1',
  sessionId: 'session-1',
};

const draft: SocialPostDraft = {
  id: 'post-1',
  platform: 'instagram',
  text: 'New article',
  media: [],
  idempotencyKey: 'post-1:instagram',
};

describe('Cloudflare HTTP integration providers', () => {
  it('assigns and records experiment exposure with injected server headers', async () => {
    const requests: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
    const provider = createHttpExperimentProvider({
      assignEndpoint: 'https://eaos.example/experiments/assign',
      exposureEndpoint: 'https://eaos.example/experiments/exposure',
      headers: () => ({ authorization: 'Bearer server-only' }),
      fetch: async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body), headers: init.headers });
        return {
          ok: true,
          status: 200,
          async json() {
            return { experimentId: 'hero-copy', variantId: 'variant-b', exposureId: 'exposure-1' };
          },
        };
      },
    });

    const assignment = await provider.assign(assignmentRequest);
    await provider.recordExposure(assignment);

    expect(assignment).toEqual({ experimentId: 'hero-copy', variantId: 'variant-b', exposureId: 'exposure-1' });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      url: 'https://eaos.example/experiments/assign',
      body: assignmentRequest,
      headers: { authorization: 'Bearer server-only' },
    });
    expect(requests[1]).toMatchObject({
      url: 'https://eaos.example/experiments/exposure',
      body: assignment,
    });
  });

  it('publishes a normalized social draft and validates the response identity', async () => {
    const publisher = createHttpSocialPublisher({
      publishEndpoint: 'https://eaos.example/social/publish',
      fetch: async (_url, init) => {
        expect(JSON.parse(init.body)).toEqual(draft);
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              status: 'published',
              platform: 'instagram',
              idempotencyKey: 'post-1:instagram',
              externalId: 'remote-1',
              externalUrl: 'https://instagram.example/p/remote-1',
              publishedAt: '2026-09-19T00:00:00.000Z',
            };
          },
        };
      },
    });

    await expect(publisher.publish(draft)).resolves.toMatchObject({
      status: 'published',
      externalId: 'remote-1',
    });
  });

  it('rejects insecure endpoints and malformed responses', async () => {
    expect(() => createHttpSocialPublisher({
      publishEndpoint: 'http://eaos.example/social/publish',
      fetch: async () => ({ ok: true, status: 200, async json() { return {}; } }),
    })).toThrow('must use HTTPS');

    const provider = createHttpExperimentProvider({
      assignEndpoint: 'https://eaos.example/assign',
      exposureEndpoint: 'https://eaos.example/exposure',
      fetch: async () => ({ ok: true, status: 200, async json() { return { variantId: 'missing' }; } }),
    });
    await expect(provider.assign(assignmentRequest)).rejects.toThrow('Invalid experiment assignment response');
  });
});
