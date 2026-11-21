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
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@aster/ui";

import { Alert, StepHeader } from "../forgot_password/shared";

import { use_i18n } from "@/lib/i18n/context";
import { useTheme } from "@/contexts/theme_context";
import { Spinner } from "@/components/ui/spinner";
import {
  confirm_public_cancel,
  format_date,
  preview_public_cancel,
  type PublicCancelPlanResponse,
} from "@/services/api/billing";

type ConfirmStage =
  | "loading"
  | "ready"
  | "confirming"
  | "confirmed"
  | "already"
  | "invalid";

const SmallLogo = () => (
  <img
    alt="Aster"
    className="h-7"
    decoding="async"
    draggable={false}
    src="/text_logo.png"
  />
);

function read_token_from_hash(): string | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("token");

  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;

  return token;
}

export default function PublicCancelConfirmPage() {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const is_dark = theme === "dark";

  const token_ref = useRef<string | null>(read_token_from_hash());
  const [stage, set_stage] = useState<ConfirmStage>(
    token_ref.current ? "loading" : "invalid",
  );
  const [plan, set_plan] = useState<PublicCancelPlanResponse | null>(null);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
    const token = token_ref.current;

    if (!token) return;
    let active = true;

    preview_public_cancel(token).then((response) => {
      if (!active) return;
      if (response.data) {
        set_plan(response.data);
        set_stage(response.data.is_cancelled ? "already" : "ready");

        return;
      }
      if (response.status === 429) {
        set_error(t("settings.public_cancel_rate_limited"));
        set_stage("ready");

        return;
      }
      set_stage("invalid");
    });

    return () => {
      active = false;
    };
  }, [t]);

  const handle_confirm = async () => {
    const token = token_ref.current;

    if (!token || stage === "confirming") return;
    set_error(null);
    set_stage("confirming");
    const response = await confirm_public_cancel(token);

    if (response.data) {
      set_plan(response.data);
      set_stage("confirmed");

      return;
    }
    if (response.status === 410) {
      set_stage("invalid");

      return;
    }
    set_error(
      response.status === 429
        ? t("settings.public_cancel_rate_limited")
        : t("settings.public_cancel_error"),
    );
    set_stage("ready");
  };

  const ends_line = (value: PublicCancelPlanResponse | null) => {
    if (!value) return "";
    if (value.ends_at) {
      return t("settings.public_cancel_ends_on", {
        plan: value.plan_name,
        date: format_date(value.ends_at),
      });
    }

    return t("settings.public_cancel_ends_period", { plan: value.plan_name });
  };

  const sign_in_button = (label: string) => (
    <Button
      className="w-full"
      size="lg"
      variant="secondary"
      onClick={() => navigate("/sign-in")}
    >
      {label}
    </Button>
  );

  const render_body = () => {
    if (stage === "loading") {
      return (
        <div className="flex w-full justify-center py-16">
          <Spinner size="lg" />
        </div>
      );
    }

    if (stage === "invalid") {
      return (
        <>
          <StepHeader
            description={t("settings.public_cancel_link_invalid_body")}
            logo={<SmallLogo />}
            title={t("settings.public_cancel_link_invalid_title")}
          />
          <div className="mt-6 w-full">
            <Button
              className="w-full"
              size="lg"
              variant="depth"
              onClick={() => navigate("/cancel")}
            >
              {t("settings.public_cancel_request_again")}
            </Button>
          </div>
        </>
      );
    }

    if (stage === "confirmed" || stage === "already") {
      return (
        <>
          <StepHeader
            description={ends_line(plan)}
            logo={<SmallLogo />}
            title={
              stage === "confirmed"
                ? t("settings.public_cancel_confirmed_title")
                : t("settings.public_cancel_already_title")
            }
          />
          <p className="mt-4 text-sm leading-relaxed text-txt-tertiary">
            {t("settings.public_cancel_confirmed_note")}
          </p>
          <div className="mt-6 w-full">
            {sign_in_button(t("settings.invite_not_found_cta_sign_in"))}
          </div>
        </>
      );
    }

    return (
      <>
        <StepHeader
          description={ends_line(plan)}
          logo={<SmallLogo />}
          title={t("settings.public_cancel_confirm_title")}
        />
        <p className="mt-4 text-sm leading-relaxed text-txt-secondary">
          {t("settings.public_cancel_confirm_note")}
        </p>
        <div className="mt-6 flex w-full flex-col gap-3">
          {error && <Alert is_dark={is_dark} message={error} />}
          <Button
            className="w-full"
            disabled={stage === "confirming"}
            size="lg"
            variant="destructive"
            onClick={handle_confirm}
          >
            {stage === "confirming" ? (
              <Spinner size="sm" />
            ) : (
              t("settings.public_cancel_confirm_button")
            )}
          </Button>
          {sign_in_button(t("settings.public_cancel_keep"))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-txt-tertiary">
          {t("settings.public_cancel_alternatives")}
        </p>
      </>
    );
  };

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <div className="flex w-full max-w-[400px] flex-col items-start px-4 text-start">
          {render_body()}
        </div>
      </div>
    </div>
  );
}
