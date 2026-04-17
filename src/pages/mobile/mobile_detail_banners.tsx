//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { ExternalContentReport } from "@/lib/html_sanitizer";

import { useState } from "react";
import {
  EnvelopeIcon,
  ShieldExclamationIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import { is_system_email } from "@/lib/utils";
import {
  perform_unsubscribe,
  get_sender_domain,
} from "@/utils/unsubscribe_detector";
import { track_subscription } from "@/services/api/subscriptions";

export function MobileUnsubscribeBanner({
  email,
  t,
}: {
  email: {
    sender_email: string;
    sender: string;
    unsubscribe_info?: {
      has_unsubscribe: boolean;
      unsubscribe_link?: string;
      list_unsubscribe_header?: string;
      unsubscribe_mailto?: string;
      method: string;
    };
  };
  t: (key: never) => string;
}) {
  const [status, set_status] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [dismissed, set_dismissed] = useState(false);

  if (dismissed || !email.unsubscribe_info?.has_unsubscribe) return null;
  if (is_system_email(email.sender_email)) return null;

  const info = email.unsubscribe_info;
  const domain = get_sender_domain(email.sender_email);

  const handle_unsubscribe = async () => {
    set_status("loading");
    try {
      await track_subscription({
        sender_email: email.sender_email,
        sender_name: email.sender,
        unsubscribe_link: info.unsubscribe_link,
        list_unsubscribe_header: info.list_unsubscribe_header,
      });
      await perform_unsubscribe(
        email.sender_email,
        email.sender,
        info as never,
      );
      set_status("success");
    } catch {
      set_status("error");
    }
  };

  return (
    <div className="mx-4 mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2.5">
      <div className="flex items-center gap-3">
        {status === "success" ? (
          <CheckIcon className="h-5 w-5 shrink-0 text-brand" />
        ) : (
          <EnvelopeIcon className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[var(--text-primary)]">
            {status === "success"
              ? t("mail.successfully_unsubscribed" as never)
              : status === "error"
                ? t("mail.unsubscribe_failed" as never)
                : `${t("mail.stop_receiving_from" as never)} ${domain}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {status === "idle" && (
            <button
              className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white active:opacity-70"
              type="button"
              onClick={handle_unsubscribe}
            >
              {t("mail.unsubscribe" as never)}
            </button>
          )}
          {status === "loading" && (
            <span className="text-[12px] text-[var(--text-muted)]">...</span>
          )}
          <button
            className="rounded-md p-1 text-[var(--text-muted)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={() => set_dismissed(true)}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function MobileExternalContentBanner({
  report,
  on_load,
  t,
}: {
  report: ExternalContentReport;
  on_load: () => void;
  t: (key: never) => string;
}) {
  const [dismissed, set_dismissed] = useState(false);

  if (dismissed || report.blocked_count === 0) return null;

  const parts: string[] = [];

  if (report.has_remote_images) {
    const count = report.blocked_items.filter((i) => i.type === "image").length;

    if (count > 0) parts.push(`${count} image${count !== 1 ? "s" : ""}`);
  }
  if (report.has_tracking_pixels)
    parts.push(t("common.tracking_pixels" as never));
  if (report.has_remote_fonts) parts.push(t("common.fonts" as never));
  if (report.has_remote_css) parts.push(t("common.stylesheets" as never));
  const message =
    parts.length > 0 ? parts.join(", ") : `${report.blocked_count} items`;

  return (
    <div className="mx-4 mt-3 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2.5">
      <div className="flex items-center gap-3">
        <ShieldExclamationIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <p className="min-w-0 flex-1 text-[13px] text-[var(--text-primary)]">
          {t("mail.external_content_blocked" as never).replace(
            "{{message}}",
            message,
          )}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            className="rounded-md bg-[var(--accent-color,#4f6ef7)] px-2.5 py-1 text-[12px] font-medium text-white active:opacity-70"
            type="button"
            onClick={on_load}
          >
            {t("common.load_content" as never)}
          </button>
          <button
            className="rounded-md p-1 text-[var(--text-muted)] active:bg-[var(--bg-tertiary)]"
            type="button"
            onClick={() => set_dismissed(true)}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
