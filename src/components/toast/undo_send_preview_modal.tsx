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
import type { LocalEmailData } from "@/components/email/hooks/use_popup_viewer";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";

import { EmailPopupViewer } from "@/components/email/email_popup_viewer";
import { use_preferences } from "@/contexts/preferences_context";

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

  return (
    <AnimatePresence>
      {data && (
        <EmailPopupViewer
          email_id={null}
          local_email={data}
          on_close={handle_close}
          preview_mode={view_mode}
        />
      )}
    </AnimatePresence>
  );
}
