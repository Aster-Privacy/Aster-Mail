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
import type { VerifiedDomainAddress } from "@/components/settings/hooks/use_verified_domain_addresses";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { show_toast } from "@/components/toast/simple_toast";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import {
  create_smtp_token,
  type CreateSmtpTokenResult,
} from "@/services/api/smtp_tokens";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface SmtpTokenCreateModalProps {
  is_open: boolean;
  on_close: () => void;
  on_created: () => void;
  addresses: VerifiedDomainAddress[];
}

type Step = "form" | "reveal";

function DisclosureCallout() {
  const { t } = use_i18n();

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
      <div className="flex items-start gap-2.5">
        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-txt-primary">
            {t("settings.smtp_token_not_e2e_title")}
          </p>
          <p className="text-xs text-txt-muted leading-relaxed mt-1">
            {t("settings.smtp_token_not_e2e_body")}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SmtpTokenCreateModal({
  is_open,
  on_close,
  on_created,
  addresses,
}: SmtpTokenCreateModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [step, set_step] = useState<Step>("form");
  const [name, set_name] = useState("");
  const [bound_address, set_bound_address] = useState("");
  const [is_loading, set_is_loading] = useState(false);
  const [error, set_error] = useState("");
  const [created, set_created] = useState<CreateSmtpTokenResult | null>(null);

  const reset_state = useCallback(() => {
    set_step("form");
    set_name("");
    set_bound_address("");
    set_is_loading(false);
    set_error("");
    set_created(null);
  }, []);

  useEffect(() => {
    if (is_open) {
      reset_state();
      set_bound_address(addresses[0]?.value ?? "");
    }
  }, [is_open, addresses, reset_state]);

  const handle_create = async () => {
    if (!name.trim() || !bound_address) return;

    const selected = addresses.find((addr) => addr.value === bound_address);

    if (!selected) {
      set_error(t("settings.smtp_token_create_failed"));

      return;
    }

    set_is_loading(true);
    set_error("");

    const response = await create_smtp_token({
      name: name.trim(),
      from_address: selected.value,
      domain_name: selected.domain_name,
      local_part: selected.local_part,
    });

    if (response.error || !response.data) {
      if (response.code === "FORBIDDEN") {
        set_error(t("settings.smtp_token_error_forbidden"));
      } else if (response.code === "CONFLICT") {
        set_error(t("settings.smtp_token_error_conflict"));
      } else {
        set_error(response.error ?? t("settings.smtp_token_create_failed"));
      }
      set_is_loading(false);

      return;
    }

    set_created(response.data);
    set_step("reveal");
    set_is_loading(false);
  };

  const copy_value = async (value: string) => {
    await navigator.clipboard.writeText(value);
    show_toast(t("common.copied_to_clipboard"), "success");
  };

  const copy_all = async () => {
    if (!created) return;

    const lines = [
      `${t("settings.smtp_token_host")}: ${created.smtp_settings.host}`,
      `${t("settings.smtp_token_port")}: ${created.smtp_settings.port}`,
      `${t("settings.smtp_token_security")}: ${created.smtp_settings.security}`,
      `${t("settings.smtp_token_username")}: ${created.smtp_settings.username}`,
      `${t("settings.smtp_token_password")}: ${created.token}`,
    ];

    await navigator.clipboard.writeText(lines.join("\n"));
    show_toast(t("common.copied_to_clipboard"), "success");
  };

  const handle_done = () => {
    on_created();
    on_close();
  };

  const render_form_step = () => (
    <>
      <ModalHeader>
        <ModalTitle>{t("settings.smtp_token_create_title")}</ModalTitle>
        <ModalDescription>
          {t("settings.smtp_token_create_description")}
        </ModalDescription>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <div>
          <label
            className="block text-sm font-medium text-txt-primary mb-1.5"
            htmlFor="smtp-token-name"
          >
            {t("settings.smtp_token_name_label")}
          </label>
          <Input
            id="smtp-token-name"
            maxLength={64}
            placeholder={t("settings.smtp_token_name_placeholder")}
            status={error ? "error" : "default"}
            value={name}
            onChange={(e) => set_name(e.target.value)}
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-txt-primary mb-1.5"
            htmlFor="smtp-token-address"
          >
            {t("settings.smtp_token_address_label")}
          </label>
          <select
            className="aster_input aster_input_lg w-full cursor-pointer"
            id="smtp-token-address"
            value={bound_address}
            onChange={(e) => set_bound_address(e.target.value)}
          >
            {addresses.map((addr) => (
              <option key={addr.value} value={addr.value}>
                {addr.value}
              </option>
            ))}
          </select>
          <p className="text-xs text-txt-muted mt-1.5">
            {t("settings.smtp_token_address_hint")}
          </p>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <DisclosureCallout />
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={!name.trim() || !bound_address || is_loading}
          variant="depth"
          onClick={handle_create}
        >
          {is_loading
            ? t("common.creating")
            : t("settings.smtp_token_generate")}
        </Button>
      </ModalFooter>
    </>
  );

  const render_reveal_step = () => {
    if (!created) return null;

    const rows: { label: string; value: string; mono?: boolean }[] = [
      { label: t("settings.smtp_token_host"), value: created.smtp_settings.host },
      {
        label: t("settings.smtp_token_port"),
        value: String(created.smtp_settings.port),
      },
      {
        label: t("settings.smtp_token_security"),
        value: created.smtp_settings.security,
      },
      {
        label: t("settings.smtp_token_username"),
        value: created.smtp_settings.username,
      },
      {
        label: t("settings.smtp_token_password"),
        value: created.token,
        mono: true,
      },
    ];

    return (
      <>
        <ModalHeader>
          <div className="flex items-center gap-3">
            <KeyIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
            <ModalTitle>{t("settings.smtp_token_ready_title")}</ModalTitle>
          </div>
          <ModalDescription>
            {t("settings.smtp_token_ready_description")}
          </ModalDescription>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div className="rounded-xl border border-edge-secondary bg-surf-primary divide-y divide-edge-secondary">
            {rows.map((row) => (
              <button
                key={row.label}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                type="button"
                onClick={() => copy_value(row.value)}
              >
                <span className="text-xs text-txt-muted flex-shrink-0">
                  {row.label}
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={[
                      "text-sm text-txt-primary truncate",
                      row.mono ? "font-mono" : "",
                    ].join(" ")}
                  >
                    {row.value}
                  </span>
                  <ClipboardDocumentIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
                </span>
              </button>
            ))}
          </div>
          <div className="flex justify-center">
            <Button variant="secondary" onClick={copy_all}>
              <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
              {t("settings.smtp_token_copy_all")}
            </Button>
          </div>
          <DisclosureCallout />
        </ModalBody>
        <ModalFooter>
          <Button variant="depth" onClick={handle_done}>
            {t("common.done")}
          </Button>
        </ModalFooter>
      </>
    );
  };

  return (
    <Modal
      close_on_overlay={false}
      is_open={is_open}
      on_close={on_close}
      show_close_button={step === "form"}
      size="md"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
        >
          {step === "form" && render_form_step()}
          {step === "reveal" && render_reveal_step()}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}
