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
import type { GuardDevice } from "@/services/guard/guard_device";
import type { TranslationKey } from "@/lib/i18n/types";

import type { ReactNode } from "react";

import { Children, useEffect, useState } from "react";
import { SettingToggleRow } from "@aster/ui";
import {
  ArrowDownTrayIcon,
  ArrowUturnRightIcon,
  CheckIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  KeyIcon,
  LifebuoyIcon,
} from "@heroicons/react/24/outline";

import { GuardCodeCard } from "@/components/guard/guard_code_card";
import {
  GuardRescueCodeBlock,
  rescue_code_confirmed,
} from "@/components/guard/guard_rescue_code_block";
import type { GuardFeatureKind } from "@/components/guard/guard_visuals";
import {
  GuardFeatureIcon,
  GuardLogo,
} from "@/components/guard/guard_visuals";
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
import { generate_rescue_code } from "@/lib/crypto/guard_rescue_code";
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  GUARD_ALL_SCOPES,
  GUARD_SCOPE,
  GUARD_SWITCH,
} from "@/services/api/guard";
import { enroll_guard } from "@/services/guard/guard_enroll";

type WizardStep = "intro" | "choose" | "rescue" | "confirm" | "done";

const INTRO_FEATURES: [GuardFeatureKind, TranslationKey, TranslationKey][] = [
  ["approve", "guard.intro_approve_title", "guard.intro_approve_body"],
  ["hold", "guard.intro_hold_title", "guard.intro_hold_body"],
  ["rescue", "guard.intro_rescue_title", "guard.intro_rescue_body"],
];

type WizardMessage = "already_on" | "error" | null;

export const GUARD_DEFAULT_SWITCHES =
  GUARD_SWITCH.new_device_approval | GUARD_SWITCH.hold_changes;

export interface GuardSelection {
  switches: number;
  hold_scopes: number;
}

export function toggle_guard_switch(
  current: GuardSelection,
  flag: number,
  on: boolean,
): GuardSelection {
  let switches = on ? current.switches | flag : current.switches & ~flag;
  let hold_scopes = current.hold_scopes;

  if (flag === GUARD_SWITCH.new_device_approval && !on) {
    switches &= ~GUARD_SWITCH.approve_mail_apps;
  }
  if (flag === GUARD_SWITCH.hold_changes) {
    hold_scopes = on ? GUARD_ALL_SCOPES : 0;
  }

  return { switches, hold_scopes };
}

export function toggle_guard_scope(
  current: GuardSelection,
  scope: number,
  on: boolean,
): GuardSelection {
  if (!(current.switches & GUARD_SWITCH.hold_changes)) return current;

  return {
    switches: current.switches,
    hold_scopes: on
      ? current.hold_scopes | scope
      : current.hold_scopes & ~scope,
  };
}

interface GuardSetupWizardProps {
  user_id: string;
  is_open: boolean;
  on_close: () => void;
  on_changed: () => void;
}

interface SwitchRowsProps {
  selection: GuardSelection;
  on_change: (next: GuardSelection) => void;
  disabled?: boolean;
  disabled_reason?: string;
}

function GuardSubOptions({
  active,
  label,
  parent,
  children,
  test_id,
}: {
  active: boolean;
  label?: string;
  parent: ReactNode;
  children: ReactNode;
  test_id: string;
}) {
  return (
    <div className="guard_tree">
      <div className="guard_tree_parent">{parent}</div>
      <div
        aria-disabled={active ? undefined : true}
        aria-label={label}
        className="guard_tree_children"
        data-active={active}
        data-testid={test_id}
        role="group"
      >
        {Children.toArray(children).map((child, index) => (
          <div key={index} className="guard_tree_child">
            <span aria-hidden className="guard_tree_trunk" />
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GuardSwitchRows({
  selection,
  on_change,
  disabled = false,
  disabled_reason,
}: SwitchRowsProps) {
  const { t } = use_i18n();
  const has = (flag: number) => (selection.switches & flag) !== 0;
  const nda = has(GUARD_SWITCH.new_device_approval);
  const hold = has(GUARD_SWITCH.hold_changes);
  const describe = (key: TranslationKey) =>
    disabled && disabled_reason ? disabled_reason : t(key);
  const scope_rows = [
    {
      scope: GUARD_SCOPE.forwarding_rules,
      label: "guard.setup_scope_forwarding",
      description: "guard.setup_scope_forwarding_description",
      icon: <ArrowUturnRightIcon />,
    },
    {
      scope: GUARD_SCOPE.recovery_password,
      label: "guard.setup_scope_recovery_password",
      description: "guard.setup_scope_recovery_password_description",
      icon: <KeyIcon />,
    },
    {
      scope: GUARD_SCOPE.security_export,
      label: "guard.setup_scope_security_export",
      description: "guard.setup_scope_security_export_description",
      icon: <ArrowDownTrayIcon />,
    },
  ] as const;

  return (
    <>
      <GuardSubOptions
        parent={
          <SettingToggleRow
            checked={nda}
            description={describe("guard.setup_new_device_approval_description")}
            disabled={disabled}
            icon={<DevicePhoneMobileIcon />}
            label={t("guard.setup_new_device_approval")}
            on_change={(on) =>
              on_change(
                toggle_guard_switch(
                  selection,
                  GUARD_SWITCH.new_device_approval,
                  on,
                ),
              )
            }
          />
        }
        active={nda}
        test_id="guard_setup_device_options"
      >
        <SettingToggleRow
          checked={has(GUARD_SWITCH.approve_mail_apps)}
          description={describe("guard.setup_approve_mail_apps_description")}
          disabled={disabled || !nda}
          icon={<EnvelopeIcon />}
          label={t("guard.setup_approve_mail_apps")}
          size="md"
          on_change={(on) =>
            on_change(
              toggle_guard_switch(
                selection,
                GUARD_SWITCH.approve_mail_apps,
                on,
              ),
            )
          }
        />
      </GuardSubOptions>
      <GuardSubOptions
        parent={
          <SettingToggleRow
            checked={hold}
            description={describe("guard.setup_hold_changes_description")}
            disabled={disabled}
            icon={<ClockIcon />}
            label={t("guard.setup_hold_changes")}
            on_change={(on) =>
              on_change(
                toggle_guard_switch(selection, GUARD_SWITCH.hold_changes, on),
              )
            }
          />
        }
        active={hold}
        label={t("guard.setup_hold_scopes_title")}
        test_id="guard_setup_hold_scopes"
      >
        {scope_rows.map((row) => (
          <SettingToggleRow
            key={row.scope}
            checked={hold && (selection.hold_scopes & row.scope) !== 0}
            description={describe(row.description)}
            disabled={disabled || !hold}
            icon={row.icon}
            label={t(row.label)}
            size="md"
            on_change={(on) =>
              on_change(toggle_guard_scope(selection, row.scope, on))
            }
          />
        ))}
      </GuardSubOptions>
      <SettingToggleRow
        checked={has(GUARD_SWITCH.recovery_wait)}
        description={describe("guard.setup_recovery_wait_description")}
        disabled={disabled}
        icon={<LifebuoyIcon />}
        label={t("guard.setup_recovery_wait")}
        on_change={(on) =>
          on_change(
            toggle_guard_switch(selection, GUARD_SWITCH.recovery_wait, on),
          )
        }
      />
    </>
  );
}

const SUMMARY_ROWS = [
  [GUARD_SWITCH.new_device_approval, "guard.setup_new_device_approval"],
  [GUARD_SWITCH.approve_mail_apps, "guard.setup_approve_mail_apps"],
  [GUARD_SWITCH.hold_changes, "guard.setup_hold_changes"],
  [GUARD_SWITCH.recovery_wait, "guard.setup_recovery_wait"],
] as const;

const WIZARD_STEP_COUNT = 3;

function WizardSteps({ step }: { step: number }) {
  const { t } = use_i18n();

  return (
    <div
      className="-mt-1 mb-3 me-2 flex h-7 items-center gap-3"
      data-testid="guard_setup_steps"
    >
      <span className="shrink-0 text-xs font-medium text-txt-muted tabular-nums">
        {t("guard.setup_step_counter", { step })}
      </span>
      <div aria-hidden className="flex min-w-0 flex-1 gap-1.5">
        {Array.from({ length: WIZARD_STEP_COUNT }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              index < step ? "bg-brand" : "bg-[color-mix(in_srgb,var(--text-muted)_26%,transparent)]",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function GuardSetupWizard({
  user_id,
  is_open,
  on_close,
  on_changed,
}: GuardSetupWizardProps) {
  const { t } = use_i18n();
  const step_up = use_guard_step_up();
  const [step, set_step] = useState<WizardStep>("intro");
  const [selection, set_selection] = useState<GuardSelection>({
    switches: GUARD_DEFAULT_SWITCHES,
    hold_scopes: GUARD_ALL_SCOPES,
  });
  const [rescue_code, set_rescue_code] = useState("");
  const [saved, set_saved] = useState(false);
  const [typed_group, set_typed_group] = useState("");
  const [busy, set_busy] = useState(false);
  const [message, set_message] = useState<WizardMessage>(null);
  const [device, set_device] = useState<GuardDevice | null>(null);

  useEffect(() => {
    if (!is_open) return;
    set_step("intro");
    set_selection({
      switches: GUARD_DEFAULT_SWITCHES,
      hold_scopes: GUARD_ALL_SCOPES,
    });
    set_rescue_code(generate_rescue_code());
    set_saved(false);
    set_typed_group("");
    set_message(null);
    set_device(null);

    return () => {
      set_rescue_code("");
      set_typed_group("");
    };
  }, [is_open]);

  const can_continue_rescue = rescue_code_confirmed(
    rescue_code,
    saved,
    typed_group,
  );
  const can_continue_choose = selection.switches !== 0;

  const confirm = async () => {
    if (busy) return;
    set_busy(true);
    set_message(null);
    try {
      const proof = await step_up.request_proof();

      if (!proof) return;
      const outcome = await enroll_guard({
        user_id,
        switches: selection.switches,
        hold_scopes: selection.hold_scopes,
        rescue_code,
        proof,
      });

      if (outcome.kind === "enabled") {
        set_rescue_code("");
        set_typed_group("");
        set_device(outcome.device);
        set_step("done");
        on_changed();
      } else if (outcome.kind === "already_on") {
        set_message("already_on");
        on_changed();
      } else {
        set_message("error");
      }
    } finally {
      set_busy(false);
    }
  };

  const step_number = step === "choose" ? 1 : step === "rescue" ? 2 : 3;

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
        <div data-testid="guard_setup_wizard">
          {step === "intro" && (
            <div
              className="mx-auto flex w-full max-w-[420px] flex-col items-center px-6 pb-6 pt-10 text-center"
              data-testid="guard_setup_intro"
            >
              <GuardLogo className="mb-6" />
              <ModalTitle className="!text-[26px] font-semibold !leading-8 tracking-[-0.2px] text-txt-primary">
                {t("guard.intro_title")}
              </ModalTitle>
              <ModalDescription className="mx-2 mt-2 text-[15px] leading-[22px] text-txt-secondary">
                {t("guard.intro_lead")}
              </ModalDescription>
              <ul className="mt-8 flex w-full flex-col gap-[22px] text-start">
                {INTRO_FEATURES.map(([kind, title, body]) => (
                  <li key={kind} className="flex items-start gap-4">
                    <GuardFeatureIcon
                      className="mt-px h-[22px] w-[22px] shrink-0 text-txt-secondary"
                      kind={kind}
                    />
                    <div className="min-w-0">
                      <p className="mb-[3px] text-[15px] font-semibold text-txt-primary">
                        {t(title)}
                      </p>
                      <p className="text-sm leading-5 text-txt-secondary">
                        {t(body)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-10 text-[12.5px] text-txt-muted">
                {t("guard.intro_note")}
              </p>
              <Button
                className="mt-3 h-[52px] w-full rounded-[14px] text-base"
                data-testid="guard_setup_start"
                variant="depth"
                onClick={() => set_step("choose")}
              >
                {t("guard.intro_start")}
              </Button>
              <Button
                className="mt-2.5 h-[52px] w-full rounded-[14px] text-base"
                variant="ghost"
                onClick={on_close}
              >
                {t("guard.intro_not_now")}
              </Button>
            </div>
          )}
          {step === "choose" && (
            <>
              <ModalHeader>
                <WizardSteps step={step_number} />
                <ModalTitle>{t("guard.setup_choose_title")}</ModalTitle>
                <ModalDescription>
                  {t("guard.setup_choose_description")}
                </ModalDescription>
              </ModalHeader>
              <ModalBody>
                <GuardSwitchRows
                  selection={selection}
                  on_change={set_selection}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="outline" onClick={on_close}>
                  {t("common.cancel")}
                </Button>
                <Button
                  disabled={!can_continue_choose}
                  variant="depth"
                  onClick={() => set_step("rescue")}
                >
                  {t("common.continue")}
                </Button>
              </ModalFooter>
            </>
          )}
          {step === "rescue" && (
            <>
              <ModalHeader>
                <WizardSteps step={step_number} />
                <ModalTitle>{t("guard.setup_rescue_title")}</ModalTitle>
                <ModalDescription>
                  {t("guard.setup_rescue_description")}
                </ModalDescription>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-5">
                  <GuardRescueCodeBlock
                    rescue_code={rescue_code}
                    saved={saved}
                    typed_group={typed_group}
                    on_saved_change={set_saved}
                    on_typed_group_change={set_typed_group}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="outline" onClick={() => set_step("choose")}>
                  {t("common.back")}
                </Button>
                <Button
                  data-testid="guard_rescue_continue"
                  disabled={!can_continue_rescue}
                  variant="depth"
                  onClick={() => set_step("confirm")}
                >
                  {t("common.continue")}
                </Button>
              </ModalFooter>
            </>
          )}
          {step === "confirm" && (
            <>
              <ModalHeader>
                <WizardSteps step={step_number} />
                <ModalTitle>{t("guard.setup_confirm_title")}</ModalTitle>
                <ModalDescription>
                  {t("guard.setup_confirm_description")}
                </ModalDescription>
              </ModalHeader>
              <ModalBody>
                <ul
                  className="mb-4 flex flex-col gap-3"
                  data-testid="guard_setup_summary"
                >
                  {SUMMARY_ROWS.filter(
                    ([flag]) => (selection.switches & flag) !== 0,
                  ).map(([flag, key]) => (
                    <li key={flag} className="flex items-center gap-3">
                      <CheckIcon
                        aria-hidden
                        className="h-5 w-5 shrink-0 text-txt-muted"
                      />
                      <span className="text-sm font-medium text-txt-primary">
                        {t(key)}
                      </span>
                    </li>
                  ))}
                </ul>
                {message && (
                  <p
                    className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {t(
                      message === "already_on"
                        ? "guard.setup_already_on"
                        : "guard.setup_error",
                    )}
                  </p>
                )}
              </ModalBody>
              <ModalFooter>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => set_step("rescue")}
                >
                  {t("common.back")}
                </Button>
                <Button
                  data-testid="guard_setup_confirm"
                  disabled={busy || message === "already_on"}
                  is_loading={busy}
                  variant="depth"
                  onClick={() => void confirm()}
                >
                  {t("guard.setup_confirm_button")}
                </Button>
              </ModalFooter>
            </>
          )}
          {step === "done" && (
            <>
              <ModalHeader className="items-center pe-6 text-center">
                <GuardLogo className="mb-5" />
                <ModalTitle className="text-center">
                  {t("guard.setup_done_title")}
                </ModalTitle>
                <ModalDescription className="text-center">
                  {t("guard.setup_done_description")}
                </ModalDescription>
              </ModalHeader>
              <ModalBody>
                <GuardCodeCard device={device} />
              </ModalBody>
              <ModalFooter>
                <Button variant="depth" onClick={on_close}>
                  {t("common.done")}
                </Button>
              </ModalFooter>
            </>
          )}
        </div>
      </Modal>
      {step_up.step_up_modal}
    </>
  );
}
