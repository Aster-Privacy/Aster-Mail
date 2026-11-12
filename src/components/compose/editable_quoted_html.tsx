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
import { useEffect, useRef } from "react";

import {
  build_editable_quoted_fragment,
  read_editable_quoted_html,
  resolve_quoted_image_blocking,
  type QuotedImageBlocking,
} from "@/lib/editable_quoted_html";
import { use_preferences_optional } from "@/contexts/preferences_context";
import { use_compose_image_hydration } from "@/hooks/use_compose_image_hydration";
import { use_i18n } from "@/lib/i18n/context";

interface EditableQuotedHtmlProps {
  html: string;
  is_hidden: boolean;
  label: string;
  on_change: (html: string) => void;
  source_email_id?: string;
}

export function EditableQuotedHtml({
  html,
  is_hidden,
  label,
  on_change,
  source_email_id,
}: EditableQuotedHtmlProps) {
  const { t } = use_i18n();
  const preferences = use_preferences_optional()?.preferences;
  const container_ref = useRef<HTMLDivElement>(null);
  const block_external_content = preferences?.block_external_content ?? true;
  const block_remote_images = preferences?.block_remote_images ?? true;
  const block_tracking_pixels = preferences?.block_tracking_pixels ?? true;
  const load_remote_images = preferences?.load_remote_images ?? "never";
  const quoted_blocking_ref = useRef<QuotedImageBlocking>({
    block_remote_images: false,
    block_tracking_pixels: true,
  });
  const t_ref = useRef(t);

  t_ref.current = t;
  use_compose_image_hydration(container_ref);
  quoted_blocking_ref.current = resolve_quoted_image_blocking({
    block_external_content,
    block_remote_images,
    block_tracking_pixels,
    load_remote_images,
    source_email_id,
  });

  useEffect(() => {
    const container = container_ref.current;

    if (!container) return;

    container.replaceChildren(
      build_editable_quoted_fragment(html, {
        ...quoted_blocking_ref.current,
        blocked_image_labels: {
          image: t_ref.current("common.image_blocked"),
          tracking_pixel: t_ref.current("common.tracking_pixel_blocked"),
        },
      }),
    );
  }, [html]);

  const report_change = () => {
    const container = container_ref.current;

    if (!container) return;

    on_change(read_editable_quoted_html(container));
  };

  return (
    <div
      ref={container_ref}
      contentEditable
      suppressContentEditableWarning
      aria-label={label}
      aria-multiline="true"
      className="mt-2 py-3 px-4 rounded-md text-sm leading-relaxed overflow-y-auto max-h-[320px] bg-surf-tertiary text-txt-secondary outline-none"
      data-selectable-region
      hidden={is_hidden}
      role="textbox"
      style={{ wordBreak: "break-word", cursor: "text" }}
      onInput={report_change}
    />
  );
}
