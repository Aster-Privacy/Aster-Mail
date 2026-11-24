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
import type { EncryptedVault } from "@/services/crypto/key_manager_core";
import type { TranslationKey } from "@/lib/i18n/types";

import {
  list_folders,
  create_folder,
  type CreateFolderRequest,
} from "@/services/api/folders";
import {
  encrypt_folder_field,
  generate_folder_token,
} from "@/hooks/use_folders";
import { emit_folders_changed } from "@/hooks/mail_events";

type Translator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

interface SystemLabelSpec {
  folder_type: string;
  i18n_key: TranslationKey;
  fallback: string;
  sort_order: number;
}

const SYSTEM_LABEL_SPECS: SystemLabelSpec[] = [
  {
    folder_type: "inbox",
    i18n_key: "common.label_system_inbox",
    fallback: "Inbox",
    sort_order: 0,
  },
  {
    folder_type: "sent",
    i18n_key: "common.label_system_sent",
    fallback: "Sent",
    sort_order: 1,
  },
  {
    folder_type: "drafts",
    i18n_key: "common.label_system_drafts",
    fallback: "Drafts",
    sort_order: 2,
  },
  {
    folder_type: "trash",
    i18n_key: "common.label_system_trash",
    fallback: "Trash",
    sort_order: 3,
  },
  {
    folder_type: "spam",
    i18n_key: "common.label_system_spam",
    fallback: "Spam",
    sort_order: 4,
  },
  {
    folder_type: "archive",
    i18n_key: "common.label_system_archive",
    fallback: "Archive",
    sort_order: 5,
  },
];

const RETRY_DELAYS_MS = [2000, 8000];

const inflight_by_identity: Map<string, Promise<void>> = new Map();

type BootstrapOutcome = "complete" | "retry";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function create_missing_system_folders(
  identity_key: string,
  t?: Translator,
): Promise<BootstrapOutcome> {
  const existing = await list_folders({
    include_system: true,
    include_counts: true,
  });

  if (existing.error || !existing.data) return "retry";

  const present_types = new Set(
    existing.data.folders
      .filter((f) => !!f.folder_token)
      .map((f) => f.folder_type),
  );
  const missing_specs = SYSTEM_LABEL_SPECS.filter(
    (spec) => !present_types.has(spec.folder_type),
  );

  if (missing_specs.length === 0) return "complete";

  const creations = missing_specs.map(async (spec) => {
    const localized_name =
      (t ? t(spec.i18n_key) : spec.fallback) || spec.fallback;
    const display_name =
      localized_name === spec.i18n_key ? spec.fallback : localized_name;

    const folder_token = generate_folder_token();
    const { encrypted: encrypted_name, nonce: name_nonce } =
      await encrypt_folder_field(display_name, identity_key);

    const request: CreateFolderRequest = {
      folder_token,
      encrypted_name,
      name_nonce,
      is_system: true,
      sort_order: spec.sort_order,
      folder_type: spec.folder_type,
    };

    const response = await create_folder(request);

    if (response.error) {
      throw new Error(response.error);
    }

    return { folder_type: spec.folder_type, folder_token };
  });

  const results = await Promise.allSettled(creations);

  if (results.some((r) => r.status === "fulfilled")) {
    emit_folders_changed();
  }

  return results.every((r) => r.status === "fulfilled") ? "complete" : "retry";
}

export async function ensure_default_labels(
  vault: EncryptedVault | null | undefined,
  t?: Translator,
): Promise<void> {
  if (!vault?.identity_key) return;

  const identity_key = vault.identity_key;
  const existing_promise = inflight_by_identity.get(identity_key);

  if (existing_promise) return existing_promise;

  const promise = (async () => {
    try {
      for (let attempt = 0; ; attempt++) {
        let outcome: BootstrapOutcome;

        try {
          outcome = await create_missing_system_folders(identity_key, t);
        } catch {
          outcome = "retry";
        }

        if (outcome === "complete") return;
        if (attempt >= RETRY_DELAYS_MS.length) {
          throw new Error("system folders could not be created");
        }
        await wait(RETRY_DELAYS_MS[attempt]);
      }
    } finally {
      inflight_by_identity.delete(identity_key);
    }
  })();

  inflight_by_identity.set(identity_key, promise);

  return promise;
}
