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
import type { RemoteContentPreferences } from "@/lib/remote_content_policy";

import {
  is_html_content,
  plain_text_to_html,
  sanitize_html,
} from "@/lib/html_sanitizer";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { effective_remote_image_mode } from "@/lib/remote_content_policy";
import { is_any_lockdown_active } from "@/services/lockdown_store";

export function scheduled_body_html(
  body: string,
  preferences: Pick<
    RemoteContentPreferences,
    "load_remote_images" | "block_remote_images" | "low_network_mode"
  >,
): string {
  if (!is_html_content(body)) return plain_text_to_html(body);

  const lockdown = is_any_lockdown_active();

  return sanitize_html(body, {
    external_content_mode: lockdown
      ? "never"
      : effective_remote_image_mode(preferences),
    image_proxy_url: lockdown ? undefined : get_image_proxy_url(),
    sandbox_mode: true,
    lockdown_mode: lockdown,
  }).html;
}
