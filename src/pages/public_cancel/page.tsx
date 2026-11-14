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
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@aster/ui";

import { Alert, StepHeader, TextLink } from "../forgot_password/shared";

import { use_i18n } from "@/lib/i18n/context";
import { useTheme } from "@/contexts/theme_context";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio_group";
import { Spinner } from "@/components/ui/spinner";
import {
  CANCEL_REASONS,
  type CancelReason,
} from "@/components/settings/billing/cancel_reason_step";
import { request_public_cancel } from "@/services/api/billing";

const MAX_ADDRESS_LENGTH = 320;

const SmallLogo = () => (
  <img
    alt="Aster"
    className="h-7"
    decoding="async"
    draggable={false}
    src="/text_logo.png"
  />
);

function looks_like_address(value: string): boolean {
  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_ADDRESS_LENGTH) return false;
  if (/\s/.test(trimmed)) return false;
  if (!trimmed.includes("@")) return true;
  const [local, domain] = [
    trimmed.slice(0, trimmed.lastIndexOf("@")),
    trimmed.slice(trimmed.lastIndexOf("@") + 1),
  ];

  return local.length > 0 && domain.includes(".");
}

export default function PublicCancelPage() {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const is_dark = theme === "dark";

  const [address, set_address] = useState("");
  const [reason, set_reason] = useState<CancelReason | null>(null);
  const [error, set_error] = useState<string | null>(null);
  const [submitting, set_submitting] = useState(false);
  const [done, set_done] = useState(false);

  const handle_submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!looks_like_address(address)) {
      set_error(t("settings.public_cancel_invalid"));

      return;
    }
    set_error(null);
    set_submitting(true);
    const response = await request_public_cancel(address.trim(), reason);

    set_submitting(false);
    if (response.data?.received) {
      set_done(true);

      return;
    }
    set_error(
      response.status === 429
        ? t("settings.public_cancel_rate_limited")
        : t("settings.public_cancel_error"),
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <div className="flex w-full max-w-[400px] flex-col items-start px-4 text-start">
          {done ? (
            <>
              <StepHeader
                description={t("settings.public_cancel_done_body")}
                logo={<SmallLogo />}
                title={t("settings.public_cancel_done_title")}
              />
              <p className="mt-4 text-sm leading-relaxed text-txt-tertiary">
                {t("settings.public_cancel_store_note")}
              </p>
              <div className="mt-6 w-full">
                <Button
                  className="w-full"
                  size="lg"
                  variant="secondary"
                  onClick={() => navigate("/sign-in")}
                >
                  {t("settings.public_cancel_sign_in")}
                </Button>
              </div>
            </>
          ) : (
            <form className="w-full" noValidate onSubmit={handle_submit}>
              <StepHeader
                description={t("settings.public_cancel_description")}
                logo={<SmallLogo />}
                title={t("settings.public_cancel_title")}
              />
              <div className="mt-6 w-full">
                {error && <Alert is_dark={is_dark} message={error} />}
                <label
                  className="mb-1.5 block text-sm font-medium text-txt-secondary"
                  htmlFor="public_cancel_address"
                >
                  {t("settings.public_cancel_address_label")}
                </label>
                <Input
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect="off"
                  className="notranslate"
                  id="public_cancel_address"
                  maxLength={MAX_ADDRESS_LENGTH}
                  status={error ? "error" : "default"}
                  type="text"
                  value={address}
                  onChange={(e) => set_address(e.target.value)}
                />
              </div>
              <fieldset className="mt-6 w-full">
                <legend className="mb-2 text-sm font-medium text-txt-secondary">
                  {t("settings.public_cancel_reason_label")}
                </legend>
                <RadioGroup
                  className="flex-col gap-0.5"
                  value={reason ?? ""}
                  onValueChange={(value) => set_reason(value as CancelReason)}
                >
                  {CANCEL_REASONS.map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-3 py-1.5 text-sm text-txt-primary cursor-pointer"
                      htmlFor={`public_cancel_reason_${option}`}
                    >
                      <RadioGroupItem
                        id={`public_cancel_reason_${option}`}
                        value={option}
                      />
                      <span>{t(`settings.cancel_reason_${option}`)}</span>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
              <div className="mt-6 w-full">
                <Button
                  className="w-full"
                  disabled={submitting}
                  size="lg"
                  type="submit"
                  variant="destructive"
                >
                  {submitting ? <Spinner size="sm" /> : t("settings.public_cancel_submit")}
                </Button>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-txt-tertiary">
                {t("settings.public_cancel_store_note")}
              </p>
              <div className="mt-4 flex w-full justify-center">
                <TextLink
                  label={t("settings.public_cancel_sign_in")}
                  on_click={() => navigate("/sign-in")}
                />
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
