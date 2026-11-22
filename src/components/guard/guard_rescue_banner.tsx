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
import type { StepUpProof } from "@/services/api/guard";
import type { GuardDevice } from "@/services/guard/guard_device";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";

import { GuardSetupWizard } from "@/components/guard/guard_setup_wizard";
import { use_guard_device } from "@/components/guard/guard_switches_panel";
import { use_guard_step_up } from "@/components/guard/use_guard_step_up";
import { use_auth } from "@/contexts/auth_context";
import { GUARD_ACTION, id_subject } from "@/lib/crypto/guard_action";
import { use_i18n } from "@/lib/i18n/context";
import { SETTINGS_ANCHORS, open_settings_target } from "@/lib/settings_links";
import { take_setup_after_rescue } from "@/pages/guard/guard_rescue_form";
import { use_should_reduce_motion } from "@/provider";
import { guard_veto } from "@/services/api/guard";
import { on_guard_event } from "@/services/guard/guard_events";
import { sign_guard_action } from "@/services/guard/sign_action";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BannerPhase = "idle" | "running" | "stopped" | "error";

export async function veto_rescue(
  device: GuardDevice,
  user_id: string,
  rescue_id: string,
  proof: StepUpProof,
): Promise<boolean> {
  const action = await sign_guard_action(
    device,
    user_id,
    GUARD_ACTION.veto,
    id_subject(rescue_id),
    proof,
  );
  const response = await guard_veto({ id: rescue_id, action });

  return !response.error && response.data?.status === "vetoed";
}

export function GuardRescueBanner({ user_id }: { user_id: string | null }) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const step_up = use_guard_step_up();
  const [rescue_id, set_rescue_id] = useState<string | null>(null);
  const [phase, set_phase] = useState<BannerPhase>("idle");
  const { device } = use_guard_device(user_id, rescue_id !== null);

  useEffect(() => {
    set_rescue_id(null);
    set_phase("idle");
    if (!user_id) return;

    return on_guard_event((event) => {
      if (event.account_id !== user_id) return;
      if (event.event === "rescue_started" && UUID_PATTERN.test(event.id)) {
        set_rescue_id(event.id);
        set_phase("idle");
      } else if (event.event === "rescue_vetoed") {
        set_phase((current) => (current === "running" ? current : "stopped"));
      }
    });
  }, [user_id]);

  const is_visible = Boolean(user_id && rescue_id && device);

  const stop = async () => {
    if (phase === "running" || !user_id || !rescue_id || !device) return;
    set_phase("running");
    try {
      const proof = await step_up.request_proof();

      if (!proof) {
        set_phase("idle");

        return;
      }
      const ok = await veto_rescue(device, user_id, rescue_id, proof);

      set_phase(ok ? "stopped" : "error");
    } catch {
      set_phase("error");
    }
  };

  const message =
    phase === "stopped"
      ? t("guard.rescue_banner_stopped")
      : phase === "error"
        ? t("guard.rescue_banner_error")
        : t("guard.rescue_banner");

  return (
    <>
      <AnimatePresence>
        {is_visible && (
          <motion.div
            animate={{ opacity: 1, height: "auto" }}
            className="w-full flex-shrink-0 overflow-hidden text-white"
            data-testid="guard_rescue_banner"
            exit={{ opacity: 0, height: 0, overflow: "hidden" }}
            initial={reduce_motion ? false : { opacity: 0, height: 0 }}
            role="alert"
            style={{ backgroundColor: "var(--color-danger)" }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
          >
            <div className="flex items-center justify-center gap-3 px-4 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <ExclamationTriangleIcon
                  aria-hidden
                  className="h-4 w-4 flex-shrink-0"
                  data-testid="guard_rescue_banner_warning"
                />
                <span className="truncate text-xs font-medium">{message}</span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {phase === "stopped" ? (
                  <>
                    <GuardBannerPill
                      emphasis
                      label={t("guard.panic_change_password")}
                      test_id="guard_rescue_change_password"
                      on_click={() => {
                        set_rescue_id(null);
                        open_settings_target({
                          section: "security",
                          anchor: SETTINGS_ANCHORS.password,
                        });
                      }}
                    />
                    <GuardBannerPill
                      label={t("common.done")}
                      on_click={() => set_rescue_id(null)}
                    />
                  </>
                ) : (
                  <GuardBannerPill
                    emphasis
                    disabled={phase === "running"}
                    label={t("guard.rescue_banner_stop")}
                    test_id="guard_rescue_stop"
                    on_click={() => void stop()}
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {step_up.step_up_modal}
    </>
  );
}

export function GuardBannerPill({
  label,
  on_click,
  emphasis = false,
  disabled = false,
  test_id,
}: {
  label: string;
  on_click: () => void;
  emphasis?: boolean;
  disabled?: boolean;
  test_id?: string;
}) {
  const rest = emphasis
    ? "rgba(255, 255, 255, 0.2)"
    : "rgba(255, 255, 255, 0.1)";
  const hover = emphasis
    ? "rgba(255, 255, 255, 0.3)"
    : "rgba(255, 255, 255, 0.2)";

  return (
    <button
      className="rounded-[var(--aster-radius-control)] px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-60"
      data-testid={test_id}
      disabled={disabled}
      style={{ backgroundColor: rest, color: "inherit" }}
      type="button"
      onClick={on_click}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hover)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = rest)}
    >
      {label}
    </button>
  );
}

export function GuardRescueTopBanner() {
  const { user } = use_auth();

  return <GuardRescueBanner user_id={user?.id ?? null} />;
}

export function GuardSetupAfterRescue({ user_id }: { user_id: string | null }) {
  const [is_open, set_is_open] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (!user_id || checked.current) return;
    checked.current = true;
    if (take_setup_after_rescue(user_id)) set_is_open(true);
  }, [user_id]);

  if (!user_id) return null;

  return (
    <GuardSetupWizard
      is_open={is_open}
      user_id={user_id}
      on_changed={() => undefined}
      on_close={() => set_is_open(false)}
    />
  );
}
