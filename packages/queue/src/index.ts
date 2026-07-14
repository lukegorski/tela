/**
 * Lightweight wrapper around pg-boss for the tela monorepo.
 *
 * Two entry points:
 *   - getQueue() — returns a started PgBoss instance for sending or receiving jobs
 *   - JOB_NAMES   — typed job-name constants shared between API (sender) and workers (receiver)
 *
 * pg-boss creates its own `pgboss` schema in the database. Migrations are
 * applied automatically by `boss.start()`.
 */
import PgBoss from 'pg-boss';

let _boss: PgBoss | null = null;
let _starting: Promise<PgBoss> | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (_boss) return _boss;
  if (_starting) return _starting;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required for queue');

  _starting = (async () => {
    const boss = new PgBoss({ connectionString: url });
    boss.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[pg-boss]', err);
    });
    await boss.start();
    // Idempotent — creates the queues if they don't exist
    await boss.createQueue(JOB_NAMES.ENHANCE_PHOTO);
    await boss.createQueue(JOB_NAMES.PROCESS_TRY_ON);
    _boss = boss;
    return boss;
  })();

  return _starting;
}

export async function closeQueue(): Promise<void> {
  if (_boss) {
    await _boss.stop({ graceful: true });
    _boss = null;
  }
  _starting = null;
}

/**
 * Job names used across the system. Producers and consumers must agree on
 * these strings AND on the payload shape.
 */
export const JOB_NAMES = {
  ENHANCE_PHOTO: 'enhancement.process',
  PROCESS_TRY_ON: 'tryon.process',
  CUTOUT_PHOTO: 'enhancement.cutout',
} as const;

export interface EnhancePhotoJob {
  /** The photoId from item_photos to enhance */
  photoId: string;
  /** The userId — used for authorization, rate limit accounting, and event attribution */
  userId: string;
}

export interface CutoutPhotoJob {
  /** The photoId from item_photos whose ENHANCED image gets a transparent cutout */
  photoId: string;
  /** The owning user — event attribution */
  userId: string;
}

export interface ProcessTryOnJob {
  /** The try_on_jobs row id (already inserted by the producer with status='pending') */
  jobId: string;
  /** The owning user — used for storage path scoping + event attribution */
  userId: string;
  /** The outfit being tried on. Drives item lookup + signed-URL minting. */
  outfitId: string;
}
