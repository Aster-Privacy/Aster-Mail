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
import type { TranslationKey } from "@/lib/i18n";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Checkbox } from "@aster/ui";

import { Button } from "@/components/ui/button";
import { use_i18n } from "@/lib/i18n/context";
import {
  describe_link,
  type LinkDestination,
  type LinkSignal,
} from "@/lib/link_destination";
import { copy_text } from "@/utils/copy_text";
import { use_favicon_src } from "@/hooks/use_favicon_src";
import { use_sender_logos_allowed } from "@/contexts/sender_logo_context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";

interface ExternalLinkWarningModalProps {
  is_open: boolean;
  url: string;
  link_text?: string | null;
  on_close: () => void;
  on_confirm: () => void;
  on_dismiss_permanently: () => void;
  lockdown_active?: boolean;
}

const ANIMATION_DURATION = 150;
const COPIED_DURATION = 1600;
export const LONG_ADDRESS_LENGTH = 96;

const SIGNAL_KEYS: Record<LinkSignal, TranslationKey> = {
  lookalike: "common.link_dialog_warning_lookalike",
  text_mismatch: "common.link_dialog_warning_mismatch",
  ip_address: "common.link_dialog_warning_ip",
  not_encrypted: "common.link_dialog_warning_http",
};

const TEXT_ACTION_CLASS =
  "rounded-[4px] text-[13px] font-medium leading-[18px] text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]";

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label";

function is_interactive_target(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
  );
}

const TOKEN_PATTERN = /\u0000(\d+)\u0000/;

function RichText({
  template,
  values,
}: {
  template: string;
  values: string[];
}) {
  const pieces = template.split(TOKEN_PATTERN);

  return (
    <>
      {pieces.map((piece, index) => {
        if (index % 2 === 0) return piece;
        const value = values[Number(piece)] ?? "";

        return (
          <strong
            key={`${index}-${value}`}
            className="font-semibold [overflow-wrap:anywhere]"
            dir="ltr"
            translate="no"
          >
            {value}
          </strong>
        );
      })}
    </>
  );
}

function signal_values(
  signal: LinkSignal,
  destination: LinkDestination,
): Record<string, string> {
  if (signal === "lookalike") return { host: destination.host_unicode };
  if (signal === "text_mismatch") {
    return { shown: destination.shown_site, site: destination.site_display };
  }

  return {};
}

export function ExternalLinkWarningModal({
  is_open,
  url,
  link_text,
  on_close,
  on_confirm,
  on_dismiss_permanently,
  lockdown_active = false,
}: ExternalLinkWarningModalProps) {
  const { t } = use_i18n();
  const [dont_show_again, set_dont_show_again] = useState(false);
  const [internal_open, set_internal_open] = useState(false);
  const [expanded, set_expanded] = useState(false);
  const [copied, set_copied] = useState(false);
  const [favicon_failed, set_favicon_failed] = useState(false);
  const closing_ref = useRef(false);
  const copied_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open_button_ref = useRef<HTMLButtonElement>(null);
  const cancel_button_ref = useRef<HTMLButtonElement>(null);
  const logos_allowed = use_sender_logos_allowed();
  const base_id = useId();
  const description_id = `${base_id}-description`;
  const warnings_id = `${base_id}-warnings`;
  const address_id = `${base_id}-address`;
  const url_region_id = `${base_id}-url`;

  const destination = useMemo(
    () => describe_link(url, link_text),
    [url, link_text],
  );
  const is_blocked = destination.kind === "blocked";
  const is_mail = destination.kind === "mailto";
  const has_signal = destination.signals.length > 0;
  const can_open = !lockdown_active && !is_blocked;
  const is_long = destination.href.length > LONG_ADDRESS_LENGTH;
  const show_toggle = is_long && !is_mail;
  const wants_favicon =
    logos_allowed &&
    destination.kind === "web" &&
    !destination.is_ip &&
    !has_signal &&
    destination.site.length > 0;
  const favicon_src = use_favicon_src(
    wants_favicon ? destination.site : "",
    wants_favicon,
  );
  const show_favicon =
    wants_favicon && !favicon_failed && !favicon_src.startsWith("data:");

  useEffect(() => {
    if (is_open) {
      closing_ref.current = false;
      set_internal_open(true);
    } else {
      closing_ref.current = false;
      set_internal_open(false);
      set_dont_show_again(false);
      set_expanded(false);
      set_copied(false);
    }
  }, [is_open]);

  useEffect(() => {
    set_favicon_failed(false);
  }, [favicon_src]);

  useEffect(
    () => () => {
      if (copied_timer_ref.current) clearTimeout(copied_timer_ref.current);
    },
    [],
  );

  const close_with_animation = (action: () => void) => {
    if (closing_ref.current) return;
    closing_ref.current = true;
    set_internal_open(false);
    setTimeout(action, ANIMATION_DURATION);
  };

  const handle_confirm = () => {
    if (!can_open) return;
    if (dont_show_again) {
      on_dismiss_permanently();
    }
    close_with_animation(on_confirm);
  };

  const handle_cancel = () => {
    close_with_animation(on_close);
  };

  const handle_copy = async () => {
    const value = is_mail ? destination.mail_address : destination.href;
    const ok = await copy_text(value);

    if (!ok) {
      show_toast(t("common.failed_to_copy"), "error");

      return;
    }
    set_copied(true);
    if (copied_timer_ref.current) clearTimeout(copied_timer_ref.current);
    copied_timer_ref.current = setTimeout(
      () => set_copied(false),
      COPIED_DURATION,
    );
  };

  const title = is_blocked
    ? t("common.link_dialog_blocked_title")
    : is_mail
      ? t("common.link_dialog_mail_title")
      : t("common.link_dialog_title");
  const body = is_blocked
    ? t("common.link_dialog_blocked_body")
    : is_mail
      ? t("common.link_dialog_mail_body")
      : t("common.link_dialog_body");
  const hero = is_mail
    ? destination.mail_address
    : is_blocked
      ? destination.scheme.replace(/:$/, "")
      : destination.site_display;
  const show_host =
    destination.kind === "web" &&
    destination.host_display !== destination.site_display;
  const described_by = has_signal
    ? `${description_id} ${warnings_id}`
    : description_id;

  return (
    <AlertDialog
      open={internal_open}
      onOpenChange={(open) => {
        if (!open) handle_cancel();
      }}
    >
      <AlertDialogContent
        aria-describedby={described_by}
        className="gap-0 p-0 overflow-hidden w-[calc(100%-2rem)] max-w-[420px] motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100"
        data-link-kind={destination.kind}
        on_overlay_click={handle_cancel}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            !is_interactive_target(event.target) &&
            can_open &&
            !has_signal
          ) {
            event.preventDefault();
            handle_confirm();
          }
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const target =
            can_open && !has_signal
              ? open_button_ref.current
              : cancel_button_ref.current;

          target?.focus({ preventScroll: true });
        }}
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-5">
            <AlertDialogHeader className="space-y-2 text-left">
              <AlertDialogTitle className="text-[16px] font-semibold">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription
                className="text-[14px] leading-normal"
                id={description_id}
              >
                {body}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div aria-labelledby={address_id} className="mt-5" role="group">
              <div className="flex items-start gap-2.5">
                {show_favicon && (
                  <img
                    alt=""
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-[3px]"
                    data-testid="link_destination_favicon"
                    decoding="async"
                    draggable={false}
                    referrerPolicy="no-referrer"
                    src={favicon_src}
                    onError={() => set_favicon_failed(true)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[15px] font-medium leading-5 text-txt-primary"
                    data-testid="link_destination_site"
                    dir="ltr"
                    id={address_id}
                    title={hero}
                    translate="no"
                  >
                    {hero}
                  </p>
                  {show_host && (
                    <p
                      className="truncate text-[13px] leading-[18px] text-txt-muted"
                      data-testid="link_destination_host"
                      dir="ltr"
                      title={destination.host_display}
                      translate="no"
                    >
                      {destination.host_display}
                    </p>
                  )}
                </div>
              </div>

              {!is_mail && (
                <>
                  <p className="sr-only">
                    {t("common.link_dialog_full_address")}
                  </p>
                  <div
                    className={`mt-2 ${expanded ? "max-h-[32vh] overflow-y-auto overscroll-contain pe-1" : ""}`}
                    data-expanded={expanded ? "true" : "false"}
                    data-testid="link_destination_url"
                    dir="ltr"
                    id={url_region_id}
                    translate="no"
                  >
                    <p
                      className={`select-text text-[13px] leading-[18px] text-txt-muted [overflow-wrap:anywhere] ${expanded ? "" : "line-clamp-2"}`}
                    >
                      {destination.parts.lead}
                      {destination.parts.host && (
                        <span className="text-txt-primary">
                          {destination.parts.host}
                        </span>
                      )}
                      {destination.parts.rest}
                    </p>
                  </div>
                </>
              )}

              {!is_blocked && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {show_toggle && (
                    <button
                      aria-controls={url_region_id}
                      aria-expanded={expanded}
                      className={TEXT_ACTION_CLASS}
                      type="button"
                      onClick={() => set_expanded((value) => !value)}
                    >
                      {expanded
                        ? t("common.show_less")
                        : t("common.link_dialog_show_full")}
                    </button>
                  )}
                  <button
                    className={TEXT_ACTION_CLASS}
                    data-copied={copied ? "true" : "false"}
                    type="button"
                    onClick={handle_copy}
                  >
                    <span aria-live="polite">
                      {copied
                        ? t("common.copied")
                        : is_mail
                          ? t("common.copy_address")
                          : t("common.link_dialog_copy")}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {has_signal && (
              <ul
                aria-label={t("common.link_dialog_warnings_label")}
                className="mt-4 flex flex-col gap-2"
                data-testid="link_warnings"
                id={warnings_id}
              >
                {destination.signals.map((signal) => {
                  const values = signal_values(signal, destination);
                  const names = Object.keys(values);
                  const tokens = Object.fromEntries(
                    names.map((name, index) => [name, `\u0000${index}\u0000`]),
                  );

                  return (
                    <li
                      key={signal}
                      className="flex items-start gap-2 text-[13px] leading-[18px] text-[var(--color-warning)]"
                      data-signal={signal}
                    >
                      <ExclamationTriangleIcon
                        aria-hidden="true"
                        className="mt-px h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0">
                        <RichText
                          template={t(SIGNAL_KEYS[signal], tokens)}
                          values={names.map((name) => values[name])}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {can_open && (
              <label
                className="inline-flex items-center gap-2 cursor-pointer select-none mt-5"
                htmlFor="external-link-dont-show-checkbox"
              >
                <Checkbox
                  checked={dont_show_again}
                  id="external-link-dont-show-checkbox"
                  onCheckedChange={(checked) =>
                    set_dont_show_again(checked === true)
                  }
                />
                <span
                  className="text-[13px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {t("common.dont_show_warning_again")}
                </span>
              </label>
            )}
          </div>

          <AlertDialogFooter className="flex-row flex-wrap gap-3 px-6 pb-6 pt-2 sm:justify-end max-sm:pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            <Button
              ref={cancel_button_ref}
              className="mt-0 whitespace-nowrap max-sm:flex-1"
              data-action="cancel"
              variant="outline"
              onClick={handle_cancel}
            >
              {can_open ? t("common.cancel") : t("common.close")}
            </Button>
            {can_open && (
              <Button
                ref={open_button_ref}
                className="whitespace-nowrap max-sm:flex-1"
                data-action="open"
                variant="primary"
                onClick={handle_confirm}
              >
                {t("common.open_link")}
              </Button>
            )}
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
