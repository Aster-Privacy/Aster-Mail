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

export function QuotedHtmlPreview({ html }: { html: string }) {
  const { handle_external_link } = use_external_link();
  const container_ref = useRef<HTMLDivElement>(null);

  const sanitized_html = useMemo(() => {
    const lockdown_mode = is_any_lockdown_active();

    return strip_unresolved_cid_references(
      sanitize_html(html, {
        external_content_mode: lockdown_mode ? "never" : "always",
        lockdown_mode,
        image_proxy_url: get_image_proxy_url(),
      }).html,
    );
  }, [html]);

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
