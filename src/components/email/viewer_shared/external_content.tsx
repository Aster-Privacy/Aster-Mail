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
import type {} from "@/types/thread";
import type {} from "@/services/api/mail";
import type {} from "@/services/api/multi_drafts";
import type {} from "@/lib/html_sanitizer";
import type {} from "@/components/email/use_email_viewer";
import type {} from "@/components/email/hooks/preload_cache";

export let loaded_content_email_id: string | null = null;

export function get_external_content_mode(
  email_id: string,
): "loaded" | undefined {
  return loaded_content_email_id === email_id ? "loaded" : undefined;
}

export function set_external_content_mode(email_id: string): void {
  loaded_content_email_id = email_id;
}
