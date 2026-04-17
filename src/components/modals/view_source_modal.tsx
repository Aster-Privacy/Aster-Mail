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
import { useCallback, useMemo, useState } from "react";
import { Button } from "@aster/ui";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

interface ViewSourceModalProps {
  is_open: boolean;
  on_close: () => void;
  html_body: string;
  message_id: string;
}

interface Token {
  type:
    | "tag"
    | "attr-name"
    | "attr-value"
    | "comment"
    | "doctype"
    | "text"
    | "entity"
    | "punctuation";
  value: string;
}

export function tokenize_html(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      const close = end === -1 ? source.length : end + 3;

      tokens.push({ type: "comment", value: source.slice(i, close) });
      i = close;
    } else if (
      source.startsWith("<!", i) &&
      source
        .slice(i, i + 10)
        .toUpperCase()
        .startsWith("<!DOCTYPE")
    ) {
      const end = source.indexOf(">", i);
      const close = end === -1 ? source.length : end + 1;

      tokens.push({ type: "doctype", value: source.slice(i, close) });
      i = close;
    } else if (
      source[i] === "<" &&
      (source[i + 1] === "/" || /[a-zA-Z]/.test(source[i + 1] || ""))
    ) {
      const tag_end = source.indexOf(">", i);

      if (tag_end === -1) {
        tokens.push({ type: "text", value: source.slice(i) });
        break;
      }

      const full_tag = source.slice(i, tag_end + 1);
      const inner = full_tag.slice(1, -1);
      const self_closing = inner.endsWith("/");
      const content = self_closing ? inner.slice(0, -1) : inner;

      tokens.push({ type: "punctuation", value: "<" });

      const name_match = content.match(/^(\/?\s*[a-zA-Z][a-zA-Z0-9-]*)/);

      if (name_match) {
        tokens.push({ type: "tag", value: name_match[1] });
        let rest = content.slice(name_match[1].length);

        while (rest.length > 0) {
          const ws_match = rest.match(/^(\s+)/);

          if (ws_match) {
            tokens.push({ type: "text", value: ws_match[1] });
            rest = rest.slice(ws_match[1].length);
            continue;
          }

          const attr_match = rest.match(/^([a-zA-Z_:][a-zA-Z0-9_.:-]*)/);

          if (attr_match) {
            tokens.push({ type: "attr-name", value: attr_match[1] });
            rest = rest.slice(attr_match[1].length);

            const eq_match = rest.match(/^(\s*=\s*)/);

            if (eq_match) {
              tokens.push({ type: "punctuation", value: eq_match[1] });
              rest = rest.slice(eq_match[1].length);

              if (rest[0] === '"' || rest[0] === "'") {
                const quote = rest[0];
                const val_end = rest.indexOf(quote, 1);
                const close_idx = val_end === -1 ? rest.length : val_end + 1;

                tokens.push({
                  type: "attr-value",
                  value: rest.slice(0, close_idx),
                });
                rest = rest.slice(close_idx);
              } else {
                const val_match = rest.match(/^([^\s>]+)/);

                if (val_match) {
                  tokens.push({ type: "attr-value", value: val_match[1] });
                  rest = rest.slice(val_match[1].length);
                }
              }
            }
            continue;
          }

          tokens.push({ type: "text", value: rest[0] });
          rest = rest.slice(1);
        }
      } else {
        tokens.push({ type: "text", value: content });
      }

      if (self_closing) {
        tokens.push({ type: "punctuation", value: "/>" });
      } else {
        tokens.push({ type: "punctuation", value: ">" });
      }

      i = tag_end + 1;
    } else if (source[i] === "&") {
      const entity_match = source.slice(i).match(/^(&[a-zA-Z0-9#]+;)/);

      if (entity_match) {
        tokens.push({ type: "entity", value: entity_match[1] });
        i += entity_match[1].length;
      } else {
        tokens.push({ type: "text", value: "&" });
        i++;
      }
    } else {
      let end = i + 1;

      while (
        end < source.length &&
        source[end] !== "<" &&
        source[end] !== "&"
      ) {
        end++;
      }
      tokens.push({ type: "text", value: source.slice(i, end) });
      i = end;
    }
  }

  return tokens;
}

export const TOKEN_COLORS: Record<Token["type"], string> = {
  tag: "#f07178",
  "attr-name": "#ffcb6b",
  "attr-value": "#c3e88d",
  comment: "#546e7a",
  doctype: "#546e7a",
  text: "var(--text-secondary)",
  entity: "#89ddff",
  punctuation: "#89ddff",
};

export function HighlightedSource({ source }: { source: string }) {
  const tokens = useMemo(() => tokenize_html(source), [source]);

  return (
    <>
      {tokens.map((token, idx) => (
        <span key={idx} style={{ color: TOKEN_COLORS[token.type] }}>
          {token.value}
        </span>
      ))}
    </>
  );
}

function format_line_numbers(total: number): number {
  return total.toString().length;
}

export function ViewSourceModal({
  is_open,
  on_close,
  html_body,
  message_id,
}: ViewSourceModalProps) {
  const { t } = use_i18n();
  const [wrap_lines, set_wrap_lines] = useState(false);

  const handle_copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(html_body);
      show_toast(t("common.source_copied_to_clipboard"), "success");
    } catch {}
  }, [html_body, t]);

  const lines = useMemo(() => html_body.split("\n"), [html_body]);
  const gutter_width = useMemo(
    () => format_line_numbers(lines.length),
    [lines.length],
  );

  return (
    <Modal is_open={is_open} on_close={on_close} size="full">
      <ModalHeader>
        <ModalTitle>{t("common.message_source")}</ModalTitle>
      </ModalHeader>

      <ModalBody>
        <p
          className="text-[12px] mb-3 flex items-center gap-3"
          style={{ color: "var(--text-muted)" }}
        >
          <span>{message_id}</span>
          <span>{t("common.n_lines", { count: lines.length })}</span>
        </p>

        <div
          className="rounded-lg overflow-auto"
          style={{
            maxHeight: "65vh",
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--border-secondary)",
          }}
        >
          <table
            className="w-full border-collapse"
            style={{
              fontFamily:
                "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
            }}
          >
            <tbody>
              {lines.map((line, idx) => (
                <tr key={idx} className="hover:bg-white/[0.03]">
                  <td
                    className="text-right select-none px-3 text-[12px] leading-relaxed align-top"
                    style={{
                      color: "var(--text-muted)",
                      opacity: 0.5,
                      width: `${gutter_width + 2}ch`,
                      minWidth: `${gutter_width + 2}ch`,
                      userSelect: "none",
                      borderRight: "1px solid var(--border-secondary)",
                    }}
                  >
                    {idx + 1}
                  </td>
                  <td
                    className="text-[13px] leading-relaxed pl-4 pr-4"
                    style={{
                      color: "var(--text-secondary)",
                      whiteSpace: wrap_lines ? "pre-wrap" : "pre",
                      wordBreak: wrap_lines ? "break-all" : "normal",
                    }}
                  >
                    <HighlightedSource source={line} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="outline" onClick={on_close}>
          {t("common.close")}
        </Button>
        <Button variant="outline" onClick={() => set_wrap_lines(!wrap_lines)}>
          {wrap_lines ? t("common.unwrap") : t("common.wrap")}
        </Button>
        <Button onClick={handle_copy}>{t("common.copy_source")}</Button>
      </ModalFooter>
    </Modal>
  );
}
