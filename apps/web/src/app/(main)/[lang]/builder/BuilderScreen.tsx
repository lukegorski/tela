'use client';
/**
 * Builder canvas (spec §3, all four locked recipes):
 *  - invisible mannequin: recipe-v2 edge-anchored placement, NO visible figure
 *  - tap-to-lock selection: browsing previews (dimmed) and never mutates the
 *    committed outfit; Keep/Revert live in a bar BELOW the canvas (the spike
 *    version covered the shoes zone — design-review defect, fixed here)
 *  - fluid dress: dresses are the tail of the top carousel; landing on one
 *    covers top+bottom; swiping the bottom zone exits back to separates
 *  - Tier-0 sizing + relational layering via @tela/types placeOutfit
 *
 * Data: ONE capability call (wardrobe.builderItems) returning items with
 * signed cutout/fallback URLs + placement trims + the saved draft. While
 * cutouts are pending the canvas renders enhanced-JPEG fallbacks and polls.
 * Draft autosaves (1s debounce, last-write-wins). Session summary reports
 * on visibilitychange per the spec §7 reliability rule.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { trpc } from '@/trpc/client';
import { useAuthContext } from '@/components/AuthProvider';
import { useDictionary } from '@/components/DictionaryProvider';
import {
  placeOutfit,
  type BuilderRole,
  type TrimBox,
  type PlacedRect,
  type OutfitSlotInput,
} from '@tela/types';

// ─── Types ───

interface BuilderItem {
  itemId: string;
  role: BuilderRole;
  subcategory: string | null;
  primaryColor: string;
  fit: string | null;
  presentation: string | null;
  cutoutUrl: string | null;
  trim: TrimBox | null;
  fallbackUrl: string | null;
}

interface BuilderData {
  items: BuilderItem[];
  draftSlots: Record<string, unknown> | null;
  cutoutsReady: boolean;
  excludedFolded: number;
}

type Slot = 'outerwear' | 'top' | 'bottom' | 'shoes';
type ZoneId = Slot; // the dress rides the top zone (fluid pattern)

const NONE = -1;
const SWIPE_FRAC = 0.16;
const AUTOSAVE_DEBOUNCE_MS = 1000;
const PENDING_POLL_MS = 5000;

// Gesture bands as fractions of canvas height (derived from recipe-v2 anchors).
const ZONE_BANDS: Record<ZoneId, [number, number]> = {
  outerwear: [0.02, 0.14],
  top: [0.14, 0.4],
  bottom: [0.4, 0.78],
  shoes: [0.78, 0.98],
};

// Enhanced JPEGs are 1024×1536 with the garment roughly centered; while a
// cutout is pending we place the fallback with this synthetic trim.
const FALLBACK_TRIM: TrimBox = { x: 143, y: 184, w: 738, h: 1106, imgW: 1024, imgH: 1536 };

const Chevron = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden
  >
    {dir === 'l' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
  </svg>
);

export default function BuilderScreen() {
  const { user } = useAuthContext();
  const { dict, lang } = useDictionary();
  const t = dict.builder;
  const userId = user?.id ?? null;

  const utils = trpc.useUtils();
  const execute = trpc.capability.execute.useMutation();

  const query = useQuery<BuilderData>({
    queryKey: ['capability', 'wardrobe.builderItems', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () =>
      (await utils.client.capability.execute.mutate({
        name: 'wardrobe.builderItems',
        input: {},
      })) as BuilderData,
    // Poll while cutouts are still being generated (lazy trigger just fired).
    refetchInterval: (q) => (q.state.data && !q.state.data.cutoutsReady ? PENDING_POLL_MS : false),
  });

  const lists = useMemo(() => {
    const items = query.data?.items ?? [];
    const by = (r: BuilderRole) => items.filter((i) => i.role === r);
    const tops = by('top');
    const dresses = by('dress');
    return {
      tops,
      dresses,
      topZone: [...tops, ...dresses], // fluid: dresses at the tail
      bottoms: by('bottom'),
      outerwear: by('outerwear'),
      shoes: by('shoes'),
    };
  }, [query.data]);

  // ─── Composition state (tap-to-lock: sel is the COMMITTED outfit) ───
  const [sel, setSel] = useState({ outerwear: NONE, top: 0, bottom: 0, shoes: NONE });
  const [dress, setDress] = useState({ active: false, idx: 0 });
  const [browse, setBrowse] = useState<{ zone: ZoneId; pos: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Post-save semantics (spec §3 recommendation): keep the composition,
  // disable Save until it changes again.
  const [savedComposition, setSavedComposition] = useState<string | null>(null);
  const savedThisSession = useRef(false);
  const restored = useRef(false);
  const cycleCounts = useRef<Record<string, number>>({});
  const addPrompted = useRef<Set<string>>(new Set());
  const sessionStart = useRef(Date.now());

  // canvas measurement
  const canvasRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  const [ch, setCh] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setCw(el.clientWidth);
      setCh(el.clientHeight);
    });
    ro.observe(el);
    setCw(el.clientWidth);
    setCh(el.clientHeight);
    return () => ro.disconnect();
  }, [query.data]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(h);
  }, [toast]);

  // ─── Draft restore (verbatim; deleted ids skipped with a note) ───
  useEffect(() => {
    if (restored.current || !query.data) return;
    restored.current = true;
    const slots = query.data.draftSlots as {
      outerwear?: string | null;
      top?: string | null;
      bottom?: string | null;
      shoes?: string | null;
      dress?: string | null;
      dressActive?: boolean;
    } | null;
    if (!slots) return;

    let missing = false;
    const idx = (arr: BuilderItem[], id: string | null | undefined, allowNone: boolean) => {
      if (!id) return allowNone ? NONE : 0;
      const i = arr.findIndex((x) => x.itemId === id);
      if (i === -1) {
        missing = true;
        return allowNone ? NONE : 0;
      }
      return i;
    };
    setSel({
      outerwear: idx(lists.outerwear, slots.outerwear, true),
      top: idx(lists.tops, slots.top, false),
      bottom: idx(lists.bottoms, slots.bottom, false),
      shoes: idx(lists.shoes, slots.shoes, true),
    });
    const dressIdx = slots.dress ? lists.dresses.findIndex((d) => d.itemId === slots.dress) : -1;
    setDress({
      active: !!slots.dressActive && dressIdx !== -1,
      idx: dressIdx === -1 ? 0 : dressIdx,
    });
    if (missing) setToast(t.itemsMissing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, lists]);

  // ─── Draft autosave (1s debounce, after restore) ───
  const executeRef = useRef(execute);
  executeRef.current = execute;
  useEffect(() => {
    if (!restored.current || !query.data) return;
    const h = setTimeout(() => {
      const at = (arr: BuilderItem[], i: number) => (i >= 0 && arr[i] ? arr[i].itemId : null);
      executeRef.current.mutate({
        name: 'outfit.saveDraft',
        input: {
          slots: {
            outerwear: at(lists.outerwear, sel.outerwear),
            top: at(lists.tops, sel.top),
            bottom: at(lists.bottoms, sel.bottom),
            shoes: at(lists.shoes, sel.shoes),
            dress: dress.active ? at(lists.dresses, dress.idx) : null,
            dressActive: dress.active,
          },
        },
      });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, dress]);

  const savedRef = useRef(false);
  savedRef.current = savedThisSession.current;

  // ─── Session summary on tab-hide (lossy by nature; cross-checked server-side) ───
  useEffect(() => {
    const report = () => {
      if (document.visibilityState !== 'hidden') return;
      executeRef.current.mutate({
        name: 'outfit.builderSessionEnded',
        input: {
          durationMs: Date.now() - sessionStart.current,
          cycleCounts: cycleCounts.current,
          saved: savedRef.current,
          addPromptedSlots: [...addPrompted.current],
        },
      });
      addPrompted.current.clear();
    };
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, []);

  // ─── Carousel mechanics ───
  const zoneList = useCallback(
    (zone: ZoneId): BuilderItem[] =>
      zone === 'top' ? lists.topZone : zone === 'bottom' ? lists.bottoms : lists[zone],
    [lists],
  );
  const zonePos = (zone: ZoneId): number => {
    if (browse?.zone === zone) return browse.pos;
    if (zone === 'top') return dress.active ? lists.tops.length + dress.idx : sel.top;
    return sel[zone];
  };
  const cyclePos = (zone: ZoneId, pos: number, dir: 1 | -1): number => {
    const n = zoneList(zone).length;
    if (n === 0) return NONE;
    const allowNone = zone === 'outerwear' || zone === 'shoes';
    if (allowNone) {
      let next = pos + dir;
      if (next >= n) next = NONE;
      if (next < NONE) next = n - 1;
      return next;
    }
    return (pos + dir + n) % n;
  };

  const applyPos = (zone: ZoneId, pos: number) => {
    if (zone === 'top') {
      if (pos >= lists.tops.length) {
        setDress({ active: true, idx: pos - lists.tops.length });
      } else {
        setDress((d) => ({ ...d, active: false }));
        setSel((s) => ({ ...s, top: pos }));
      }
      return;
    }
    if (zone === 'bottom' && dress.active) {
      // fluid exit: swiping the bottom zone brings separates back
      setDress((d) => ({ ...d, active: false }));
      setSel((s) => ({ ...s, bottom: pos }));
      setToast(t.dressOff);
      return;
    }
    setSel((s) => ({ ...s, [zone]: pos }));
  };

  // drag state
  const drag = useRef<{ zone: ZoneId; startX: number; dx: number } | null>(null);
  const [dragRender, setDragRender] = useState<{ zone: ZoneId; dx: number } | null>(null);

  const onPointerDown = (zone: ZoneId, e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    drag.current = { zone, startX: e.clientX, dx: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.dx = e.clientX - drag.current.startX;
    setDragRender({ zone: drag.current.zone, dx: drag.current.dx });
  };
  const onPointerUp = (zone: ZoneId) => {
    const d = drag.current;
    drag.current = null;
    setDragRender(null);
    if (!d) return;
    if (Math.abs(d.dx) > cw * SWIPE_FRAC && zoneList(zone).length > 0) {
      // tap-to-lock: swiping BROWSES; it never mutates the committed outfit
      if (browse && browse.zone !== zone) setBrowse(null); // switching zones reverts the prior browse
      const next = cyclePos(zone, zonePos(zone), d.dx < 0 ? 1 : -1);
      setBrowse({ zone, pos: next });
      cycleCounts.current[zone] = (cycleCounts.current[zone] ?? 0) + 1;
    } else if (Math.abs(d.dx) < 6 && browse?.zone === zone) {
      keepBrowse(); // tapping the browsing zone commits
    }
  };

  const keepBrowse = () => {
    if (!browse) return;
    applyPos(browse.zone, browse.pos);
    setBrowse(null);
    setToast(t.kept);
  };
  const revertBrowse = () => {
    setBrowse(null);
    setToast(t.reverted);
  };

  // ─── Composition → placed rects (recipe v2) ───
  const entryAt = (zone: ZoneId, pos: number): BuilderItem | null =>
    pos === NONE ? null : (zoneList(zone)[pos] ?? null);

  const topZonePos = zonePos('top');
  const topZoneEntry = entryAt('top', topZonePos);
  const dressShowing = !!topZoneEntry && topZoneEntry.role === 'dress';

  const slotInput = (item: BuilderItem | null): OutfitSlotInput | undefined =>
    item
      ? {
          trim: item.trim ?? FALLBACK_TRIM,
          sizing: { subcategory: item.subcategory, fit: item.fit },
        }
      : undefined;

  const visible: Partial<Record<BuilderRole, BuilderItem>> = {};
  if (dressShowing) {
    visible.dress = topZoneEntry!;
    // browsing the bottom under a dress previews the exit composition
    if (browse?.zone === 'bottom') {
      const b = entryAt('bottom', browse.pos);
      const tp = lists.tops[sel.top] ?? null;
      delete visible.dress;
      if (b) visible.bottom = b;
      if (tp) visible.top = tp;
    }
  } else {
    const tp = topZoneEntry;
    const b = entryAt('bottom', zonePos('bottom'));
    if (tp) visible.top = tp;
    if (b) visible.bottom = b;
  }
  const o = entryAt('outerwear', zonePos('outerwear'));
  if (o) visible.outerwear = o;
  const sh = entryAt('shoes', zonePos('shoes'));
  if (sh) visible.shoes = sh;

  const rects: Partial<Record<BuilderRole, PlacedRect>> =
    cw > 0
      ? placeOutfit(
          {
            top: slotInput(visible.top ?? null),
            bottom: slotInput(visible.bottom ?? null),
            outerwear: slotInput(visible.outerwear ?? null),
            shoes: slotInput(visible.shoes ?? null),
            dress: slotInput(visible.dress ?? null),
          },
          cw,
          ch,
        )
      : {};

  const valid = dressShowing || (!!visible.top && !!visible.bottom);
  const browsingItem = browse ? entryAt(browse.zone, browse.pos) : null;

  // Post-save semantics: fingerprint the committed composition; Save
  // re-enables only when it changes (spec §3 recommendation).
  const compositionKey = JSON.stringify({
    d: dressShowing ? (visible.dress?.itemId ?? null) : null,
    t: dressShowing ? null : (visible.top?.itemId ?? null),
    b: dressShowing ? null : (visible.bottom?.itemId ?? null),
    o: visible.outerwear?.itemId ?? null,
    s: visible.shoes?.itemId ?? null,
  });
  const alreadySaved = savedComposition === compositionKey;

  /** Draw the committed composition at card resolution → base64 + mime. */
  const exportCard = async (): Promise<{ base64: string; mime: string } | null> => {
    try {
      const W = 900;
      const H = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, W, H);

      const cardRects = placeOutfit(
        {
          top: slotInput(visible.top ?? null),
          bottom: slotInput(visible.bottom ?? null),
          outerwear: slotInput(visible.outerwear ?? null),
          shoes: slotInput(visible.shoes ?? null),
          dress: slotInput(visible.dress ?? null),
        },
        W,
        H,
      );
      const ordered = (Object.entries(visible) as Array<[BuilderRole, BuilderItem]>).sort(
        (a, b) => (cardRects[a[0]]?.z ?? 0) - (cardRects[b[0]]?.z ?? 0),
      );
      for (const [role, item] of ordered) {
        const r = cardRects[role];
        const src = item.cutoutUrl ?? item.fallbackUrl;
        if (!r || !src) continue;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = src;
        await img.decode();
        ctx.drawImage(img, r.left, r.top, r.drawW, r.drawH);
      }

      const dataUrl = canvas.toDataURL('image/webp', 0.82);
      // Safari has no webp encoder and silently falls back to png.
      const mime = dataUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/png';
      const base64 = dataUrl.split(',')[1];
      if (!base64 || base64.length > 1_300_000) return null;
      return { base64, mime };
    } catch {
      return null; // card is best-effort; the save proceeds without it
    }
  };

  const handleSave = async () => {
    if (!valid || saving || alreadySaved || browse) return;
    setSaving(true);
    try {
      const card = await exportCard();
      await executeRef.current.mutateAsync({
        name: 'outfit.createManual',
        input: {
          slots: {
            top: dressShowing ? null : (visible.top?.itemId ?? null),
            bottom: dressShowing ? null : (visible.bottom?.itemId ?? null),
            outerwear: visible.outerwear?.itemId ?? null,
            shoes: visible.shoes?.itemId ?? null,
            dress: dressShowing ? (visible.dress?.itemId ?? null) : null,
          },
          ...(card ? { cardImageBase64: card.base64, cardImageMime: card.mime } : {}),
        },
      });
      savedThisSession.current = true;
      setSavedComposition(compositionKey);
      setToast(t.saved);
    } catch {
      setToast(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───
  if (!userId || query.isPending) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50dvh]">
        <div className="animate-pulse bg-stone-100 dark:bg-neutral-800 rounded h-4 w-40" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50dvh] px-6">
        <p className="text-sm text-red-600 dark:text-red-400 text-center">{t.loadError}</p>
      </div>
    );
  }

  const emptyCategory = lists.tops.length === 0 || lists.bottoms.length === 0;

  return (
    <div className="h-[calc(100dvh-4rem)] sm:h-auto flex flex-col bg-white dark:bg-neutral-900">
      {toast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-neutral-900/90 dark:bg-neutral-100/90 text-white dark:text-neutral-900 backdrop-blur-sm rounded-xl text-sm">
          {toast}
        </div>
      )}

      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <h1 className="text-sm font-semibold tracking-widest uppercase text-neutral-900 dark:text-neutral-100">
          {t.title}
        </h1>
        {!query.data?.cutoutsReady && (
          <span className="text-[10px] font-medium uppercase tracking-widest text-stone-500 dark:text-stone-400 animate-pulse">
            {t.preparing}
          </span>
        )}
      </div>

      <div className="px-4 flex-1 min-h-0 flex flex-col max-w-[430px] w-full mx-auto">
        {(query.data?.excludedFolded ?? 0) > 0 && (
          <p
            data-testid="folded-notice"
            className="mb-2 self-start px-2.5 py-1 bg-stone-100 dark:bg-neutral-800 text-stone-600 dark:text-stone-400 text-xs rounded-none"
          >
            {(query.data!.excludedFolded === 1 ? t.foldedNoticeOne : t.foldedNoticeMany).replace(
              '{count}',
              String(query.data!.excludedFolded),
            )}
          </p>
        )}
        {/* canvas: light plate in BOTH themes so dark garments stay visible
            (v0 design-review candidate, spec §9) */}
        <div
          ref={canvasRef}
          className="relative w-full aspect-[3/4] rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 overflow-hidden touch-pan-y select-none"
          data-testid="builder-canvas"
        >
          {emptyCategory ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 gap-3">
              <p className="text-sm text-neutral-500 leading-relaxed text-center">{t.emptyWardrobe}</p>
              <Link
                href={`/${lang}/wardrobe`}
                onClick={() => addPrompted.current.add(lists.tops.length === 0 ? 'top' : 'bottom')}
                className="px-4 py-2 bg-stone-700 text-stone-50 rounded-none text-xs font-medium tracking-wide uppercase hover:bg-stone-600 transition-colors"
              >
                {t.addItems}
              </Link>
            </div>
          ) : (
            <>
              {cw > 0 &&
                (Object.entries(visible) as Array<[BuilderRole, BuilderItem]>)
                  .sort((a, b) => (rects[a[0]]?.z ?? 0) - (rects[b[0]]?.z ?? 0))
                  .map(([role, item]) => {
                    const r = rects[role];
                    if (!r) return null;
                    const zone: ZoneId = role === 'dress' ? 'top' : (role as ZoneId);
                    const dx = dragRender?.zone === zone ? dragRender.dx : 0;
                    const isBrowse =
                      browse?.zone === zone ||
                      (dressShowing && browse?.zone === 'bottom' && (role === 'top' || role === 'bottom'));
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={item.itemId}
                        src={item.cutoutUrl ?? item.fallbackUrl ?? ''}
                        crossOrigin="anonymous"
                        alt={`${item.primaryColor} ${item.subcategory ?? role}`}
                        data-testid={`builder-item-${role}`}
                        className={`absolute pointer-events-none [filter:drop-shadow(0_8px_12px_rgba(40,32,18,0.14))] ${isBrowse ? 'opacity-55' : ''}`}
                        style={{
                          left: r.left,
                          top: r.top,
                          width: r.drawW,
                          height: r.drawH,
                          zIndex: r.z,
                          transform: `translateX(${dx}px)`,
                        }}
                      />
                    );
                  })}

              {dressShowing && !browse && (
                <p className="absolute left-1/2 -translate-x-1/2 top-[58%] z-40 text-[10px] font-medium uppercase tracking-widest text-neutral-400 bg-neutral-50/80 px-2 py-0.5 rounded-none pointer-events-none">
                  {t.coveredByDress}
                </p>
              )}

              {cw > 0 &&
                (Object.entries(ZONE_BANDS) as Array<[ZoneId, [number, number]]>).map(
                  ([zone, [y0, y1]]) => {
                    const n = zoneList(zone).length;
                    const pos = zonePos(zone);
                    const label =
                      zone === 'top' && lists.dresses.length > 0
                        ? `${t.slots[zone]} · ${t.dressHint}`
                        : t.slots[zone];
                    return (
                      <div
                        key={zone}
                        data-testid={`builder-zone-${zone}`}
                        className="absolute left-0 w-full z-40 touch-pan-y"
                        style={{ top: `${y0 * 100}%`, height: `${(y1 - y0) * 100}%` }}
                        onPointerDown={(e) => onPointerDown(zone, e)}
                        onPointerMove={onPointerMove}
                        onPointerUp={() => onPointerUp(zone)}
                        onPointerCancel={() => {
                          drag.current = null;
                          setDragRender(null);
                        }}
                      >
                        {n > 0 && (
                          <>
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-neutral-300 dark:text-neutral-400">
                              <Chevron dir="l" />
                            </span>
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-300 dark:text-neutral-400">
                              <Chevron dir="r" />
                            </span>
                          </>
                        )}
                        <span
                          className={`absolute right-2.5 bottom-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400 transition-opacity ${dragRender?.zone === zone ? 'opacity-100' : 'opacity-0'}`}
                        >
                          {label} · {pos === NONE ? t.none : `${pos + 1}/${n}`}
                        </span>
                      </div>
                    );
                  },
                )}
            </>
          )}
        </div>

        {/* tap-to-lock bar — BELOW the canvas so it never covers a zone */}
        <div className="h-14 flex items-center">
          {browse && browsingItem ? (
            <div className="w-full flex items-center justify-between gap-2" data-testid="browse-bar">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {t.browsing}: {browsingItem.primaryColor} {browsingItem.subcategory ?? ''}
              </span>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={keepBrowse}
                  data-testid="keep-btn"
                  className="px-4 py-2 bg-stone-700 dark:bg-stone-300 text-stone-50 dark:text-stone-900 rounded-none text-xs font-medium tracking-wide uppercase hover:bg-stone-600 dark:hover:bg-stone-400 transition-colors"
                >
                  {t.keep}
                </button>
                <button
                  onClick={revertBrowse}
                  data-testid="revert-btn"
                  className="px-4 py-2 border-2 border-stone-200 dark:border-neutral-600 text-stone-700 dark:text-stone-300 rounded-none text-xs font-medium tracking-wide uppercase transition-colors"
                >
                  {t.revert}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              {t.swipeHint}
            </p>
          )}
        </div>

        <button
          disabled={!valid || saving || alreadySaved || !!browse}
          data-testid="save-btn"
          onClick={handleSave}
          className="w-full mb-4 px-4 py-3 bg-stone-700 text-stone-50 rounded-none text-sm font-medium tracking-wide uppercase hover:bg-stone-600 transition-colors disabled:bg-stone-200 disabled:text-stone-400 dark:bg-stone-300 dark:text-stone-900 dark:hover:bg-stone-400 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-600"
        >
          {!valid ? t.saveInvalid : alreadySaved ? t.saved : saving ? '…' : t.save}
        </button>
      </div>
    </div>
  );
}
