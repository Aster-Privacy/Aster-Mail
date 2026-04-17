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
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { use_templates } from "@/contexts/templates_context";

interface TemplatePickerProps {
  on_select: (content: string) => void;
  disabled?: boolean;
  open_direction?: "up" | "down";
}

export function TemplatePicker({
  on_select,
  disabled = false,
  open_direction = "down",
}: TemplatePickerProps) {
  const { t } = use_i18n();
  const { templates, grouped_templates, is_loading } = use_templates();
  const reduce_motion = use_should_reduce_motion();
  const [is_open, set_is_open] = useState(false);
  const container_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle_click_outside = (event: MouseEvent) => {
      if (
        container_ref.current &&
        !container_ref.current.contains(event.target as Node)
      ) {
        set_is_open(false);
      }
    };

    if (is_open) {
      document.addEventListener("mousedown", handle_click_outside);
    }

    return () => {
      document.removeEventListener("mousedown", handle_click_outside);
    };
  }, [is_open]);

  const handle_select = (content: string) => {
    on_select(content);
    set_is_open(false);
  };

  if (is_loading || templates.length === 0) {
    return null;
  }

  return (
    <div ref={container_ref} className="relative">
      <button
        className="p-1.5 rounded transition-colors duration-150 disabled:opacity-50 hover:bg-black/5 dark:hover:bg-white/10 text-txt-tertiary"
        disabled={disabled}
        title={t("mail.insert_template")}
        type="button"
        onClick={() => set_is_open(!is_open)}
        onMouseDown={(e) => e.preventDefault()}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
        </svg>
      </button>

      <AnimatePresence>
        {is_open && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={`absolute z-50 w-64 border border-edge-primary rounded-lg shadow-lg overflow-hidden bg-modal-bg ${open_direction === "up" ? "bottom-full mb-2" : "mt-2"}`}
            exit={{ opacity: 0, y: open_direction === "up" ? 10 : -10 }}
            initial={
              reduce_motion
                ? false
                : { opacity: 0, y: open_direction === "up" ? 10 : -10 }
            }
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
          >
            <div className="max-h-96 overflow-y-auto">
              {Object.entries(grouped_templates).map(
                ([category, category_templates]) => (
                  <div key={category}>
                    <div className="px-4 py-2 text-xs font-semibold text-txt-muted bg-surf-tertiary sticky top-0">
                      {category}
                    </div>
                    {category_templates.map((template) => (
                      <button
                        key={template.id}
                        className="w-full px-4 py-2 text-sm text-left hover:bg-surf-hover transition-colors border-b last:border-0 border-edge-primary"
                        onClick={() => handle_select(template.content)}
                      >
                        <div className="font-medium text-txt-primary">
                          {template.name}
                        </div>
                        <div className="text-xs text-txt-muted truncate">
                          {template.content.substring(0, 50)}
                        </div>
                      </button>
                    ))}
                  </div>
                ),
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
