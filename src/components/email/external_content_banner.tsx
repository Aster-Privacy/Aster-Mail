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
import type { ExternalContentReport, BlockedItem } from "@/lib/html_sanitizer";
import type { TranslationKey } from "@/lib/i18n/types";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldExclamationIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { use_should_reduce_motion } from "@/provider";
import { use_external_link } from "@/contexts/external_link_context";
import { use_i18n } from "@/lib/i18n/context";

interface ExternalContentBannerProps {
  blocked_content: ExternalContentReport;
  on_load: () => void;
  on_dismiss: () => void;
}

type TFunc = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

const format_blocked_message = (
  report: ExternalContentReport,
  t: TFunc,
): string => {
  const parts: string[] = [];

  if (report.has_remote_images) {
    const image_count = report.blocked_items.filter(
      (i) => i.type === "image",
    ).length;

    if (image_count > 0) {
      parts.push(t("common.n_images", { count: image_count }));
    }
  }

  if (report.has_tracking_pixels) {
    parts.push(t("common.tracking_pixels"));
  }

  if (report.has_remote_fonts) {
    parts.push(t("common.fonts"));
  }

  if (report.has_remote_css) {
    parts.push(t("common.stylesheets"));
  }

  if (parts.length === 0) {
    return t("common.n_items", { count: report.blocked_count });
  }

  return parts.join(", ");
};

const get_type_label = (type: BlockedItem["type"], t: TFunc): string => {
  switch (type) {
    case "image":
      return t("common.image");
    case "font":
      return t("common.font");
    case "css":
      return t("common.stylesheet");
    case "tracking_pixel":
      return t("common.tracking_pixel");
  }
};

const truncate_url = (url: string, max_length: number = 60): string => {
  if (url.length <= max_length) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const path = parsed.pathname;
    const remaining = max_length - host.length - 3;

    if (remaining > 10) {
      return `${host}${path.length > remaining ? path.slice(0, remaining) + "..." : path}`;
    }

    return host + "/...";
  } catch (error) {
    if (import.meta.env.DEV) console.error(error);

    return url.slice(0, max_length) + "...";
  }
};

export function ExternalContentBanner({
  blocked_content,
  on_load,
  on_dismiss,
}: ExternalContentBannerProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { handle_external_link } = use_external_link();
  const [is_open, set_is_open] = useState(false);
  const [ctrl_held, set_ctrl_held] = useState(false);
  const popover_ref = useRef<HTMLDivElement>(null);
  const button_ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const on_key_down = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") set_ctrl_held(true);
    };
    const on_key_up = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") set_ctrl_held(false);
    };
    const on_blur = () => set_ctrl_held(false);

    window.addEventListener("keydown", on_key_down);
    window.addEventListener("keyup", on_key_up);
    window.addEventListener("blur", on_blur);

    return () => {
      window.removeEventListener("keydown", on_key_down);
      window.removeEventListener("keyup", on_key_up);
      window.removeEventListener("blur", on_blur);
    };
  }, []);

  useEffect(() => {
    if (!is_open) return;

    const handle_click_outside = (e: MouseEvent) => {
      if (
        popover_ref.current &&
        !popover_ref.current.contains(e.target as Node) &&
        button_ref.current &&
        !button_ref.current.contains(e.target as Node)
      ) {
        set_is_open(false);
      }
    };

    const handle_escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") set_is_open(false);
    };

    const handle_blur = () => {
      set_is_open(false);
    };

    document.addEventListener("mousedown", handle_click_outside);
    document.addEventListener("keydown", handle_escape);
    window.addEventListener("blur", handle_blur);

    return () => {
      document.removeEventListener("mousedown", handle_click_outside);
      document.removeEventListener("keydown", handle_escape);
      window.removeEventListener("blur", handle_blur);
    };
  }, [is_open]);

  if (blocked_content.blocked_count === 0) {
    return null;
  }

  const message = format_blocked_message(blocked_content, t);
  const has_details =
    blocked_content.blocked_items && blocked_content.blocked_items.length > 0;

  return (
    <div className="mb-4">
      <div className="rounded-lg bg-surf-tertiary text-txt-secondary border border-edge-primary">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0 flex items-center">
              <button
                ref={button_ref}
                className={`flex items-center rounded p-0.5 transition-colors ${is_open ? "text-brand" : "text-txt-tertiary"}`}
                title={
                  has_details
                    ? t("common.view_blocked_content_details")
                    : undefined
                }
                type="button"
                onClick={has_details ? () => set_is_open(!is_open) : undefined}
              >
                <ShieldExclamationIcon className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {is_open && has_details && (
                  <motion.div
                    ref={popover_ref}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute left-0 top-full mt-2 z-50 rounded-lg shadow-lg bg-surf-card border border-edge-primary"
                    exit={{ opacity: 0, y: -4 }}
                    initial={reduce_motion ? false : { opacity: 0, y: -4 }}
                    style={{
                      minWidth: "280px",
                      maxWidth: "400px",
                    }}
                    transition={{
                      duration: reduce_motion ? 0 : 0.12,
                    }}
                  >
                    <div className="px-3 py-2.5">
                      <div className="text-xs font-medium mb-2 text-txt-tertiary">
                        {t("common.blocked_content_count", {
                          count: blocked_content.blocked_count,
                        })}
                      </div>
                      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[200px]">
                        {blocked_content.blocked_items.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-surf-tertiary text-txt-tertiary text-[10px] uppercase tracking-wide">
                              {get_type_label(item.type, t)}
                            </span>
                            <span
                              className={`truncate font-mono text-txt-muted ${ctrl_held ? "hover:underline cursor-pointer" : ""}`}
                              role="link"
                              tabIndex={0}
                              title={`${item.url}\n${t("common.ctrl_click_to_open")}`}
                              onClick={(e) => {
                                if (e.ctrlKey || e.metaKey) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handle_external_link(item.url);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  (e.ctrlKey || e.metaKey)
                                ) {
                                  e.preventDefault();
                                  handle_external_link(item.url);
                                }
                              }}
                            >
                              {truncate_url(item.url)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <span className="text-sm">
              {t("mail.external_content_blocked", { message })}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className="rounded-md px-3 py-1 text-sm font-medium transition-colors bg-brand text-white"
              type="button"
              onClick={on_load}
            >
              {t("common.load_content")}
            </button>
            <button
              className="p-1 rounded-md transition-colors text-txt-muted"
              title={t("common.dismiss")}
              type="button"
              onClick={on_dismiss}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
