//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { emoji_categories, search_emojis } from "@/config/emoji";

const CATEGORY_KEYS = Object.keys(emoji_categories);

function EmojiPicker({ on_select }: { on_select: (emoji: string) => void }) {
  const { t } = use_i18n();
  const [active_category, set_active_category] = useState(CATEGORY_KEYS[0]);
  const [search_query, set_search_query] = useState("");
  const grid_ref = useRef<HTMLDivElement>(null);
  const input_ref = useRef<HTMLInputElement>(null);

  const search_results = search_query ? search_emojis(search_query) : null;
  const current_entries =
    search_results ?? emoji_categories[active_category].entries;

  useEffect(() => {
    if (grid_ref.current) {
      grid_ref.current.scrollTop = 0;
    }
  }, [active_category, search_query]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl shadow-xl border w-[296px] bg-modal-bg border-edge-primary"
      exit={{ opacity: 0, y: 4 }}
      initial={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.12 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="p-2.5 pb-2">
        <Input
          ref={input_ref}
          className="w-full bg-transparent"
          placeholder={t("common.search_emojis")}
          size="sm"
          type="text"
          value={search_query}
          onChange={(e) => set_search_query(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>

      {!search_query && (
        <div className="flex px-1.5 border-b border-edge-secondary">
          {CATEGORY_KEYS.map((key) => (
            <button
              key={key}
              className="flex-1 flex items-center justify-center py-1.5 cursor-pointer bg-transparent hover:bg-transparent"
              style={{
                borderBottom:
                  active_category === key
                    ? "2px solid #3b82f6"
                    : "2px solid transparent",
              }}
              title={emoji_categories[key].label}
              type="button"
              onClick={() => {
                set_active_category(key);
                set_search_query("");
              }}
            >
              <span className="text-sm leading-none">
                {emoji_categories[key].icon}
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={grid_ref}
        className="grid grid-cols-8 gap-0.5 p-2 max-h-[216px] overflow-y-auto scrollbar-hide"
      >
        {current_entries.map((entry, index) => (
          <button
            key={`${active_category}-${index}`}
            className="w-8 h-8 flex items-center justify-center rounded text-lg cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
            type="button"
            onClick={() => on_select(entry.emoji)}
          >
            {entry.emoji}
          </button>
        ))}
      </div>

      {current_entries.length === 0 && (
        <div className="text-center py-6 text-txt-muted">
          <p className="text-xs">{t("common.no_emojis_found")}</p>
        </div>
      )}
    </motion.div>
  );
}

export default EmojiPicker;
