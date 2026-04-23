import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @tela/db
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockFindFirst = vi.fn();

vi.mock('@tela/db', () => ({
  getDb: () => ({
    insert: mockInsert,
    update: mockUpdate,
    query: {
      itemPhotos: { findFirst: mockFindFirst },
      closets: { findFirst: mockFindFirst },
    },
  }),
  closetItems: { id: 'id' },
  closets: { id: 'id', userId: 'user_id', itemCount: 'item_count' },
  itemPhotos: {},
}));

// Mock @tela/events
const mockLogEvent = vi.fn().mockResolvedValue('event-123');
vi.mock('@tela/events', () => ({
  logEvent: mockLogEvent,
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

// Import after mocks
const { addItem } = await import('./addItem.js');
const { runInContext } = await import('../context/requestContext.js');

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

const validInput = {
  photoId: '550e8400-e29b-41d4-a716-446655440001',
  metadata: {
    category: 'top',
    subcategory: 't-shirt',
    primaryColor: 'navy',
    secondaryColor: null,
    pattern: 'solid',
    style: 'casual',
    fit: 'regular',
    length: null,
    sleeveLength: 'short',
    description: 'A navy blue t-shirt',
    formalityScore: 0.3,
    materialWeight: 'light' as const,
    seasonCompatibility: ['spring', 'summer'] as const,
    analysisLocale: 'en',
  },
};

const TEST_CONTEXT = { userId: TEST_USER_ID, source: 'test' as const };

describe('wardrobe.addItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockResolvedValue([{ id: 'item-001' }]);
    mockValues.mockReturnValue({ returning: mockReturning });
    mockInsert.mockReturnValue({ values: mockValues });
    mockWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockWhere });
    mockUpdate.mockReturnValue({ set: mockSet });
  });

  it('has the correct name and description', () => {
    expect(addItem.name).toBe('wardrobe.addItem');
    expect(addItem.description).toContain('Add a clothing item');
  });

  it('input schema no longer accepts userId (auth context required instead)', () => {
    // userId is no longer part of the input schema; passing it is silently dropped
    const result = addItem.input.safeParse({ ...validInput, userId: 'whatever' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).userId).toBeUndefined();
    }
  });

  it('validates input schema rejects invalid formalityScore', () => {
    const result = addItem.input.safeParse({
      ...validInput,
      metadata: { ...validInput.metadata, formalityScore: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it('validates input schema applies defaults for optional fields', () => {
    const minimalInput = {
      photoId: '550e8400-e29b-41d4-a716-446655440001',
      metadata: { category: 'top', primaryColor: 'navy' },
    };
    const result = addItem.input.safeParse(minimalInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata.formalityScore).toBe(0.5);
      expect(result.data.metadata.materialWeight).toBe('medium');
      expect(result.data.metadata.seasonCompatibility).toEqual([]);
      expect(result.data.metadata.analysisLocale).toBe('en');
    }
  });

  it('validates output schema', () => {
    const result = addItem.output.safeParse({
      itemId: '550e8400-e29b-41d4-a716-446655440000',
      closetId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(true);
  });

  it('executes successfully when photo exists and closet exists', async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: validInput.photoId, userId: TEST_USER_ID })
      .mockResolvedValueOnce({ id: 'closet-001', userId: TEST_USER_ID });
    mockReturning.mockResolvedValueOnce([{ id: 'item-001' }]);

    const result = await runInContext(TEST_CONTEXT, () => addItem.execute(validInput));

    expect(result.itemId).toBe('item-001');
    expect(result.closetId).toBe('closet-001');
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER_ID,
        type: 'wardrobe.item_added',
        source: 'test',
      }),
    );
  });

  it('creates closet if none exists', async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: validInput.photoId, userId: TEST_USER_ID })
      .mockResolvedValueOnce(null);
    mockReturning
      .mockResolvedValueOnce([{ id: 'new-closet-001' }])
      .mockResolvedValueOnce([{ id: 'item-001' }]);

    const result = await runInContext(TEST_CONTEXT, () => addItem.execute(validInput));

    expect(result.closetId).toBe('new-closet-001');
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('throws when photo not found', async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(
      runInContext(TEST_CONTEXT, () => addItem.execute(validInput)),
    ).rejects.toThrow('Photo not found or does not belong to user');
  });

  it('throws when called outside a request context', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: validInput.photoId, userId: TEST_USER_ID });
    await expect(addItem.execute(validInput)).rejects.toThrow('No RequestContext available');
  });
});
