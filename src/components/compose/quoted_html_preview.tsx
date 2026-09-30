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
import { useEffect, useMemo, useRef } from "react";

import { sanitize_html } from "@/lib/html_sanitizer";
import { strip_unresolved_cid_references } from "@/lib/cid_resolver";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { use_external_link } from "@/contexts/external_link_context";
import { use_preferences_optional } from "@/contexts/preferences_context";
import { resolve_content_blocking } from "@/components/email/resolve_content_blocking";
import { strip_style_blocks } from "@/utils/print_email";

export function QuotedHtmlPreview({ html }: { html: string }) {
  const { handle_external_link } = use_external_link();
  const preferences = use_preferences_optional()?.preferences;
  const container_ref = useRef<HTMLDivElement>(null);
  const block_external_content = preferences?.block_external_content ?? false;
  const block_remote_images = preferences?.block_remote_images ?? true;
  const block_remote_fonts = preferences?.block_remote_fonts ?? true;
  const block_remote_css = preferences?.block_remote_css ?? true;
  const block_tracking_pixels = preferences?.block_tracking_pixels ?? true;

  const sanitized_html = useMemo(() => {
    const lockdown_mode = is_any_lockdown_active();
    const content_blocking = block_external_content
      ? resolve_content_blocking({
          lockdown_active: lockdown_mode,
          load_remote_content: false,
          preferences: {
            block_remote_images,
            block_remote_fonts,
            block_remote_css,
            block_tracking_pixels,
          },
        })
      : undefined;

    return strip_unresolved_cid_references(
      sanitize_html(strip_style_blocks(html), {
        external_content_mode: lockdown_mode ? "never" : "always",
        lockdown_mode,
        image_proxy_url: get_image_proxy_url(),
        content_blocking,
      }).html,
    );
  }, [
    html,
    block_external_content,
    block_remote_images,
    block_remote_fonts,
    block_remote_css,
    block_tracking_pixels,
  ]);

  useEffect(() => {
    const container = container_ref.current;

    if (!container) return;

    const intercept = (event: MouseEvent) => {
      if (event.type === "auxclick" && event.button !== 1) return;

      const target = event.target as HTMLElement | null;
      const link = target?.closest("a");

      if (!link) return;
      const href = link.getAttribute("href") ?? "";

      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

      event.preventDefault();
      event.stopPropagation();
      handle_external_link(href);
    };

    container.addEventListener("click", intercept);
    container.addEventListener("auxclick", intercept);

    return () => {
      container.removeEventListener("click", intercept);
      container.removeEventListener("auxclick", intercept);
    };
  }, [handle_external_link]);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: sanitized_html }}
      ref={container_ref}
      data-selectable-region
      className="mt-2 py-3 px-4 rounded-md text-sm leading-relaxed overflow-y-auto max-h-[150px] bg-surf-tertiary text-txt-secondary"
      style={{ wordBreak: "break-word" }}
      tabIndex={-1}
    />
  );
}
