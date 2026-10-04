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
import { memo, useState } from "react";

import { is_icon_failed, mark_icon_failed } from "@/lib/icon_cache";
import { use_favicon_src } from "@/hooks/use_favicon_src";
import { get_domain_from_email } from "@/components/compose/compose_shared_core";

export const DdgFavicon = memo(function DdgFavicon({
  email,
  size = 16,
}: {
  email: string;
  size?: number;
}) {
  const domain = get_domain_from_email(email);
  const [error, set_error] = useState(() => is_icon_failed(domain));
  const [prev_email, set_prev_email] = useState(email);
  const loaded = use_favicon_src(domain, !!domain && !is_icon_failed(domain));
  const url =
    domain && !is_icon_failed(domain) && !loaded.startsWith("data:")
      ? loaded
      : "";

  if (email !== prev_email) {
    set_prev_email(email);
    set_error(is_icon_failed(get_domain_from_email(email)));
  }

  if (!url || error) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full flex-shrink-0"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          fontWeight: 500,
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-muted)",
        }}
      >
        {(domain || email).charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full flex-shrink-0 overflow-hidden bg-surf-tertiary"
      style={{
        width: size,
        height: size,
      }}
    >
      <img
        alt=""
        className="object-cover"
        src={url}
        style={{ width: size, height: size }}
        onError={() => {
          if (domain) mark_icon_failed(domain);
          set_error(true);
        }}
      />
    </span>
  );
});
