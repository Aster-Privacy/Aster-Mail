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
} from "@/lib/editable_quoted_html";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { use_preferences_optional } from "@/contexts/preferences_context";
import { resolve_content_blocking } from "@/components/email/resolve_content_blocking";

interface EditableQuotedHtmlProps {
  html: string;
  is_hidden: boolean;
  label: string;
  on_change: (html: string) => void;
}

export function EditableQuotedHtml({
  html,
  is_hidden,
  label,
  on_change,
}: EditableQuotedHtmlProps) {
  const preferences = use_preferences_optional()?.preferences;
  const container_ref = useRef<HTMLDivElement>(null);
  const block_external_content = preferences?.block_external_content ?? false;
  const block_remote_images = preferences?.block_remote_images ?? true;
  const should_block_images_ref = useRef(false);

  should_block_images_ref.current =
    block_external_content &&
    resolve_content_blocking({
      lockdown_active: is_any_lockdown_active(),
      load_remote_content: false,
      preferences: {
        block_remote_images,
        block_remote_fonts: true,
        block_remote_css: true,
        block_tracking_pixels: true,
      },
    }).block_remote_images;

  useEffect(() => {
    const container = container_ref.current;

    if (!container) return;

    container.replaceChildren(
      build_editable_quoted_fragment(html, {
        block_remote_images: should_block_images_ref.current,
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
