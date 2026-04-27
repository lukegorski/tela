"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useDictionary } from "@/components/DictionaryProvider";
import { useAuthContext } from "@/components/AuthProvider";
import { useChat, type StreamingState, type ChatMessage as ChatMessageState } from "@/hooks/useChat";
import ChatMessage, { type ChatMessageData } from "@/components/ChatMessage";
import ChatComposer, {
  type ComposerAttachment,
  type WardrobeAttachmentDisplay,
} from "@/components/ChatComposer";
import ChatWardrobePicker from "@/components/ChatWardrobePicker";
import ChatOutfitGrid from "@/components/ChatOutfitGrid";
import ChatItemGrid from "@/components/ChatItemGrid";
import BottomSheet from "@/components/BottomSheet";
import OutfitPiecesSheet from "@/components/OutfitPiecesSheet";
import { ItemDetailContent } from "@/components/ItemDetailContent";
import LoadingSpinner from "@/components/LoadingSpinner";
import { trpc } from "@/trpc/client";
import { localePath } from "@/lib/i18n";
import { useWardrobe } from "@/hooks/useWardrobe";
import type { Outfit, WardrobeItem } from "@/lib/types";

// (Legacy chat page also has an in-chat onboarding flow triggered when
// !profile.styleDna. Skipped in D.9: D.5 onboarding quiz handles
// language + body info + lifestyle. Style DNA replaced by closet read
// (profile.closetRead). No equivalent UI needed here. Re-evaluate
// post-launch if user data shows users want a soft re-onboarding path.)

/**
 * Tool-name → loading-label mapping. Mixed strategy per the visual port
 * plan: 4 capabilities have existing dict.chat keys; the rest use
 * English fallbacks lifted from the MVP describeToolCall. Adding new
 * dict keys is explicitly out of scope for D.9.
 */
const TOOL_LABELS: Record<
  string,
  { dictKey?: string; loading: string; completed?: string }
> = {
  "outfit.generate": {
    dictKey: "stylingOutfits",
    loading: "Styling your outfits...",
  },
  "wardrobe.addItem": {
    dictKey: "analyzingItem",
    loading: "Analyzing your item...",
  },
  "tryon.generate": {
    dictKey: "generatingTryOn",
    loading: "Generating try-on...",
  },
  "outfit.save": {
    dictKey: "savingToLookbook",
    loading: "Saving to lookbook...",
  },
  "wardrobe.listItems": { loading: "Looking through your wardrobe..." },
  "wardrobe.getItem": { loading: "Looking at a specific piece..." },
  "wardrobe.removeItem": { loading: "Removing an item..." },
  "outfit.list": { loading: "Looking at your outfit history..." },
  "outfit.get": { loading: "Looking at an outfit..." },
  "outfit.delete": { loading: "Deleting an outfit..." },
  "outfit.setFeedback": { loading: "Recording your feedback..." },
  "profile.get": { loading: "Reviewing your style profile..." },
  "profile.closetRead": { loading: "Refreshing your style profile..." },
  "context.assemble": {
    loading: "Checking the time / season / occasion...",
  },
  "item.analyze": { loading: "Analyzing the photo..." },
  "tryon.getStatus": { loading: "Checking try-on status..." },
};

function ToolLoadingIndicator({
  toolName,
  dict,
}: {
  toolName: string;
  dict: Record<string, unknown>;
}) {
  const chatDict = (dict.chat ?? {}) as Record<string, string>;
  const entry = TOOL_LABELS[toolName];
  const label = entry?.dictKey
    ? chatDict[entry.dictKey] ?? entry.loading
    : entry?.loading ?? "Working on it...";

  return (
    <div className="flex items-center gap-2.5 px-4 py-2">
      <div className="w-4 h-4">
        <LoadingSpinner variant="auto" />
      </div>
      <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
    </div>
  );
}

function SuggestedPrompts({
  dict,
  onSelect,
}: {
  dict: Record<string, unknown>;
  onSelect: (text: string) => void;
}) {
  const chatDict = (dict.chat ?? {}) as Record<string, string>;
  const prompts = [
    chatDict.suggestWear || "What should I wear today?",
    chatDict.suggestPlan || "Help me plan outfits for this week",
    chatDict.suggestEvent || "I have a big event coming up...",
    chatDict.suggestMissing || "What is missing from my wardrobe?",
  ];

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pt-2 pb-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          className="shrink-0 whitespace-nowrap px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-none text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 active:bg-neutral-100 dark:active:bg-neutral-800 transition-colors"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

// Hardcoded English thinking words. Intentionally NOT translated — this
// is a 2s-cycle indicator showing the AI is working, not user-facing
// content. Translating would expand the matrix to 14 locales for
// no real signal.
const THINKING_WORDS = [
  "Styling",
  "Curating",
  "Draping",
  "Accessorizing",
  "Coordinating",
  "Tailoring",
  "Harmonizing",
  "Envisioning",
  "Mixing",
  "Layering",
  "Refining",
  "Polishing",
  "Elevating",
  "Composing",
  "Pairing",
];

function ThinkingIndicator() {
  const [wordIndex, setWordIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_WORDS.length),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % THINKING_WORDS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="text-sm italic text-neutral-300 animate-fade-in"
      key={wordIndex}
    >
      {THINKING_WORDS[wordIndex]}...
    </span>
  );
}

function StreamingMessage({
  streaming,
  dict,
}: {
  streaming: StreamingState;
  dict: Record<string, unknown>;
}) {
  // Streaming bubble shows ONLY streamed text + active tool indicator.
  // Rich cards render only AFTER `done` lands — they cause layout shifts
  // as text streams above them.
  const showThinking =
    !streaming.streamedText && !streaming.activeToolName;

  if (showThinking) {
    return (
      <div className="flex justify-start px-1">
        <ThinkingIndicator />
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] px-4 py-2.5 bg-stone-100 dark:bg-neutral-800 text-stone-800 dark:text-stone-200 rounded-2xl text-sm leading-relaxed">
        {streaming.streamedText && (
          <p className="whitespace-pre-wrap">{streaming.streamedText}</p>
        )}
        {streaming.activeToolName && (
          <ToolLoadingIndicator
            toolName={streaming.activeToolName}
            dict={dict}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Detect whether a value looks like a renderable rich Outfit (has id +
 * items[] with imageUrl). All chatTool capabilities that return outfits
 * (outfit.generate, outfit.list, outfit.get) return the rich shape since
 * D.9c, so this guard mostly keeps us safe against future shape drift.
 */
function looksLikeRichOutfit(value: unknown): value is Outfit {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string") return false;
  if (!Array.isArray(o.items)) return false;
  return (
    o.items.length === 0 ||
    o.items.every(
      (it) =>
        it !== null &&
        typeof it === "object" &&
        "imageUrl" in (it as Record<string, unknown>),
    )
  );
}

function looksLikeRichItem(value: unknown): value is WardrobeItem {
  if (!value || typeof value !== "object") return false;
  const i = value as Record<string, unknown>;
  return (
    typeof i.id === "string" && "imageUrl" in i && "category" in i
  );
}

/**
 * Format the persisted ChatMessage shape into the bubble's display
 * shape. ChatMessage handles its own attachment thumbnails, but
 * historical attachment URL resolution is deferred — the structured
 * `attachments` (photoId / itemId) refs aren't surfaced to the bubble
 * for D.9b. See known limitations in the commit message.
 */
function toMessageData(msg: ChatMessageState): ChatMessageData {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
  };
}

function ChatPageContent() {
  const { dict, lang } = useDictionary();
  const chatDict = (dict.chat ?? {}) as Record<string, string>;
  const { user } = useAuthContext();
  const router = useRouter();

  const {
    messages,
    loading,
    sending,
    streaming,
    error,
    sendMessage,
    loadMore,
    hasMore,
  } = useChat();

  const { items: wardrobeItems } = useWardrobe();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Wardrobe picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Detail sheet state
  const [selectedOutfit, setSelectedOutfit] = useState<Outfit | null>(null);
  const [selectedItem, setSelectedItem] = useState<WardrobeItem | null>(null);

  // Suggested-prompts dismissal — survives navigation within the session
  // but a new tab/login resets.
  const [promptsDismissed, setPromptsDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("chat-prompts-dismissed") === "true";
  });

  // Optimistic save state — chat tool results don't refresh when the
  // outfit row updates, so track locally-saved IDs for instant UI
  // feedback when the user taps "Add Outfit".
  const [savedOutfitIds, setSavedOutfitIds] = useState<Set<string>>(new Set());

  // Pitfall #11: stash useMutation().execute in a ref so callback deps stay stable.
  const execute = trpc.capability.execute.useMutation();
  const executeRef = useRef(execute);
  executeRef.current = execute;

  // Composer needs imageUrl thumbnails for selected wardrobe items —
  // resolved client-side via useWardrobe rather than crossing the wire.
  const wardrobeAttachments: WardrobeAttachmentDisplay[] = useMemo(() => {
    return selectedItemIds
      .map((itemId) => {
        const item = wardrobeItems.find((i) => i.id === itemId);
        return item && item.imageUrl
          ? { itemId, imageUrl: item.imageUrl }
          : null;
      })
      .filter((a): a is WardrobeAttachmentDisplay => a !== null);
  }, [selectedItemIds, wardrobeItems]);

  // Lookup maps for tap handlers. Built from tool results across all
  // messages so an outfit shown in turn 3 can still be tapped in turn 8.
  // wardrobeItems also seeded so item taps resolve when the LLM
  // mentioned an item via a non-listing tool.
  const outfitMap = useMemo(() => {
    const map = new Map<string, Outfit>();
    for (const msg of messages) {
      if (!msg.toolInvocations) continue;
      for (const inv of msg.toolInvocations) {
        if (!inv.ok || !inv.result) continue;
        const result = inv.result as Record<string, unknown>;
        if (Array.isArray(result.outfits)) {
          for (const o of result.outfits) {
            if (looksLikeRichOutfit(o)) map.set(o.id, o);
          }
        } else if (looksLikeRichOutfit(inv.result)) {
          map.set(inv.result.id, inv.result);
        }
      }
    }
    return map;
  }, [messages]);

  const itemMap = useMemo(() => {
    const map = new Map<string, WardrobeItem>();
    for (const it of wardrobeItems) {
      map.set(it.id, it);
    }
    for (const msg of messages) {
      if (!msg.toolInvocations) continue;
      for (const inv of msg.toolInvocations) {
        if (!inv.ok || !inv.result) continue;
        const result = inv.result as Record<string, unknown>;
        if (Array.isArray(result.items)) {
          for (const item of result.items) {
            if (looksLikeRichItem(item)) map.set(item.id, item);
          }
        } else if (looksLikeRichItem(inv.result)) {
          map.set(inv.result.id, inv.result);
        }
      }
    }
    return map;
  }, [messages, wardrobeItems]);

  const handleOutfitTap = useCallback(
    (outfitId: string) => {
      setSelectedOutfit(outfitMap.get(outfitId) || null);
    },
    [outfitMap],
  );

  const handleItemTap = useCallback(
    (itemId: string) => {
      setSelectedItem(itemMap.get(itemId) || null);
    },
    [itemMap],
  );

  // Auto-scroll to bottom on new messages or while streaming.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming.streamedText, streaming.isStreaming]);

  // Scroll-to-top pagination — same pattern as legacy.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !hasMore) return;
    if (el.scrollTop < 100) {
      void loadMore();
    }
  }, [hasMore, loadMore]);

  const handleSaveOutfit = useCallback(async (outfitId: string) => {
    if (!user) return;
    setSavedOutfitIds((prev) => new Set(prev).add(outfitId));
    try {
      await executeRef.current.mutateAsync({
        name: "outfit.save",
        input: { outfitId, saved: true },
      });
    } catch {
      // Roll back optimistic save
      setSavedOutfitIds((prev) => {
        const next = new Set(prev);
        next.delete(outfitId);
        return next;
      });
    }
  }, [user]);

  const handleViewOutfit = useCallback(
    (outfitId: string) => {
      router.push(localePath(lang, `/outfits?id=${outfitId}`));
    },
    [router, lang],
  );

  const handleSend = useCallback(
    (text: string, attachments?: ComposerAttachment[]) => {
      setPromptsDismissed(true);
      sessionStorage.setItem("chat-prompts-dismissed", "true");
      void sendMessage(text, attachments);
      // Composer clears its own state on send; clear our wardrobe selection too.
      setSelectedItemIds([]);
    },
    [sendMessage],
  );

  const handleSendFromSuggestion = useCallback(
    (text: string) => handleSend(text),
    [handleSend],
  );

  // Render rich cards for a message — collect outfits + items from all
  // tool results into ONE grid each (legacy pattern).
  const renderRichCards = (msg: ChatMessageState) => {
    if (!msg.toolInvocations || msg.toolInvocations.length === 0) return null;

    const outfitsToShow: Outfit[] = [];
    const itemsToShow: WardrobeItem[] = [];

    for (const inv of msg.toolInvocations) {
      if (!inv.ok || !inv.result) continue;
      if (typeof inv.result !== "object" || inv.result === null) continue;
      const result = inv.result as Record<string, unknown>;

      if (Array.isArray(result.outfits)) {
        for (const o of result.outfits) {
          if (looksLikeRichOutfit(o)) outfitsToShow.push(o);
        }
      } else if (Array.isArray(result.items)) {
        for (const item of result.items) {
          if (looksLikeRichItem(item)) itemsToShow.push(item);
        }
      } else if (looksLikeRichOutfit(inv.result)) {
        outfitsToShow.push(inv.result);
      } else if (looksLikeRichItem(inv.result)) {
        itemsToShow.push(inv.result);
      }
    }

    const elements: React.ReactNode[] = [];
    if (outfitsToShow.length > 0) {
      elements.push(
        <ChatOutfitGrid
          key="outfits"
          outfits={outfitsToShow}
          optimisticSavedIds={savedOutfitIds}
          onSave={handleSaveOutfit}
          onView={handleViewOutfit}
          onTap={handleOutfitTap}
        />,
      );
    }
    if (itemsToShow.length > 0) {
      elements.push(
        <ChatItemGrid
          key="items"
          items={itemsToShow}
          onTap={handleItemTap}
        />,
      );
    }
    return elements.length > 0 ? elements : null;
  };

  if (loading) {
    return (
      <div className="h-[calc(100dvh-4rem)] flex items-center justify-center">
        <div className="w-12 h-12">
          <LoadingSpinner variant="auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-4rem)] flex flex-col bg-white dark:bg-neutral-900">
      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {hasMore && (
          <button
            onClick={() => void loadMore()}
            className="w-full text-center text-xs text-neutral-400 dark:text-neutral-500 py-2"
          >
            {chatDict.loadOlder || "Load older messages"}
          </button>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            <ChatMessage message={toMessageData(msg)} />
            {msg.toolInvocations && msg.toolInvocations.length > 0 && (
              <div className="mt-2 space-y-3 max-w-[80%]">
                {renderRichCards(msg)}
              </div>
            )}
          </div>
        ))}

        {(streaming.isStreaming ||
          streaming.streamedText ||
          streaming.activeToolName) && (
          <StreamingMessage
            streaming={streaming}
            dict={dict as Record<string, unknown>}
          />
        )}

        {/* Inline error — visible when streaming produced nothing */}
        {error && !streaming.isStreaming && !streaming.streamedText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-4 py-2.5 bg-stone-100 dark:bg-neutral-800 text-stone-800 dark:text-stone-200 rounded-2xl text-sm leading-relaxed">
              <p className="text-neutral-400 dark:text-neutral-500 italic">
                {error}
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts — visible until first send */}
      {!promptsDismissed && messages.length === 0 && (
        <SuggestedPrompts
          dict={dict as Record<string, unknown>}
          onSelect={handleSendFromSuggestion}
        />
      )}

      {/* Composer */}
      <div className="flex-none bg-white dark:bg-neutral-900 pb-safe">
        <div className="px-4 py-2">
          <ChatComposer
            onSend={handleSend}
            onOpenWardrobePicker={() => setPickerOpen(true)}
            disabled={sending || streaming.isStreaming}
            placeholder={chatDict.placeholder}
            wardrobeAttachments={wardrobeAttachments}
            onClearWardrobeAttachment={(itemId) => {
              if (itemId) {
                setSelectedItemIds((prev) => prev.filter((id) => id !== itemId));
              } else {
                setSelectedItemIds([]);
              }
            }}
          />
        </div>
      </div>

      {/* Wardrobe item picker */}
      <ChatWardrobePicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedItemIds={selectedItemIds}
        onToggle={(itemId) => {
          setSelectedItemIds((prev) =>
            prev.includes(itemId)
              ? prev.filter((id) => id !== itemId)
              : [...prev, itemId],
          );
        }}
      />

      {/* Outfit detail sheet */}
      <BottomSheet
        isOpen={selectedOutfit !== null}
        onClose={() => setSelectedOutfit(null)}
        overlayClose
        hideDesktopClose
      >
        {selectedOutfit && (
          <OutfitPiecesSheet
            outfit={selectedOutfit}
            saved={
              selectedOutfit.saved || savedOutfitIds.has(selectedOutfit.id)
            }
            onSave={async () => {
              if (!user) return;
              const wasSaved =
                selectedOutfit.saved ||
                savedOutfitIds.has(selectedOutfit.id);
              const newSaved = !wasSaved;
              try {
                await executeRef.current.mutateAsync({
                  name: "outfit.save",
                  input: { outfitId: selectedOutfit.id, saved: newSaved },
                });
                setSavedOutfitIds((prev) => {
                  const next = new Set(prev);
                  if (newSaved) next.add(selectedOutfit.id);
                  else next.delete(selectedOutfit.id);
                  return next;
                });
                setSelectedOutfit({
                  ...selectedOutfit,
                  saved: newSaved,
                  savedAt: newSaved ? new Date().toISOString() : null,
                });
              } catch {
                /* ignore — UI stays put on failure */
              }
            }}
          />
        )}
      </BottomSheet>

      {/* Wardrobe item detail sheet */}
      <BottomSheet
        isOpen={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        overlayClose
        hideDesktopClose
      >
        {selectedItem && <ItemDetailContent item={selectedItem} dimensions={null} />}
      </BottomSheet>
    </div>
  );
}

export default function ChatPage() {
  return (
    <ProtectedRoute>
      <ChatPageContent />
    </ProtectedRoute>
  );
}
