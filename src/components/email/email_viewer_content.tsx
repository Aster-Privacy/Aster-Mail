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
import type { Email } from "@/types/email";
import type { ExternalContentReport } from "@/lib/html_sanitizer";
import type { PreloadedSanitizedContent } from "@/components/email/hooks/preload_cache";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Separator } from "@/components/ui/separator";
import { UnsubscribeBanner } from "@/components/email/unsubscribe_banner";
import { ExternalContentBanner } from "@/components/email/external_content_banner";
import { ExpirationBanner } from "@/components/email/expiration_countdown";
import { LockIcon } from "@/components/common/icons";
import { detect_unsubscribe_info } from "@/utils/unsubscribe_detector";
import {
  sanitize_html,
  is_html_content,
  has_rich_html,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { SandboxedEmailRenderer } from "@/components/email/sandboxed_email_renderer";
import { is_system_email } from "@/lib/utils";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { EmailTag } from "@/components/ui/email_tag";
import {
  extract_cid_references,
  resolve_cid_references,
  revoke_cid_blob_urls,
} from "@/lib/cid_resolver";

interface EmailViewerContentProps {
  email: Email;
  external_content_mode?: "always" | "ask" | "never";
  on_external_content_detected?: (report: ExternalContentReport) => void;
  preloaded_sanitized?: PreloadedSanitizedContent;
}

export function EmailViewerContent({
  email,
  external_content_mode: external_content_mode_override,
  on_external_content_detected,
  preloaded_sanitized,
}: EmailViewerContentProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const [force_load_content, set_force_load_content] = useState(false);
  const [banner_dismissed, set_banner_dismissed] = useState(false);

  useEffect(() => {
    set_force_load_content(false);
    set_banner_dismissed(false);
  }, [email.id]);

  const unsubscribe_info = useMemo(() => {
    if (email.unsubscribe_info) {
      return email.unsubscribe_info;
    }

    return detect_unsubscribe_info(
      email.html_content,
      email.body || email.preview,
    );
  }, [email.unsubscribe_info, email.html_content, email.body, email.preview]);

  const raw_content = email.html_content || email.body || email.preview;

  const is_system = is_system_email(email.sender.email);
  const is_plain_text = !raw_content || !has_rich_html(raw_content);
  const is_literal_plain_text = !raw_content || !is_html_content(raw_content);

  const effective_content_mode = is_system
    ? ("always" as const)
    : !preferences.block_external_content
      ? ("always" as const)
      : (external_content_mode_override ?? preferences.load_remote_images);

  const sanitize_result = useMemo(() => {
    if (preloaded_sanitized && effective_content_mode !== "always") {
      return {
        html: preloaded_sanitized.html,
        external_content: preloaded_sanitized.external_content,
        body_background: preloaded_sanitized.body_background,
      };
    }

    if (!is_html_content(raw_content)) {
      return {
        html: plain_text_to_html(raw_content),
        external_content: {
          has_remote_images: false,
          has_remote_fonts: false,
          has_remote_css: false,
          has_tracking_pixels: false,
          blocked_count: 0,
          blocked_items: [],
          cleaned_links: [],
        } as ExternalContentReport,
        body_background: undefined,
      };
    }

    return sanitize_html(raw_content, {
      external_content_mode: effective_content_mode,
      image_proxy_url: get_image_proxy_url(),
      sandbox_mode: true,
      content_blocking:
        !is_system && preferences.block_external_content
          ? {
              block_remote_images: preferences.block_remote_images,
              block_remote_fonts: preferences.block_remote_fonts,
              block_remote_css: preferences.block_remote_css,
              block_tracking_pixels: preferences.block_tracking_pixels,
            }
          : undefined,
    });
  }, [
    preloaded_sanitized,
    raw_content,
    effective_content_mode,
    preferences.block_external_content,
    preferences.block_remote_images,
    preferences.block_remote_fonts,
    preferences.block_remote_css,
    preferences.block_tracking_pixels,
  ]);

  const show_banner = useMemo(() => {
    if (is_system || banner_dismissed || force_load_content) return false;

    return sanitize_result.external_content.blocked_count > 0;
  }, [
    is_system,
    sanitize_result.external_content,
    banner_dismissed,
    force_load_content,
  ]);

  useMemo(() => {
    if (
      on_external_content_detected &&
      sanitize_result.external_content.blocked_count > 0
    ) {
      on_external_content_detected(sanitize_result.external_content);
    }
  }, [sanitize_result.external_content, on_external_content_detected]);

  const [cid_resolved_html, set_cid_resolved_html] = useState<string | null>(
    null,
  );
  const cid_blob_urls_ref = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const has_cid = extract_cid_references(sanitize_result.html).length > 0;

    if (!has_cid) {
      set_cid_resolved_html(null);

      return;
    }

    resolve_cid_references(sanitize_result.html, email.id)
      .then((result) => {
        if (cancelled) {
          revoke_cid_blob_urls(result.blob_urls);

          return;
        }
        revoke_cid_blob_urls(cid_blob_urls_ref.current);
        cid_blob_urls_ref.current = result.blob_urls;
        set_cid_resolved_html(result.html);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [sanitize_result.html, email.id]);

  useEffect(() => {
    return () => {
      revoke_cid_blob_urls(cid_blob_urls_ref.current);
      cid_blob_urls_ref.current = [];
    };
  }, []);

  const effective_html = cid_resolved_html ?? sanitize_result.html;

  const handle_load_remote = useCallback(() => {
    set_force_load_content(true);
  }, []);

  const handle_dismiss_banner = useCallback(() => {
    set_banner_dismissed(true);
  }, []);

  return (
    <>
      {unsubscribe_info.has_unsubscribe && !is_system && (
        <UnsubscribeBanner
          sender_email={email.sender.email}
          sender_name={email.sender.name}
          unsubscribe_info={unsubscribe_info}
        />
      )}
      {email.expires_at && (
        <div className="px-6 pt-4">
          <ExpirationBanner expires_at={email.expires_at} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="flex items-start gap-4 mb-6">
          <ProfileAvatar
            clickable
            use_domain_logo
            email={email.sender.email}
            name={email.sender.name}
            size="lg"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-blue-500 cursor-default">
                <LockIcon size={20} />
              </span>
              <h2 className="text-2xl font-semibold break-words text-txt-primary">
                {email.subject}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-txt-secondary">
                {email.sender.name}
              </p>
              {is_system_email(email.sender.email) && (
                <EmailTag
                  className="flex-shrink-0"
                  icon="info"
                  label={t("common.system")}
                  size="default"
                  variant="blue"
                />
              )}
            </div>
            <p className="text-sm text-txt-tertiary">{email.sender.email}</p>
            <p className="text-xs mt-2 text-txt-muted">{email.timestamp}</p>
          </div>
        </div>

        <Separator className="my-6" />

        <div>
          {show_banner && (
            <ExternalContentBanner
              blocked_content={sanitize_result.external_content}
              on_dismiss={handle_dismiss_banner}
              on_load={handle_load_remote}
            />
          )}
          <SandboxedEmailRenderer
            body_background={sanitize_result.body_background}
            email_id={email.id}
            is_literal_plain_text={is_literal_plain_text}
            is_plain_text={is_plain_text}
            load_remote_content={force_load_content}
            sanitized_html={effective_html}
          />
        </div>
      </div>
    </>
  );
}
