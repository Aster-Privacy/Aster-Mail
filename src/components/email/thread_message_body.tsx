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
import { useMemo } from "react";
import { Button } from "@aster/ui";

import { SandboxedEmailRenderer } from "@/components/email/sandboxed_email_renderer";
import {
  tokenize_html,
  TOKEN_COLORS,
} from "@/components/modals/view_source_modal";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

interface ThreadMessageBodyProps {
  clean_body: string;
  viewing_source: boolean;
  wrap_source: boolean;
  set_wrap_source: (value: boolean) => void;
  is_plain_text: boolean;
  load_remote_content: boolean;
  sanitized_html: string;
  force_dark_mode?: boolean;
  body_background?: string;
  email_id?: string;
}

export function ThreadMessageBody({
  clean_body,
  viewing_source,
  wrap_source,
  set_wrap_source,
  is_plain_text,
  load_remote_content,
  sanitized_html,
  force_dark_mode,
  body_background,
  email_id,
}: ThreadMessageBodyProps): React.ReactElement {
  const { t } = use_i18n();

  const source_lines = useMemo(() => clean_body.split("\n"), [clean_body]);
  const source_gutter_width = useMemo(
    () => source_lines.length.toString().length,
    [source_lines.length],
  );

  return (
    <div
      className={
        viewing_source
          ? "px-3 @md:px-4 pt-4 pb-2 bg-[var(--thread-content-bg)]"
          : "bg-[var(--thread-content-bg)]"
      }
    >
      {viewing_source ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-txt-muted">
              {t("mail.lines_count", { count: source_lines.length })}
            </span>
            <div className="flex-1" />
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
              size="md"
              onClick={() => set_wrap_source(!wrap_source)}
            >
              {wrap_source ? t("common.unwrap") : t("common.wrap")}
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white border-0"
              size="md"
              onClick={() => {
                navigator.clipboard
                  .writeText(clean_body)
                  .then(() => {
                    show_toast(
                      t("common.source_copied_to_clipboard"),
                      "success",
                    );
                  })
                  .catch(() => {});
              }}
            >
              {t("common.copy_source")}
            </Button>
          </div>
          <div className="rounded-lg overflow-auto max-h-[65vh] bg-surf-tertiary border border-edge-secondary">
            <table
              className="w-full border-collapse"
              style={{
                fontFamily:
                  "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
              }}
            >
              <tbody>
                {source_lines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.03]">
                    <td
                      className="text-right select-none px-3 text-[12px] leading-relaxed align-top text-txt-muted opacity-50 border-r border-edge-secondary"
                      style={{
                        width: `${source_gutter_width + 2}ch`,
                        minWidth: `${source_gutter_width + 2}ch`,
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      className="text-[13px] leading-relaxed pl-4 pr-4 text-txt-secondary"
                      style={{
                        whiteSpace: wrap_source ? "pre-wrap" : "pre",
                        wordBreak: wrap_source ? "break-all" : "normal",
                      }}
                    >
                      {tokenize_html(line).map((token, tidx) => (
                        <span
                          key={tidx}
                          style={{ color: TOKEN_COLORS[token.type] }}
                        >
                          {token.value}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <SandboxedEmailRenderer
          body_background={body_background}
          email_id={email_id}
          force_dark_mode={force_dark_mode}
          is_plain_text={is_plain_text}
          load_remote_content={load_remote_content}
          sanitized_html={sanitized_html}
        />
      )}
    </div>
  );
}
