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
import type { DecryptedThreadMessage } from "@/types/thread";
import { resolve_content_blocking } from "./resolve_content_blocking";
import type {
  ExternalContentReport,
  ImageLoadMode,
} from "@/lib/html_sanitizer";
import type { PreloadedSanitizedContent } from "@/components/email/hooks/preload_cache";
import type { PhishingLevel } from "@/lib/phishing_analyzer";

import { useState, useMemo, useEffect, useRef } from "react";

import { pop_preloaded_thread_cid } from "@/components/email/hooks/preload_cache";
import { dispatch_iframe_ready } from "@/components/email/sandboxed_email_renderer";
import { is_ghost_email } from "@/stores/ghost_alias_store";
import {
  sanitize_html,
  is_html_content,
  has_rich_html,
  plain_text_to_html,
  html_to_readable_plain_text,
  strip_html_tags_bounded,
} from "@/lib/html_sanitizer";
import { is_system_email } from "@/lib/utils";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_date_format } from "@/hooks/use_date_format";
import { use_latched_by_id } from "@/hooks/use_latched_by_id";
import { use_email_translation } from "@/components/email/hooks/use_email_translation";
import { analyze_email_content } from "@/lib/phishing_analyzer";
import {
  extract_cid_references,
  extract_cid_inline_filenames,
  resolve_cid_references,
  revoke_cid_blob_urls,
} from "@/lib/cid_resolver";
import {
  RATCHET_UNDECRYPTABLE_SENTINEL,
  PGP_UNDECRYPTABLE_SENTINEL,
  is_ratchet_envelope,
  is_password_protected_body,
} from "@/utils/email_crypto";
import {
  is_lockdown_enabled,
  LOCKDOWN_CHANGED_EVENT,
} from "@/services/lockdown_store";
import { resolve_received_on_address } from "@/utils/delivered_to";
import {
  normalize_alias_candidates,
  use_alias_delivery,
} from "@/hooks/use_alias_delivery";
import { use_auth_safe } from "@/contexts/auth_context";
import { use_attachment_keys_version } from "@/hooks/use_attachment_keys_version";
import { ignore_error } from "@/lib/ignore_error";
import { clip_with_ellipsis } from "@/utils/preview_text";

export interface ThreadMessageBlockProps {
  message: DecryptedThreadMessage;
  is_own_message: boolean;
  is_expanded: boolean;
  is_reply?: boolean;
  is_single_message?: boolean;
  is_last_in_thread?: boolean;
  hide_bottom_border?: boolean;
  on_toggle: () => void;
  is_starred?: boolean;
  is_read?: boolean;
  on_star_toggle?: () => void;
  on_toggle_read?: () => void;
  on_reply?: (message: DecryptedThreadMessage) => void;
  on_reply_all?: (message: DecryptedThreadMessage) => void;
  on_forward?: (message: DecryptedThreadMessage) => void;
  on_archive?: (message: DecryptedThreadMessage) => void;
  on_trash?: (message: DecryptedThreadMessage) => void;
  on_print?: (message: DecryptedThreadMessage) => void;
  on_view_source?: (message: DecryptedThreadMessage) => void;
  on_report_phishing?: (message: DecryptedThreadMessage) => void;
  on_block_sender?: (message: DecryptedThreadMessage) => void;
  on_not_spam?: (message: DecryptedThreadMessage) => void;
  folders?: { id: string; name: string; color: string }[];
  message_folder_tokens?: string[];
  on_move_to_folder?: (
    message: DecryptedThreadMessage,
    folder_token: string,
  ) => void;
  external_content_mode?: ImageLoadMode;
  on_external_content_detected?: (report: ExternalContentReport) => void;
  force_dark_mode?: boolean;
  disable_auto_dark_mode?: boolean;
  on_toggle_dark_mode?: () => void;
  show_inline_reply?: boolean;
  inline_reply_thread_token?: string;
  inline_reply_is_external?: boolean;
  on_close_inline_reply?: () => void;
  inline_mode?: "reply" | "reply_all" | "forward";
  on_set_inline_mode?: (mode: "reply" | "reply_all" | "forward") => void;
  on_draft_saved?: (draft: {
    id: string;
    version: number;
    content: import("@/services/api/multi_drafts").DraftContent;
  }) => void;
  existing_draft?: {
    id: string;
    version: number;
    reply_to_id?: string;
    content: import("@/services/api/multi_drafts").DraftContent;
  } | null;
  preloaded_sanitized?: PreloadedSanitizedContent;
  size_bytes?: number;
  on_unsubscribe?: () => Promise<"success" | "manual">;
  on_manual_unsubscribed?: () => void;
  unsubscribe_url?: string;
  loaded_content_types?: Set<string>;
  on_load_external_content?: (types?: string[]) => void;
}

function strip_quotes(body: string): string {
  const wrote_re = /On .+wrote:\s*/i;
  const match = body.match(wrote_re);
  let processed = body;

  if (match && match.index !== undefined) {
    const before = body.substring(0, match.index).trim();

    if (before.length > 0) {
      processed = before;
    } else {
      processed = body.substring(match.index + match[0].length);
    }
  }

  return (
    processed
      .replace(/^>.*$/gm, "")
      .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "")
      .trim() || body
  );
}

export function use_thread_message_block(props: ThreadMessageBlockProps) {
  const {
    message,
    is_own_message,
    is_expanded,
    is_single_message = false,
    is_last_in_thread = false,
    external_content_mode,
    on_external_content_detected,
    preloaded_sanitized: preloaded_sanitized_prop,
    loaded_content_types,
  } = props;

  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const auth = use_auth_safe();
  const account_id = auth?.current_account_id ?? "";
  const { format_email_detail } = use_date_format();
  const [viewing_source, set_viewing_source] = useState(false);
  const [wrap_source, set_wrap_source] = useState(false);
  const [show_details_modal, set_show_details_modal] = useState(false);
  const [unsub_state, set_unsub_state] = useState<
    "idle" | "loading" | "manual" | "done"
  >("idle");
  const preloaded_sanitized = use_latched_by_id(
    message.id,
    preloaded_sanitized_prop,
  );

  const [password_unlocked_body, set_password_unlocked_body] = useState<
    string | null
  >(null);
  const password_protected =
    is_password_protected_body(message.body) && password_unlocked_body === null;

  useEffect(() => {
    set_password_unlocked_body(null);
  }, [message.id]);

  const clean_body = useMemo(() => {
    if (password_unlocked_body !== null) {
      return password_unlocked_body;
    }

    if (message.html_content && !is_ratchet_envelope(message.html_content)) {
      return message.html_content;
    }

    return strip_quotes(message.body);
  }, [message.body, message.html_content, password_unlocked_body]);
  const has_reported_external_content = useRef(false);

  const collapsed_preview = useMemo(() => {
    if (password_protected) {
      return t("mail.pgp_password_protected_title");
    }

    if (
      clean_body === RATCHET_UNDECRYPTABLE_SENTINEL ||
      clean_body === PGP_UNDECRYPTABLE_SENTINEL
    ) {
      return t("mail.encrypted_message_unavailable");
    }
    const plain = strip_html_tags_bounded(clean_body, 600).replace(/\s+/g, " ").trim();

    return clip_with_ellipsis(plain, 120);
  }, [clean_body, password_protected, t]);

  const [lockdown_active, set_lockdown_active] = useState(() =>
    is_lockdown_enabled(account_id),
  );

  useEffect(() => {
    const update = () =>
      set_lockdown_active(is_lockdown_enabled(auth?.current_account_id ?? ""));

    window.addEventListener(LOCKDOWN_CHANGED_EVENT, update);
    window.addEventListener("storage", update);

    return () => {
      window.removeEventListener(LOCKDOWN_CHANGED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, [auth?.current_account_id]);

  const is_body_visible =
    message.is_deleted !== true &&
    (is_expanded || is_last_in_thread || is_single_message);

  const is_system = is_system_email(message);
  const is_ghost_sender = is_ghost_email(message.sender_email);
  const show_sender_name = message.display_sender_name ?? message.sender_name;
  const show_sender_email =
    message.display_sender_email ?? message.sender_email;
  const received_on_address = useMemo(
    () =>
      message.item_type === "received"
        ? resolve_received_on_address(message)
        : undefined,
    [message],
  );
  const alias_candidates_key = useMemo(
    () =>
      message.item_type === "received"
        ? normalize_alias_candidates([
            received_on_address,
            ...(message.to_recipients?.map((r) => r.email) ?? []),
            ...(message.cc_recipients?.map((r) => r.email) ?? []),
          ])
        : "",
    [
      message.item_type,
      message.to_recipients,
      message.cc_recipients,
      received_on_address,
    ],
  );
  const alias_delivery = use_alias_delivery(undefined, alias_candidates_key);
  const delivered_to_address = received_on_address ?? alias_delivery?.address;
  const has_plaintext_body =
    !password_protected &&
    !!message.body &&
    message.body !== RATCHET_UNDECRYPTABLE_SENTINEL &&
    message.body !== PGP_UNDECRYPTABLE_SENTINEL &&
    !is_ratchet_envelope(message.body);
  const is_ratchet_undecryptable =
    !has_plaintext_body &&
    (message.body === RATCHET_UNDECRYPTABLE_SENTINEL ||
      message.body === PGP_UNDECRYPTABLE_SENTINEL ||
      is_ratchet_envelope(message.body) ||
      is_ratchet_envelope(message.html_content));
  const rich_html_source = message.html_content || message.body;
  const is_plain_text = !rich_html_source || !has_rich_html(rich_html_source);

  const translation_enabled = preferences.translate_incoming !== "off";

  const [phishing_level, set_phishing_level] = useState<PhishingLevel>("safe");
  const [phishing_checked, set_phishing_checked] = useState(false);

  useEffect(() => {
    if (!translation_enabled || !is_body_visible) {
      set_phishing_level("safe");
      set_phishing_checked(false);

      return;
    }

    let cancelled = false;

    set_phishing_level("safe");
    set_phishing_checked(false);

    analyze_email_content(
      message.html_content ?? "",
      message.body ?? "",
      message.sender_name ?? "",
      message.sender_email ?? "",
      !is_system,
    )
      .then((result) => {
        if (!cancelled) set_phishing_level(result.level);
      })
      .catch((caught) =>
        ignore_error(
          "components/email/use_thread_message_block:update",
          caught,
        ),
      )
      .finally(() => {
        if (!cancelled) set_phishing_checked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    translation_enabled,
    is_body_visible,
    message.id,
    message.html_content,
    message.body,
    message.sender_name,
    message.sender_email,
    is_system,
  ]);

  const translation = use_email_translation({
    account_id,
    email_id: message.id,
    subject: message.subject ?? "",
    translatable:
      is_body_visible &&
      !is_ratchet_undecryptable &&
      message.is_spam !== true &&
      message.item_type !== "draft" &&
      phishing_checked &&
      phishing_level === "safe",
  });

  useEffect(() => {
    if (is_ratchet_undecryptable) {
      dispatch_iframe_ready(message.id);
    }
  }, [is_ratchet_undecryptable, message.id]);

  const base_image_mode = is_system
    ? ("always" as ImageLoadMode)
    : !preferences.block_external_content
      ? ("always" as ImageLoadMode)
      : preferences.load_remote_images;

  const load_remote_content =
    !lockdown_active && external_content_mode === "always";

  const has_loaded_types =
    loaded_content_types && loaded_content_types.size > 0;

  const sanitized_content = useMemo(() => {
    if (!is_body_visible) {
      return { html: "", report: null, body_background: undefined };
    }

    if (
      preloaded_sanitized &&
      base_image_mode !== "always" &&
      !load_remote_content &&
      !has_loaded_types
    ) {
      const report: ExternalContentReport | null =
        preloaded_sanitized.external_content.blocked_count > 0
          ? preloaded_sanitized.external_content
          : null;

      return {
        html: preloaded_sanitized.html,
        report,
        body_background: preloaded_sanitized.body_background,
      };
    }

    if (!is_html_content(clean_body)) {
      return {
        html: plain_text_to_html(clean_body),
        report: null,
        body_background: undefined,
      };
    }

    const resolved_blocking = resolve_content_blocking({
      lockdown_active,
      load_remote_content,
      loaded_content_types,
      preferences: {
        block_remote_images: preferences.block_remote_images,
        block_remote_fonts: preferences.block_remote_fonts,
        block_remote_css: preferences.block_remote_css,
        block_tracking_pixels: preferences.block_tracking_pixels,
      },
    });

    const result = sanitize_html(clean_body, {
      external_content_mode: lockdown_active
        ? "never"
        : load_remote_content
          ? "always"
          : base_image_mode,
      image_proxy_url: get_image_proxy_url(),
      sandbox_mode: true,
      lockdown_mode: lockdown_active,
      content_blocking:
        !is_system && (lockdown_active || preferences.block_external_content)
          ? {
              ...resolved_blocking,
            }
          : undefined,
    });

    const report: ExternalContentReport | null =
      result.external_content.blocked_count > 0
        ? result.external_content
        : null;

    return {
      html: result.html,
      report,
      body_background: result.body_background,
    };
  }, [
    is_body_visible,
    preloaded_sanitized,
    clean_body,
    base_image_mode,
    load_remote_content,
    has_loaded_types,
    loaded_content_types,
    lockdown_active,
    preferences.block_external_content,
    preferences.block_remote_images,
    preferences.block_remote_fonts,
    preferences.block_remote_css,
    preferences.block_tracking_pixels,
  ]);

  useEffect(() => {
    if (
      !is_system &&
      sanitized_content.report &&
      sanitized_content.report.blocked_count > 0 &&
      on_external_content_detected &&
      !has_reported_external_content.current
    ) {
      has_reported_external_content.current = true;
      on_external_content_detected(sanitized_content.report);
    }
  }, [is_system, sanitized_content.report, on_external_content_detected]);

  useEffect(() => {
    has_reported_external_content.current = false;
  }, [message.id]);

  const cid_blob_urls_ref = useRef<string[]>([]);
  const cid_preload_consumed_ref = useRef(false);
  const attachment_keys_version = use_attachment_keys_version(message.id);

  const [cid_resolved_html, set_cid_resolved_html] = useState<string | null>(
    () => {
      if (!is_expanded || base_image_mode === "always") return null;
      const preloaded = pop_preloaded_thread_cid(message.id);

      if (preloaded) {
        cid_blob_urls_ref.current = preloaded.blob_urls;
        cid_preload_consumed_ref.current = true;

        return preloaded.html;
      }

      return null;
    },
  );

  useEffect(() => {
    if (cid_preload_consumed_ref.current) {
      cid_preload_consumed_ref.current = false;

      return;
    }

    let cancelled = false;

    const has_cid = extract_cid_references(sanitized_content.html).length > 0;

    if (
      !has_cid ||
      !is_expanded ||
      message.is_sending === true ||
      preferences.low_network_mode
    ) {
      revoke_cid_blob_urls(cid_blob_urls_ref.current);
      cid_blob_urls_ref.current = [];
      set_cid_resolved_html(null);

      return;
    }

    const preloaded =
      base_image_mode !== "always"
        ? pop_preloaded_thread_cid(message.id)
        : null;

    if (preloaded) {
      revoke_cid_blob_urls(cid_blob_urls_ref.current);
      cid_blob_urls_ref.current = preloaded.blob_urls;
      set_cid_resolved_html(preloaded.html);

      return;
    }

    resolve_cid_references(sanitized_content.html, message.id)
      .then((result) => {
        if (cancelled) {
          revoke_cid_blob_urls(result.blob_urls);

          return;
        }
        revoke_cid_blob_urls(cid_blob_urls_ref.current);
        cid_blob_urls_ref.current = result.blob_urls;
        set_cid_resolved_html(result.html);
      })
      .catch((caught) =>
        ignore_error(
          "components/email/use_thread_message_block:update",
          caught,
        ),
      );

    return () => {
      cancelled = true;
    };
  }, [
    sanitized_content.html,
    message.id,
    is_expanded,
    preferences.low_network_mode,
    attachment_keys_version,
  ]);

  useEffect(() => {
    return () => {
      revoke_cid_blob_urls(cid_blob_urls_ref.current);
      cid_blob_urls_ref.current = [];
    };
  }, []);

  const effective_html = cid_resolved_html ?? sanitized_content.html;

  const html_blocked =
    is_html_content(clean_body) &&
    (preferences.html_rendering_mode === "plain_text" ||
      preferences.low_network_mode);

  const plain_text_html = useMemo(() => {
    if (!html_blocked) return null;

    return plain_text_to_html(
      html_to_readable_plain_text(clean_body, { keep_link_urls: true }),
    );
  }, [html_blocked, clean_body]);

  const inline_cids = useMemo(() => {
    const refs = extract_cid_references(sanitized_content.html);

    return refs.length > 0
      ? new Set(refs.map((r) => r.toLowerCase()))
      : undefined;
  }, [sanitized_content.html]);

  const inline_filenames = useMemo(() => {
    const names = extract_cid_inline_filenames(sanitized_content.html);

    return names.size > 0 ? names : undefined;
  }, [sanitized_content.html]);

  const name = is_own_message ? t("common.me") : show_sender_name;
  const can_collapse = !is_single_message && !is_last_in_thread;

  return {
    t,
    auth,
    format_email_detail,
    viewing_source,
    set_viewing_source,
    wrap_source,
    set_wrap_source,
    show_details_modal,
    set_show_details_modal,
    unsub_state,
    set_unsub_state,
    set_password_unlocked_body,
    password_protected,
    clean_body,
    collapsed_preview,
    lockdown_active,
    is_system,
    is_ghost_sender,
    show_sender_name,
    show_sender_email,
    received_on_address,
    alias_delivery,
    delivered_to_address,
    is_ratchet_undecryptable,
    is_plain_text,
    translation,
    load_remote_content,
    sanitized_content,
    effective_html,
    html_blocked,
    plain_text_html,
    inline_cids,
    inline_filenames,
    name,
    can_collapse,
  };
}
