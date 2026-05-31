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
import type { TranslationKey } from "@/lib/i18n/types";
import type { DecryptedSecureMessage } from "@/services/crypto/secure_message_crypto";
import type { SecureViewMetadata } from "@/services/api/secure_view";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { sanitize_html } from "@/lib/html_sanitizer";
import {
  derive_auth_proof,
  decrypt_secure_message,
} from "@/services/crypto/secure_message_crypto";
import {
  get_secure_view_metadata,
  verify_secure_view,
} from "@/services/api/secure_view";

type ViewState = "loading" | "not_found" | "expired" | "ready" | "unlocked";

export default function SecureViewPage() {
  const { t } = use_i18n();
  const sv = useCallback((key: string) => t(key as TranslationKey), [t]);

  const { token } = useParams<{ token: string }>();

  useEffect(() => {
    const meta = document.createElement("meta");

    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);

    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const [view_state, set_view_state] = useState<ViewState>("loading");
  const [metadata, set_metadata] = useState<SecureViewMetadata | null>(null);
  const [password, set_password] = useState("");
  const [is_unlocking, set_is_unlocking] = useState(false);
  const [error, set_error] = useState("");
  const [decrypted, set_decrypted] = useState<DecryptedSecureMessage | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      set_view_state("not_found");

      return;
    }

    const load = async () => {
      try {
        const data = await get_secure_view_metadata(token);

        if (cancelled) return;

        set_metadata(data);

        if (data.is_expired) {
          set_view_state("expired");

          return;
        }

        set_view_state("ready");
      } catch {
        if (cancelled) return;
        set_view_state("not_found");
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const sender_label = useMemo(() => {
    if (!metadata) return "";

    return metadata.sender_display_name || metadata.sender_email;
  }, [metadata]);

  const expires_label = useMemo(() => {
    if (!metadata) return "";

    const date = new Date(metadata.expires_at);

    if (Number.isNaN(date.getTime())) return metadata.expires_at;

    return date.toLocaleString();
  }, [metadata]);

  const sanitized_body = useMemo(() => {
    if (!decrypted) return "";

    return sanitize_html(decrypted.body, {
      sandbox_mode: false,
      external_content_mode: "never",
      content_blocking: {
        block_remote_images: true,
        block_remote_fonts: true,
        block_remote_css: true,
        block_tracking_pixels: true,
      },
    }).html;
  }, [decrypted]);

  const handle_unlock = async () => {
    if (!token || !metadata || !metadata.kdf_salt) {
      set_error(sv("secure_view.decrypt_failed"));

      return;
    }

    if (!password) return;

    set_error("");
    set_is_unlocking(true);

    try {
      const auth_proof = await derive_auth_proof(password, metadata.kdf_salt);
      const response = await verify_secure_view(token, auth_proof);

      if (!response.success || !response.content) {
        const code = response.error || "";

        if (code === "locked") {
          set_error(sv("secure_view.locked"));
        } else if (code === "expired") {
          set_view_state("expired");
        } else {
          set_error(sv("secure_view.wrong_password"));
        }

        return;
      }

      const content = response.content;

      if (!content.encrypted_subject || !content.encrypted_body) {
        set_error(sv("secure_view.decrypt_failed"));

        return;
      }

      try {
        const result = await decrypt_secure_message(
          password,
          content.kdf_salt ?? metadata.kdf_salt,
          {
            encrypted_subject: content.encrypted_subject,
            encrypted_body: content.encrypted_body,
            encrypted_attachments: content.encrypted_attachments ?? [],
          },
        );

        set_decrypted(result);
        set_view_state("unlocked");
      } catch {
        set_error(sv("secure_view.decrypt_failed"));
      }
    } catch {
      set_error(sv("secure_view.decrypt_failed"));
    } finally {
      set_is_unlocking(false);
    }
  };

  const handle_download = (
    filename: string,
    content_type: string,
    data: Uint8Array,
  ) => {
    const blob = new Blob([data], {
      type: content_type || "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const render_meta = () => {
    if (!metadata) return null;

    return (
      <div className="w-full space-y-1 text-sm text-txt-tertiary">
        <p>
          {sv("secure_view.from")} {sender_label}
        </p>
        <p>
          {sv("secure_view.expires")} {expires_label}
        </p>
      </div>
    );
  };

  const render_body = () => {
    switch (view_state) {
      case "loading":
        return (
          <div className="flex flex-col items-center gap-4">
            <Spinner className="h-10 w-10 text-blue-500" size="lg" />
            <p className="text-sm text-txt-tertiary">
              {sv("secure_view.loading")}
            </p>
          </div>
        );

      case "not_found":
        return (
          <p className="text-sm text-center text-txt-tertiary">
            {sv("secure_view.not_found")}
          </p>
        );

      case "expired":
        return (
          <div className="w-full space-y-6">
            {render_meta()}
            <p className="text-sm text-center text-txt-tertiary">
              {sv("secure_view.expired")}
            </p>
          </div>
        );

      case "ready":
        return (
          <div className="w-full space-y-6">
            {render_meta()}

            {metadata?.requires_password && (
              <div className="w-full space-y-3">
                <p className="text-sm text-txt-tertiary">
                  {sv("secure_view.password_prompt")}
                </p>
                <Input
                  aria-label={sv("secure_view.password_label")}
                  placeholder={sv("secure_view.password_label")}
                  type="password"
                  value={password}
                  onChange={(e) => set_password(e.target.value)}
                  onKeyDown={(e) => {
                    if (e["key"] === "Enter" && !is_unlocking) {
                      handle_unlock();
                    }
                  }}
                />

                {error && (
                  <p
                    className="text-sm text-danger"
                    style={{ color: "#dc2626" }}
                  >
                    {error}
                  </p>
                )}

                <Button
                  className="w-full"
                  disabled={is_unlocking || !password}
                  size="xl"
                  variant="depth"
                  onClick={handle_unlock}
                >
                  {is_unlocking
                    ? sv("secure_view.unlocking")
                    : sv("secure_view.view_button")}
                </Button>
              </div>
            )}
          </div>
        );

      case "unlocked":
        return (
          <div className="w-full space-y-6">
            {render_meta()}

            {decrypted && (
              <>
                <h1 className="text-xl font-semibold text-txt-primary">
                  {decrypted.subject}
                </h1>

                <div
                  className="prose max-w-none text-txt-primary"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: sanitized_body }}
                />

                {decrypted.attachments.length > 0 && (
                  <div className="w-full space-y-2">
                    <p className="text-sm font-medium text-txt-muted">
                      {sv("secure_view.attachments")}
                    </p>
                    {decrypted.attachments.map((attachment, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 bg-surf-tertiary border-edge-secondary"
                      >
                        <span className="text-sm truncate text-txt-primary">
                          {attachment.filename}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            handle_download(
                              attachment.filename,
                              attachment.content_type,
                              attachment.data,
                            )
                          }
                        >
                          {sv("secure_view.download")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <div className="flex flex-col items-center w-full max-w-md px-4 space-y-6 text-center">
          <h2 className="text-lg font-semibold text-txt-primary">
            {sv("secure_view.title")}
          </h2>

          {render_body()}

          <p className="text-xs text-txt-muted">
            {sv("secure_view.powered_by")}
          </p>
        </div>
      </div>
    </div>
  );
}
