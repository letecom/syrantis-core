import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { ClientProtectedRoute } from "./components/ClientProtectedRoute";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { getCurrentUser } from "./lib/api-client";
import { getAuthenticatedHomePath } from "./lib/routing";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { ClientInboxLabPage } from "./pages/ClientInboxLabPage";
import { ClientInboxPreviewPage } from "./pages/ClientInboxPreviewPage";
import { ClientInboxLivePage } from "./features/client-inbox";
import { ClientConfigPage } from "./pages/ClientConfigPage";
import { ClientInstallPage } from "./pages/ClientInstallPage";
import { ClientUsersPage } from "./pages/ClientUsersPage";
import { ClientPlaceholderPage } from "./pages/ClientPlaceholderPage";
import { ClientDashboardPage } from "./pages/ClientDashboardPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DraftQueuePage } from "./pages/DraftQueuePage";
import { GmailExportOpsPage } from "./pages/GmailExportOpsPage";
import { GoogleSheetsPage } from "./pages/GoogleSheetsPage";
import { LoginPage } from "./pages/LoginPage";
import { MailQueuePage } from "./pages/MailQueuePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OpsPage } from "./pages/OpsPage";
import { PushbackPage } from "./pages/PushbackPage";
import { ResponsePolicyPage } from "./pages/ResponsePolicyPage";

function RootRedirect() {
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: getCurrentUser,
  });

  if (sessionQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-5 text-sm text-slate-600">
        Checking session...
      </div>
    );
  }

  return (
    <Navigate
      replace
      to={sessionQuery.data ? getAuthenticatedHomePath(sessionQuery.data) : "/login"}
    />
  );
}

function ClientAppRouteGuard() {
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

  return <Outlet context={sessionQuery.data} />;
}

export function App() {
  return (
    <Routes>
      <Route element={<RootRedirect />} path="/" />
      <Route element={<LoginPage />} path="/login" />
      <Route element={<ClientInboxPreviewPage />} path="/app/client-inbox-preview" />
      <Route element={<ClientProtectedRoute />}>
        <Route
          element={
            <ClientPlaceholderPage title="Tableau de bord">
              Le tableau de bord client arrive dans une prochaine étape.
            </ClientPlaceholderPage>
          }
          path="/dashboard"
        />
        <Route element={<ClientInboxLivePage />} path="/inbox" />
        <Route element={<ClientConfigPage />} path="/config" />
      </Route>
      <Route element={<ClientAppRouteGuard />} path="/app/client">
        <Route element={<ClientInboxLivePage />} path="inbox" />
      </Route>
      <Route element={<ProtectedRoute />} path="/app">
        <Route index element={<DashboardPage />} />
        <Route element={<PushbackPage />} path="pushback" />
        <Route element={<ClientDashboardPage />} path="client-dashboard" />
        <Route element={<ClientInboxLabPage />} path="client-inbox-lab" />
        <Route element={<ClientInstallPage />} path="client-install" />
        <Route element={<ClientUsersPage />} path="client-users" />
        <Route element={<DraftQueuePage />} path="draft-queue" />
        <Route element={<MailQueuePage />} path="mail-queue" />
        <Route element={<ResponsePolicyPage />} path="response-policy" />
        <Route element={<GmailExportOpsPage />} path="gmail-export" />
        <Route element={<ApiKeysPage />} path="api-keys" />
        <Route element={<GoogleSheetsPage />} path="google-sheets" />
        <Route element={<OpsPage />} path="ops" />
      </Route>
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}
