import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { getCurrentUser } from "../lib/api-client";
import { AdminShell } from "./AdminShell";

export function ProtectedRoute() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: getCurrentUser
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

  return <AdminShell user={sessionQuery.data} />;
}
