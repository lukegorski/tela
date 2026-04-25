import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb, outfits, tryOnJobs } from '@tela/db';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';
import { getSupabaseAdmin, TRY_ON_BUCKET } from '../storage/supabase.js';

const input = z.object({
  outfitId: z.string().uuid(),
});

const output = z.object({
  deleted: z.boolean(),
});

export const deleteOutfit = registerCapability({
  name: 'outfit.delete',
  chatTool: true,
  description:
    "Permanently delete an outfit. Cascades to outfit_items + try_on_jobs rows, and best-effort cleans up the try-on result images from Supabase Storage.",
  input,
  output,

  async execute({ outfitId }) {
    const { userId, source } = getRequestContext();
    const db = getDb();

    // Collect storage paths up front — once we delete the outfit, the
    // try_on_jobs rows cascade away and we lose the paths.
    const jobs = await db
      .select({ resultStoragePath: tryOnJobs.resultStoragePath })
      .from(tryOnJobs)
      .where(and(eq(tryOnJobs.outfitId, outfitId), eq(tryOnJobs.userId, userId)));
    const pathsToCleanUp = jobs
      .map((j) => j.resultStoragePath)
      .filter((p): p is string => !!p);

    await db.transaction(async (tx) => {
      const result = await tx
        .delete(outfits)
        .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)))
        .returning({ id: outfits.id });
      if (result.length === 0) throw new Error('Outfit not found');
    });

    if (pathsToCleanUp.length > 0) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.storage.from(TRY_ON_BUCKET).remove(pathsToCleanUp);
      if (error) {
        // Best-effort — orphaned blobs aren't user-visible. Log and move on.
        // eslint-disable-next-line no-console
        console.warn(
          `[outfit.delete] storage cleanup failed for outfit ${outfitId}:`,
          error.message,
        );
      }
    }

    await logEvent({
      userId,
      type: 'outfit.deleted',
      source,
      payload: { outfitId, storageObjectsRemoved: pathsToCleanUp.length },
    });

    return { deleted: true };
  },
});
