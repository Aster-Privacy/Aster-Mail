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
import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { FullPageLoader } from "@/components/common/full_page_loader";

function dispatch_app_ready() {
  window.dispatchEvent(new CustomEvent("astermail:app-ready"));
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { is_authenticated, is_loading, is_completing_registration } =
    use_auth();
  const { is_loading: preferences_loading } = use_preferences();
  const location = useLocation();
  const dispatched = useRef(false);

  const is_ready = !is_loading && (!is_authenticated || !preferences_loading);

  useEffect(() => {
    if (is_ready && !dispatched.current) {
      dispatched.current = true;
      dispatch_app_ready();
    }
  }, [is_ready]);

  if (is_loading || (is_authenticated && preferences_loading)) {
    return <FullPageLoader />;
  }

  if (!is_authenticated && !is_completing_registration) {
    return (
      <Navigate
        replace
        state={{ from: location }}
        to={"/sign-in" + location.search}
      />
    );
  }

  return <>{children}</>;
}
