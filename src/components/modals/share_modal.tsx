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
import { useRef, useState } from "react";
import {
  LinkIcon,
  CheckIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { open_external } from "@/utils/open_link";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";

interface ShareModalProps {
  is_open: boolean;
  on_close: () => void;
}

export function ShareModal({ is_open, on_close }: ShareModalProps) {
  const { t } = use_i18n();
  const [email, set_email] = useState("");
  const [copy_success, set_copy_success] = useState(false);
  const copy_timeout_ref = useRef<NodeJS.Timeout | null>(null);

  const handle_close = () => {
    on_close();
    set_email("");
    if (copy_timeout_ref.current) {
      clearTimeout(copy_timeout_ref.current);
      copy_timeout_ref.current = null;
    }
    set_copy_success(false);
  };

  const handle_send = () => {
    if (email) {
      set_email("");
    }
  };

  const handle_copy_link = () => {
    if (copy_timeout_ref.current) {
      clearTimeout(copy_timeout_ref.current);
    }
    navigator.clipboard
      .writeText("https://astermail.org/invite")
      .catch(() => {});
    set_copy_success(true);
    copy_timeout_ref.current = setTimeout(() => {
      set_copy_success(false);
      copy_timeout_ref.current = null;
    }, 2000);
  };

  const handle_twitter_share = () => {
    const text = encodeURIComponent(t("common.check_out_aster_mail"));
    const url = encodeURIComponent("https://astermail.org/invite");

    open_external(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      "width=550,height=420",
    );
  };

  const handle_whatsapp_share = () => {
    const text = encodeURIComponent(
      `${t("common.check_out_aster_mail")} https://astermail.org/invite`,
    );

    open_external(`https://wa.me/?text=${text}`);
  };

  const social_buttons = [
    {
      id: "twitter",
      label: t("common.twitter"),
      color: "#1DA1F2",
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M22.46 6c-.85.38-1.78.64-2.75.76 1-.6 1.76-1.55 2.12-2.68-.93.55-1.96.96-3.06 1.18C17.93 4.37 16.76 3.8 15.46 3.8c-2.67 0-4.83 2.16-4.83 4.83 0 .38.04.75.13 1.1-4.02-.2-7.58-2.13-9.96-5.05-.42.72-.66 1.55-.66 2.44 0 1.68.85 3.16 2.15 4.03-.79-.03-1.54-.24-2.19-.6v.06c0 2.34 1.66 4.29 3.87 4.74-.4.11-.83.17-1.27.17-.31 0-.62-.03-.92-.08.62 1.94 2.42 3.35 4.55 3.39-1.67 1.31-3.77 2.09-6.05 2.09-.39 0-.78-.02-1.17-.07 2.18 1.4 4.77 2.21 7.55 2.21 9.06 0 14.01-7.5 14.01-14.01 0-.21 0-.42-.02-.63.96-.7 1.8-1.56 2.46-2.55z" />
        </svg>
      ),
      on_click: handle_twitter_share,
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      color: "#25D366",
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
      on_click: handle_whatsapp_share,
    },
  ];

  return (
    <Modal is_open={is_open} on_close={handle_close} size="md">
      <ModalHeader>
        <ModalTitle>{t("common.share_aster_mail_label")}</ModalTitle>
        <ModalDescription>
          {t("common.invite_encrypted_email")}
        </ModalDescription>
      </ModalHeader>

      <div className="px-6 pb-4 space-y-5">
        <div>
          <label
            className="block text-[12px] font-medium uppercase tracking-wider mb-2"
            htmlFor="share-invite-email"
            style={{ color: "var(--text-muted)" }}
          >
            {t("common.send_invite_via_email")}
          </label>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              id="share-invite-email"
              placeholder="friend@example.com"
              type="email"
              value={email}
              onChange={(e) => set_email(e.target.value)}
              onKeyDown={(e) => e["key"] === "Enter" && handle_send()}
            />
            <Button
              className="px-4 font-medium"
              disabled={!email}
              variant="depth"
              onClick={handle_send}
            >
              <PaperAirplaneIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div
          className="h-px w-full"
          style={{ backgroundColor: "var(--border-secondary)" }}
        />

        <div>
          <label
            className="block text-[12px] font-medium uppercase tracking-wider mb-3"
            htmlFor="share-copy-link"
            style={{ color: "var(--text-muted)" }}
          >
            {t("common.copy_invite_link")}
          </label>
          <button
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all duration-150 hover:border-blue-500/30"
            id="share-copy-link"
            style={{
              borderColor: "var(--border-secondary)",
              backgroundColor: "var(--bg-tertiary)",
            }}
            onClick={handle_copy_link}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: copy_success
                  ? "rgba(34, 197, 94, 0.15)"
                  : "rgba(59, 130, 246, 0.15)",
                color: copy_success
                  ? "var(--color-success)"
                  : "var(--color-info)",
              }}
            >
              {copy_success ? (
                <CheckIcon className="w-4 h-4" />
              ) : (
                <LinkIcon className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p
                className="text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {copy_success
                  ? t("common.link_copied")
                  : "astermail.org/invite"}
              </p>
            </div>
            <span
              className="text-[12px] font-medium px-2.5 py-1 rounded-md"
              style={{
                backgroundColor: copy_success
                  ? "rgba(34, 197, 94, 0.15)"
                  : "var(--bg-card)",
                color: copy_success
                  ? "var(--color-success)"
                  : "var(--text-muted)",
              }}
            >
              {copy_success ? t("common.copied") : t("common.copy")}
            </span>
          </button>
        </div>

        <div>
          <label
            className="block text-[12px] font-medium uppercase tracking-wider mb-3"
            htmlFor="share-social"
            style={{ color: "var(--text-muted)" }}
          >
            {t("common.share_on_social")}
          </label>
          <div className="flex gap-2">
            {social_buttons.map((btn) => (
              <button
                key={btn.id}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-150 hover:scale-[1.02]"
                style={{
                  borderColor: "var(--border-secondary)",
                  backgroundColor: "var(--bg-tertiary)",
                  color: btn.color,
                }}
                onClick={btn.on_click}
              >
                {btn.icon}
                <span className="text-[13px] font-medium">{btn.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <ModalFooter>
        <Button
          className="h-10 px-5 text-[14px] font-normal"
          variant="ghost"
          onClick={handle_close}
        >
          {t("common.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
