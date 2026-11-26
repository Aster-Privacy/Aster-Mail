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
import type { InboxEmail } from "@/types/email";
import type { AttachmentPreviewEntry } from "@/hooks/use_attachment_previews";

import "@/styles/fonts.css";
import "@/styles/globals.css";

import { Profiler, useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { InboxEmailListItem } from "@/components/email/inbox_email_list_item/item";
import { PreferencesContext } from "@/contexts/preferences_context/helpers";
import { DEFAULT_PREFERENCES } from "@/services/api/preferences";
import { TitleTipLayer } from "@/components/ui/title_tip_layer";
import { sanitize_html } from "@/lib/html_sanitizer";

function newsletter_html(blocks: number): string {
  const block = (i: number) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#ffffff;margin:0 auto;max-width:600px"><tr><td style="padding:24px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#222222"><img src="https://img.example.org/hero_${i}.png" width="536" height="240" alt="Hero ${i}" style="display:block;border:0;width:100%;height:auto"><h2 style="margin:16px 0 8px;font-size:20px;color:#111111">Story ${i}: what changed this week</h2><p style="margin:0 0 12px">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. <a href="https://news.example.org/track?u=${i}&amp;c=abc" style="color:#1a73e8;text-decoration:underline">Read more</a></p><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:6px;background:#1a73e8"><a href="https://news.example.org/cta/${i}" style="display:inline-block;padding:10px 18px;color:#ffffff;font-weight:bold;text-decoration:none">Open</a></td></tr></table></td></tr></table>`;

  return `<html><head><style>@media (max-width:600px){.x{width:100%!important}} body{margin:0}</style></head><body style="margin:0;background:#f4f4f4">${Array.from({ length: blocks }, (_, i) => block(i)).join("")}<img src="https://track.example.org/open.gif" width="1" height="1"></body></html>`;
}

(window as unknown as { __sanitize_bench: () => unknown }).__sanitize_bench =
  () => {
    const out: Record<string, number[]> = {};

    for (const blocks of [10, 40, 120]) {
      const html = newsletter_html(blocks);
      const runs: number[] = [];

      for (let i = 0; i < 4; i += 1) {
        const t0 = performance.now();

        sanitize_html(html, {
          external_content_mode: "ask",
          sandbox_mode: true,
        } as never);
        runs.push(+(performance.now() - t0).toFixed(1));
      }
      out[`${blocks}_blocks_${Math.round(html.length / 1024)}kb`] = runs;
    }

    return out;
  };

declare global {
  interface Window {
    __perf: {
      commits: number;
      actual_ms: number;
      reset: () => void;
      by_phase: Record<string, number>;
    };
  }
}

const perf = {
  commits: 0,
  actual_ms: 0,
  by_phase: {} as Record<string, number>,
  reset() {
    perf.commits = 0;
    perf.actual_ms = 0;
    perf.by_phase = {};
  },
};

window.__perf = perf;

const ROWS = 60;
const SUBJECTS = [
  "Your sign-in code is 612716",
  "Quarterly report attached",
  "Re: lunch on Thursday",
  "Invoice 2026-11 for your workspace",
  "Weekly digest: 14 new posts",
  "Verification code 483920",
];

function make_email(i: number): InboxEmail {
  return {
    id: `email-${i}`,
    item_type: "received",
    sender_name: `Sender ${i}`,
    sender_email: `sender${i}@example.org`,
    subject: SUBJECTS[i % SUBJECTS.length],
    preview:
      i % 3 === 0
        ? `Use 612716 to finish signing in. This code expires in 10 minutes. ${i}`
        : `Here is the latest update on the project with a longer preview line ${i}`,
    timestamp: "10:4" + (i % 10),
    is_read: i % 4 !== 0,
    is_starred: i % 7 === 0,
    is_selected: false,
    has_attachment: i % 2 === 0,
    list_unsubscribe: i % 5 === 0 ? "<mailto:unsub@example.org>" : undefined,
    thread_message_count: i % 6 === 0 ? 3 : 1,
    folders: [],
    tags: [],
  } as unknown as InboxEmail;
}

const ATTACHMENTS: AttachmentPreviewEntry = {
  state: "loaded",
  attachments: [
    {
      id: "a1",
      filename: "image.png",
      content_type: "image/png",
      size_bytes: 20480,
      type_label: "PNG",
      type_color: "#3b82f6",
    },
    {
      id: "a2",
      filename: "report.pdf",
      content_type: "application/pdf",
      size_bytes: 102400,
      type_label: "PDF",
      type_color: "#e24942",
    },
  ] as AttachmentPreviewEntry["attachments"],
};

const noop_email = () => {};

function Harness() {
  const emails = useMemo(
    () => Array.from({ length: ROWS }, (_, i) => make_email(i)),
    [],
  );
  const [active_id, set_active_id] = useState<string | null>(null);
  const on_click = useCallback((id: string) => set_active_id(id), []);
  const on_toggle_select = useCallback(() => {}, []);
  const prefs_value = useMemo(
    () =>
      ({
        preferences: { ...DEFAULT_PREFERENCES },
        update_preference: () => {},
        update_preferences: () => {},
        reset_to_defaults: () => {},
        reset_section: () => {},
        save_now: async () => {},
        reload_preferences: async () => {},
        is_loading: false,
      }) as never,
    [],
  );

  return (
    <PreferencesContext.Provider value={prefs_value}>
      <Profiler
        id="list"
        onRender={(_id, phase, actual) => {
          perf.commits += 1;
          perf.actual_ms += actual;
          perf.by_phase[phase] = (perf.by_phase[phase] ?? 0) + 1;
        }}
      >
        <div
          className="bg-surf-primary"
          data-testid="list"
          style={{ height: "100vh", overflowY: "auto", width: 1100 }}
        >
          {emails.map((email) => (
            <div
              key={email.id}
              data-row-email-id={email.id}
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: `auto ${email.has_attachment ? 88 : 64}px`,
              }}
            >
              <InboxEmailListItem
                attachment_previews={
                  email.has_attachment ? ATTACHMENTS : undefined
                }
                current_view="inbox"
                density="comfortable"
                email={email}
                is_active={email.id === active_id}
                on_archive={noop_email}
                on_delete={noop_email}
                on_email_click={on_click}
                on_spam={noop_email}
                on_toggle_read={noop_email}
                on_toggle_select={on_toggle_select}
                on_toggle_star={noop_email}
                show_email_preview={true}
                show_profile_pictures={true}
              />
            </div>
          ))}
        </div>
      </Profiler>
      <TitleTipLayer />
    </PreferencesContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
