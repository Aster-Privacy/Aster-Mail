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
import { useCallback, useEffect, useState } from "react";
import { IslandRow } from "@aster/ui";
import { ArrowRightIcon, TrashIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { format_bytes } from "@/lib/utils";
import { ignore_error } from "@/lib/ignore_error";
import { language_display_name } from "@/services/translation/accepted_languages";
import {
  cache_storage_available,
  cached_packs,
  clear_model_cache,
  remove_pack,
  type CachedPack,
} from "@/services/translation/model_cache";
import {
  clear_pack_consent,
  revoke_pack_consent,
} from "@/services/translation/download_consent";

export function TranslationPacks() {
  const { t, language } = use_i18n();
  const [packs, set_packs] = useState<CachedPack[]>([]);
  const supported = cache_storage_available();

  const refresh = useCallback(() => {
    if (!supported) return;

    cached_packs()
      .then(set_packs)
      .catch((caught) => {
        ignore_error("settings/translation_packs:refresh", caught);
      });
  }, [supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const remove_one = useCallback(
    (pair: string) => {
      void (async () => {
        await remove_pack(pair);
        revoke_pack_consent(pair);
        refresh();
      })();
    },
    [refresh],
  );

  const remove_every = useCallback(() => {
    void (async () => {
      await clear_model_cache();
      clear_pack_consent();
      refresh();
    })();
  }, [refresh]);

  const total = packs.reduce((sum, pack) => sum + pack.bytes, 0);
  const show_list = supported && packs.length > 0;

  return (
    <IslandRow
      description={t("settings.translation_packs_description")}
      label={t("settings.translation_packs")}
      layout="block"
      trailing={
        !supported ? (
          <p className="text-sm text-txt-muted">
            {t("settings.translation_packs_unavailable")}
          </p>
        ) : !show_list ? (
          <p className="text-sm text-txt-muted">
            {t("settings.translation_packs_empty")}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <ul className="overflow-hidden rounded-xl bg-surf-primary">
              {packs.map((pack, index) => (
                <li
                  key={pack.pair}
                  className={`flex items-center gap-3 ps-3.5 pe-2 py-2 ${index > 0 ? "border-t border-[var(--aster-island-divider,var(--aster-floating-divider,var(--border-secondary)))]" : ""}`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-txt-primary">
                    <span className="truncate">
                      {language_display_name(pack.from, language)}
                    </span>
                    <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-txt-muted rtl:-scale-x-100" />
                    <span className="truncate">
                      {language_display_name(pack.to, language)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-txt-muted">
                    {format_bytes(pack.bytes)}
                  </span>
                  <button
                    aria-label={t("settings.translation_packs_remove")}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-txt-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                    title={t("settings.translation_packs_remove")}
                    type="button"
                    onClick={() => remove_one(pack.pair)}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs tabular-nums text-txt-muted">
                {t("settings.translation_packs_total", {
                  size: format_bytes(total),
                })}
              </span>
              <button
                className="rounded-full bg-[var(--aster-hover)] px-3 py-1 text-sm font-medium text-txt-secondary transition-colors hover:bg-red-500/10 hover:text-red-500"
                type="button"
                onClick={remove_every}
              >
                {t("settings.translation_packs_remove_all")}
              </button>
            </div>
          </div>
        )
      }
    />
  );
}
