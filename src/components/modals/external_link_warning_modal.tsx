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

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DocumentDuplicateIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import { Checkbox, Island, IslandIconButton, Tooltip } from "@aster/ui";

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
  return_focus_to?: HTMLElement | null;
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

const TOGGLE_CLASS =
  "-ms-1.5 inline-flex min-h-6 items-center justify-self-start rounded-[var(--aster-radius-item)] px-1.5 text-[13px] font-medium leading-5 text-txt-secondary transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-color)]";

const OPTION_ROW_CLASS =
  "aster_island_row aster_island_row_pressable -mx-3 mt-2.5 w-[calc(100%+1.5rem)] min-h-11 select-none gap-3 rounded-[var(--aster-radius-item)] px-3 py-2.5 [--aster-island-hover:var(--aster-hover)] [--aster-island-press:var(--aster-selected)]";

const WARNING_TEXT_CLASS = "text-amber-700 dark:text-[var(--color-warning)]";

function UrlText({ destination }: { destination: LinkDestination }) {
  return (
    <>
      {destination.chunks.map((chunk, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          <span className={chunk.long ? "break-all" : "whitespace-nowrap"}>
            {chunk.pieces.map((piece, piece_index) =>
              piece.strong ? (
                <span
                  key={piece_index}
                  className="font-medium text-txt-primary"
                >
                  {piece.text}
                </span>
              ) : (
                piece.text
              ),
            )}
          </span>
        </Fragment>
      ))}
    </>
  );
}

function LeadingIcon({ kind }: { kind: LinkDestination["kind"] }) {
  const Icon =
    kind === "mailto"
      ? EnvelopeIcon
      : kind === "blocked"
        ? NoSymbolIcon
        : GlobeAltIcon;

  return <Icon className="h-4 w-4" data-testid="link_destination_glyph" />;
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
  return_focus_to = null,
}: ExternalLinkWarningModalProps) {
  const { t } = use_i18n();
  const [dont_show_again, set_dont_show_again] = useState(false);
  const [internal_open, set_internal_open] = useState(false);
  const [expanded, set_expanded] = useState(false);
  const [copied, set_copied] = useState(false);
  const [favicon_failed, set_favicon_failed] = useState(false);
  const closing_ref = useRef(false);
  const copied_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    show_toast(
      is_mail
        ? t("common.address_copied_to_clipboard")
        : t("common.link_copied"),
      "success",
    );
    set_copied(true);
    if (copied_timer_ref.current) clearTimeout(copied_timer_ref.current);
    copied_timer_ref.current = setTimeout(
      () => set_copied(false),
      COPIED_DURATION,
    );
  };

  const title = is_blocked
    ? t("common.link_dialog_blocked_title")
    : lockdown_active
      ? t("common.link_dialog_lockdown_title")
      : is_mail
        ? t("common.link_dialog_mail_title")
        : t("common.link_dialog_title");
  const body = is_blocked
    ? t("common.link_dialog_blocked_body")
    : lockdown_active
      ? t("common.link_dialog_lockdown_body")
      : is_mail
        ? t("common.link_dialog_mail_body")
        : t("common.link_dialog_body");
  const hero = is_mail
    ? destination.mail_address
    : is_blocked
      ? destination.scheme.replace(/:$/, "")
      : destination.site_display;
  const copy_label = is_mail
    ? t("common.copy_address")
    : t("common.link_dialog_copy");
  const described_by = [
    description_id,
    is_mail ? address_id : url_region_id,
    has_signal ? warnings_id : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <AlertDialog
      open={internal_open}
      onOpenChange={(open) => {
        if (!open) handle_cancel();
      }}
    >
      <AlertDialogContent
        aria-describedby={described_by}
        aria-modal="true"
        className="gap-0 p-0 overflow-hidden w-[calc(100%-2rem)] max-w-[420px] motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100"
        data-link-kind={destination.kind}
        on_overlay_click={handle_cancel}
        onCloseAutoFocus={(event) => {
          if (!return_focus_to?.isConnected) return;
          event.preventDefault();
          return_focus_to.focus({ preventScroll: true });
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel_button_ref.current?.focus({ preventScroll: true });
        }}
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-5">
            <AlertDialogHeader className="space-y-2 text-start">
              <AlertDialogTitle className="text-[16px] font-semibold">
                {title}
              </AlertDialogTitle>
              <p
                className="text-[14px] leading-5"
                id={description_id}
                style={{ color: "var(--text-tertiary)" }}
              >
                {body}
              </p>
            </AlertDialogHeader>

            <Island
              className={`mt-5 flex items-start gap-2 bg-[color-mix(in_srgb,var(--text-primary)_5%,transparent)] py-3.5 ps-4 ${is_blocked ? "pe-4" : "pe-2"}`}
              data-testid="link_destination_card"
            >
              <div className="grid min-w-0 flex-1 grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-1">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 items-center justify-center text-txt-muted"
                  data-testid="link_destination_icon"
                >
                  {show_favicon ? (
                    <img
                      alt=""
                      className="h-4 w-4 rounded-[3px]"
                      data-testid="link_destination_favicon"
                      decoding="async"
                      draggable={false}
                      referrerPolicy="no-referrer"
                      src={favicon_src}
                      onError={() => set_favicon_failed(true)}
                    />
                  ) : (
                    <LeadingIcon kind={destination.kind} />
                  )}
                </span>
                <p
                  className="min-w-0 text-start text-[16px] font-semibold leading-5 text-txt-primary [overflow-wrap:anywhere]"
                  data-testid="link_destination_site"
                  id={address_id}
                  translate="no"
                >
                  <span dir="ltr">{hero}</span>
                </p>

                {!is_mail && (
                  <div
                    className="col-start-2 min-w-0"
                    data-expanded={expanded ? "true" : "false"}
                    data-testid="link_destination_url"
                  >
                    <p
                      className={`select-text text-start text-[13px] leading-5 text-txt-muted ${expanded ? "" : "line-clamp-2"}`}
                      id={url_region_id}
                      translate="no"
                    >
                      <span className="sr-only">
                        {`${t("common.link_dialog_full_address")}: `}
                      </span>
                      <span data-testid="link_destination_address" dir="ltr">
                        <UrlText destination={destination} />
                      </span>
                    </p>
                  </div>
                )}

                {show_toggle && (
                  <button
                    aria-controls={url_region_id}
                    aria-expanded={expanded}
                    className={`col-start-2 mt-1 ${TOGGLE_CLASS}`}
                    type="button"
                    onClick={() => set_expanded((value) => !value)}
                  >
                    {expanded
                      ? t("common.show_less")
                      : t("common.link_dialog_show_full")}
                  </button>
                )}
              </div>

              {!is_blocked && (
                <Tooltip tip={copied ? t("common.copied") : copy_label}>
                  <IslandIconButton
                    className="-my-2"
                    data-copied={copied ? "true" : "false"}
                    label={copied ? t("common.copied") : copy_label}
                    onClick={handle_copy}
                  >
                    <DocumentDuplicateIcon
                      aria-hidden="true"
                      className="h-[18px] w-[18px]"
                    />
                  </IslandIconButton>
                </Tooltip>
              )}
            </Island>
            <p
              aria-atomic="true"
              aria-live="polite"
              className="sr-only"
              data-testid="link_copy_status"
              role="status"
            >
              {copied
                ? is_mail
                  ? t("common.address_copied_to_clipboard")
                  : t("common.link_copied")
                : ""}
            </p>

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
                      className={`flex items-start gap-2 text-[14px] leading-5 ${WARNING_TEXT_CLASS}`}
                      data-signal={signal}
                    >
                      <ExclamationTriangleIcon
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0"
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
                className={OPTION_ROW_CLASS}
                data-testid="link_dont_show_row"
                htmlFor="external-link-dont-show-checkbox"
              >
                <Checkbox
                  checked={dont_show_again}
                  id="external-link-dont-show-checkbox"
                  onCheckedChange={(checked) =>
                    set_dont_show_again(checked === true)
                  }
                />
                <span className="min-w-0 text-[14px] leading-5 text-txt-secondary">
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
