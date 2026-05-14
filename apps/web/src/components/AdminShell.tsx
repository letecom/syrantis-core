import type { ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { logout } from "../lib/api-client";
import type { CurrentUser } from "../lib/api-client";

type AdminShellProps = {
  user: CurrentUser;
  children?: ReactNode;
};

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-md px-3 py-2 text-sm font-medium transition",
    isActive
      ? "bg-white text-brand shadow-sm"
      : "text-slate-100 hover:bg-white/10 hover:text-white",
  ].join(" ");

export function AdminShell({ user, children }: AdminShellProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const displayName = user.name?.trim() || user.email;

  async function handleLogout() {
    try {
      await logout();
    } finally {
      queryClient.clear();
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-ink">
      <div className="grid min-h-screen lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="bg-brand px-5 py-5 text-white lg:min-h-screen">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div>
              <p className="text-xs font-semibold uppercase text-orange-200">Syrantis</p>
              <h1 className="mt-1 text-xl font-semibold">Syrantis Admin</h1>
            </div>
          </div>
          <nav className="mt-6 flex gap-2 lg:grid" aria-label="Admin">
            <NavLink className={navLinkClass} end to="/app">
              Dashboard
            </NavLink>
            <NavLink className={navLinkClass} to="/app/pushback">
              Pushback
            </NavLink>
            <NavLink className={navLinkClass} to="/app/client-dashboard">
              Client Dashboard
            </NavLink>
            <NavLink className={navLinkClass} to="/app/client-install">
              Client Install
            </NavLink>
            <NavLink className={navLinkClass} to="/app/gmail-export">
              Gmail Export
            </NavLink>
            <NavLink className={navLinkClass} to="/app/api-keys">
              API Keys
            </NavLink>
            <NavLink className={navLinkClass} to="/app/google-sheets">
              Google Sheets
            </NavLink>
            <NavLink className={navLinkClass} to="/app/ops">
              Ops
            </NavLink>
          </nav>
        </aside>
        <div className="flex min-h-screen flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-4">
            <div>
              <p className="text-sm font-medium text-slate-700">{displayName}</p>
              <p className="text-xs uppercase text-slate-500">{user.role}</p>
            </div>
            <button
              className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={handleLogout}
              type="button"
            >
              Logout
            </button>
          </header>
          <main className="flex-1 px-5 py-6">{children ?? <Outlet />}</main>
        </div>
      </div>
    </div>
  );
}
