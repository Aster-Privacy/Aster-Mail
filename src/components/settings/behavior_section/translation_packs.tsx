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
import { TrashIcon } from "@heroicons/react/24/outline";

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
  const label = (pack: CachedPack) =>
    `${language_display_name(pack.from, language)} → ${language_display_name(pack.to, language)}`;

  return (
    <div className="py-4">
      <p className="text-sm font-medium text-txt-primary">
        {t("settings.translation_packs")}
      </p>
      <p className="text-sm mt-0.5 text-txt-muted">
        {t("settings.translation_packs_description")}
      </p>

      {!supported && (
        <p className="text-sm mt-3 text-txt-muted">
          {t("settings.translation_packs_unavailable")}
        </p>
      )}

      {supported && packs.length === 0 && (
        <p className="text-sm mt-3 text-txt-muted">
          {t("settings.translation_packs_empty")}
        </p>
      )}

      {supported && packs.length > 0 && (
        <>
          <ul className="mt-3 divide-y divide-edge-secondary rounded-lg border border-edge-primary">
            {packs.map((pack) => (
              <li
                key={pack.pair}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="text-sm text-txt-primary">{label(pack)}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-txt-muted">
                    {format_bytes(pack.bytes)}
                  </span>
                  <button
                    aria-label={t("settings.translation_packs_remove")}
                    className="rounded-md p-1 text-txt-muted hover:text-txt-primary hover:bg-white/10 transition-colors"
                    type="button"
                    onClick={() => remove_one(pack.pair)}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-txt-muted">
              {t("settings.translation_packs_total", {
                size: format_bytes(total),
              })}
            </span>
            <button
              className="text-xs font-medium text-txt-secondary hover:text-txt-primary transition-colors"
              type="button"
              onClick={remove_every}
            >
              {t("settings.translation_packs_remove_all")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
