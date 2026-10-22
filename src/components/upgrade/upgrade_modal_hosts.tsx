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
import type { ReactNode } from "react";

import { Suspense, useEffect, useState } from "react";

import { use_auth } from "@/contexts/auth_context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { ignore_error } from "@/lib/ignore_error";
import { special_offer_can_auto_show } from "@/lib/special_offer";
import { use_alias_cap_upsell_state } from "@/stores/alias_cap_upsell_store";
import { use_special_offer_state } from "@/stores/special_offer_store";
import { use_special_offer_status } from "@/stores/special_offer_status";
import { use_upgrade_state } from "@/stores/upgrade_store";
import { lazy_with_retry, preload_when_idle } from "@/utils/lazy_with_retry";

const load_upgrade_modal = () => import("@/components/upgrade/upgrade_modal");
const load_alias_cap_upsell_modal = () =>
  import("@/components/upgrade/alias_cap_upsell_modal");
const load_special_offer_modal = () =>
  import("@/components/upgrade/special_offer_modal");

const UpgradeModal = lazy_with_retry(() =>
  load_upgrade_modal().then((m) => ({ default: m.UpgradeModal })),
);
const AliasCapUpsellModal = lazy_with_retry(() =>
  load_alias_cap_upsell_modal().then((m) => ({
    default: m.AliasCapUpsellModal,
  })),
);
const SpecialOfferModal = lazy_with_retry(() =>
  load_special_offer_modal().then((m) => ({ default: m.SpecialOfferModal })),
);

export function preload_upgrade_modals(): void {
  for (const load of [
    load_upgrade_modal,
    load_alias_cap_upsell_modal,
    load_special_offer_modal,
  ]) {
    void load().catch((caught) =>
      ignore_error("components/upgrade/upgrade_modal_hosts:preload", caught),
    );
  }
}

function MountOnceNeeded({
  is_needed,
  children,
}: {
  is_needed: boolean;
  children: ReactNode;
}) {
  const [was_needed, set_was_needed] = useState(is_needed);

  if (is_needed && !was_needed) set_was_needed(true);

  if (!is_needed && !was_needed) return null;

  return <Suspense fallback={null}>{children}</Suspense>;
}

export function UpgradeModalHost() {
  const { is_open } = use_upgrade_state();

  return (
    <MountOnceNeeded is_needed={is_open}>
      <UpgradeModal />
    </MountOnceNeeded>
  );
}

export function AliasCapUpsellModalHost() {
  const { is_open } = use_alias_cap_upsell_state();

  return (
    <MountOnceNeeded is_needed={is_open}>
      <AliasCapUpsellModal />
    </MountOnceNeeded>
  );
}

export function SpecialOfferModalHost() {
  const { is_authenticated, user } = use_auth();
  const { status, is_loaded } = use_special_offer_status();
  const { plan_code, refresh: refresh_plan_limits } = use_plan_limits();
  const { is_open, checkout_seq } = use_special_offer_state();
  const user_id = is_authenticated ? (user?.id ?? null) : null;
  const can_auto_show = special_offer_can_auto_show({
    status,
    is_loaded,
    plan_code,
  });

  useEffect(() => {
    if (user_id) void refresh_plan_limits();
  }, [user_id, refresh_plan_limits]);

  useEffect(() => {
    if (!user_id) return;

    return preload_when_idle(preload_upgrade_modals);
  }, [user_id]);

  return (
    <MountOnceNeeded is_needed={is_open || checkout_seq > 0 || can_auto_show}>
      <SpecialOfferModal />
    </MountOnceNeeded>
  );
}
