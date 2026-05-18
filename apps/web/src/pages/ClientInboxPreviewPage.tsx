import "../styles/client-design-tokens.css";

type IconName =
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

type Message = {
  id: string;
  initials: string;
  color: string;
  sender: string;
  company: string;
  time: string;
  subject: string;
  preview: string;
  scoreLabel: string;
  scoreClass: "hot" | "warm" | "cold";
  badges: Array<{ label: string; className: string }>;
  selected?: boolean;
};

const messages: Message[] = [
  {
    id: "pierre-belanger",
    initials: "PB",
    color: "",
    sender: "Pierre Belanger",
    company: "Belanger Rénovation",
    time: "09:42",
    subject: "Demande de devis – Isolation garage",
    preview: "Bonjour, je souhaite isoler mon garage de...",
    scoreLabel: "Chaud 82",
    scoreClass: "hot",
    selected: true,
    badges: [
      { label: "Demande de devis", className: "category" },
      { label: "Contact existant · 3 échanges", className: "contact" },
      { label: "Brouillon prêt", className: "ready" },
    ],
  },
  {
    id: "anne-caron",
    initials: "AC",
    color: "blue",
    sender: "Anne Caron",
    company: "Caron Paysage",
    time: "08:15",
    subject: "Entretien annuel de notre terrain",
    preview: "Bonjour, pouvez-vous nous faire parvenir...",
    scoreLabel: "Tiède 61",
    scoreClass: "warm",
    badges: [
      { label: "Intervention urgente", className: "category" },
      { label: "Contact existant · 1 échange", className: "contact" },
      { label: "Validation requise", className: "approval" },
    ],
  },
  {
    id: "marc-dubois",
    initials: "MC",
    color: "violet",
    sender: "Marc Dubois",
    company: "MD Menuiserie",
    time: "Hier",
    subject: "Suivi sur la proposition",
    preview: "Merci pour votre proposition. Nous aurions...",
    scoreLabel: "Tiède 58",
    scoreClass: "warm",
    badges: [
      { label: "Relance", className: "category" },
      { label: "Contact existant · 2 échanges", className: "contact" },
      { label: "Brouillon prêt", className: "ready" },
    ],
  },
  {
    id: "sophie-leblanc",
    initials: "SL",
    color: "amber",
    sender: "Sophie Leblanc",
    company: "Leblanc Immobilier",
    time: "Hier",
    subject: "Problème fuite - Intervention rapide",
    preview: "Nous avons une fuite d'eau dans notre local...",
    scoreLabel: "Chaud 76",
    scoreClass: "hot",
    badges: [
      { label: "Intervention urgente", className: "category" },
      { label: "Contact existant · 5 échanges", className: "contact" },
      { label: "Validation requise", className: "approval" },
    ],
  },
  {
    id: "julien-moreau",
    initials: "JM",
    color: "mint",
    sender: "Julien Moreau",
    company: "Moreau Consulting",
    time: "21 mai",
    subject: "Partenariat potentiel",
    preview: "Bonjour, nous accompagnons des PME...",
    scoreLabel: "Froid 29",
    scoreClass: "cold",
    badges: [
      { label: "Partenariat", className: "neutral" },
      { label: "Nouveau contact", className: "neutral" },
      { label: "Aucun brouillon", className: "neutral" },
    ],
  },
  {
    id: "caroline-petit",
    initials: "CP",
    color: "red",
    sender: "Caroline Petit",
    company: "Studio CP",
    time: "20 mai",
    subject: "Question sur vos services",
    preview: "Bonjour, j'aimerais en savoir plus sur vos...",
    scoreLabel: "Froid 24",
    scoreClass: "cold",
    badges: [
      { label: "Demande d'information", className: "neutral" },
      { label: "Nouveau contact", className: "neutral" },
      { label: "Aucun brouillon", className: "neutral" },
    ],
  },
  {
    id: "newsletter",
    initials: "NL",
    color: "gray",
    sender: "Newsletter",
    company: "Syrantis",
    time: "19 mai",
    subject: "Nouveautés - Mai 2024",
    preview: "Découvrez les dernières fonctionnalités...",
    scoreLabel: "Ignoré",
    scoreClass: "cold",
    badges: [
      { label: "Newsletter ignorée", className: "ignored" },
      { label: "Système", className: "neutral" },
      { label: "Aucun brouillon", className: "neutral" },
    ],
  },
];

const filters = [
  { label: "À traiter", count: 7, active: true },
  { label: "Leads chauds", count: 3, active: false },
  { label: "Contact existant", count: 5, active: false },
  { label: "Brouillon prêt", count: 4, active: false },
  { label: "Ignorés", count: 2, active: false },
];

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
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

  const paths: Record<Exclude<IconName, "spark">, string> = {
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

function ClientSidebar() {
  return (
    <aside className="client-sidebar" aria-label="Application client">
      <div className="client-brand">
        <span className="client-brand-mark">
          <Icon className="blue" name="spark" />
        </span>
        <span>syrantis</span>
      </div>

      <nav className="client-sidebar-nav" aria-label="Navigation client">
        <button className="client-nav-item" type="button">
          <Icon className="muted" name="dashboard" />
          <span>Tableau de bord</span>
        </button>
        <button className="client-nav-item is-active" type="button">
          <Icon name="mail" />
          <span>Boîte de réception</span>
          <span className="client-nav-count">7</span>
        </button>
        <button className="client-nav-item" type="button">
          <Icon className="muted" name="config" />
          <span>Configuration</span>
        </button>
      </nav>

      <div className="client-sidebar-footer">
        <div className="client-workspace-card">
          <div className="client-workspace-main">
            <span className="client-workspace-icon">
              <Icon className="small" name="building" />
            </span>
            <strong>Lumière Services</strong>
          </div>
          <Icon className="small muted" name="chevronDown" />
        </div>
        <div className="client-user-card">
          <div className="client-user-main">
            <span className="client-user-avatar">TM</span>
            <div>
              <strong>Thomas Martin</strong>
              <p className="client-user-role">Administrateur</p>
            </div>
          </div>
          <Icon className="small muted" name="chevronUp" />
        </div>
      </div>
    </aside>
  );
}

function TopSearchBar() {
  return (
    <header className="client-topbar">
      <div>
        <h1 className="client-page-title">Boîte de réception</h1>
        <p className="client-page-subtitle">Messages et demandes priorisés par l’IA</p>
      </div>

      <label className="client-search">
        <Icon className="muted" name="search" />
        <input
          aria-label="Rechercher des messages"
          placeholder="Rechercher messages, contacts, entreprises..."
          readOnly
          value=""
        />
        <span className="client-keycap">K</span>
      </label>

      <div className="client-top-actions">
        <div className="client-picker" aria-label="Sélecteur d’espace client">
          <Icon className="blue" name="building" />
          <span>Lumière Services</span>
          <Icon className="small muted" name="chevronDown" />
        </div>
        <span className="client-top-divider" />
        <button aria-label="Notifications" className="client-icon-button" type="button">
          <Icon name="bell" />
        </button>
        <button aria-label="Aide" className="client-icon-button" type="button">
          <Icon name="help" />
        </button>
      </div>
    </header>
  );
}

function InboxFilterPills() {
  return (
    <div className="client-filter-row">
      <div className="client-filter-pills" aria-label="Filtres de la boîte de réception">
        {filters.map((filter) => (
          <button
            className={["client-filter-pill", filter.active ? "is-active" : ""].join(" ")}
            key={filter.label}
            type="button"
          >
            <span className="client-pill-dot" />
            <span>{filter.label}</span>
            <span className="client-pill-count">{filter.count}</span>
          </button>
        ))}
      </div>
      <div className="client-sort-group">
        <button className="client-sort-button" type="button">
          Tri : plus récents <Icon className="small" name="chevronDown" />
        </button>
        <button aria-label="Filtrer les messages" className="client-filter-button" type="button">
          <Icon name="filter" />
        </button>
      </div>
    </div>
  );
}

function ScoreBadge({ className, label }: { className: Message["scoreClass"]; label: string }) {
  return <span className={`client-badge ${className}`}>{label}</span>;
}

function StatusBadge({ className, label }: { className: string; label: string }) {
  return <span className={`client-badge ${className}`}>{label}</span>;
}

function InboxMessageItem({ message }: { message: Message }) {
  return (
    <article className={["client-message-item", message.selected ? "is-selected" : ""].join(" ")}>
      <span className={["client-initials", message.color].filter(Boolean).join(" ")}>
        {message.initials}
      </span>
      <div className="client-message-content">
        <div className="client-message-meta">
          <span className="client-message-name">{message.sender}</span>
          <span className="client-message-company">{message.company}</span>
        </div>
        <p className="client-message-subject">{message.subject}</p>
        <p className="client-message-preview">{message.preview}</p>
        <div className="client-message-badges">
          {message.badges.map((badge) => (
            <StatusBadge
              className={badge.className}
              key={`${message.id}-${badge.label}`}
              label={badge.label}
            />
          ))}
        </div>
      </div>
      <div className="client-message-side">
        <span className="client-message-time">{message.time}</span>
        {message.scoreLabel === "Ignoré" ? (
          <StatusBadge className="ignored" label={message.scoreLabel} />
        ) : (
          <ScoreBadge className={message.scoreClass} label={message.scoreLabel} />
        )}
      </div>
    </article>
  );
}

function MailReadingPanel() {
  return (
    <section className="client-panel client-reading-panel" aria-label="Message ouvert">
      <div className="client-mail-toolbar">
        <div className="client-toolbar-left">
          <span className="client-toolbar-round">
            <Icon name="arrowLeft" />
          </span>
          <Icon className="muted" name="clock" />
          <Icon className="muted" name="tag" />
          <Icon className="muted" name="mail" />
        </div>
        <div className="client-toolbar-right">
          <Icon className="muted" name="more" />
        </div>
      </div>

      <div className="client-mail-body">
        <div className="client-mail-heading">
          <h2>Demande de devis – Isolation garage</h2>
          <span className="client-mail-label">Boîte de réception</span>
        </div>

        <div className="client-mail-sender">
          <span className="client-initials">PB</span>
          <div>
            <p className="client-mail-from">Pierre Belanger</p>
            <p className="client-mail-address">pierre.belanger@email.com</p>
            <p className="client-mail-recipient">à contact@lumiereservices.fr</p>
          </div>
          <div>
            <p className="client-mail-date">Aujourd’hui, 09:42</p>
            <div className="client-mail-actions">
              <Icon className="small muted" name="arrowLeft" />
              <Icon className="small muted" name="more" />
            </div>
          </div>
        </div>

        <div className="client-mail-text">
          <p>Bonjour,</p>
          <p>
            Nous souhaitons isoler notre garage qui sert aussi d'atelier. Surface approximative : 35
            m2. Idéalement, nous aimerions une intervention d'ici fin juin.
          </p>
          <p>Pouvez-vous nous faire parvenir un devis avec les différentes options possibles ?</p>
          <p>Merci d'avance,</p>
          <p>
            Pierre Belanger
            <br />
            418-555-0147
          </p>
          <button
            aria-label="Plus d’actions sur le message"
            className="client-more-button"
            type="button"
          >
            <Icon className="small" name="more" />
          </button>
        </div>
      </div>

      <QuickContextCard />
    </section>
  );
}

function QuickContextCard() {
  return (
    <div className="client-context-section">
      <div className="client-context-block">
        <h3 className="client-context-title">
          <Icon className="small muted" name="shield" />
          Contexte rapide
        </h3>
        <div className="client-quick-grid">
          <span className="client-quick-item">
            <Icon className="xsmall muted" name="tag" />3 fils précédents
          </span>
          <span className="client-quick-item">
            <Icon className="xsmall muted" name="history" />
            Dernier sortant il y a 12 jours
          </span>
          <span className="client-quick-item">
            <Icon className="xsmall muted" name="clock" />
            Dernier entrant il y a 18 jours
          </span>
          <span className="client-quick-item">
            <Icon className="xsmall muted" name="history" />
            Client depuis févr. 2023
          </span>
        </div>
      </div>
      <div className="client-context-block">
        <h3 className="client-context-title">
          <Icon className="small muted" name="paperclip" />
          Pièces jointes
        </h3>
        <div className="client-attachment-row">
          <Icon className="xsmall muted" name="draft" />
          <span>Devis_isolation_garage.pdf</span>
          <span>512 KB</span>
        </div>
      </div>
    </div>
  );
}

function SyrantisAnalysisPanel() {
  return (
    <section className="client-ai-card" aria-label="Analyse IA Syrantis">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <Icon className="violet" name="spark" />
          Analyse IA Syrantis
        </h2>
        <Icon className="small muted" name="chevronUp" />
      </div>
      <div className="client-card-body client-analysis-grid">
        <div className="client-analysis-row">
          <Icon className="small blue" name="tag" />
          <span className="client-analysis-label">Intention</span>
          <span>Demande de devis</span>
        </div>
        <div className="client-analysis-row">
          <Icon className="small blue" name="clock" />
          <span className="client-analysis-label">Urgence</span>
          <span>Élevée - souhaite une intervention avant fin juin</span>
        </div>
        <div className="client-analysis-row">
          <Icon className="small blue" name="spark" />
          <span className="client-analysis-label">Action recommandée</span>
          <span>Envoyer un devis détaillé avec options</span>
        </div>
        <div className="client-analysis-row">
          <Icon className="small blue" name="chart" />
          <span className="client-analysis-label">Confiance</span>
          <div className="client-confidence">
            <span>92%</span>
            <span className="client-confidence-bar">
              <span />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactContextCard() {
  return (
    <section className="client-ai-card" aria-label="Contexte contact">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <Icon className="blue" name="user" />
          Contexte contact
        </h2>
      </div>
      <div className="client-card-body">
        <div className="client-context-card-top">
          <div>
            <p className="client-card-kicker">
              Pierre Belanger <StatusBadge className="contact" label="Contact existant" />
            </p>
            <p className="client-card-muted">Belanger Rénovation - belanger.ca</p>
            <p className="client-card-muted">Contact existant, dernier sortant il y a 12 jours</p>
          </div>
          <button className="client-secondary-button" type="button">
            Voir l’historique
          </button>
        </div>
      </div>
    </section>
  );
}

function CompanyPolicyContextCard() {
  return (
    <section className="client-ai-card" aria-label="Contexte entreprise et règles">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <Icon className="violet" name="shield" />
          Contexte entreprise & règles
        </h2>
      </div>
      <div className="client-card-body">
        <div className="client-context-card-top">
          <div>
            <p className="client-card-kicker">Règles de ton Lumière Services</p>
            <ul className="client-policy-list">
              <li>Ton amical, professionnel, orienté solution.</li>
              <li>Toujours inclure garantie et délais.</li>
              <li>Ne jamais partager les tables tarifaires internes.</li>
            </ul>
            <p className="client-policy-match">
              <Icon className="xsmall" name="check" />
              Règles respectées : 98%
            </p>
          </div>
          <button className="client-secondary-button" type="button">
            Modifier
          </button>
        </div>
      </div>
    </section>
  );
}

function AiDraftReplyCard() {
  return (
    <section className="client-ai-card" aria-label="Brouillon IA">
      <div className="client-card-header">
        <h2 className="client-card-title">
          <Icon className="violet" name="spark" />
          Brouillon IA
        </h2>
        <button className="client-secondary-button" type="button">
          Modifier le brouillon
        </button>
      </div>
      <div className="client-card-body">
        <div className="client-draft-box">
          <p className="client-draft-text">Bonjour M. Belanger,</p>
          <p className="client-draft-text">
            Merci pour votre message et pour votre confiance. Nous serions ravis de vous accompagner
            dans l'isolation de votre garage/atelier.
          </p>
          <p className="client-draft-text">
            Je peux vous proposer deux options avec les délais disponibles en juin. Je vous envoie
            le détail pour validation avant la fin de journée.
          </p>
          <Icon className="small muted" name="chevronDown" />
        </div>
      </div>
      <GmailExportActions />
    </section>
  );
}

function GmailExportActions() {
  return (
    <div className="client-action-row">
      <button className="client-primary-action" type="button">
        <Icon name="check" />
        Valider
      </button>
      <button className="client-export-action" type="button">
        <span aria-hidden="true" className="client-gmail-mark">
          M
        </span>
        Exporter vers Gmail
      </button>
      <button
        aria-label="Plus d’actions sur le brouillon"
        className="client-menu-action"
        type="button"
      >
        <Icon name="chevronDown" />
      </button>
    </div>
  );
}

function IntelligencePanel() {
  return (
    <aside className="client-ai-panel">
      <SyrantisAnalysisPanel />
      <ContactContextCard />
      <CompanyPolicyContextCard />
      <AiDraftReplyCard />
    </aside>
  );
}

export function ClientInboxPreviewPage() {
  return (
    <div className="client-inbox-preview">
      <div className="client-app-shell">
        <ClientSidebar />
        <main className="client-app-main">
          <TopSearchBar />
          <InboxFilterPills />
          <div className="client-inbox-grid">
            <section className="client-message-list" aria-label="Messages priorisés">
              {messages.map((message) => (
                <InboxMessageItem key={message.id} message={message} />
              ))}
            </section>
            <MailReadingPanel />
            <IntelligencePanel />
          </div>
        </main>
      </div>
    </div>
  );
}
