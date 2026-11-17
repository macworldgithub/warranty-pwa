import { expect, it, vi } from 'vitest';
import { createTopicHandler } from '../server/push-topics.mjs';
it('derives notification topics from the verified account and ignores injected topics', async () => {
  const subscribeToTopic = vi.fn().mockResolvedValue({ failureCount: 0 });
  const handler = createTopicHandler({ apiUrl: 'https://backend.test/api/v1', messaging: { subscribeToTopic }, fetcher: vi.fn(async () => Response.json({ id: 'tech-a', role: 'TECHNICIAN' })) });
  const response = await handler(new Request('https://pwa.test/pwa-api/push/topics', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'tech-a', token: 'a-valid-token-at-least-20-characters', topics: ['tech-other'] }) }));
  expect(response.status).toBe(200);
  expect(subscribeToTopic.mock.calls.map(call => call[1])).toEqual(['warranty-all', 'tech-tech-a', 'warranty-techs']);
});
it('rejects unauthenticated and mismatched account registrations', async () => {
  const subscribeToTopic=vi.fn(); const handler = createTopicHandler({ apiUrl: 'https://backend.test/api/v1', messaging: { subscribeToTopic }, fetcher: vi.fn(async () => Response.json({ id: 'tech-a' })) });
  expect((await handler(new Request('https://pwa.test'))).status).toBe(401);
  const response=await handler(new Request('https://pwa.test', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ userId: 'other', token: 'a-valid-token-at-least-20-characters' }) }));
  expect(response.status).toBe(400); expect(subscribeToTopic).not.toHaveBeenCalled();
});
