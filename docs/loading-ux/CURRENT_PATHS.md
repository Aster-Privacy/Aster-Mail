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
| Deep link with no cached row | `use_email_detail_load` marks read as soon as the fetched item shows unread, guarded by intent | Closed; the unread state is unknown until the item arrives |
| Full viewer | `use_email_viewer` guards its mark-read on intent, and a reload of the same mail keeps content on screen | Closed |
| Popup viewer | `use_popup_viewer` marks read optimistically with rollback | Closed |
| Thread messages | `thread_messages_list` marks read optimistically with rollback | Closed |
| Mobile detail | `use_mobile_mail_detail.mark_message_read` marks read optimistically with rollback | Closed |
| Offline mark read or unread | `use_single_actions_flags` notes the intent before the optimistic update | Closed |
| Popup read toggle | `popup_viewer_actions.handle_read_toggle` ignores taps while a toggle is saving | Closed |
| Multi-select mark read | `batch_actions` explicit user action | Unchanged, not an open path |
| Command palette mark all read | `command_palette` bulk action | Unchanged, not an open path |

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
| Settings sections gated on plan | Skeleton only when limits are missing | Unchanged |
| Token refresh | Auth loading starts true once and never flips back, so routes do not remount | Unchanged |
| Startup loader | Light theme paints the light background before the app mounts | Closed |

## Accessibility

| Element | Change |
| --- | --- |
| Desktop list row | The unread dot has a screen reader label |
| Mobile list row | Unread rows have a screen reader label |
| Pulse skeletons | Static with reduced motion, both system and in-app setting |

## Tests

- `src/hooks/use_delayed_flag.test.tsx`: a skeleton cancelled under 150 ms, data plus fetching is not a skeleton.
- `src/services/user_opened_mail.test.ts`: a hanging write still shows read, a stale fetch cannot restore unread, missing metadata does not block read, failure rolls back.
- `src/hooks/email_actions/unread_counters_sync.integration.test.tsx`: archive and star still sync after an open.
- `src/hooks/use_category_inbox.refresh.test.ts`: refresh keeps rows on screen.
