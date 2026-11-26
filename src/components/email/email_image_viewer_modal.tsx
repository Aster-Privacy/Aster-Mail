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
import type { TranslationKey } from "@/lib/i18n/types";
import type { ImageViewerRequest } from "@/lib/email_image_viewer";

import { useReducedMotionConfig } from "framer-motion";

import { ImagePreviewModal } from "@/components/email/attachment_list/preview_modal";
import { save_viewer_image } from "@/lib/email_image_actions";

export function EmailImageViewer({
  request,
  t,
  on_change,
}: {
  request: ImageViewerRequest;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  on_change: (next: ImageViewerRequest | null) => void;
}) {
  const reduce_motion = useReducedMotionConfig() ?? false;
  const { items, index } = request;
  const item = items[index];
  const has_many = items.length > 1;

  if (!item) return null;

  const step = (delta: number) =>
    on_change({
      items,
      index: (index + delta + items.length) % items.length,
    });

  const handle_close = () => on_change(null);

  const handle_download = () => {
    save_viewer_image(item.src).catch(async () => {
      const { show_toast } = await import("@/components/toast/simple_toast");

      show_toast(t("mail.image_save_failed"), "error");
    });
  };

  const open_link = item.open_link;

  return (
    <ImagePreviewModal
      caption={item.alt}
      counter={has_many ? `${index + 1} / ${items.length}` : undefined}
      filename={t("mail.image_viewer_title")}
      on_close={handle_close}
      on_download={handle_download}
      on_next={has_many ? () => step(1) : undefined}
      on_open_link={
        open_link
          ? () => {
              handle_close();
              open_link();
            }
          : undefined
      }
      on_prev={has_many ? () => step(-1) : undefined}
      reduce_motion={reduce_motion}
      src={item.src}
      t={t}
    />
  );
}
