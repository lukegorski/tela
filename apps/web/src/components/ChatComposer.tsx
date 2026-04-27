"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import BottomSheet from "@/components/BottomSheet";
import { useDictionary } from "@/components/DictionaryProvider";
import { trpc } from "@/trpc/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * What the chat composer hands up to the parent on Send. The composer
 * already uploaded any photo via the wardrobe pipeline, so this carries
 * just stable row ids — server resolves to URLs / descriptions inside
 * `streamChatTurn` per locked decision (D5).
 */
export type ComposerAttachment =
  | { type: "image"; photoId: string }
  | { type: "wardrobe_item"; itemId: string };

/**
 * Wardrobe-item attachment with the imageUrl already resolved by
 * useWardrobe — used purely for the composer's thumbnail row. The
 * `attachments` payload sent to onSend never includes the URL.
 */
export interface WardrobeAttachmentDisplay {
  itemId: string;
  imageUrl: string;
}

interface ChatComposerProps {
  onSend: (text: string, attachments?: ComposerAttachment[]) => void;
  onOpenWardrobePicker: () => void;
  disabled?: boolean;
  placeholder?: string;
  wardrobeAttachments?: WardrobeAttachmentDisplay[];
  onClearWardrobeAttachment?: (itemId?: string) => void;
}

const SUPPORTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

function isSupportedMimeType(t: string): t is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(t);
}

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
    case "heif":
      return "image/heic";
    default:
      return "";
  }
}

async function readImageDimensions(
  objectUrl: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new globalThis.Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = objectUrl;
  });
}

export default function ChatComposer({
  onSend,
  onOpenWardrobePicker,
  disabled = false,
  placeholder,
  wardrobeAttachments = [],
  onClearWardrobeAttachment,
}: ChatComposerProps) {
  const { dict } = useDictionary();
  const chatDict = (dict.chat ?? {}) as Record<string, string>;
  const placeholderText =
    placeholder ?? chatDict.placeholder ?? "Message Tela...";

  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pitfall #11: tRPC's mutation hook returns a fresh `execute` wrapper
  // each render. Stash in a ref so we can invoke from event handlers
  // without the wrapper churning effect deps.
  const execute = trpc.capability.execute.useMutation();
  const executeRef = useRef(execute);
  executeRef.current = execute;

  const hasAttachment = imageFile !== null || wardrobeAttachments.length > 0;
  const canSend =
    !disabled && !uploading && (text.trim().length > 0 || hasAttachment);

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    // Max 4 lines: lineHeight 28px * 4 = 112px
    ta.style.height = `${Math.min(ta.scrollHeight, 112)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  // Revoke the preview object URL when it changes or the composer unmounts.
  // revokeObjectURL is idempotent, so doubling up with manual revokes in
  // removePhoto / handleImageSelect is harmless.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    onClearWardrobeAttachment?.();
    setError(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);

    const mime = inferMimeType(file);
    if (!isSupportedMimeType(mime)) {
      const isHeic = mime === "image/heic" || mime === "image/heif";
      setError(
        isHeic
          ? "HEIC isn't supported yet. On iPhone, set Settings → Camera → Formats → Most Compatible."
          : "Unsupported format. Use JPEG, PNG, WebP, or GIF.",
      );
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImageFile(file);
    setImagePreview(previewUrl);

    // Read dims so confirmPhotoUpload can pass them through (saves the
    // enhancement worker from probing).
    const dims = await readImageDimensions(previewUrl);
    setImageDims(dims);
  }

  function removePhoto() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setImageDims(null);
  }

  function removeAllAttachments() {
    removePhoto();
    onClearWardrobeAttachment?.();
  }

  async function handleSend() {
    if (!canSend) return;
    setError(null);

    const currentText = text.trim();
    const currentImageFile = imageFile;
    const currentImageDims = imageDims;
    const currentWardrobe = wardrobeAttachments;

    const attachments: ComposerAttachment[] = [];

    if (currentImageFile) {
      const mime = inferMimeType(currentImageFile);
      if (!isSupportedMimeType(mime)) {
        setError("Unsupported format. Use JPEG, PNG, WebP, or GIF.");
        return;
      }
      setUploading(true);
      try {
        // Step 1 — request signed upload URL
        const upload = (await executeRef.current.mutateAsync({
          name: "wardrobe.requestPhotoUpload",
          input: { filename: currentImageFile.name, mimeType: mime },
        })) as { uploadUrl: string; storagePath: string; token: string };

        // Step 2 — PUT the file directly to Supabase Storage
        const supabase = getSupabaseBrowserClient();
        const { error: uploadErr } = await supabase.storage
          .from("item-photos")
          .uploadToSignedUrl(upload.storagePath, upload.token, currentImageFile, {
            contentType: mime,
          });
        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

        // Step 3 — confirm; server creates item_photos row + enqueues enhancement
        const confirmed = (await executeRef.current.mutateAsync({
          name: "wardrobe.confirmPhotoUpload",
          input: {
            storagePath: upload.storagePath,
            width: currentImageDims?.width ?? null,
            height: currentImageDims?.height ?? null,
          },
        })) as { photoId: string };

        attachments.push({ type: "image", photoId: confirmed.photoId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload photo");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    for (const att of currentWardrobe) {
      attachments.push({ type: "wardrobe_item", itemId: att.itemId });
    }

    onSend(currentText, attachments.length > 0 ? attachments : undefined);
    setText("");
    removeAllAttachments();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFromWardrobe() {
    setShowPlusMenu(false);
    // Mutual exclusivity with photo attachment — match legacy behavior
    removePhoto();
    onOpenWardrobePicker();
  }

  function handleTakePhoto() {
    setShowPlusMenu(false);
    fileInputRef.current?.click();
  }

  return (
    <>
      <div className="w-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
        {error && (
          <div className="px-3 pt-2 text-xs text-red-500 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Top row: textarea */}
        <div className="flex items-end gap-2 px-3 pt-2.5 pb-1.5">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            disabled={disabled || uploading}
            rows={1}
            className="flex-1 resize-none bg-transparent text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm leading-relaxed outline-none disabled:opacity-50 max-h-28"
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center gap-2 px-2 pt-1 pb-2 min-h-[48px]">
          <button
            type="button"
            onClick={() => {
              if (!disabled && !uploading) setShowPlusMenu(true);
            }}
            disabled={disabled || uploading}
            className="p-1.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 transition-colors disabled:opacity-40"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
          </button>

          {imagePreview && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Selected"
                className="h-10 w-10 object-cover border border-neutral-200 dark:border-neutral-700"
              />
              <button
                type="button"
                onClick={removePhoto}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-stone-600 text-white"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          )}

          {wardrobeAttachments.map((item) => (
            <div
              key={item.itemId}
              className="relative flex-shrink-0 mt-1.5 mr-1.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt="Selected"
                className="h-10 w-10 object-cover border border-neutral-200 dark:border-neutral-700"
              />
              <button
                type="button"
                onClick={() => onClearWardrobeAttachment?.(item.itemId)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-stone-600 text-white"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={`ml-auto flex-shrink-0 p-2 rounded-none transition-colors ${
              canSend
                ? "bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200"
                : "bg-transparent text-neutral-300 dark:text-neutral-600"
            }`}
          >
            {uploading ? (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                />
              </svg>
            )}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />
      </div>

      <BottomSheet isOpen={showPlusMenu} onClose={() => setShowPlusMenu(false)}>
        <div className="px-5 pt-6 pb-8 space-y-3">
          <button
            type="button"
            onClick={handleFromWardrobe}
            className="w-full px-4 py-3 bg-stone-700 dark:bg-stone-300 text-stone-50 dark:text-stone-900 rounded-none text-xs uppercase tracking-widest font-semibold transition-colors hover:bg-stone-600 dark:hover:bg-stone-400"
          >
            From wardrobe
          </button>
          <button
            type="button"
            onClick={handleTakePhoto}
            className="w-full px-4 py-3 bg-transparent border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 rounded-none text-xs uppercase tracking-widest font-semibold transition-colors hover:bg-stone-50 dark:hover:bg-neutral-800"
          >
            Take photo
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
