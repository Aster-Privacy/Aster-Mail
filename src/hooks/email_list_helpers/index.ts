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
export { decrypt_envelope } from "./decrypt";
export {
  is_snoozed_in_future,
  outgoing_profile_email,
  outgoing_recipient_names,
  resolve_list_display_name,
  should_keep_email_in_view,
} from "./display";
export { fetch_mail_from_api } from "./fetch_api";
export { fetch_mail_by_ids_reconciled } from "./fetch_ids";
export type { FetchByIdsResult } from "./fetch_ids";
export {
  collect_restore_entries,
  expand_email_ids,
  group_emails_by_thread,
  insert_emails_at,
  sort_emails_by_timestamp,
} from "./grouping";
export type { RestoredEmailEntry } from "./grouping";
export { mail_to_email, mail_to_email_safe } from "./mapping";
export {
  DEFAULT_PAGE_SIZE,
  UNKNOWN_TOTAL,
  VIEW_PARAMS,
  is_outgoing_view,
} from "./views";
export type { MailView } from "./views";
