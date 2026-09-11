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
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { AppStorePlans } from "@/components/app_store/app_store_plans";
import {
  AppStoreManagedElsewhereNotice,
  use_app_store_subscription,
} from "@/components/app_store/app_store_billing_section";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  close_upgrade_modal,
  is_on_auth_route,
  show_plan_limit_upgrade,
  show_storage_full_upgrade,
  use_upgrade_state,
} from "@/stores/upgrade_store";

export function AppStoreUpgradeModal() {
  const { t } = use_i18n();
  const location = useLocation();
  const state = use_upgrade_state();
  const { is_authenticated } = use_auth();
  const is_blocked = is_on_auth_route(location.pathname) || !is_authenticated;
  const is_visible = state.is_open && !is_blocked;
  const { subscription, plan_code, managed_elsewhere } =
    use_app_store_subscription(is_visible);

  useEffect(() => {
    function handle_plan_limit(e: Event) {
      const detail =
        (
          e as CustomEvent<{
            resource?: string | null;
            message?: string | null;
          }>
        ).detail || {};

      show_plan_limit_upgrade({
        resource: detail.resource ?? null,
        message: detail.message ?? null,
      });
    }

    function handle_storage_full(e: Event) {
      const detail =
        (e as CustomEvent<{ message?: string | null }>).detail || {};

      show_storage_full_upgrade({ message: detail.message ?? null });
    }

    window.addEventListener("aster:plan-limit-hit", handle_plan_limit);
    window.addEventListener("aster:storage-full", handle_storage_full);

    return () => {
      window.removeEventListener("aster:plan-limit-hit", handle_plan_limit);
      window.removeEventListener("aster:storage-full", handle_storage_full);
    };
  }, []);

  useEffect(() => {
    if (is_blocked && state.is_open) {
      close_upgrade_modal();
    }
  }, [is_blocked, state.is_open]);

  const description =
    state.reason === "storage_full"
      ? t("app_store.upgrade_storage_description")
      : state.reason === "plan_limit"
        ? t("app_store.upgrade_limit_description")
        : t("app_store.upgrade_generic_description");

  return (
    <Modal is_open={is_visible} on_close={close_upgrade_modal} size="2xl">
      <ModalHeader>
        <ModalTitle>{t("app_store.upgrade_title")}</ModalTitle>
        <ModalDescription>{description}</ModalDescription>
      </ModalHeader>
      <ModalBody className="space-y-4">
        {managed_elsewhere ? <AppStoreManagedElsewhereNotice /> : null}
        <AppStorePlans
          compact
          current_plan_code={plan_code}
          on_redeemed={close_upgrade_modal}
          purchases_locked={managed_elsewhere || !subscription}
          recommended_plan_code={state.preselect_plan_code ?? "nova"}
        />
      </ModalBody>
    </Modal>
  );
}
