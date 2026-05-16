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
import { AnimatePresence, motion } from "framer-motion";
import {
  XMarkIcon,
  EnvelopeIcon,
  ClipboardDocumentIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useCallback } from "react";
import { Button } from "@aster/ui";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { AvatarRing } from "@/components/ui/avatar_ring";
import { BadgeChip } from "@/components/ui/badge_chip";
import { use_i18n } from "@/lib/i18n/context";
import { get_email_username, get_email_domain } from "@/lib/utils";
import { ProfileNotesBox } from "@/components/profile/profile_notes_box";
import { show_toast } from "@/components/toast/simple_toast";
import { use_should_reduce_motion } from "@/provider";
import { use_peer_profile } from "@/hooks/use_peer_profile";

interface ProfilePopupProps {
  is_open: boolean;
  on_close: () => void;
  email: string;
  name?: string;
  on_compose?: (email: string) => void;
  on_copy?: (text: string, label: string) => void;
}

export function ProfilePopup({
  is_open,
  on_close,
  email,
  name,
  on_compose,
  on_copy,
}: ProfilePopupProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  const handle_copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(email);
      on_copy?.(email, t("common.email"));
      show_toast(t("common.email_copied"), "success");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      const textarea = document.createElement("textarea");

      textarea.value = email;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      on_copy?.(email, t("common.email"));
      show_toast(t("common.email_copied"), "success");
    }
  }, [email, on_copy, t]);

  const handle_compose = useCallback(() => {
    on_compose?.(email);
    on_close();
  }, [email, on_compose, on_close]);

  useEffect(() => {
    if (!is_open) return;

    const handle_keydown = (e: KeyboardEvent) => {
      if (e["key"] === "Escape") {
        on_close();
      }
    };

    window.addEventListener("keydown", handle_keydown);

    return () => window.removeEventListener("keydown", handle_keydown);
  }, [is_open, on_close]);

  const peer_profile = use_peer_profile(is_open ? email : null);
  const peer_display_name = peer_profile?.display_name;
  const display_name = peer_display_name || name || get_email_username(email);
  const domain = get_email_domain(email);
  const active_badge = peer_profile?.active_badge ?? null;
  const show_ring = (peer_profile?.show_badge_ring ?? false) && !!active_badge;
  const show_profile_badge =
    (peer_profile?.show_badge_profile ?? false) && !!active_badge;

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
          onClick={on_close}
        >
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={reduce_motion ? false : { opacity: 0 }}
          />

          <motion.div
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-full max-w-[360px] rounded-xl border overflow-hidden bg-modal-bg border-edge-primary shadow-[0_25px_50px_-12px_rgba(0,0,0,0.35)]"
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            initial={reduce_motion ? false : { scale: 0.96, opacity: 0, y: 8 }}
            transition={{
              duration: reduce_motion ? 0 : 0.15,
              ease: [0.19, 1, 0.22, 1],
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-edge-secondary">
              <span className="text-[13px] font-medium text-txt-primary">
                {t("common.profile")}
              </span>
              <button
                className="p-1.5 rounded-[14px] transition-colors hover:bg-surf-hover"
                onClick={on_close}
              >
                <XMarkIcon className="w-4 h-4 text-txt-muted" />
              </button>
            </div>

            <div className="p-5">
              <div className="flex flex-col items-center text-center mb-5">
                <AvatarRing
                  badge_slug={active_badge?.slug}
                  className="mb-3"
                  enabled={show_ring}
                  thickness={3}
                >
                  <ProfileAvatar
                    use_domain_logo
                    className="ring-2 ring-white dark:ring-zinc-800 shadow-md"
                    email={email}
                    image_url={peer_profile?.profile_picture ?? undefined}
                    name={display_name}
                    size="xl"
                  />
                </AvatarRing>
                <h3 className="text-[16px] font-semibold text-txt-primary">
                  {display_name}
                </h3>
                {domain && (
                  <p className="text-[12px] mt-0.5 text-txt-muted">{domain}</p>
                )}
                {show_profile_badge && active_badge && (
                  <div className="mt-2">
                    <BadgeChip badge={active_badge} size="md" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl mb-4 bg-surf-secondary">
                <EnvelopeIcon className="w-5 h-5 flex-shrink-0 text-txt-muted" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
                    {t("common.email")}
                  </p>
                  <p className="text-[13px] truncate text-txt-primary">
                    {email}
                  </p>
                </div>
                <button
                  className="p-2 rounded-[14px] transition-colors hover:bg-surf-hover"
                  onClick={handle_copy}
                >
                  <ClipboardDocumentIcon className="w-4 h-4 text-txt-muted" />
                </button>
              </div>

              <ProfileNotesBox email={email} />

              {on_compose && (
                <div className="mt-4 pt-4 border-t border-edge-secondary">
                  <Button
                    className="w-full"
                    variant="depth"
                    onClick={handle_compose}
                  >
                    <PaperAirplaneIcon className="w-4 h-4" />
                    {t("mail.send_email")}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
