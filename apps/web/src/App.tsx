import { useMemo, useState } from "react";
import { Pipeline } from "./pages/Pipeline";
import { Settings } from "./pages/Settings";
import { Tasks } from "./pages/Tasks";

type PageKey = "pipeline" | "tasks" | "settings";

const pages: Array<{ key: PageKey; label: string }> = [
  { key: "pipeline", label: "Pipeline" },
  { key: "tasks", label: "Tasks" },
  { key: "settings", label: "Settings" }
];

export function App() {
  const [activePage, setActivePage] = useState<PageKey>("pipeline");

  const page = useMemo(() => {
    switch (activePage) {
      case "pipeline":
        return <Pipeline />;
      case "tasks":
        return <Tasks />;
      case "settings":
        return <Settings />;
    }
  }, [activePage]);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div>
          <p className="eyebrow">Syrantis Core</p>
          <h1>Delivery shell</h1>
        </div>
        <nav className="nav-list">
          {pages.map((item) => (
            <button
              aria-current={activePage === item.key ? "page" : undefined}
              className="nav-button"
              key={item.key}
              onClick={() => setActivePage(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="content-area">{page}</section>
    </main>
  );
}
