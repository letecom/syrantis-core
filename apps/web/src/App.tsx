import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { getCurrentUser } from "./lib/api-client";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PushbackPage } from "./pages/PushbackPage";

function RootRedirect() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: getCurrentUser
  });

  if (sessionQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-5 text-sm text-slate-600">
        Checking session...
      </div>
    );
  }

  return <Navigate replace to={sessionQuery.data ? "/app" : "/login"} />;
}

export function App() {
  return (
    <Routes>
      <Route element={<RootRedirect />} path="/" />
      <Route element={<LoginPage />} path="/login" />
      <Route element={<ProtectedRoute />} path="/app">
        <Route index element={<DashboardPage />} />
        <Route element={<PushbackPage />} path="pushback" />
      </Route>
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}
