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
import { PlusIcon } from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { use_auth } from "@/contexts/auth_context";
import { use_i18n } from "@/lib/i18n/context";
import {
  account_index_path,
  account_index_url,
  app_pathname,
  is_signed_in_entry_path,
} from "@/lib/account_index_url";
import { hard_redirect } from "@/lib/hard_redirect";

function account_destination(index: number): string {
  const path = app_pathname();

  if (!is_signed_in_entry_path(path)) return account_index_url(index);

  return `${account_index_path(index, path)}${window.location.search}${window.location.hash}`;
}

export function AccountChooser(): JSX.Element {
  const { t } = use_i18n();
  const { accounts } = use_auth();

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[var(--bg-primary)] px-4 py-10">
      <section className="w-full max-w-[420px]">
        <h1 className="text-[20px] font-semibold text-[var(--text-primary)]">
          {t("auth.account_chooser_title")}
        </h1>
        <p className="mt-2 text-[14px] text-[var(--text-secondary)]">
          {accounts.length > 0
            ? t("auth.account_chooser_body")
            : t("auth.account_chooser_empty")}
        </p>
        <div className="mt-6 overflow-hidden rounded-[16px] border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
          {accounts.map((account, index) => {
            const name =
              account.user.display_name ||
              account.user.username ||
              account.user.email.split("@")[0];

            return (
              <button
                key={account.id}
                className="flex w-full items-center gap-3 border-b border-[var(--border-primary)] px-4 py-3 text-start hover:bg-[var(--bg-tertiary)]"
                data-testid="account_chooser_option"
                type="button"
                onClick={() => hard_redirect(account_destination(index))}
              >
                <ProfileAvatar
                  email={account.user.email}
                  image_url={account.user.profile_picture}
                  name={name}
                  profile_color={account.user.profile_color}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[var(--text-primary)]">
                    {name}
                  </span>
                  <span className="block truncate text-[12px] text-[var(--text-muted)]">
                    {account.user.email}
                  </span>
                </span>
              </button>
            );
          })}
          <button
            className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-[var(--bg-tertiary)]"
            data-testid="account_chooser_add"
            type="button"
            onClick={() =>
              hard_redirect(account_index_path(accounts.length, "/sign-in"))
            }
          >
            <PlusIcon className="h-5 w-5 text-[var(--text-muted)]" />
            <span className="flex-1 text-[14px] text-[var(--text-primary)]">
              {t("auth.add_another_account")}
            </span>
          </button>
        </div>
      </section>
    </main>
  );
}
