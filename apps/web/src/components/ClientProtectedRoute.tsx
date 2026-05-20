import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { getCurrentUser } from "../lib/api-client";
import { ClientShell } from "./ClientShell";

function canAccessClientShell(role: string): boolean {
  return role === "client" || role === "admin" || role === "founder";
}

export function ClientProtectedRoute() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: getCurrentUser,
  });

  if (sessionQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-5 text-sm text-slate-600">
        Restoring session...
      </div>
    );
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return <Navigate replace to="/login" />;
  }

  if (!canAccessClientShell(sessionQuery.data.role)) {
    return <Navigate replace to="/app" />;
  }

  return <ClientShell user={sessionQuery.data} />;
}
