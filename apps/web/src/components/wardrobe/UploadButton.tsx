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
 *   - JPEG only (the only mime our requestPhotoUpload accepts; expand later)
 *   - Shows status text inline
 *   - On success, refreshes the page so the new item appears in the grid
 */
export function UploadButton({ lang }: { lang: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const execute = trpc.capability.execute.useMutation();

  async function handleFile(file: File) {
    setBusy(true);
    setStatus('Requesting upload URL…');
    try {
      // 1. Request signed upload URL
      const upload = (await execute.mutateAsync({
        name: 'wardrobe.requestPhotoUpload',
        input: { filename: file.name, mimeType: 'image/jpeg' },
      })) as { uploadUrl: string; storagePath: string; token: string };

      // 2. Upload to Supabase Storage
      setStatus('Uploading photo…');
      const supabase = getSupabaseBrowserClient();
      const { error: uploadErr } = await supabase.storage
        .from('item-photos')
        .uploadToSignedUrl(upload.storagePath, upload.token, file, {
          contentType: 'image/jpeg',
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
        accept="image/jpeg,image/png,image/webp,image/heic"
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
