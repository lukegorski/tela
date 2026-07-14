/**
 * Fail-open kill test (v0 DoD, spec §8a whitelist item c): a cutout enqueue
 * failure — queue outage, pg-boss down, anything — must NEVER affect the
 * enhancement result. Enhancement is the product-critical path; the cutout
 * is a builder-only derivative that regenerates lazily on builder open.
 *
 * The full pipeline's external deps are mocked; the capability runs through
 * the real registry wrapper (input/output validation included) inside a
 * real request context.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const USER_ID = 'cd83153d-1d56-4ac2-8c6b-4d03945c2244';
const PHOTO_ID = '0b6f3f6e-8a68-4b5e-9a51-2f0f2f6c1a11';

const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
const setCalls: Array<Record<string, unknown>> = [];
const queueSend = vi.fn(async () => undefined);

// Rejecting logEvent for this type simulates the worst case: the queue is
// down AND the failure-event write fails too.
let rejectCutoutFailedEvent = false;

vi.mock('drizzle-orm', () => ({
  eq: () => ({}),
  and: () => ({}),
  sql: () => ({}),
}));

vi.mock('@tela/db', () => ({
  itemPhotos: { id: 'id', userId: 'user_id', enhancementAttempts: 'enhancement_attempts' },
  getDb: () => ({
    query: {
      itemPhotos: {
        findFirst: async () => ({
          id: PHOTO_ID,
          userId: USER_ID,
          storagePath: 'items/luke/photo.jpg',
          enhancementStatus: 'pending',
          enhancedStoragePath: null,
          backgroundColor: null,
          enhancementAttempts: 0,
        }),
      },
    },
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        setCalls.push(vals);
        return { where: async () => undefined };
      },
    }),
  }),
}));

vi.mock('@tela/events', () => ({
  logEvent: vi.fn((e: { type: string; payload: Record<string, unknown> }) => {
    if (rejectCutoutFailedEvent && e.type === 'enhancement.cutout_failed') {
      return Promise.reject(new Error('events table unavailable'));
    }
    events.push({ type: e.type, payload: e.payload });
    return Promise.resolve();
  }),
}));

vi.mock('@tela/queue', () => ({
  JOB_NAMES: { CUTOUT_PHOTO: 'enhancement.cutout' },
  getQueue: vi.fn(async () => ({ send: queueSend })),
}));

vi.mock('@tela/ai', () => ({
  image: async () => ({ pngBuffer: Buffer.from('png-bytes'), provenance: { costCents: 6 } }),
}));

vi.mock('@tela/prompts', () => ({
  getPrompt: async () => ({
    name: 'enhancement.product_photo',
    versionId: 'v-test',
    template: 'make it a product photo',
  }),
}));

vi.mock('./imageAnalysis.js', () => ({
  detectBgColor: async () => ({ median: '#f5f5f5' }),
  detectCropping: async () => ({ isCropped: false, croppedEdges: [], edgeRatios: {} }),
  pngToJpeg: async (b: Buffer) => b,
}));

vi.mock('../storage/supabase.js', () => ({
  ITEM_PHOTOS_BUCKET: 'item-photos',
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.test/x' }, error: null }),
        upload: async () => ({ error: null }),
      }),
    },
  }),
}));

vi.stubGlobal('fetch', async () => ({
  ok: true,
  arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
}));

import { executeCapability } from '../registry.js';
import { runInContext } from '../context/requestContext.js';
import { getQueue } from '@tela/queue';
import './process.js'; // registers enhancement.process

const runProcess = () =>
  runInContext(
    { userId: USER_ID, source: 'test', requestId: 'kill-test', isServiceAccount: true } as never,
    () => executeCapability('enhancement.process', { photoId: PHOTO_ID }),
  ) as Promise<{ enhancedStoragePath: string; totalCostCents: number }>;

const eventTypes = () => events.map((e) => e.type);
const failedStatusWrites = () => setCalls.filter((s) => s.enhancementStatus === 'failed');

beforeEach(() => {
  events.length = 0;
  setCalls.length = 0;
  queueSend.mockClear();
  rejectCutoutFailedEvent = false;
  vi.mocked(getQueue).mockResolvedValue({ send: queueSend } as never);
});

describe('enhancement → cutout enqueue is fail-open (kill test)', () => {
  it('control: healthy queue → enhancement completes AND the cutout job is enqueued', async () => {
    const result = await runProcess();

    expect(result.enhancedStoragePath).toBe('items/luke/photo.jpg.enhanced.jpg');
    expect(queueSend).toHaveBeenCalledTimes(1);
    expect(queueSend).toHaveBeenCalledWith('enhancement.cutout', { photoId: PHOTO_ID, userId: USER_ID });
    expect(eventTypes()).toContain('enhancement.completed');
    expect(eventTypes()).not.toContain('enhancement.cutout_failed');
    expect(failedStatusWrites()).toHaveLength(0);
  });

  it('KILL: queue outage → enhancement still succeeds, outage recorded, status never “failed”', async () => {
    vi.mocked(getQueue).mockRejectedValue(new Error('connect ECONNREFUSED (pg-boss down)'));

    const result = await runProcess();

    // Identical success outcome to the control run.
    expect(result.enhancedStoragePath).toBe('items/luke/photo.jpg.enhanced.jpg');
    expect(result.totalCostCents).toBe(6);
    expect(queueSend).not.toHaveBeenCalled();

    // The outage is observable but non-fatal.
    expect(eventTypes()).toContain('enhancement.completed');
    const failure = events.find((e) => e.type === 'enhancement.cutout_failed');
    expect(failure?.payload.stage).toBe('enqueue');
    expect(String(failure?.payload.error)).toContain('ECONNREFUSED');
    expect(eventTypes()).not.toContain('enhancement.failed');

    // The photo row was completed and never flipped to failed.
    expect(failedStatusWrites()).toHaveLength(0);
    expect(setCalls.at(-1)?.enhancementStatus).toBe('complete');
  });

  it('DOUBLE KILL: queue down AND the failure-event write fails → enhancement still succeeds', async () => {
    vi.mocked(getQueue).mockRejectedValue(new Error('queue outage'));
    rejectCutoutFailedEvent = true;

    const result = await runProcess();

    expect(result.enhancedStoragePath).toBe('items/luke/photo.jpg.enhanced.jpg');
    expect(eventTypes()).toContain('enhancement.completed');
    expect(failedStatusWrites()).toHaveLength(0);
    expect(setCalls.at(-1)?.enhancementStatus).toBe('complete');
  });
});
