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
import type { InboxEmail, EmailListState } from "@/types/email";

export const MIN_SKELETON_MS = 0;

export interface UseEmailListReturn {
  state: EmailListState;
  fetch_page: (page: number, limit: number) => Promise<void>;
  load_more: () => Promise<void>;
  update_email: (id: string, updates: Partial<InboxEmail>) => void;
  remove_email: (id: string) => void;
  remove_emails: (ids: string[]) => void;
  toggle_star: (id: string) => Promise<void>;
  toggle_pin: (id: string) => void;
  mark_read: (id: string) => Promise<void>;
  delete_email: (id: string) => Promise<void>;
  archive_email: (id: string) => Promise<void>;
  unarchive_email: (id: string) => Promise<void>;
  mark_spam: (id: string) => Promise<void>;
  bulk_delete: (ids: string[]) => Promise<void>;
  bulk_archive: (ids: string[]) => Promise<void>;
  bulk_unarchive: (ids: string[]) => Promise<void>;
  refresh: () => void;
}
