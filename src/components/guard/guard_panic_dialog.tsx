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
import type { GuardPanicResult, StepUpProof } from "@/services/api/guard";
import type { GuardDevice } from "@/services/guard/guard_device";

import type { ComponentType } from "react";

import { useEffect, useState } from "react";
import {
  ArrowRightStartOnRectangleIcon,
  ComputerDesktopIcon,
  NoSymbolIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";

import { GuardIconTile } from "@/components/guard/guard_visuals";
import { use_guard_step_up } from "@/components/guard/use_guard_step_up";
import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { GUARD_ACTION, PANIC_SUBJECT } from "@/lib/crypto/guard_action";
import { use_i18n } from "@/lib/i18n/context";
import { SETTINGS_ANCHORS, open_settings_target } from "@/lib/settings_links";
import { guard_panic } from "@/services/api/guard";
import { STEP_UP_REQUIRED_CODE } from "@/services/api/step_up";
import { sign_guard_action } from "@/services/guard/sign_action";

function PanicRow({
  icon: Icon,
  text,
  count,
  done = false,
  test_id,
}: {
  icon: ComponentType<{ className?: string }>;
  text: string;
  count?: number;
  done?: boolean;
  test_id?: string;
}) {
  return (
    <li className="flex items-center gap-3" data-testid={test_id}>
      <GuardIconTile size="tinted" tone={done ? "success" : "danger"}>
        <Icon />
      </GuardIconTile>
      <span className="flex min-w-0 items-baseline gap-1.5 text-sm text-txt-primary">
        {count !== undefined && (
          <span className="text-lg font-semibold tabular-nums text-txt-primary">
            {count}
          </span>
        )}
        <span className={count !== undefined ? "text-txt-secondary" : undefined}>
          {text}
        </span>
      </span>
    </li>
  );
}

export const GUARD_PANIC_OPEN_EVENT = "aster:guard_panic_open";

export function open_guard_panic(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GUARD_PANIC_OPEN_EVENT));
}

type PanicPhase = "confirm" | "running" | "done" | "error";

async function run_panic(
  device: GuardDevice,
  user_id: string,
  request_proof: () => Promise<StepUpProof | null>,
): Promise<GuardPanicResult | "canceled" | null> {
  let proof: StepUpProof | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const action = await sign_guard_action(
      device,
      user_id,
      GUARD_ACTION.panic,
      PANIC_SUBJECT,
      proof,
    );
    const response = await guard_panic(action);

    if (response.data && !response.error) return response.data;
    if (response.server_code !== STEP_UP_REQUIRED_CODE || proof) return null;
    proof = await request_proof();
    if (!proof) return "canceled";
  }

  return null;
}

interface GuardPanicDialogProps {
  is_open: boolean;
  user_id: string;
  device: GuardDevice | null;
  on_close: () => void;
}

export function GuardPanicDialog({
  is_open,
  user_id,
  device,
  on_close,
}: GuardPanicDialogProps) {
  const { t } = use_i18n();
  const step_up = use_guard_step_up();
  const [phase, set_phase] = useState<PanicPhase>("confirm");
  const [result, set_result] = useState<GuardPanicResult | null>(null);

  useEffect(() => {
    if (!is_open) return;
    set_phase("confirm");
    set_result(null);
  }, [is_open]);

  const confirm = async () => {
    if (!device || phase === "running") return;
    set_phase("running");
    try {
      const outcome = await run_panic(device, user_id, step_up.request_proof);

      if (outcome === "canceled") {
        set_phase("confirm");
      } else if (outcome) {
        set_result(outcome);
        set_phase("done");
      } else {
        set_phase("error");
      }
    } catch {
      set_phase("error");
    }
  };

  const change_password = () => {
    on_close();
    open_settings_target({
      section: "security",
      anchor: SETTINGS_ANCHORS.password,
    });
  };

  return (
    <>
      <Modal
        close_on_escape={phase !== "running"}
        close_on_overlay={false}
        is_open={is_open}
        on_close={on_close}
        show_close_button={phase !== "running"}
        size="md"
      >
        <div data-testid="guard_panic_dialog">
          <ModalHeader>
            <div className="mb-3">
              <GuardIconTile size="lg" tone={phase === "done" ? "success" : "danger"}>
                {phase === "done" ? (
                  <ShieldCheckIcon className="h-7 w-7" />
                ) : (
                  <ShieldExclamationIcon className="h-7 w-7" />
                )}
              </GuardIconTile>
            </div>
            <ModalTitle>
              {phase === "done"
                ? t("guard.panic_done_title")
                : t("guard.panic_title")}
            </ModalTitle>
            <ModalDescription>
              {phase === "done"
                ? t("guard.panic_done_description")
                : t("guard.panic_description")}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            {phase !== "done" && (
              <ul
                className="mb-4 flex flex-col gap-3"
                data-testid="guard_panic_steps"
              >
                <PanicRow icon={ArrowRightStartOnRectangleIcon} text={t("guard.panic_will_sign_out")} />
                <PanicRow icon={ComputerDesktopIcon} text={t("guard.panic_will_remove_devices")} />
                <PanicRow icon={NoSymbolIcon} text={t("guard.panic_will_cancel_changes")} />
              </ul>
            )}
            {phase === "done" && result && (
              <ul
                className="mb-4 flex flex-col gap-3"
                data-testid="guard_panic_counts"
              >
                <PanicRow
                  done
                  icon={ArrowRightStartOnRectangleIcon}
                  test_id="guard_panic_sessions"
                  count={result.signed_out_sessions}
                  text={t("guard.panic_sessions_label", {
                    count: result.signed_out_sessions,
                  })}
                />
                <PanicRow
                  done
                  icon={ComputerDesktopIcon}
                  test_id="guard_panic_devices"
                  count={result.removed_devices}
                  text={t("guard.panic_devices_label", {
                    count: result.removed_devices,
                  })}
                />
                <PanicRow
                  done
                  icon={NoSymbolIcon}
                  test_id="guard_panic_changes"
                  count={result.cancelled_changes}
                  text={t("guard.panic_changes_label", {
                    count: result.cancelled_changes,
                  })}
                />
              </ul>
            )}
            {phase === "done" && result && !result.can_reset_password_now && (
              <p className="pb-2 text-sm text-txt-muted">
                {t("guard.panic_password_later")}
              </p>
            )}
            {phase === "error" && (
              <p
                className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {t("guard.panic_error")}
              </p>
            )}
            {!device && phase !== "done" && (
              <p className="pb-2 text-sm text-txt-muted">
                {t("guard.panic_needs_approver")}
              </p>
            )}
          </ModalBody>
          <ModalFooter>
            {phase === "done" ? (
              <>
                <Button variant="outline" onClick={on_close}>
                  {t("common.done")}
                </Button>
                {result?.can_reset_password_now && (
                  <Button
                    data-testid="guard_panic_change_password"
                    variant="depth"
                    onClick={change_password}
                  >
                    {t("guard.panic_change_password")}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  disabled={phase === "running"}
                  variant="outline"
                  onClick={on_close}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  data-testid="guard_panic_confirm"
                  disabled={!device}
                  is_loading={phase === "running"}
                  variant="depth_destructive"
                  onClick={() => void confirm()}
                >
                  {t("guard.panic_confirm")}
                </Button>
              </>
            )}
          </ModalFooter>
        </div>
      </Modal>
      {step_up.step_up_modal}
    </>
  );
}
