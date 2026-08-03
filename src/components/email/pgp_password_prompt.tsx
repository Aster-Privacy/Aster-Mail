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
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

import { use_i18n } from "@/lib/i18n";
import {
  decode_password_protected_body,
  decrypt_pgp_with_password,
} from "@/utils/email_crypto";

interface PgpPasswordPromptProps {
  block: string;
  className?: string;
  on_decrypted: (plaintext: string) => void;
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)\]]+/g;

function extract_links(html: string): string[] {
  const found = html.match(URL_PATTERN) ?? [];

  return Array.from(new Set(found)).slice(0, 5);
}

function to_visible_text(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function PgpPasswordPrompt({
  block,
  className,
  on_decrypted,
}: PgpPasswordPromptProps): React.ReactElement {
  const { t } = use_i18n();
  const [password, set_password] = useState("");
  const [busy, set_busy] = useState(false);
  const [failed, set_failed] = useState(false);

  const submit = async () => {
    if (!password || busy) return;

    set_busy(true);
    set_failed(false);

    try {
      const plaintext = await decrypt_pgp_with_password(block, password);

      set_password("");
      on_decrypted(plaintext);
    } catch {
      set_failed(true);
    } finally {
      set_busy(false);
    }
  };

  return (
    <div
      className={`p-4 rounded-lg border border-edge-secondary bg-surf-tertiary ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <LockClosedIcon className="w-5 h-5 mt-0.5 flex-shrink-0 text-brand" />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-txt-primary">
            {t("mail.pgp_password_protected_title")}
          </p>
          <p className="text-[13px] mt-0.5 text-txt-secondary">
            {t("mail.pgp_password_protected_description")}
          </p>
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              autoComplete="off"
              className="h-10 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none focus:border-blue-500 flex-1 min-w-0 sm:max-w-xs"
              disabled={busy}
              placeholder={t("mail.pgp_password_placeholder")}
              type="password"
              value={password}
              onChange={(e) => set_password(e.target.value)}
            />
            <button
              className="aster_btn aster_btn_primary aster_btn_md"
              disabled={busy || !password}
              type="submit"
            >
              {busy
                ? t("mail.pgp_password_decrypting")
                : t("mail.pgp_password_decrypt")}
            </button>
          </form>
          {failed && (
            <p className="mt-2 text-[13px] text-red-500">
              {t("mail.pgp_password_incorrect")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface PgpPasswordProtectedMessageProps {
  body: string;
  className?: string;
  on_decrypted: (plaintext: string) => void;
}

export function PgpPasswordProtectedMessage({
  body,
  className,
  on_decrypted,
}: PgpPasswordProtectedMessageProps): React.ReactElement {
  const payload = decode_password_protected_body(body);
  const visible_text = to_visible_text(payload.rest);
  const links = extract_links(payload.rest).filter(
    (link) => !visible_text.includes(link),
  );

  return (
    <div className={className}>
      <PgpPasswordPrompt block={payload.block} on_decrypted={on_decrypted} />
      {visible_text && (
        <p className="mt-3 text-sm whitespace-pre-wrap break-words text-txt-secondary">
          {visible_text}
        </p>
      )}
      {links.length > 0 && (
        <ul className="mt-2 space-y-1">
          {links.map((link) => (
            <li key={link}>
              <a
                className="text-sm text-brand break-all hover:underline"
                href={link}
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                {link}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
