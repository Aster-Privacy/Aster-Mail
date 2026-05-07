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

import { useMemo } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  sanitize_html,
  is_html_content,
  has_rich_html,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { get_image_proxy_url } from "@/lib/image_proxy";
import { SandboxedEmailRenderer } from "@/components/email/sandboxed_email_renderer";

interface SendingMessageBlockProps {
  message: DecryptedThreadMessage;
  current_user_name?: string;
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

export function SendingMessageBlock({
  message,
  current_user_name,
}: SendingMessageBlockProps): React.ReactElement {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const clean_body = useMemo(() => {
    if (message.html_content && is_html_content(message.html_content)) {
      return message.html_content;
    }
    return strip_quotes(message.body);
  }, [message.body, message.html_content]);
  const display_name =
    current_user_name || message.sender_name || t("common.me");

  return (
    <div
      className="relative overflow-hidden rounded-xl animate-pulse"
      style={{
        backgroundColor: "var(--thread-card-bg)",
        border: "1px solid var(--thread-card-border)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <ProfileAvatar
            email={message.sender_email}
            name={display_name}
            size="sm"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-txt-primary">
              {display_name}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.15)",
                color: "rgb(59, 130, 246)",
              }}
            >
              <PaperAirplaneIcon className="w-3 h-3 animate-pulse" />
              {t("common.sending")}
            </span>
          </div>
        </div>
        <span className="text-xs text-txt-muted">{t("common.just_now")}</span>
      </div>

      <div style={{ backgroundColor: "var(--thread-content-bg)" }}>
        <div className="opacity-70">
          <SandboxedEmailRenderer
            is_plain_text={!has_rich_html(message.html_content || message.body)}
            sanitized_html={
              is_html_content(clean_body)
                ? sanitize_html(clean_body, {
                    external_content_mode: preferences.load_remote_images,
                    image_proxy_url: get_image_proxy_url(),
                    sandbox_mode: true,
                  }).html
                : plain_text_to_html(clean_body)
            }
          />
        </div>
      </div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.03) 50%, transparent 100%)",
          animation: "sending-shimmer 2s infinite",
        }}
      />

      <style>{`
        @keyframes sending-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
