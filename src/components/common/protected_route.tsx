import { Navigate, useLocation } from "react-router-dom";

import { use_auth } from "@/contexts/auth_context";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { is_authenticated, is_loading, is_completing_registration } =
    use_auth();
  const location = useLocation();

  if (is_loading) {
    return null;
  }

  if (!is_authenticated && !is_completing_registration) {
    return <Navigate replace state={{ from: location }} to="/sign-in" />;
  }

  return <>{children}</>;
}
