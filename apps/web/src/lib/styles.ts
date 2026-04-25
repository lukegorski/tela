import type { WardrobeItem } from "./types";

/**
 * CSS style for the wardrobe card/detail background.
 *
 * Legacy used a 4-corner gradient (one hex per corner of the enhanced
 * photo). We store a single detected `backgroundColor` per photo, so the
 * card just paints that flat hex. If/when we add per-corner sampling
 * later, this is the only function that needs to change.
 */
export function itemBgStyle(item: WardrobeItem): React.CSSProperties {
  return { backgroundColor: item.backgroundColor || "#fafafa" };
}
