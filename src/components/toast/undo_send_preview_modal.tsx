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
import type { LocalEmailData } from "@/components/email/email_viewer_types";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { EmailPopupViewer } from "@/components/email/email_popup_viewer";
import { SplitEmailViewer } from "@/components/email/split_email_viewer";
import { FullEmailViewer } from "@/components/email/full_email_viewer";
import { use_preferences } from "@/contexts/preferences_context";
import { use_should_reduce_motion } from "@/provider";

export type UndoSendPreviewData = LocalEmailData;

export function dispatch_undo_send_preview(data: UndoSendPreviewData): void {
  window.dispatchEvent(
    new CustomEvent<UndoSendPreviewData>("astermail:undo-send-preview", {
      detail: data,
    }),
  );
}

export function UndoSendPreviewModal() {
  const [data, set_data] = useState<UndoSendPreviewData | null>(null);
  const { preferences } = use_preferences();
  const view_mode = preferences.email_view_mode;
  const reduce_motion = use_should_reduce_motion();

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<UndoSendPreviewData>;

      set_data(custom.detail);
    };

    window.addEventListener("astermail:undo-send-preview", handler);

    return () => {
      window.removeEventListener("astermail:undo-send-preview", handler);
    };
  }, []);

  const handle_close = useCallback(() => set_data(null), []);

  if (!data) return null;

  if (view_mode === "popup") {
    return (
      <AnimatePresence>
        <EmailPopupViewer
          email_id={null}
          local_email={data}
          on_close={handle_close}
        />
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[60]"
        exit={{ opacity: 0 }}
        initial={reduce_motion ? false : { opacity: 0 }}
        transition={{ duration: reduce_motion ? 0 : 0.2 }}
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-md"
          role="button"
          tabIndex={0}
          onClick={handle_close}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handle_close();
            }
          }}
        />
        <div
          className="relative z-10 h-full"
          onClick={(e) => e.stopPropagation()}
        >
          {view_mode === "fullpage" ? (
            <FullEmailViewer
              email_id="undo-send-preview"
              local_email={data}
              on_back={handle_close}
            />
          ) : (
            <div className="flex h-full">
              <div className="flex-1" />
              <div className="w-1/2 max-w-[800px] min-w-[400px] h-full bg-surf-primary border-l border-edge-primary">
                <SplitEmailViewer
                  email_id="undo-send-preview"
                  local_email={data}
                  on_close={handle_close}
                />
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
