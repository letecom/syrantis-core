export type ClientInboxIconName =
  | "arrowLeft"
  | "bell"
  | "building"
  | "chart"
  | "check"
  | "chevronDown"
  | "chevronUp"
  | "clock"
  | "config"
  | "dashboard"
  | "draft"
  | "filter"
  | "help"
  | "history"
  | "inbox"
  | "mail"
  | "more"
  | "paperclip"
  | "search"
  | "shield"
  | "spark"
  | "tag"
  | "user";

type ClientInboxIconProps = {
  name: ClientInboxIconName;
  className?: string;
};

export function ClientInboxIcon({ name, className = "" }: ClientInboxIconProps) {
  const classes = ["client-icon", className].filter(Boolean).join(" ");

  if (name === "spark") {
    return (
      <svg aria-hidden="true" className={classes} fill="none" viewBox="0 0 24 24">
        <path
          d="M12 2l2.2 6.1L20 10.4l-5.8 2.2L12 19l-2.2-6.4L4 10.4l5.8-2.3L12 2z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"
          fill="currentColor"
        />
      </svg>
    );
  }

  const paths: Record<Exclude<ClientInboxIconName, "spark">, string> = {
    arrowLeft: "M19 12H5 M11 6l-6 6 6 6",
    bell: "M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2z M10 21h4",
    building: "M5 21V7l7-4 7 4v14 M9 21v-7h6v7 M8 9h1 M12 9h1 M16 9h1",
    chart: "M5 19V9 M12 19V5 M19 19v-8 M3 19h18",
    check: "M5 12.5l4.2 4.2L19 7",
    chevronDown: "M6 9l6 6 6-6",
    chevronUp: "M6 15l6-6 6 6",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
    config:
      "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19 12h2 M3 12h2 M17 5l1.4-1.4 M5.6 18.4 1.4-1.4 M12 3V1 M12 23v-2 M5.6 5.6 4.2 4.2 M18.4 18.4 16.9 16.9",
    dashboard: "M5 5h5v5H5V5z M14 5h5v5h-5V5z M5 14h5v5H5v-5z M14 14h5v5h-5v-5z",
    draft: "M6 3h9l3 3v15H6V3z M14 3v4h4 M9 13h6 M9 17h4",
    filter: "M4 6h16 M7 12h10 M10 18h4",
    help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.8 9a2.3 2.3 0 1 1 3.5 2c-.8.5-1.3 1-1.3 2 M12 17h.01",
    history: "M4 12a8 8 0 1 0 2.3-5.7L4 8 M4 4v4h4 M12 8v5l3 2",
    inbox: "M4 7h16v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7z M4 13h4l2 3h4l2-3h4",
    mail: "M4 6h16v12H4V6z M4 7l8 6 8-6",
    more: "M5 12h.01 M12 12h.01 M19 12h.01",
    paperclip: "M8 12.5l5.8-5.8a3.2 3.2 0 0 1 4.5 4.5l-7.2 7.2a5 5 0 0 1-7.1-7.1l7.5-7.5",
    search: "M11 19a8 8 0 1 1 5.7-2.3L21 21",
    shield: "M12 3l7 3v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3z",
    tag: "M4 11V4h7l9 9-7 7-9-9z M8 8h.01",
    user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  };

  return (
    <svg aria-hidden="true" className={classes} fill="none" viewBox="0 0 24 24">
      <path
        d={paths[name]}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
