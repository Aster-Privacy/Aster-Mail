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
import type { SenderOption } from "@/hooks/use_sender_aliases";

import { useEffect, useMemo, useState } from "react";

import { use_sender_aliases } from "@/hooks/use_sender_aliases";
import {
  get_preferred_sender_id,
  sender_id_matches,
  subscribe_preferred_sender,
} from "@/lib/preferred_sender";
import {
  find_invite_sender,
  invite_sender_options,
} from "@/services/calendar/invite_sender";

export interface InviteSenders {
  all_options: SenderOption[];
  options: SenderOption[];
  pending_domain_names: string[];
  loading: boolean;
  mail_default_email: string | null;
}

export function mail_default_invite_email(
  options: SenderOption[],
  preferred_id: string | null,
): string | null {
  if (!preferred_id) {
    return null;
  }

  const preferred = options.find(
    (option) => option.is_enabled && sender_id_matches(option.id, preferred_id),
  );

  return preferred
    ? (find_invite_sender(options, preferred.email)?.email ?? null)
    : null;
}

export function use_invite_senders(
  candidates: (string | null | undefined)[] = [],
): InviteSenders {
  const { sender_options, pending_domain_names, loading } =
    use_sender_aliases(candidates);
  const [preferred_id, set_preferred_id] = useState<string | null>(() =>
    get_preferred_sender_id(),
  );

  useEffect(() => {
    set_preferred_id(get_preferred_sender_id());

    return subscribe_preferred_sender(set_preferred_id);
  }, []);

  const options = useMemo(
    () => invite_sender_options(sender_options),
    [sender_options],
  );
  const mail_default_email = useMemo(
    () => mail_default_invite_email(sender_options, preferred_id),
    [sender_options, preferred_id],
  );

  return {
    all_options: sender_options,
    options,
    pending_domain_names,
    loading,
    mail_default_email,
  };
}
