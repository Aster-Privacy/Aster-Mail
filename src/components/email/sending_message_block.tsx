import type { DecryptedThreadMessage } from "@/types/thread";

import { useMemo } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import {
  sanitize_html,
  is_html_content,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { use_preferences } from "@/contexts/preferences_context";

interface SendingMessageBlockProps {
  message: DecryptedThreadMessage;
  current_user_name?: string;
}

function strip_quotes(body: string): string {
  return (
    body
      .replace(/On .+wrote:[\s\S]*/gi, "")
      .replace(/^>.*$/gm, "")
      .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "")
      .trim() || body
  );
}

export function SendingMessageBlock({
  message,
  current_user_name,
}: SendingMessageBlockProps): React.ReactElement {
  const { preferences } = use_preferences();
  const clean_body = useMemo(() => strip_quotes(message.body), [message.body]);
  const display_name = current_user_name || message.sender_name || "Me";

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
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
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
              Sending
            </span>
          </div>
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Just now
        </span>
      </div>

      <div
        className="px-4 pt-2 pb-4"
        style={{ backgroundColor: "var(--thread-content-bg)" }}
      >
        <div
          dangerouslySetInnerHTML={{
            __html: is_html_content(clean_body)
              ? sanitize_html(clean_body, {
                  image_mode: preferences.load_remote_images,
                })
              : plain_text_to_html(clean_body),
          }}
          className="email-body-content prose prose-sm max-w-none [&>*:last-child]:!mb-0 [&>p]:my-2 opacity-70"
        />
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
