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
import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
import { CheckIcon } from "@heroicons/react/16/solid";

import { Input } from "@/components/ui/input";
import { use_tags, type DecryptedTag } from "@/hooks/use_tags";
import { CreateTagModal } from "@/components/tags/create_tag_modal";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";

interface TagPickerProps {
  is_open: boolean;
  on_close: () => void;
  assigned_tag_tokens: string[];
  on_toggle_tag: (tag_token: string, is_adding: boolean) => void;
  position?: { top: number; left: number };
  anchor_ref?: React.RefObject<HTMLElement | null>;
}

export function TagPicker({
  is_open,
  on_close,
  assigned_tag_tokens,
  on_toggle_tag,
  position,
  anchor_ref,
}: TagPickerProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { state: tags_state } = use_tags();
  const [search_query, set_search_query] = useState("");
  const [is_create_open, set_is_create_open] = useState(false);

  use_escape_layer(is_open, on_close, "tag_picker", false);

  const filtered_tags = useMemo(() => {
    if (!search_query.trim()) return tags_state.tags;

    const query = search_query.toLowerCase();

    return tags_state.tags.filter((tag: DecryptedTag) =>
      tag.name.toLowerCase().includes(query),
    );
  }, [tags_state.tags, search_query]);

  const computed_position = useMemo(() => {
    if (position) return position;
    if (anchor_ref?.current) {
      const rect = anchor_ref.current.getBoundingClientRect();

      return {
        top: rect.bottom + 4,
        left: rect.left,
      };
    }

    return { top: 0, left: 0 };
  }, [position, anchor_ref]);

  const is_tag_assigned = (tag_token: string) =>
    assigned_tag_tokens.includes(tag_token);

  if (!is_open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={on_close} />
      <AnimatePresence>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="fixed z-50 w-64 rounded-[var(--aster-radius-floating,16px)] overflow-hidden bg-[var(--aster-floating-bg,var(--modal-bg))] shadow-[var(--aster-floating-shadow)]"
          exit={{ opacity: 0, y: -4 }}
          initial={reduce_motion ? false : { opacity: 0, y: -4 }}
          style={{
            top: computed_position.top,
            left: computed_position.left,
          }}
          transition={{ duration: reduce_motion ? 0 : 0.12 }}
        >
          <div className="p-1.5">
            <div className="flex items-center gap-2 px-2.5 h-8 rounded-[var(--aster-radius-control)] bg-[var(--aster-field-bg)]">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 flex-shrink-0 text-txt-muted" />
              <Input
                autoFocus
                className="flex-1 bg-transparent border-none"
                placeholder={t("common.search_labels")}
                size="sm"
                type="text"
                value={search_query}
                onChange={(e) => set_search_query(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto px-1.5">
            {filtered_tags.length === 0 && (
              <p className="text-[12px] px-3 py-3 text-center text-txt-muted">
                {search_query
                  ? t("common.no_matching_labels")
                  : t("common.no_labels_yet")}
              </p>
            )}
            {filtered_tags.map((tag: DecryptedTag) => {
              const assigned = is_tag_assigned(tag.tag_token);

              return (
                <button
                  key={tag.id}
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[var(--aster-radius-item,8px)] text-[13px] transition-colors hover:bg-[var(--aster-floating-hover,var(--bg-hover))] text-txt-primary"
                  onClick={() => on_toggle_tag(tag.tag_token, !assigned)}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color || "#3b82f6" }}
                  />
                  <span className="flex-1 text-start truncate">{tag.name}</span>
                  {assigned && (
                    <CheckIcon
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: tag.color || "#3b82f6" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 border-t p-1.5 border-[var(--aster-floating-divider,var(--border-secondary))]">
            <button
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[var(--aster-radius-item,8px)] text-[12px] transition-colors hover:bg-[var(--aster-floating-hover,var(--bg-hover))] text-txt-muted"
              onClick={() => set_is_create_open(true)}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>{t("common.create_new_label")}</span>
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      <CreateTagModal
        is_open={is_create_open}
        on_close={() => set_is_create_open(false)}
      />
    </>
  );
}
