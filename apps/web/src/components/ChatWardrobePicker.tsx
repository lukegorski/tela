"use client";

import Image from "next/image";
import BottomSheet from "@/components/BottomSheet";
import { useWardrobe } from "@/hooks/useWardrobe";
import { itemBgStyle } from "@/lib/styles";
import LoadingSpinner from "@/components/LoadingSpinner";

interface ChatWardrobePickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItemIds: string[];
  onToggle: (itemId: string) => void;
}

/**
 * Multi-select wardrobe picker shown via BottomSheet. Powers the chat
 * composer's "From wardrobe" attachment flow. The composer holds the
 * selection state and only the itemId list is exchanged across the
 * boundary — server-side resolution turns those into descriptions
 * appended to the LLM's user text per locked decision (D3).
 */
export default function ChatWardrobePicker({
  isOpen,
  onClose,
  selectedItemIds,
  onToggle,
}: ChatWardrobePickerProps) {
  const { items, loading } = useWardrobe();
  const selectedCount = selectedItemIds.length;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      {/* Header — title left, action icon right */}
      <div className="flex items-center justify-between px-5 pt-6 pb-3">
        <div>
          <h4 className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
            Wardrobe
          </h4>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 uppercase tracking-wide mt-1">
            {selectedCount > 0 ? `${selectedCount} selected` : "Add to chat"}
          </h3>
        </div>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClose}
            className="p-1"
            aria-label="Confirm selection"
          >
            <svg
              className="w-5 h-5 text-stone-700 dark:text-stone-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8">
            <LoadingSpinner variant="auto" />
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center py-16 px-6">
          <p className="text-sm text-neutral-400 dark:text-neutral-500 text-center">
            Your wardrobe is empty. Add some items first!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-neutral-200 dark:bg-neutral-700 overflow-y-auto max-h-[60vh]">
          {items.map((item) => {
            const isSelected = selectedItemIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className="bg-white dark:bg-neutral-900 active:opacity-80 transition-opacity"
              >
                <div
                  className="aspect-[3/4] relative overflow-hidden"
                  style={itemBgStyle(item)}
                >
                  {item.imageUrl && (
                    <Image
                      src={item.imageUrl}
                      alt={item.description ?? item.subcategory ?? item.category}
                      fill
                      sizes="(max-width: 768px) 33vw, 20vw"
                      className="object-contain"
                    />
                  )}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5">
                      <svg
                        className="w-5 h-5 text-neutral-400 dark:text-neutral-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="px-2 py-1.5 bg-white dark:bg-neutral-900">
                  <p className="text-xs text-neutral-700 dark:text-neutral-300 capitalize truncate">
                    {item.subcategory ?? item.category}
                  </p>
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-500 capitalize truncate">
                    {item.primaryColor}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
