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
import { useEffect, useId, useRef, useState } from "react";
import { LockClosedIcon } from "@heroicons/react/24/outline";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio_group";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  FOUND_US_MAX_DETAIL_CHARS,
  FOUND_US_OTHER,
  FOUND_US_SOURCES,
  clean_found_us_detail,
  count_chars,
  finish_found_us,
  limit_chars,
  type FoundUsSource,
} from "@/services/api/found_us";

interface FoundUsModalProps {
  is_open: boolean;
  on_close: () => void;
  on_finished: () => void;
}

type FormError = "pick" | "detail" | null;

function is_found_us_source(value: string): value is FoundUsSource {
  return (FOUND_US_SOURCES as readonly string[]).includes(value);
}

export function FoundUsModal({
  is_open,
  on_close,
  on_finished,
}: FoundUsModalProps) {
  const { t } = use_i18n();
  const [source, set_source] = useState<FoundUsSource | null>(null);
  const [detail, set_detail] = useState("");
  const [form_error, set_form_error] = useState<FormError>(null);
  const [error_nonce, set_error_nonce] = useState(0);
  const [is_sending, set_is_sending] = useState(false);
  const sending_ref = useRef(false);
  const detail_ref = useRef<HTMLInputElement | null>(null);
  const error_ref = useRef<HTMLParagraphElement | null>(null);
  const error_id = useId();
  const counter_id = useId();

  const is_other = source === FOUND_US_OTHER;
  const detail_length = count_chars(clean_found_us_detail(detail));

  useEffect(() => {
    if (is_other) detail_ref.current?.focus();
  }, [is_other]);

  useEffect(() => {
    if (error_nonce > 0) {
      error_ref.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [error_nonce]);

  const finish = async (with_answer: boolean) => {
    if (sending_ref.current) return;

    let answer: { source: FoundUsSource; detail?: string } | null = null;

    if (with_answer) {
      if (!source) {
        set_form_error("pick");
        set_error_nonce((n) => n + 1);

        return;
      }

      if (source === FOUND_US_OTHER) {
        const cleaned = clean_found_us_detail(detail);

        if (!cleaned) {
          set_form_error("detail");
          set_error_nonce((n) => n + 1);
          detail_ref.current?.focus();

          return;
        }

        answer = { source, detail: cleaned };
      } else {
        answer = { source };
      }
    }

    sending_ref.current = true;
    set_is_sending(true);

    const response = await finish_found_us(answer);

    sending_ref.current = false;
    set_is_sending(false);

    const no_longer_asked = response.status === 403;

    if (response.error && !no_longer_asked && with_answer) {
      show_toast(t("found_us.send_failed"), "error");

      return;
    }

    if (with_answer && !response.error) {
      show_toast(t("found_us.thanks"), "success", 6000);
    }

    on_finished();
  };

  const handle_source_change = (value: string) => {
    if (!is_found_us_source(value)) return;

    set_source(value);
    set_form_error(null);
  };

  const handle_detail_change = (value: string) => {
    set_detail(limit_chars(value, FOUND_US_MAX_DETAIL_CHARS));

    if (form_error === "detail") set_form_error(null);
  };

  const error_message =
    form_error === "pick"
      ? t("found_us.pick_one_error")
      : form_error === "detail"
        ? t("found_us.other_required_error")
        : null;

  return (
    <Modal
      close_on_overlay={false}
      is_open={is_open}
      on_close={is_sending ? () => undefined : on_close}
      size="lg"
    >
      <ModalHeader>
        <ModalTitle>{t("found_us.modal_title")}</ModalTitle>
        <ModalDescription>{t("found_us.modal_subtitle")}</ModalDescription>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <RadioGroup
          aria-describedby={form_error === "pick" ? error_id : undefined}
          aria-label={t("found_us.modal_title")}
          className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5"
          disabled={is_sending}
          value={source ?? ""}
          onValueChange={handle_source_change}
        >
          {FOUND_US_SOURCES.map((option) => (
            <label
              key={option}
              className="flex items-start gap-2.5 cursor-pointer"
            >
              <RadioGroupItem className="mt-0.5 flex-shrink-0" value={option} />
              <span
                className="text-sm leading-5"
                style={{ color: "var(--text-primary)" }}
              >
                {t(`found_us.source_${option}`)}
              </span>
            </label>
          ))}
        </RadioGroup>
        {is_other && (
          <div>
            <input
              ref={detail_ref}
              aria-describedby={
                form_error === "detail"
                  ? `${error_id} ${counter_id}`
                  : counter_id
              }
              aria-invalid={form_error === "detail"}
              aria-label={t("found_us.other_label")}
              autoComplete="off"
              className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent focus:outline-none"
              disabled={is_sending}
              placeholder={t("found_us.other_placeholder")}
              style={{
                borderColor:
                  form_error === "detail"
                    ? "rgb(239, 68, 68)"
                    : "var(--border-primary)",
                color: "var(--text-primary)",
              }}
              type="text"
              value={detail}
              onChange={(e) => handle_detail_change(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  finish(true);
                }
              }}
            />
            <p
              className="mt-1 text-xs text-end tabular-nums"
              id={counter_id}
              style={{ color: "var(--text-muted)" }}
            >
              {t("found_us.char_count", {
                used: detail_length,
                max: FOUND_US_MAX_DETAIL_CHARS,
              })}
            </p>
          </div>
        )}
        {error_message && (
          <p
            ref={error_ref}
            className="text-xs text-red-500"
            id={error_id}
            role="alert"
          >
            {error_message}
          </p>
        )}
        <p
          className="flex items-start gap-2 text-xs leading-5"
          style={{ color: "var(--text-secondary)" }}
        >
          <LockClosedIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{t("found_us.privacy_note")}</span>
        </p>
      </ModalBody>
      <ModalFooter>
        <button
          className="aster_btn aster_btn_outline aster_btn_lg"
          disabled={is_sending}
          type="button"
          onClick={() => finish(false)}
        >
          {t("found_us.skip")}
        </button>
        <button
          className="aster_btn aster_btn_primary aster_btn_lg"
          disabled={is_sending}
          type="button"
          onClick={() => finish(true)}
        >
          {t("found_us.send")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
