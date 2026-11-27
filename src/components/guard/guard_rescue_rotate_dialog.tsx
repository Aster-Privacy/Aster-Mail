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
import type { GuardDevice } from "@/services/guard/guard_device";

import { useEffect, useState } from "react";

import {
  GuardRescueCodeBlock,
  rescue_code_confirmed,
} from "@/components/guard/guard_rescue_code_block";
import { format_guard_time } from "@/components/guard/guard_waiting_screen";
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
import { GUARD_ACTION, rescue_rotate_subject } from "@/lib/crypto/guard_action";
import {
  generate_rescue_code,
  normalize_rescue_code,
} from "@/lib/crypto/guard_rescue_code";
import { use_i18n } from "@/lib/i18n/context";
import { rotate_guard_rescue_code } from "@/services/api/guard";
import {
  guard_error_text,
  type GuardErrorSource,
} from "@/components/guard/guard_error_text";
import { sign_guard_action } from "@/services/guard/sign_action";

type RotateResult =
  | { kind: "applied" }
  | { kind: "held"; apply_after: string }
  | { kind: "error"; source?: GuardErrorSource }
  | null;

interface GuardRescueRotateDialogProps {
  is_open: boolean;
  user_id: string;
  device: GuardDevice;
  on_close: () => void;
  on_changed: () => void;
}

export function GuardRescueRotateDialog({
  is_open,
  user_id,
  device,
  on_close,
  on_changed,
}: GuardRescueRotateDialogProps) {
  const { t } = use_i18n();
  const step_up = use_guard_step_up();
  const [rescue_code, set_rescue_code] = useState("");
  const [saved, set_saved] = useState(false);
  const [typed_group, set_typed_group] = useState("");
  const [busy, set_busy] = useState(false);
  const [result, set_result] = useState<RotateResult>(null);

  useEffect(() => {
    if (!is_open) return;
    set_rescue_code(generate_rescue_code());
    set_saved(false);
    set_typed_group("");
    set_result(null);

    return () => {
      set_rescue_code("");
      set_typed_group("");
    };
  }, [is_open]);

  const finished = result?.kind === "applied" || result?.kind === "held";
  const can_confirm =
    !busy &&
    !finished &&
    rescue_code_confirmed(rescue_code, saved, typed_group);

  const confirm = async () => {
    const normalized = normalize_rescue_code(rescue_code);

    if (!can_confirm || !normalized) return;
    set_busy(true);
    set_result(null);
    try {
      const response = await step_up.run(async (proof) =>
        rotate_guard_rescue_code({
          rescue_code: normalized,
          action: await sign_guard_action(
            device,
            user_id,
            GUARD_ACTION.rotate_rescue,
            rescue_rotate_subject(normalized),
            proof,
          ),
        }),
      );

      if (!response) return;
      if (response.held) {
        set_result({ kind: "held", apply_after: response.held.apply_after });
      } else if (response.error || response.data?.status !== "applied") {
        set_result({ kind: "error", source: response });

        return;
      } else {
        set_result({ kind: "applied" });
      }
      set_rescue_code("");
      set_typed_group("");
      on_changed();
    } catch {
      set_result({ kind: "error" });
    } finally {
      set_busy(false);
    }
  };

  return (
    <>
      <Modal
        close_on_escape={!busy}
        close_on_overlay={false}
        is_open={is_open}
        on_close={on_close}
        show_close_button={!busy}
        size="lg"
      >
        <div data-testid="guard_rescue_rotate_dialog">
          <ModalHeader>
            <ModalTitle>{t("guard.rescue_rotate_title")}</ModalTitle>
            <ModalDescription>
              {t("guard.rescue_rotate_description")}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            {finished ? (
              <p
                className="text-sm text-txt-primary"
                data-testid="guard_rescue_rotate_done"
                role="status"
              >
                {result.kind === "held"
                  ? t("guard.rescue_rotate_held", {
                      time: format_guard_time(result.apply_after),
                    })
                  : t("guard.rescue_rotate_applied")}
              </p>
            ) : (
              <div className="flex flex-col gap-5">
                <GuardRescueCodeBlock
                  rescue_code={rescue_code}
                  saved={saved}
                  typed_group={typed_group}
                  on_saved_change={set_saved}
                  on_typed_group_change={set_typed_group}
                />
                {result?.kind === "error" && (
                  <p
                    className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {guard_error_text(
                      t,
                      result.source,
                      "guard.rescue_rotate_error",
                    )}
                  </p>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            {finished ? (
              <Button variant="depth" onClick={on_close}>
                {t("common.done")}
              </Button>
            ) : (
              <>
                <Button disabled={busy} variant="outline" onClick={on_close}>
                  {t("common.cancel")}
                </Button>
                <Button
                  data-testid="guard_rescue_rotate_confirm"
                  disabled={!can_confirm}
                  variant="depth"
                  onClick={() => void confirm()}
                >
                  {t("guard.rescue_rotate_confirm")}
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
