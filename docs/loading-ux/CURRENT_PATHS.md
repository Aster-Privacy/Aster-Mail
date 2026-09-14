# Mail loading and read-state paths

This document lists every mail surface that loads data or marks mail as read, and the rule each one follows.

## Rules

- A view that has data never clears it to show a skeleton.
- A skeleton appears only when there is no data and loading lasts longer than 180 ms (`use_delayed_flag`, `SKELETON_DELAY_MS`).
- Opening mail marks it read through `on_user_opened_mail` in `src/services/user_opened_mail.ts`. The read state, the unread count, and the list row change in the same call, and the server write follows.
- A pending read intent in `src/services/read_intent.ts` wins over any list fetch or push event that still says unread.
- If the server write fails, the read state and the unread count roll back.
- Viewer paths that also mark mail read skip their own row update and count change when an open already owns the read (`get_read_intent(id) === true`).
- With reduced motion, skeleton bones stay still.

## Open paths

| Entry | Path | Status |
| --- | --- | --- |
| Inbox list click | `use_index_page_state.handle_email_click` calls `on_user_opened_mail` | Closed |
| Search result | `use_index_page_state.handle_search_result_click`, `use_search_results_page.open_result` | Closed |
| Notification or deep link to a cached row | `use_email_detail_load` calls `on_user_opened_mail` when the id changes | Closed |
| Deep link with no cached row | `on_user_opened_mail` returns false with no row, so nothing is marked read before the fetch; `use_email_detail_load` marks read only after the fetched item arrives | Closed |
| Full viewer | `use_email_viewer` guards its mark-read on intent, and a reload of the same mail keeps content on screen | Closed |
| Popup viewer | `use_popup_viewer` marks read optimistically with rollback | Closed |
| Thread messages | `thread_messages_list` marks read optimistically with rollback | Closed |
| Mobile detail | `use_mobile_mail_detail.mark_message_read` marks read optimistically with rollback | Closed |
| Offline mark read or unread | `use_single_actions_flags` notes the intent before the optimistic update | Closed |
| Popup read toggle | `popup_viewer_actions.handle_read_toggle` ignores taps while a toggle is saving | Closed |
| Account switch | `clear_account_scoped_caches` in `src/contexts/auth/auth_helpers.ts` calls `reset_opened_mail_scope`, which clears pending intents and pending opens; save callbacks in `user_opened_mail`, `use_email_detail_load`, `use_popup_viewer`, and `use_mobile_mail_detail` return early when the scope changed | Closed |
| Failed open | `revert_user_opened_mail` restores unread and the count, and writes unread back if the read save lands, with `force` so the write skips the dedupe in `update_item_metadata`; `use_email_detail_load` calls it on a fetch error or locked folder, and `use_popup_viewer` calls it on a fetch error. Search, notifications, and deep links open through these viewers | Closed |
| Multi-select mark read | `batched_bulk_patch_metadata` and `bulk_patch_metadata` in `src/services/api/mail.ts` note intents before the write and clear them for failed ids | Closed |
| Command palette mark all read | `bulk_update_items_metadata` in `src/services/crypto/mail_metadata_writer.ts` notes intents before the write | Closed |
| Toolbar mark all read by scope | `mark_all_read_by_scope` in `header_toolbar/helpers.tsx` marks indexed rows read through `set_all_indexed_read`, which notes intents, and lowers the unread count before the request, then rolls rows, intents, and the count back if the request fails | Closed |

## Loading paths

| Surface | Path | Status |
| --- | --- | --- |
| Desktop inbox | `use_email_inbox_state` delays the skeleton; `email_inbox` no longer covers existing rows | Closed |
| Mobile inbox | `mobile_email_list` delays the skeleton | Closed |
| Category tabs refresh | `use_category_inbox` keeps rows during refresh with no minimum skeleton time | Closed |
| Pull to refresh | Uses the same refresh path and keeps rows | Closed |
| Mail detail | `use_email_detail_load` has no minimum loading time | Closed |
| Folder list | `use_folders` does not re-enter loading while folders exist | Closed |
| Aliases settings | `alias_list` delays the skeleton, and cached aliases skip it | Closed |
| Compose sender picker | `use_sender_aliases` does not enter loading when the cache is filled | Closed |
| Settings sections gated on plan | `bridge_section`, `category_settings_section`, and `smtp_tokens_section` show the skeleton only when limits are missing, after `use_delayed_flag` | Closed |
| Billing | `billing_section` and `onion_billing_section` show the skeleton only on the first load, after `use_delayed_flag` | Closed |
| Other settings sections | Account, Allowlist, Blocked, Encryption, Signature, Storage, Templates, Vacation reply, and similar sections render their placeholder only when they have no data, so they never cover cached data | Closed |
| Domains | `use_aliases` starts `domains_loading` as `!aliases_cache.loaded`, so cached domains render at once, and `domains_section` shows no skeleton while loading | Closed |
| Token refresh | `use_auth_account_state` sets `is_loading: true` only in its initial state, so a refresh never remounts routes | Closed |
| Startup loader | Light theme paints the light background before the app mounts | Closed |
| Desktop boot | `index.html` paints `#0a0a0a` inline before any script, and `src-tauri/tauri.conf.json` sets the same window `backgroundColor`, so the dark window never shows white | Closed |

## Accessibility

| Element | Change |
| --- | --- |
| Desktop list row | The unread dot has a screen reader label |
| Mobile list row | Unread rows have a screen reader label |
| Pulse skeletons | Static with reduced motion, both system and in-app setting |

## Tests

- `src/hooks/use_delayed_flag.test.tsx`: a skeleton cancelled under 150 ms, data plus fetching is not a skeleton.
- `src/services/user_opened_mail.test.ts`: a hanging write still shows read, a stale fetch cannot restore unread, missing metadata does not block read, failure rolls back, an account switch drops pending intents and ignores saves from the previous account, and a failed open restores unread, including when the read save lands late.
- `src/services/crypto/mail_metadata_writer.force.test.ts`: a forced write skips a recently completed or in-flight identical write.
- `src/components/inbox/header/header_toolbar/helpers.mark_all_read.test.ts`: mark all read updates rows and the count before the request and rolls back on failure.
- `src/hooks/email_actions/unread_counters_sync.integration.test.tsx`: archive and star still sync after an open.
- `src/hooks/use_category_inbox.refresh.test.ts`: refresh keeps rows on screen.
