/**
 * Firebase Admin SDK init for read-only access to the legacy Tela project.
 * Mirrors the legacy app's pattern (`/Users/lukegorski/ale/src/lib/firebase-admin.ts`)
 * but only exposes the surfaces the migration needs (Auth, Firestore, Storage).
 *
 * Credentials come from FIREBASE_ADMIN_* env vars (see migration M10 for the
 * doppler-set procedure). The service account is read-only by intent — we
 * never write back to the legacy project.
 */
import {
  initializeApp,
  getApps,
  cert,
  type App as FirebaseApp,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

const APP_NAME = 'tela-legacy-migration';

let _app: FirebaseApp | undefined;

function getLegacyApp(): FirebaseApp {
  if (_app) return _app;

  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    _app = existing;
    return _app;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, ' +
        'FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY in the env ' +
        '(via doppler — see migration M10).',
    );
  }

  _app = initializeApp(
    {
      credential: cert({ projectId, clientEmail, privateKey }),
    },
    APP_NAME,
  );
  return _app;
}

export function getLegacyAuth(): Auth {
  return getAuth(getLegacyApp());
}

export function getLegacyDb(): Firestore {
  return getFirestore(getLegacyApp());
}

/**
 * Resolve the legacy storage bucket. Reads NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 * from env so we don't hardcode a project — same name the legacy app uses.
 */
export function getLegacyBucket(): ReturnType<Storage['bucket']> {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error(
      'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env var is required (via doppler — see migration M10).',
    );
  }
  return getStorage(getLegacyApp()).bucket(bucketName);
}
