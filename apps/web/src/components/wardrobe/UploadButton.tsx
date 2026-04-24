'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * File-picker → signed-URL upload → confirm → analyze → addItem flow.
 *
 * MVP version:
 *   - Single file at a time
 *   - Accepts JPEG / PNG / WebP / GIF (the formats OpenAI vision supports)
 *   - HEIC is rejected client-side with a clear message — iPhone users need to
 *     either change their camera format to "Most Compatible" (Settings > Camera
 *     > Formats) or take a screenshot. Server-side HEIC→JPEG conversion is a
 *     post-MVP polish item.
 *   - Shows status text inline
 *   - On success, refreshes the page so the new item appears in the grid
 */

// Mirror of OpenAI's accepted vision formats. Anything outside this set is
// rejected before we ever upload to Storage.
const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

function isSupportedMimeType(t: string): t is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(t);
}

// Some browsers (iOS Safari especially) report an empty MIME type for HEIC.
// Fall back to filename extension when the browser declines to identify it.
function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return '';
  }
}

export function UploadButton({ lang }: { lang: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const execute = trpc.capability.execute.useMutation();

  async function handleFile(file: File) {
    const mimeType = inferMimeType(file);

    if (!isSupportedMimeType(mimeType)) {
      const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif';
      setStatus(
        isHeic
          ? "HEIC isn't supported yet. On iPhone, set Settings → Camera → Formats → Most Compatible, or take a screenshot."
          : `Unsupported format${mimeType ? ` (${mimeType})` : ''}. Use JPEG, PNG, WebP, or GIF.`,
      );
      return;
    }

    setBusy(true);
    setStatus('Requesting upload URL…');
    try {
      // 1. Request signed upload URL
      const upload = (await execute.mutateAsync({
        name: 'wardrobe.requestPhotoUpload',
        input: { filename: file.name, mimeType },
      })) as { uploadUrl: string; storagePath: string; token: string };

      // 2. Upload to Supabase Storage with the file's actual content-type
      setStatus('Uploading photo…');
      const supabase = getSupabaseBrowserClient();
      const { error: uploadErr } = await supabase.storage
        .from('item-photos')
        .uploadToSignedUrl(upload.storagePath, upload.token, file, {
          contentType: mimeType,
        });
      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      // 3. Confirm upload (creates item_photos row + enqueues enhancement)
      setStatus('Registering photo…');
      const confirmed = (await execute.mutateAsync({
        name: 'wardrobe.confirmPhotoUpload',
        input: { storagePath: upload.storagePath },
      })) as { photoId: string };

      // 4. Analyze
      setStatus('Analyzing with AI…');
      const analysis = (await execute.mutateAsync({
        name: 'item.analyze',
        input: { photoId: confirmed.photoId, locale: lang },
      })) as {
        metadata: {
          category: string;
          subcategory: string | null;
          primaryColor: string;
          secondaryColor: string | null;
          pattern: string | null;
          style: string | null;
          fit: string | null;
          length: string | null;
          sleeveLength: string | null;
          description: string | null;
          formalityScore: number;
          materialWeight: 'light' | 'medium' | 'heavy';
          seasonCompatibility: string[];
        };
      };

      // 5. Save to closet
      setStatus('Saving to closet…');
      await execute.mutateAsync({
        name: 'wardrobe.addItem',
        input: {
          photoId: confirmed.photoId,
          metadata: { ...analysis.metadata, analysisLocale: lang },
        },
      });

      setStatus('Done — refreshing…');
      router.refresh();
      setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Failed: ${msg}`);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className="w-full sm:w-auto px-5 py-3 bg-stone-700 text-stone-50 text-sm font-medium hover:bg-stone-600 disabled:opacity-50 transition-colors"
      >
        {busy ? 'Working…' : 'Add a piece'}
      </button>
      {status && <p className="text-xs text-stone-500">{status}</p>}
    </div>
  );
}
