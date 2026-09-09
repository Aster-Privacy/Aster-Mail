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
import { useLocation, useNavigate } from "react-router-dom";

import { open_external } from "@/utils/open_link";

const WEB_SIGN_UP_URL = "https://app.astermail.org/register";

export function DesktopSignUpHandoff() {
  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    open_external(`${WEB_SIGN_UP_URL}${search}`);
    navigate("/sign-in", { replace: true });
  }, [navigate, search]);

  return null;
}
