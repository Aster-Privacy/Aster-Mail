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

import { Button } from "@/components/ui/button";
import { use_i18n } from "@/lib/i18n/context";
import { guard_veto } from "@/services/api/guard";

export const GUARD_VETO_INVALID = "GUARD_VETO_INVALID";

type VetoPhase = "confirm" | "working" | "done" | "invalid" | "error";

export function take_veto_params(): { id: string; t: string } | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const id = url.searchParams.get("id");
  const t = url.searchParams.get("t");

  url.searchParams.delete("id");
  url.searchParams.delete("t");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  if (!id || !t) return null;

  return { id, t };
}

function use_no_referrer() {
  useEffect(() => {
    const meta = document.createElement("meta");

    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);

    return () => meta.remove();
  }, []);
}

export default function GuardVetoPage() {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const [phase, set_phase] = useState<VetoPhase>("confirm");
  const params_ref = useRef<{ id: string; t: string } | null>(null);
  const started = useRef(false);

  use_no_referrer();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    params_ref.current = take_veto_params();
    if (!params_ref.current) set_phase("invalid");
  }, []);

  const submit = () => {
    const params = params_ref.current;

    if (!params) {
      set_phase("invalid");

      return;
    }
    set_phase("working");
    void guard_veto(params)
      .then((response) => {
        if (!response.error && response.data) {
          set_phase("done");
        } else if (
          response.server_code === GUARD_VETO_INVALID ||
          response.status === 404 ||
          response.status === 410
        ) {
          set_phase("invalid");
        } else {
          set_phase("error");
        }
      })
      .catch(() => set_phase("error"));
  };

  const title =
    phase === "done" ? t("guard.veto_done_title") : t("guard.veto_title");
  let message: string;

  if (phase === "confirm") {
    message = t("guard.veto_prompt");
  } else if (phase === "working") {
    message = t("guard.veto_working");
  } else if (phase === "done") {
    message = t("guard.veto_done_body");
  } else if (phase === "invalid") {
    message = t("guard.veto_invalid");
  } else {
    message = t("guard.veto_error");
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-surf-primary px-4"
      data-testid="guard_veto_page"
    >
      <div className="w-full max-w-sm space-y-5 text-center">
        <div className="flex justify-center">
          <img
            alt="Aster"
            className="h-10"
            decoding="async"
            draggable={false}
            src="/text_logo.png"
          />
        </div>
        <h1 className="text-xl font-semibold text-txt-primary">{title}</h1>
        <p
          className={
            phase === "invalid" || phase === "error"
              ? "text-sm text-red-500"
              : "text-sm text-txt-muted"
          }
          data-testid={`guard_veto_${phase}`}
          role={
            phase === "working" || phase === "confirm" ? "status" : "alert"
          }
        >
          {message}
        </p>
        {(phase === "confirm" || phase === "error") && (
          <Button
            className="w-full"
            data-testid="guard_veto_stop_button"
            variant="destructive"
            onClick={submit}
          >
            {t("guard.veto_confirm")}
          </Button>
        )}
        {phase !== "working" && phase !== "confirm" && (
          <Button
            className="w-full"
            variant="depth"
            onClick={() => navigate("/sign-in")}
          >
            {t("guard.veto_sign_in")}
          </Button>
        )}
      </div>
    </div>
  );
}
