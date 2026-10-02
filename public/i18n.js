/* Interface language (English / German).
   The UI is rendered from English templates; this layer translates the rendered DOM after every
   render: exact phrases, a few patterns, dates and amounts. Single-word entries are applied only
   inside interface elements (buttons, labels, headers, menus, badges) so user content such as a
   phase called "Design" is never changed. */
const I18N_UI_SCOPE =
  "button, a.btn, th, label, legend, summary, option, nav a, .status, .tag, .cc-label, .eyebrow, .pa-pill, .sr-risk, .in-col header b, .ui-count, .stage-flow span, .sr-chips a, .ob-count, h1, h2, h3, h4, dt, .panel-title small, kbd, .ng-title, .ds-ui";
const I18N_DE = {
  // Navigation & shell
  Dashboard: "Übersicht",
  Analytics: "Analysen",
  Approvals: "Freigaben",
  Projects: "Projekte",
  Sourcing: "Beschaffung",
  Contracts: "Verträge",
  "Offers overview": "Angebotsübersicht",
  "Find suppliers": "Lieferanten finden",
  Invoices: "Rechnungen",
  Inbox: "Posteingang",
  "Time approvals": "Zeitfreigaben",
  Messages: "Nachrichten",
  "Profile / Settings": "Profil / Einstellungen",
  "Bid opportunities": "Ausschreibungen",
  "Assigned work": "Zugewiesene Arbeit",
  "Time & approvals": "Zeiten & Freigaben",
  "Admin Dashboard": "Admin-Übersicht",
  "Vetting Queue": "Prüfwarteschlange",
  Users: "Benutzer",
  "Payments & Billing": "Zahlungen & Abrechnung",
  "Reports & Analytics": "Berichte & Analysen",
  "Audit log": "Audit-Protokoll",
  Escalations: "Eskalationen",
  Settings: "Einstellungen",
  Search: "Suche",
  "Log out": "Abmelden",
  "Log in": "Anmelden",
  "How it works": "So funktioniert es",
  Pricing: "Preise",
  FAQ: "FAQ",
  "Industrial services, coordinated end-to-end.": "Industrielle Dienstleistungen, durchgängig koordiniert.",
  Notifications: "Benachrichtigungen",
  "Building industry together.": "Gemeinsam Industrie gestalten.",
  Impressum: "Impressum",
  "Privacy policy": "Datenschutzerklärung",
  "Terms of use": "Nutzungsbedingungen",
  "Impressum / Legal notice": "Impressum",
  "Signed in as": "Angemeldet als",
  // Common actions
  Save: "Speichern",
  Cancel: "Abbrechen",
  Close: "Schließen",
  Edit: "Bearbeiten",
  Delete: "Löschen",
  Open: "Öffnen",
  View: "Ansehen",
  Review: "Prüfen",
  Download: "Herunterladen",
  Upload: "Hochladen",
  Apply: "Anwenden",
  Reset: "Zurücksetzen",
  Done: "Fertig",
  Copy: "Kopieren",
  Hide: "Ausblenden",
  Preview: "Vorschau",
  "Export CSV": "CSV exportieren",
  "Apply filters": "Filter anwenden",
  Grid: "Raster",
  List: "Liste",
  Map: "Karte",
  "Board view": "Board-Ansicht",
  "Open in new tab": "In neuem Tab öffnen",
  Send: "Senden",
  Submit: "Absenden",
  Approve: "Freigeben",
  Reject: "Ablehnen",
  "Request changes": "Änderungen anfordern",
  Award: "Zuschlag erteilen",
  "Request a quote": "Angebot anfragen",
  Documents: "Dokumente",
  "+ New chat": "+ Neuer Chat",
  "+ Log time": "+ Zeit erfassen",
  "+ Upload document": "+ Dokument hochladen",
  "Open project": "Projekt öffnen",
  "Project documents": "Projektdokumente",
  "Project messages": "Projektnachrichten",
  "Save review": "Prüfung speichern",
  "Put on hold": "Zurückstellen",
  "Approve & assign badge": "Freigeben & Badge vergeben",
  "Return to review queue": "Zurück in die Prüfung",
  Suspend: "Sperren",
  Reactivate: "Reaktivieren",
  "Reset password": "Passwort zurücksetzen",
  "Send test email": "Test-E-Mail senden",
  "Save platform settings": "Plattformeinstellungen speichern",
  "Save legal pages": "Rechtstexte speichern",
  "Change password": "Passwort ändern",
  "Sign out other sessions": "Andere Sitzungen abmelden",
  "Save preferences": "Einstellungen speichern",
  "Save payout details": "Auszahlungsdaten speichern",
  "Change payout account": "Auszahlungskonto ändern",
  "Edit company details": "Unternehmensdaten bearbeiten",
  "Manage service catalog and team": "Leistungskatalog & Team verwalten",
  "Manage team & service catalog": "Team & Leistungskatalog verwalten",
  "Start a project": "Projekt starten",
  "Explore suppliers": "Lieferanten entdecken",
  "Start as a customer": "Als Kunde starten",
  "Apply as a supplier": "Als Lieferant bewerben",
  "Browse the full directory →": "Zum vollständigen Verzeichnis →",
  "Sign in": "Anmelden",
  "Try again": "Erneut versuchen",
  Retry: "Erneut versuchen",
  "Get started": "Loslegen",
  "Search chats or people": "Chats oder Personen suchen",
  "Write a message...": "Nachricht schreiben …",
  browse: "durchsuchen",
  "Open project": "Projekt öffnen",
  // Dashboards & panels
  "Customer dashboard": "Kunden-Übersicht",
  "Supplier dashboard": "Lieferanten-Übersicht",
  "Admin dashboard": "Admin-Übersicht",
  "Coordinate active projects, phases and payments.": "Aktive Projekte, Phasen und Zahlungen koordinieren.",
  Completed: "Abgeschlossen",
  "Invoices to review": "Zu prüfende Rechnungen",
  "Nothing is overdue.": "Nichts ist überfällig.",
  "No messages yet.": "Noch keine Nachrichten.",
  "Vetting queue": "Prüfwarteschlange",
  "Invoice status": "Rechnungsstatus",
  "Getting started": "Erste Schritte",
  // Onboarding
  "GETTING STARTED": "ERSTE SCHRITTE",
  "Complete your company profile": "Unternehmensprofil vervollständigen",
  "Create your first project": "Erstes Projekt anlegen",
  "Source a supplier for a task": "Lieferanten für eine Aufgabe finden",
  "Choose email notifications": "E-Mail-Benachrichtigungen wählen",
  "Get verified": "Verifizieren lassen",
  "Publish your service catalog": "Leistungskatalog veröffentlichen",
  "Add payout details": "Auszahlungsdaten hinterlegen",
  "Answer your first sourcing event": "Erste Ausschreibung beantworten",
  "Change the bootstrap password": "Startpasswort ändern",
  "Publish Impressum and privacy policy": "Impressum und Datenschutzerklärung veröffentlichen",
  "Review platform settings": "Plattformeinstellungen prüfen",
  "Confirm email delivery": "E-Mail-Versand bestätigen",
  "Decide your first supplier application": "Erste Lieferantenbewerbung entscheiden",
  "Edit profile": "Profil bearbeiten",
  "New project": "Neues Projekt",
  "Find suppliers": "Lieferanten finden",
  "Apply now": "Jetzt bewerben",
  "Apply again": "Erneut bewerben",
  "Service catalog": "Leistungskatalog",
  "Add IBAN": "IBAN hinterlegen",
  Opportunities: "Ausschreibungen",
  Security: "Sicherheit",
  "Legal pages": "Rechtstexte",
  "Email outbox": "E-Mail-Ausgang",
  // Landing page
  "INDUSTRIAL SERVICES, COORDINATED": "INDUSTRIELLE DIENSTLEISTUNGEN, KOORDINIERT",
  "Build complex projects with trusted crews.": "Komplexe Projekte mit verlässlichen Teams umsetzen.",
  "WHY CRAFTCREW": "WARUM CRAFTCREW",
  "One platform for the whole industrial delivery chain.":
    "Eine Plattform für die gesamte industrielle Lieferkette.",
  "Vetted suppliers": "Geprüfte Lieferanten",
  "Waterfall control": "Phasensteuerung",
  "Invoice workflow": "Rechnungs-Workflow",
  "Industrial collaboration": "Industrielle Zusammenarbeit",
  "From supplier application to project completion.":
    "Von der Lieferantenbewerbung bis zum Projektabschluss.",
  "FOR BOTH SIDES": "FÜR BEIDE SEITEN",
  "FEATURED SUPPLIERS": "AUSGEWÄHLTE LIEFERANTEN",
  "Vetted partners ready for your next project": "Geprüfte Partner für Ihr nächstes Projekt",
  "Approvals inbox": "Freigabe-Eingang",
  "Ready to coordinate your next industrial project?": "Bereit für Ihr nächstes Industrieprojekt?",
  "Customers start free. Suppliers join after a 5-step verification.":
    "Kunden starten kostenlos. Lieferanten nach einer 5-stufigen Prüfung.",
  "vetted suppliers": "geprüfte Lieferanten",
  "supplier vetting": "Lieferantenprüfung",
  "waterfall delivery": "Phasenplanung",
  "projects & payments": "Projekte & Zahlungen",
  Service: "Leistung",
  Badge: "Badge",
  Name: "Name",
  Company: "Unternehmen",
  Customer: "Kunde",
  Supplier: "Lieferant",
  Email: "E-Mail",
  Password: "Passwort",
  "Choose a new password": "Neues Passwort wählen",
  "Password changed": "Passwort geändert",
  // Projects & work
  Budget: "Budget",
  Schedule: "Zeitplan",
  Delivery: "Lieferung",
  "PROJECT WORKSPACE": "PROJEKTARBEITSBEREICH",
  "TASK BOARD": "AUFGABEN-BOARD",
  Tasks: "Aufgaben",
  Status: "Status",
  Estimate: "Schätzung",
  "Supplier request history": "Anfragehistorie",
  "Progress updates": "Fortschrittsmeldungen",
  "All phases": "Alle Phasen",
  Unassigned: "Nicht zugewiesen",
  "Description *": "Beschreibung *",
  Requirements: "Anforderungen",
  Project: "Projekt",
  Phase: "Phase",
  Task: "Aufgabe",
  "Work status": "Arbeitsstatus",
  Communication: "Kommunikation",
  Comment: "Kommentar",
  "Project root": "Projektebene",
  "Search this project": "Projekt durchsuchen",
  // Sourcing & contracts
  Event: "Ausschreibung",
  Category: "Kategorie",
  Bids: "Angebote",
  Deadline: "Frist",
  "Supplier scorecards": "Lieferanten-Scorecards",
  "Supplier scorecard": "Lieferanten-Scorecard",
  "Supplier scorecards & risk": "Lieferanten-Scorecards & Risiko",
  Score: "Score",
  Rating: "Bewertung",
  Risk: "Risiko",
  Price: "Preis",
  "Supplier performance": "Lieferantenleistung",
  Offer: "Angebot",
  Scope: "Leistungsumfang",
  Title: "Titel",
  Contract: "Vertrag",
  Value: "Wert",
  Term: "Laufzeit",
  "New contract": "Neuer Vertrag",
  Start: "Beginn",
  End: "Ende",
  All: "Alle",
  "Invoices to approve": "Rechnungen zur Freigabe",
  "Documents to review": "Dokumente zur Prüfung",
  "Time entries to approve": "Zeiteinträge zur Freigabe",
  "Offers to decide": "Angebote zur Entscheidung",
  "Contracts to activate": "Verträge zur Aktivierung",
  "All clear.": "Alles erledigt.",
  "Nothing is waiting for your decision.": "Nichts wartet auf Ihre Entscheidung.",
  // Analytics
  "Project analytics": "Projektanalysen",
  "Business analytics": "Geschäftsanalysen",
  "All projects": "Alle Projekte",
  "Last 3 months": "Letzte 3 Monate",
  "Last 6 months": "Letzte 6 Monate",
  "Last 12 months": "Letzte 12 Monate",
  "Total budget": "Gesamtbudget",
  "Committed to suppliers": "An Lieferanten vergeben",
  Invoiced: "Abgerechnet",
  "Budget remaining": "Restbudget",
  "Schedule health": "Terminlage",
  "Budget vs. spend by project": "Budget vs. Ausgaben je Projekt",
  "Monthly spend": "Monatliche Ausgaben",
  "Spend by supplier": "Ausgaben je Lieferant",
  "Work status": "Arbeitsstatus",
  "Overdue work": "Überfällige Arbeiten",
  "Revenue paid": "Bezahlter Umsatz",
  Pipeline: "Pipeline",
  "Bid win rate": "Zuschlagsquote",
  "Invoice approval rate": "Rechnungsfreigabequote",
  "On-time delivery": "Liefertermintreue",
  "Approved hours this month": "Freigegebene Stunden diesen Monat",
  "Monthly revenue": "Monatlicher Umsatz",
  "Revenue by customer": "Umsatz je Kunde",
  "Approved hours by team member": "Freigegebene Stunden je Mitarbeiter",
  Offers: "Angebote",
  "No data yet.": "Noch keine Daten.",
  "No activity in this period yet.": "In diesem Zeitraum noch keine Aktivität.",
  Paid: "Bezahlt",
  "Committed (order caps)": "Vergeben (Auftragsobergrenzen)",
  "Reports & analytics": "Berichte & Analysen",
  "Financial report · last 6 months": "Finanzbericht · letzte 6 Monate",
  "Customer analytics": "Kundenanalysen",
  "Vetting funnel": "Prüftrichter",
  // Invoices, time, messages, settings
  "Invoices & payments": "Rechnungen & Zahlungen",
  Find: "Suchen",
  From: "Von",
  To: "Bis",
  Invoice: "Rechnung",
  "Project / phase / task": "Projekt / Phase / Aufgabe",
  Amount: "Betrag",
  "Download PDF": "PDF herunterladen",
  "Approve & schedule payment": "Freigeben & Zahlung planen",
  "Invoice positions": "Rechnungspositionen",
  "← Back to invoices": "← Zurück zu den Rechnungen",
  Chats: "Chats",
  "Company profile & settings": "Unternehmensprofil & Einstellungen",
  "Legal name": "Firmenname",
  "VAT / tax ID": "USt-IdNr. / Steuer-ID",
  Industry: "Branche",
  "Company size": "Unternehmensgröße",
  Address: "Adresse",
  Website: "Website",
  "Main contact": "Hauptansprechpartner",
  Phone: "Telefon",
  "Procurement email": "Einkaufs-E-Mail",
  About: "Über uns",
  "Email notifications": "E-Mail-Benachrichtigungen",
  "Current password": "Aktuelles Passwort",
  "New password": "Neues Passwort",
  "Repeat new password": "Neues Passwort wiederholen",
  "New messages": "Neue Nachrichten",
  "Invoices & payments ": "Rechnungen & Zahlungen",
  "Documents & approvals": "Dokumente & Freigaben",
  "Bids, offers & quote requests": "Ausschreibungen, Angebote & Anfragen",
  "Project & assignment updates": "Projekt- & Zuweisungsupdates",
  "Time entries": "Zeiteinträge",
  "Payouts & billing details": "Auszahlungen & Rechnungsdaten",
  "Account holder *": "Kontoinhaber *",
  "Bank name": "Bank",
  "Billing email": "Rechnungs-E-Mail",
  "Team & roles": "Team & Rollen",
  "Account settings": "Kontoeinstellungen",
  "Platform management": "Plattformverwaltung",
  Administrator: "Administrator",
  Role: "Rolle",
  // Statuses
  "In Progress": "In Bearbeitung",
  "Not Started": "Nicht begonnen",
  "On Hold": "Pausiert",
  Submitted: "Eingereicht",
  Approved: "Freigegeben",
  Rejected: "Abgelehnt",
  "Changes Requested": "Änderungen angefordert",
  Refunded: "Erstattet",
  Awarded: "Vergeben",
  Closed: "Geschlossen",
  Shortlist: "Engere Wahl",
  "Second round": "Zweite Runde",
  "Final round": "Finale Runde",
  Draft: "Entwurf",
  Active: "Aktiv",
  Expiring: "Läuft aus",
  Expired: "Abgelaufen",
  Terminated: "Beendet",
  "Pending approval": "Freigabe ausstehend",
  Pending: "Ausstehend",
  Accepted: "Angenommen",
  Declined: "Abgelehnt",
  "Not selected": "Nicht ausgewählt",
  Shared: "Geteilt",
  Sent: "Gesendet",
  Failed: "Fehlgeschlagen",
  Queued: "In Warteschlange",
  Suspended: "Gesperrt",
  Low: "Niedrig",
  Medium: "Mittel",
  High: "Hoch",
  Busy: "Ausgelastet",
  Available: "Verfügbar",
  Reviewed: "Bewertet",
  New: "Neu",
};
Object.assign(I18N_DE, {
  // Onboarding descriptions
  "Legal name, address and procurement contact appear on invoices and supplier requests.":
    "Firmenname, Adresse und Einkaufskontakt erscheinen auf Rechnungen und Lieferantenanfragen.",
  "Pick a template to generate phases and tasks, set budget and dates.":
    "Vorlage wählen, um Phasen und Aufgaben zu erzeugen; Budget und Termine festlegen.",
  "Invite a vetted supplier directly or run a sourcing event to compare offers.":
    "Einen geprüften Lieferanten direkt einladen oder eine Ausschreibung zum Angebotsvergleich starten.",
  "Decide which events should also reach you by email.":
    "Legen Sie fest, welche Ereignisse Sie zusätzlich per E-Mail erhalten.",
  "Legal name, address and tax ID are printed on your invoices.":
    "Firmenname, Adresse und Steuer-ID werden auf Ihre Rechnungen gedruckt.",
  "Your company is verified and visible in the directory.":
    "Ihr Unternehmen ist geprüft und im Verzeichnis sichtbar.",
  "Submit your company, insurance and certification evidence to be listed.":
    "Reichen Sie Unternehmens-, Versicherungs- und Zertifikatsnachweise ein, um gelistet zu werden.",
  "Services, rates, capacity and key people help customers choose you.":
    "Leistungen, Sätze, Kapazität und Schlüsselpersonen helfen Kunden bei der Auswahl.",
  "Your bank account is printed on invoices so customers can pay you.":
    "Ihre Bankverbindung wird auf Rechnungen gedruckt, damit Kunden zahlen können.",
  "Open bid opportunities and send an offer.": "Ausschreibungen öffnen und ein Angebot senden.",
  "Replace the initial administrator password with your own.":
    "Ersetzen Sie das Start-Passwort des Administrators durch Ihr eigenes.",
  "Required in Germany before inviting users.": "In Deutschland Pflicht, bevor Nutzer eingeladen werden.",
  "Service categories, badge criteria, platform fee and payment terms.":
    "Leistungskategorien, Badge-Kriterien, Plattformgebühr und Zahlungsbedingungen.",
  "Configure SMTP on the server (see DEPLOY.md), then send a test email.":
    "SMTP auf dem Server konfigurieren (siehe DEPLOY.md), dann eine Test-E-Mail senden.",
  "Send a test email from the email outbox.": "Eine Test-E-Mail aus dem E-Mail-Ausgang senden.",
  "Verify evidence and references, then approve with a badge.":
    "Nachweise und Referenzen prüfen, dann mit Badge freigeben.",
  // Page intros and panels
  "Budget, spend, schedule health and supplier spend across your projects.":
    "Budget, Ausgaben, Terminlage und Lieferantenausgaben über alle Projekte.",
  "No insurance evidence on file": "Kein Versicherungsnachweis hinterlegt",
  "No certifications listed": "Keine Zertifikate angegeben",
  "Currently marked as busy": "Derzeit als ausgelastet markiert",
  "Not verified or not live in the directory": "Nicht geprüft oder nicht im Verzeichnis",
  "downstream risk": "Folgerisiko",
  "Depends on phases": "Abhängig von Phasen",
  "Depends on": "Abhängig von",
  "Messages, bid updates, document reviews and work notifications in one place.":
    "Nachrichten, Angebotsupdates, Dokumentprüfungen und Arbeitsmeldungen an einem Ort.",
  "Mark all read": "Alle als gelesen markieren",
  "All types": "Alle Typen",
  "Review exact work dates, start and finish times, site, task and approval trail.":
    "Arbeitstage, Start- und Endzeiten, Einsatzort, Aufgabe und Freigabeverlauf prüfen.",
  "Entries for your projects": "Einträge für Ihre Projekte",
  "Filters also define which rows are included in the export.":
    "Die Filter bestimmen auch den Umfang des Exports.",
  "All companies": "Alle Unternehmen",
  "All tasks": "Alle Aufgaben",
  "All statuses": "Alle Status",
  "No hour estimate": "Keine Stundenschätzung",
  "By Customer": "Vom Kunden",
  You: "Sie",
  "Share the business identity and contacts project partners need.":
    "Unternehmensdaten und Kontakte für Projektpartner.",
  "Choose a strong, unique password.": "Wählen Sie ein starkes, einzigartiges Passwort.",
  "At least 10 characters with letters and numbers. Other signed-in devices are signed out.":
    "Mindestens 10 Zeichen mit Buchstaben und Zahlen. Andere angemeldete Geräte werden abgemeldet.",
  "In-app notifications are always on. Choose which events also send an email copy.":
    "Benachrichtigungen in der App sind immer aktiv. Wählen Sie, welche Ereignisse zusätzlich per E-Mail kommen.",
  "Revenue, pipeline, bid success, delivery performance and team utilisation.":
    "Umsatz, Pipeline, Angebotserfolg, Lieferleistung und Teamauslastung.",
  "Task invitations, supplier commitments, documentation and progress.":
    "Aufgabeneinladungen, Zusagen, Dokumentation und Fortschritt.",
  "YOUR MARKETPLACE PROFILE": "IHR MARKTPLATZPROFIL",
  "Manage individually priced services and the people qualified to deliver them.":
    "Einzeln bepreiste Leistungen und qualifiziertes Personal verwalten.",
  "Customers can see your published services and send requests linked to a project task.":
    "Kunden sehen Ihre veröffentlichten Leistungen und können projektbezogene Anfragen senden.",
  "+ Add service / person": "+ Leistung / Person hinzufügen",
  "Edit catalog & team": "Katalog & Team bearbeiten",
  "Where customers pay approved invoices. Shown on your invoice PDFs and to CraftCrew administrators only.":
    "Hierhin zahlen Kunden freigegebene Rechnungen. Nur auf Ihren Rechnungs-PDFs und für CraftCrew-Administratoren sichtbar.",
  "No payout account yet — add one so approved invoices can be paid.":
    "Noch kein Auszahlungskonto – bitte hinterlegen, damit freigegebene Rechnungen bezahlt werden können.",
  "Key people, roles and certifications are managed in your service catalog and shown on your public profile.":
    "Schlüsselpersonen, Rollen und Zertifikate verwalten Sie im Leistungskatalog; sie erscheinen im öffentlichen Profil.",
  "Marketplace quality, vetting and financial operations.":
    "Marktplatzqualität, Lieferantenprüfung und Finanzen.",
  "Signed in": "Angemeldet",
  "Check evidence, record references and risk, then approve, hold or reject each application.":
    "Nachweise prüfen, Referenzen und Risiko erfassen, dann freigeben, zurückstellen oder ablehnen.",
  "Supplier verification pipeline": "Lieferantenprüfung",
  "Manage account access and supplier verification badges.": "Kontozugänge und Lieferanten-Badges verwalten.",
  "Users & supplier badges": "Benutzer & Lieferanten-Badges",
  "Supplier directory badges": "Badges im Lieferantenverzeichnis",
  Accounts: "Konten",
  "Live in directory": "Im Verzeichnis",
  "Not live": "Nicht gelistet",
  "Suspending revokes active sessions and blocks future sign-ins. The last active admin account is protected.":
    "Sperren beendet aktive Sitzungen und blockiert künftige Anmeldungen. Das letzte aktive Admin-Konto ist geschützt.",
  "Payments, fees & supplier payouts": "Zahlungen, Gebühren & Auszahlungen",
  "Track invoice decisions and payout records. Actual bank transfers and refunds still require a connected payment provider.":
    "Rechnungsentscheidungen und Auszahlungen verfolgen. Echte Überweisungen und Erstattungen erfordern einen angebundenen Zahlungsanbieter.",
  "No payout record": "Keine Auszahlung erfasst",
  "Refunds change the CraftCrew ledger and notify the supplier. Complete the matching refund with your payment provider separately.":
    "Erstattungen ändern das CraftCrew-Buch und informieren den Lieferanten. Die Erstattung beim Zahlungsanbieter separat durchführen.",
  "Open dispute resolution": "Streitbeilegung öffnen",
  "Record refund": "Erstattung erfassen",
  "Record paid": "Als bezahlt erfassen",
  "Refunds & disputes": "Erstattungen & Streitfälle",
  "Maintain marketplace rules and help content. Payment, map and email connectors are shown as configuration notes; live credentials are not stored here.":
    "Marktplatzregeln und Hilfetexte pflegen. Zahlungs-, Karten- und E-Mail-Anbindungen sind Konfigurationshinweise; Zugangsdaten werden hier nicht gespeichert.",
  "One category per line": "Eine Kategorie pro Zeile",
  "Thresholds used by admins when assigning Bronze, Silver or Gold":
    "Schwellenwerte für die Vergabe von Bronze, Silber oder Gold",
  "Editable labels for future outbound mail integration": "Bearbeitbare Betreffzeilen für ausgehende E-Mails",
  "Live payment processing, email delivery and external map credentials require provider setup before activation.":
    "Zahlungsabwicklung, E-Mail-Versand und Kartendienste müssen vor der Aktivierung beim Anbieter eingerichtet werden.",
  "Service categories": "Leistungskategorien",
  "Supplier badge criteria": "Badge-Kriterien",
  "Completed projects": "Abgeschlossene Projekte",
  "Minimum rating": "Mindestbewertung",
  "System settings": "Systemeinstellungen",
  "Support email": "Support-E-Mail",
  "Platform fee estimate (%)": "Plattformgebühr (%)",
  "Default payment terms (days)": "Standard-Zahlungsziel (Tage)",
  "Upload limit (MB)": "Upload-Limit (MB)",
  "FAQ & help content": "FAQ & Hilfetexte",
  "Email template subjects": "E-Mail-Betreffzeilen",
  Integrations: "Integrationen",
  "No emails yet.": "Noch keine E-Mails.",
  "Public at /#/imprint, /#/privacy and /#/terms": "Öffentlich unter /#/imprint, /#/privacy und /#/terms",
  "Project, supplier, customer and financial performance across the marketplace.":
    "Projekt-, Lieferanten-, Kunden- und Finanzkennzahlen des Marktplatzes.",
  "In verification": "In Prüfung",
  Received: "Eingegangen",
  "Backup / restore": "Sicherung / Wiederherstellung",
  "Export full JSON": "Vollständiges JSON exportieren",
  "Import JSON": "JSON importieren",
  "Export the full JSON database. Admin import is available through the API and can be wired to a file picker for production deployment.":
    "Vollständige Datenbank als JSON exportieren oder eine Sicherung importieren.",
  "Every change made through CraftCrew is recorded with who did it, when, and on which project.":
    "Jede Änderung in CraftCrew wird mit Person, Zeitpunkt und Projekt protokolliert.",
  "All roles": "Alle Rollen",
  When: "Wann",
  Who: "Wer",
  Action: "Aktion",
  Record: "Datensatz",
  COMPLIANCE: "COMPLIANCE",
  "Resolve delivery, quality, timeline and invoice disputes.":
    "Streitfälle zu Lieferung, Qualität, Terminen und Rechnungen klären.",
  "Escalations & support": "Eskalationen & Support",
  "No escalations.": "Keine Eskalationen.",
  "Your administrator account, security and notification preferences. Marketplace-wide settings live in Platform management.":
    "Ihr Administratorkonto, Sicherheit und Benachrichtigungen. Marktplatzweite Einstellungen finden Sie in der Plattformverwaltung.",
  "Administrator · full access to vetting, users, billing, reports and settings":
    "Administrator · voller Zugriff auf Prüfung, Benutzer, Abrechnung, Berichte und Einstellungen",
  "ADMIN ACCOUNT": "ADMIN-KONTO",
  // Landing, public pages and pricing
  "Build complex projects with": "Komplexe Projekte mit",
  "trusted crews.": "verlässlichen Teams umsetzen.",
  "CraftCrew connects SMEs with vetted mechanical, electrical, automation and industrial service specialists — managed through one transparent waterfall workflow.":
    "CraftCrew verbindet KMU mit geprüften Spezialisten für Mechanik, Elektrik, Automatisierung und Industrieservice – gesteuert in einem transparenten Phasen-Workflow.",
  "One platform for the whole industrial": "Eine Plattform für die gesamte industrielle",
  "delivery chain.": "Lieferkette.",
  "Every supplier passes an explicit application, verification, reference and badge process.":
    "Jeder Lieferant durchläuft Bewerbung, Prüfung, Referenzcheck und Badge-Vergabe.",
  "Break projects into phases, assign specialists, track dates and handoffs.":
    "Projekte in Phasen gliedern, Spezialisten zuweisen, Termine und Übergaben verfolgen.",
  "Supplier submits → customer reviews → approves → payment is scheduled.":
    "Lieferant reicht ein → Kunde prüft → gibt frei → Zahlung wird geplant.",
  "Keep messages, updates, deliverables and decisions connected to the project.":
    "Nachrichten, Updates, Ergebnisse und Entscheidungen bleiben am Projekt.",
  "From supplier application to": "Von der Lieferantenbewerbung bis zum",
  "project completion.": "Projektabschluss.",
  "Customers coordinate a waterfall project. Suppliers accept assigned phases. CraftCrew handles the operational workflow, vetting, documentation and invoice lifecycle.":
    "Kunden steuern ein Phasenprojekt. Lieferanten übernehmen zugewiesene Phasen. CraftCrew organisiert Workflow, Prüfung, Dokumentation und Rechnungsablauf.",
  "A professional operating layer for": "Eine professionelle Arbeitsumgebung für",
  "industrial work.": "industrielle Projekte.",
  "Contact name": "Ansprechpartner",
  Location: "Standort",
  Certifications: "Zertifizierungen",
  "Portfolio / past work *": "Referenzprojekte *",
  "Reference contact name *": "Referenzkontakt *",
  "Reference contact email *": "E-Mail des Referenzkontakts *",
  "Policy number": "Policennummer",
  Define: "Definieren",
  Source: "Beschaffen",
  Agree: "Vereinbaren",
  Deliver: "Liefern",
  "Close out": "Abschließen",
  "I accept the": "Ich akzeptiere die",
  "terms of use": "Nutzungsbedingungen",
  "and have read the": "und habe die",
  "privacy policy": "Datenschutzerklärung",
});
Object.assign(I18N_DE, {
  // On-site compliance
  "Sites & safety": "Standorte & Arbeitsschutz",
  Compliance: "Compliance",
  "CONTRACTOR SAFETY": "FREMDFIRMENMANAGEMENT",
  "SITE COMPLIANCE": "STANDORT-COMPLIANCE",
  SITE: "STANDORT",
  "Who may work on your sites, with which evidence, briefing and permit — and who is there right now.":
    "Wer auf Ihren Standorten arbeiten darf, mit welchen Nachweisen, Unterweisungen und Erlaubnissen – und wer gerade vor Ort ist.",
  "+ New site": "+ Neuer Standort",
  "On site now": "Jetzt vor Ort",
  "Access requests": "Zutrittsanfragen",
  "waiting for approval": "warten auf Freigabe",
  "Documents to review": "Zu prüfende Dokumente",
  "certificates and qualifications": "Zertifikate und Qualifikationen",
  Sites: "Standorte",
  "Open site →": "Standort öffnen →",
  "No address yet": "Noch keine Adresse",
  "No open requests": "Keine offenen Anfragen",
  "Set up your first site": "Ersten Standort anlegen",
  "Define which certificates and qualifications contractors need, add your safety briefing, and link the projects that take place there.":
    "Legen Sie fest, welche Nachweise und Qualifikationen Fremdfirmen brauchen, hinterlegen Sie Ihre Sicherheitsunterweisung und verknüpfen Sie die Projekte am Standort.",
  "No requests waiting.": "Keine offenen Anfragen.",
  "All documents reviewed.": "Alle Dokumente geprüft.",
  Compliant: "Vollständig",
  Incomplete: "Unvollständig",
  "Check in": "Einchecken",
  "Check out": "Auschecken",
  Accept: "Akzeptieren",
  "New site": "Neuer Standort",
  "Edit site": "Standort bearbeiten",
  "Site name": "Standortname",
  "Site contact": "Ansprechpartner vor Ort",
  "Contact phone": "Telefon",
  "Emergency number": "Notrufnummer",
  "Company evidence required": "Erforderliche Unternehmensnachweise",
  "Worker qualifications required": "Erforderliche Qualifikationen der Mitarbeitenden",
  "Work permits used on this site": "Arbeitserlaubnisse an diesem Standort",
  "Projects at this site": "Projekte an diesem Standort",
  "Create site": "Standort anlegen",
  "Save site": "Standort speichern",
  expires: "läuft ab",
  "Print on-site list": "Anwesenheitsliste drucken",
  "Open requests": "Offene Anfragen",
  "Suppliers ready": "Lieferanten bereit",
  "meet every requirement": "erfüllen alle Anforderungen",
  "Safety briefing": "Sicherheitsunterweisung",
  "not written yet": "noch nicht erstellt",
  "Nobody is checked in.": "Niemand ist eingecheckt.",
  "Supplier readiness": "Bereitschaft der Lieferanten",
  Ready: "Bereit",
  "Not ready": "Nicht bereit",
  "Action needed": "Handlung nötig",
  "No workers registered yet.": "Noch keine Mitarbeitenden erfasst.",
  "No suppliers work at this site yet. Link projects in the site settings.":
    "Noch keine Lieferanten an diesem Standort. Verknüpfen Sie Projekte in den Standorteinstellungen.",
  "← Sites & safety": "← Standorte & Arbeitsschutz",
  "Upload certificates once, keep your workers' qualifications current, complete site briefings and request site access.":
    "Nachweise einmal hochladen, Qualifikationen aktuell halten, Unterweisungen abschließen und Zutritt anfragen.",
  "+ Request site access": "+ Zutritt anfragen",
  "Your sites": "Ihre Standorte",
  "Request access": "Zutritt anfragen",
  "Sites appear here once a customer links a project you work on to one of their sites.":
    "Standorte erscheinen hier, sobald ein Kunde ein Projekt, an dem Sie arbeiten, einem Standort zuordnet.",
  "Company documents": "Unternehmensnachweise",
  Workers: "Mitarbeitende",
  "+ Add worker": "+ Mitarbeiter hinzufügen",
  "Add the people who work on customer sites.": "Erfassen Sie die Personen, die bei Kunden vor Ort arbeiten.",
  "Site access": "Zutritt",
  "No access requests yet.": "Noch keine Zutrittsanfragen.",
  "Not uploaded": "Nicht hochgeladen",
  Replace: "Ersetzen",
  "Add worker": "Mitarbeiter hinzufügen",
  "Edit worker": "Mitarbeiter bearbeiten",
  "Full name": "Vollständiger Name",
  "Mobile phone": "Mobiltelefon",
  "Posted from abroad (an A1 certificate is required)":
    "Aus dem Ausland entsandt (A1-Bescheinigung erforderlich)",
  "No longer works for us": "Arbeitet nicht mehr für uns",
  "Save worker": "Mitarbeiter speichern",
  "Upload document": "Dokument hochladen",
  "File (PDF, JPG or PNG)": "Datei (PDF, JPG oder PNG)",
  "Issued on": "Ausgestellt am",
  "Valid until *": "Gültig bis *",
  "Valid until (optional)": "Gültig bis (optional)",
  "Each customer reviews the document for their sites. You are reminded 30 days before it expires.":
    "Jeder Kunde prüft das Dokument für seine Standorte. Sie werden 30 Tage vor Ablauf erinnert.",
  Worker: "Mitarbeiter",
  "Sign briefing": "Unterweisung unterschreiben",
  "Signature — type your full name": "Unterschrift – vollständigen Namen eingeben",
  "Request site access": "Zutritt anfragen",
  Site: "Standort",
  Until: "Bis",
  "Work permit": "Arbeitserlaubnis",
  "Work description": "Tätigkeitsbeschreibung",
  "Send request": "Anfrage senden",
  "Site access requests": "Zutrittsanfragen",
  "Compliance documents": "Compliance-Dokumente",
  "Site safety briefing": "Sicherheitsunterweisung Standort",
  "Checked in": "Eingecheckt",
  "Checked out": "Ausgecheckt",
  Requested: "Angefragt",
  Cancelled: "Storniert",
  Missing: "Fehlt",
  Valid: "Gültig",
  Outdated: "Veraltet",
  "Pending review": "Prüfung ausstehend",
  "Public liability insurance certificate": "Betriebshaftpflicht-Nachweis",
  "Tax exemption certificate (§48b EStG)": "Freistellungsbescheinigung (§48b EStG)",
  "Certificate of good standing (BG / accident insurance)":
    "Unbedenklichkeitsbescheinigung der Berufsgenossenschaft",
  "SCC / SCP safety certificate": "SCC-/SCP-Zertifikat",
  "Minimum wage declaration (MiLoG)": "Mindestlohnerklärung (MiLoG)",
  "A1 certificate (workers posted from abroad)": "A1-Bescheinigung (Entsendung aus dem Ausland)",
  "Qualified electrician (Elektrofachkraft)": "Nachweis Elektrofachkraft",
  "Fitness for work at height (G41)": "Eignung Arbeiten mit Absturzgefahr (G41)",
  "Forklift licence": "Staplerschein",
  "First aider training": "Ersthelfer-Ausbildung",
  "No special permit": "Keine besondere Erlaubnis",
  "Hot work (welding, cutting, grinding)": "Heißarbeiten (Schweißen, Trennen, Schleifen)",
  "Work at height": "Arbeiten in der Höhe",
  "Electrical work (isolation / LOTO)": "Elektroarbeiten (Freischalten / LOTO)",
  "Confined space entry": "Arbeiten in engen Räumen",
  "Fire watch assigned": "Brandwache eingeteilt",
  "Combustibles removed or covered (10 m radius)": "Brennbares entfernt oder abgedeckt (10 m Umkreis)",
  "Extinguisher at the work place": "Feuerlöscher am Arbeitsplatz",
  "Fire detection section informed": "Brandmeldeanlage/Leitstelle informiert",
  "Fall protection equipment inspected": "Absturzsicherung geprüft",
  "Area below cordoned off": "Bereich darunter abgesperrt",
  "Rescue plan in place": "Rettungskonzept vorhanden",
  "Isolated and secured against reconnection": "Freigeschaltet und gegen Wiedereinschalten gesichert",
  "Absence of voltage verified": "Spannungsfreiheit festgestellt",
  "Earthed and short-circuited": "Geerdet und kurzgeschlossen",
  "Adjacent live parts covered": "Benachbarte unter Spannung stehende Teile abgedeckt",
  "Atmosphere measured": "Atmosphäre gemessen",
  "Ventilation running": "Belüftung in Betrieb",
  "Attendant posted outside": "Sicherungsposten draußen",
  "Rescue equipment ready": "Rettungsausrüstung bereit",
});
Object.assign(I18N_DE, {
  // Team members
  Team: "Team",
  ACCOUNT: "KONTO",
  "Invite colleagues and decide for each area whether they have no access, can only view, or can work fully. Only you can manage the team.":
    "Laden Sie Kolleginnen und Kollegen ein und legen Sie für jeden Bereich fest, ob sie keinen Zugriff haben, nur ansehen oder voll arbeiten dürfen. Nur Sie verwalten das Team.",
  "+ Invite team member": "+ Teammitglied einladen",
  "Invite team member": "Teammitglied einladen",
  "Team members": "Teammitglieder",
  "with access to this account": "mit Zugriff auf dieses Konto",
  "Invitations open": "Offene Einladungen",
  "not signed in yet": "noch nicht angemeldet",
  "Full access": "Vollzugriff",
  "to every area": "auf alle Bereiche",
  Removed: "Entfernt",
  "no longer have access": "haben keinen Zugriff mehr",
  "Members and access": "Mitglieder und Zugriff",
  Member: "Mitglied",
  Invited: "Eingeladen",
  "No access": "Kein Zugriff",
  "View only": "Nur ansehen",
  Remove: "Entfernen",
  Edit: "Bearbeiten",
  "Work together as a team": "Gemeinsam als Team arbeiten",
  "Invite buyers, project managers, accounting or site staff. Each person signs in with their own login, and every action is recorded under their name.":
    "Laden Sie Einkauf, Projektleitung, Buchhaltung oder Standortpersonal ein. Jede Person meldet sich mit eigenem Login an, und jede Aktion wird unter ihrem Namen protokolliert.",
  "What the access levels mean": "Was die Zugriffsstufen bedeuten",
  "The area is hidden and its data cannot be opened.":
    "Der Bereich ist ausgeblendet und seine Daten können nicht geöffnet werden.",
  "Can see everything in the area but cannot create, change, approve or send.":
    "Sieht alles im Bereich, kann aber nichts anlegen, ändern, freigeben oder senden.",
  "Can work in the area like you, for example approve offers or pay invoices.":
    "Kann im Bereich wie Sie arbeiten, z. B. Angebote freigeben oder Rechnungen bezahlen.",
  "Projects, phases, tasks and documents": "Projekte, Phasen, Aufgaben und Dokumente",
  "Sourcing, offers and contracts": "Beschaffung, Angebote und Verträge",
  "Invoices and payments": "Rechnungen und Zahlungen",
  "Time approvals": "Zeitfreigaben",
  "Sites and contractor safety": "Standorte und Fremdfirmensicherheit",
  "Analytics and reports": "Analysen und Berichte",
  "Company profile and settings": "Firmenprofil und Einstellungen",
  "Assigned work, progress and documents": "Zugewiesene Arbeiten, Fortschritt und Dokumente",
  "Bids, quote requests and contracts": "Angebote, Anfragen und Verträge",
  "Time logging": "Zeiterfassung",
  "Compliance: workers, certificates, site access": "Compliance: Mitarbeitende, Nachweise, Standortzugang",
  "Service catalog and public profile": "Leistungskatalog und öffentliches Profil",
  "Company settings and payouts": "Firmeneinstellungen und Auszahlungen",
  Sourcing: "Beschaffung",
  Time: "Zeiten",
  Catalog: "Katalog",
  Settings: "Einstellungen",
  "Job title": "Funktion",
  optional: "optional",
  "e.g. Buyer, Project manager, Accounting": "z. B. Einkauf, Projektleitung, Buchhaltung",
  Access: "Zugriff",
  "Set all to": "Alle setzen auf",
  "Send invitation": "Einladung senden",
  "Save changes": "Änderungen speichern",
  "Team member added": "Teammitglied hinzugefügt",
  "Temporary password": "Temporäres Passwort",
  "Copy password": "Passwort kopieren",
  Copied: "Kopiert",
  Done: "Fertig",
  "Access updated": "Zugriff aktualisiert",
  "Team member removed": "Teammitglied entfernt",
  "Access restored": "Zugriff wiederhergestellt",
  "Restore access": "Zugriff wiederherstellen",
  "Team member": "Teammitglied",
  "Remove this team member? They are signed out immediately and can no longer open this account. You can restore access later.":
    "Dieses Teammitglied entfernen? Es wird sofort abgemeldet und kann dieses Konto nicht mehr öffnen. Sie können den Zugriff später wiederherstellen.",
  "Your team role has no access to this area": "Ihre Teamrolle hat keinen Zugriff auf diesen Bereich",
  "You have view-only access to this area. Ask your account owner if you need to make changes.":
    "Sie haben in diesem Bereich nur Lesezugriff. Wenden Sie sich an den Kontoinhaber, wenn Sie Änderungen vornehmen müssen.",
  "Welcome to the team. Please replace your temporary password with your own to continue.":
    "Willkommen im Team. Bitte ersetzen Sie Ihr temporäres Passwort durch ein eigenes, um fortzufahren.",
  "Only the main account can manage the team": "Nur das Hauptkonto kann das Team verwalten",
  "This email already has a CraftCrew account":
    "Für diese E-Mail-Adresse gibt es bereits ein CraftCrew-Konto",
  "Enter a name and a valid email address": "Bitte Namen und gültige E-Mail-Adresse eingeben",
});
Object.assign(I18N_DE, {
  // Change requests on invoices and offers
  "Requested changes": "Angeforderte Änderungen",
  Unit: "Einheit",
  Total: "Summe",
  "+ Add position": "+ Position hinzufügen",
  "Changes requested": "Änderungen angefordert",
  Rejected: "Abgelehnt",
  "Request changes": "Änderungen anfordern",
  "Send request": "Anfrage senden",
  // Supplier certificates & proofs
  Open: "Öffnen",
  "No expiry": "Unbefristet",
  "Compliance evidence": "Compliance-Nachweis",
  "Quality certificate": "Qualitätszertifikat",
  "Trade licence / registration": "Gewerbe / Registrierung",
  Insurance: "Versicherung",
  "Safety certificate": "Sicherheitszertifikat",
  "Training & qualification": "Schulung & Qualifikation",
  "Reference letter": "Referenzschreiben",
  "Other proof": "Sonstiger Nachweis",
  "Valid until": "Gültig bis",
  File: "Datei",
  "Your vetting documents": "Ihre Prüfunterlagen",
  // File explorer
  "Project files": "Projektdateien",
  Upload: "Hochladen",
  Download: "Herunterladen",
  Delete: "Löschen",
  Approve: "Freigeben",
  Sort: "Sortieren",
  Name: "Name",
  Type: "Typ",
  Size: "Größe",
  Status: "Status",
  Folder: "Ordner",
  "This project": "Dieses Projekt",
  Refresh: "Aktualisieren",
  Details: "Details",
  // Team planner
  "Team planner": "Teamplaner",
  "TEAM PLANNER": "TEAMPLANER",
  "Plan who works on which job, see vacations and site visits, and spot double bookings.":
    "Planen Sie, wer an welchem Auftrag arbeitet, sehen Sie Urlaube und Einsätze vor Ort und erkennen Sie Doppelbuchungen.",
  "Plan a job": "Auftrag planen",
  "+ New entry": "+ Neuer Eintrag",
  Today: "Heute",
  "Working today": "Heute im Einsatz",
  "on jobs or site visits": "bei Aufträgen oder vor Ort",
  "Absent today": "Heute abwesend",
  "vacation, sick or training": "Urlaub, krank oder Schulung",
  "Jobs without people": "Aufträge ohne Personal",
  Job: "Auftrag",
  "Site visit": "Einsatz vor Ort",
  "Arrival time (optional)": "Ankunftszeit (optional)",
  "Enter the start time as HH:MM, for example 07:30": "Geben Sie die Startzeit als HH:MM ein, zum Beispiel 07:30",
  Vacation: "Urlaub",
  Sick: "Krank",
  Training: "Schulung",
  Other: "Sonstiges",
  Week: "Woche",
  "2 weeks": "2 Wochen",
  "4 weeks": "4 Wochen",
  "Jobs to staff": "Zu besetzende Aufträge",
  "Plan people": "Personal planen",
  "Nobody planned": "Niemand eingeplant",
  "Job assignment": "Auftragseinsatz",
  "Sick leave": "Krankmeldung",
  Person: "Person",
  From: "Von",
  To: "Bis",
  Note: "Notiz",
  "New planner entry": "Neuer Planungseintrag",
  "Edit planner entry": "Planungseintrag bearbeiten",
  "Plan people on a job": "Personal für einen Auftrag planen",
  People: "Personen",
  "Plan selected people": "Ausgewählte Personen planen",
  "Planner updated": "Planung aktualisiert",
  "Entry deleted": "Eintrag gelöscht",
  Moved: "Verschoben",
  "Account owner": "Kontoinhaber",
  "Field worker": "Monteur",
  "Add your team first": "Legen Sie zuerst Ihr Team an",
  "Register workers": "Mitarbeitende erfassen",
  "Invite team members": "Teammitglieder einladen",
  "No open jobs assigned to your company.": "Ihrem Unternehmen sind keine offenen Aufträge zugewiesen.",
  "Site visits are managed under Compliance": "Einsätze vor Ort werden unter Compliance verwaltet",
  // Public top bar & onboarding
  Customer: "Kunde",
  Supplier: "Lieferant",
  Admin: "Admin",
  "Checklist hidden — reopen it any time from the sidebar":
    "Checkliste ausgeblendet – jederzeit über die Seitenleiste wieder öffnen",
});
Object.assign(I18N_DE, {
  "Please confirm": "Bitte bestätigen",
  Continue: "Fortfahren",
  Required: "Pflichtfeld",
  "What needs to be clarified or corrected?": "Was muss geklärt oder korrigiert werden?",
  "What should be changed?": "Was soll geändert werden?",
  "Reason for rejecting this access request:": "Grund für die Ablehnung dieser Zutrittsanfrage:",
  "Tell the supplier why this document is rejected:": "Warum wird das Dokument abgelehnt?",
  "Compliance is incomplete for this request. Enter a reason to approve anyway (e.g. documents checked on paper at the gate):":
    "Die Nachweise sind unvollständig. Begründung für eine Freigabe trotzdem (z. B. Dokumente am Tor auf Papier geprüft):",
  "Reason for recording this refund": "Grund für die Erstattung",
  "Resolution / outcome": "Lösung / Ergebnis",
  "Delete this task?": "Diese Aufgabe löschen?",
  "Delete phase?": "Phase löschen?",
  "Delete this project and its invoices?": "Projekt und zugehörige Rechnungen löschen?",
  "Delete this project? Projects with invoices, documents or accepted suppliers are archived instead.":
    "Dieses Projekt löschen? Projekte mit Rechnungen, Dokumenten oder angenommenen Lieferanten werden stattdessen archiviert.",
  "Please choose a new password first.": "Bitte wählen Sie zuerst ein neues Passwort.",
  "Change awaiting re-verification": "Änderung wartet auf erneute Prüfung",
  "Until an admin reviews it, your profile still shows the previous values.":
    "Bis ein Admin sie prüft, zeigt Ihr Profil weiterhin die bisherigen Angaben.",
  "Company name": "Firmenname",
  "Tax ID": "Steuernummer",
  "Profile changes": "Profiländerungen",
  "Profile changes awaiting re-verification": "Profiländerungen, die auf erneute Prüfung warten",
  "Changes to a company name, legal invoicing details or claimed certifications wait here until approved.":
    "Änderungen am Firmennamen, an rechtlichen Rechnungsdaten oder an angegebenen Zertifizierungen warten hier auf Freigabe.",
  "Nothing is waiting for re-verification.": "Nichts wartet derzeit auf erneute Prüfung.",
  Field: "Feld",
  Current: "Aktuell",
  Proposed: "Vorgeschlagen",
  "Explain to the supplier why this change was not approved":
    "Erklären Sie dem Anbieter, warum diese Änderung nicht freigegeben wurde",
  "Approve this change? It goes live right away.": "Diese Änderung freigeben? Sie wird sofort wirksam.",
  "Change approved": "Änderung freigegeben",
  "Enter a reason for the supplier in the decision note.":
    "Geben Sie im Entscheidungshinweis einen Grund für den Anbieter an.",
  "Change rejected": "Änderung abgelehnt",
  "Admin only": "Nur für Admins",
  "Choose Approve or Reject": "Wählen Sie Freigeben oder Ablehnen",
  "No pending change for this supplier": "Für diesen Anbieter liegt keine ausstehende Änderung vor",
  "Enter the hourly rate in euros, or leave it empty":
    "Geben Sie den Stundensatz in Euro ein oder lassen Sie das Feld leer",
  "Preferred suppliers": "Bevorzugte Anbieter",
  Joined: "Beigetreten",
  "Invitation sent": "Einladung gesendet",
  Saved: "Gespeichert",
  "Only customers keep a preferred-supplier list": "Nur Kunden führen eine Liste bevorzugter Anbieter",
  "Enter the supplier's email address": "Geben Sie die E-Mail-Adresse des Anbieters ein",
  "Enter the supplier's company name": "Geben Sie den Firmennamen des Anbieters ein",
  "You can invite up to 20 suppliers a day.": "Sie können bis zu 20 Anbieter pro Tag einladen.",
  "This supplier is already on CraftCrew. Add them from the supplier directory.":
    "Dieser Anbieter ist schon auf CraftCrew. Fügen Sie ihn über das Anbieterverzeichnis hinzu.",
  "You already invited this supplier.": "Sie haben diesen Anbieter bereits eingeladen.",
  "Your list can hold up to 500 suppliers": "Ihre Liste kann bis zu 500 Anbieter enthalten",
  "Admin accounts need two-factor sign-in. Turn it on to continue.":
    "Admin-Konten brauchen die Zwei-Faktor-Anmeldung. Schalten Sie sie ein, um fortzufahren.",
  "Two-factor sign-in": "Zwei-Faktor-Anmeldung",
  Off: "Aus",
  "Signing in needs your password and a code from your authenticator app.":
    "Zur Anmeldung brauchen Sie Ihr Passwort und einen Code aus Ihrer Authenticator-App.",
  "Protect your account with a second step: a 6-digit code from an authenticator app such as Microsoft Authenticator, Google Authenticator or 1Password.":
    "Schützen Sie Ihr Konto mit einem zweiten Schritt: einem 6-stelligen Code aus einer Authenticator-App wie Microsoft Authenticator, Google Authenticator oder 1Password.",
  "Recovery codes left:": "Verbleibende Wiederherstellungscodes:",
  "Admin accounts must use two-factor sign-in.": "Admin-Konten müssen die Zwei-Faktor-Anmeldung nutzen.",
  "Turn on": "Einschalten",
  "Require two-factor sign-in for all admin accounts":
    "Zwei-Faktor-Anmeldung für alle Admin-Konten verlangen",
  "Turn on two-factor sign-in": "Zwei-Faktor-Anmeldung einschalten",
  "Open your authenticator app and add an account.":
    "Öffnen Sie Ihre Authenticator-App und fügen Sie ein Konto hinzu.",
  "Open in authenticator app": "In der Authenticator-App öffnen",
  "If you can't scan or open the link, enter this key by hand:":
    "Wenn Sie den Link nicht öffnen können, geben Sie diesen Schlüssel von Hand ein:",
  "Time-based, 6 digits, every 30 seconds.": "Zeitbasiert, 6 Ziffern, alle 30 Sekunden.",
  "Enter the 6-digit code the app shows.": "Geben Sie den 6-stelligen Code aus der App ein.",
  "Code from the app": "Code aus der App",
  "Save your recovery codes": "Speichern Sie Ihre Wiederherstellungscodes",
  "Each code signs you in once if you lose your phone. Store them somewhere safe, like a password manager. They are shown only now.":
    "Jeder Code meldet Sie einmal an, falls Sie Ihr Telefon verlieren. Bewahren Sie sie sicher auf, etwa in einem Passwortmanager. Sie werden nur jetzt angezeigt.",
  "Download as text file": "Als Textdatei herunterladen",
  "I saved them": "Ich habe sie gespeichert",
  "Turn off two-factor sign-in": "Zwei-Faktor-Anmeldung ausschalten",
  "Code from the app or a recovery code": "Code aus der App oder ein Wiederherstellungscode",
  "Two-factor sign-in turned off": "Zwei-Faktor-Anmeldung ausgeschaltet",
  "Two-factor sign-in is now required for admins": "Zwei-Faktor-Anmeldung ist jetzt für Admins Pflicht",
  "Requirement turned off": "Pflicht ausgeschaltet",
  "Enter the 6-digit code from your authenticator app, or a recovery code.":
    "Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App oder einen Wiederherstellungscode ein.",
  "That code is not right. Check the time on your phone and try again.":
    "Der Code stimmt nicht. Prüfen Sie die Uhrzeit auf Ihrem Telefon und versuchen Sie es erneut.",
  "Turn the admin two-factor requirement on or off":
    "Schalten Sie die Zwei-Faktor-Pflicht für Admins ein oder aus",
  "Turn on two-factor sign-in for your own account first.":
    "Schalten Sie zuerst die Zwei-Faktor-Anmeldung für Ihr eigenes Konto ein.",
  "Two-factor sign-in is already on. Turn it off first to set it up again.":
    "Die Zwei-Faktor-Anmeldung ist schon an. Schalten Sie sie zuerst aus, um sie neu einzurichten.",
  "Start the setup again; it expires after 15 minutes.":
    "Starten Sie die Einrichtung neu; sie läuft nach 15 Minuten ab.",
  "Two-factor sign-in is required for admin accounts.":
    "Die Zwei-Faktor-Anmeldung ist für Admin-Konten Pflicht.",
  "Your password is incorrect": "Ihr Passwort ist falsch",
  Calendar: "Kalender",
  On: "An",
  "Task due dates, phase dates, bid deadlines, contract notice dates and approved site visits appear in your own calendar as all-day events.":
    "Fälligkeiten von Aufgaben, Phasentermine, Angebotsfristen, Kündigungsfristen von Verträgen und genehmigte Standortbesuche erscheinen als ganztägige Termine in Ihrem eigenen Kalender.",
  "Your private calendar link (shown once — keep it secret)":
    "Ihr privater Kalenderlink (wird nur einmal angezeigt – geheim halten)",
  "Copy link": "Link kopieren",
  "How to add it": "So fügen Sie ihn hinzu",
  "Outlook:": "Outlook:",
  "Calendar → Add calendar → Subscribe from web → paste the link.":
    "Kalender → Kalender hinzufügen → Aus dem Internet abonnieren → Link einfügen.",
  "Google Calendar:": "Google Kalender:",
  "Other calendars → + → From URL → paste the link.": "Weitere Kalender → + → Per URL → Link einfügen.",
  "Apple Calendar:": "Apple Kalender:",
  "File → New Calendar Subscription → paste the link.": "Ablage → Neues Kalenderabonnement → Link einfügen.",
  "Calendar apps refresh subscribed calendars every few hours.":
    "Kalender-Apps aktualisieren abonnierte Kalender alle paar Stunden.",
  "Create new link": "Neuen Link erstellen",
  "Create calendar link": "Kalenderlink erstellen",
  "Turn off": "Ausschalten",
  "Create a new link? The old link stops working in every calendar that uses it.":
    "Neuen Link erstellen? Der alte Link funktioniert dann in keinem Kalender mehr.",
  "Turn off the calendar link? Calendars that use it stop updating.":
    "Kalenderlink ausschalten? Kalender, die ihn nutzen, werden nicht mehr aktualisiert.",
  "Calendar link turned off": "Kalenderlink ausgeschaltet",
  "Link copied": "Link kopiert",
  "Daily site reports": "Bautagesberichte",
  Acknowledged: "Zur Kenntnis genommen",
  "Not acknowledged yet": "Noch nicht zur Kenntnis genommen",
  "Team on site": "Personal vor Ort",
  "Work done": "Ausgeführte Arbeiten",
  "Problems or obstructions": "Probleme oder Behinderungen",
  "Add a comment": "Kommentar hinzufügen",
  Acknowledge: "Zur Kenntnis nehmen",
  "No site reports yet.": "Noch keine Bautagesberichte.",
  "New daily report": "Neuer Tagesbericht",
  Day: "Tag",
  "Weather (optional)": "Wetter (optional)",
  "e.g. Dry, 14 °C": "z. B. trocken, 14 °C",
  "Add your workers under Compliance first.": "Legen Sie Ihre Mitarbeiter zuerst unter Compliance an.",
  "Hours (time entries of that day)": "Stunden (Zeiteinträge dieses Tages)",
  "No time entries for this day.": "Keine Zeiteinträge für diesen Tag.",
  "Photos (up to 10)": "Fotos (bis zu 10)",
  "Save report": "Bericht speichern",
  "Site report saved": "Bautagesbericht gespeichert",
  "Site report acknowledged": "Bautagesbericht zur Kenntnis genommen",
  "Download failed": "Download fehlgeschlagen",
  "Choose team members from your own workers": "Wählen Sie Personal aus Ihren eigenen Mitarbeitern",
  "Link only your time entries for this task and day":
    "Verknüpfen Sie nur Ihre Zeiteinträge für diese Aufgabe und diesen Tag",
  "Attach up to 10 photos": "Hängen Sie bis zu 10 Fotos an",
  "Describe the work done today": "Beschreiben Sie die heute ausgeführten Arbeiten",
  "Only the supplier writes the daily site report": "Nur der Auftragnehmer schreibt den Bautagesbericht",
  "Choose today or an earlier day": "Wählen Sie heute oder einen früheren Tag",
  "There is already a report for this day. Edit that one instead.":
    "Für diesen Tag gibt es schon einen Bericht. Bearbeiten Sie diesen.",
  "Site report not found": "Bautagesbericht nicht gefunden",
  "Only the customer acknowledges a site report":
    "Nur der Auftraggeber nimmt einen Bautagesbericht zur Kenntnis",
  "Only the supplier edits the daily site report": "Nur der Auftragnehmer bearbeitet den Bautagesbericht",
  "The customer has acknowledged this report; add a comment instead":
    "Der Auftraggeber hat diesen Bericht zur Kenntnis genommen; schreiben Sie stattdessen einen Kommentar",
  "Write a comment first": "Schreiben Sie zuerst einen Kommentar",
  "This report has too many comments": "Dieser Bericht hat zu viele Kommentare",
  "Choose a valid date range": "Wählen Sie einen gültigen Zeitraum",
  "No site reports in this period": "Keine Bautagesberichte in diesem Zeitraum",
  Defects: "Mängel",
  Minor: "Geringfügig",
  Major: "Erheblich",
  Critical: "Kritisch",
  "Fixed – to verify": "Behoben – zu prüfen",
  "Photo of the fix": "Foto der Behebung",
  "Mark fixed": "Als behoben melden",
  "Note (required to reopen)": "Notiz (Pflicht zum Wiedereröffnen)",
  "Verify fix": "Behebung bestätigen",
  Reopen: "Wieder öffnen",
  "Reopened:": "Wieder geöffnet:",
  "Supplier note:": "Notiz des Auftragnehmers:",
  "Fix by": "Beheben bis",
  "No defects recorded.": "Keine Mängel erfasst.",
  "Record a defect": "Mangel erfassen",
  Severity: "Schwere",
  "Photos (up to 5)": "Fotos (bis zu 5)",
  "Add defect": "Mangel hinzufügen",
  "Defect recorded": "Mangel erfasst",
  "Marked as fixed": "Als behoben gemeldet",
  "Fix verified": "Behebung bestätigt",
  "Defect reopened": "Mangel wieder geöffnet",
  "Only the customer records defects": "Nur der Auftraggeber erfasst Mängel",
  "This task already has 200 defects": "Diese Aufgabe hat bereits 200 Mängel",
  "Describe the defect in a short title": "Beschreiben Sie den Mangel in einem kurzen Titel",
  "Choose minor, major or critical": "Wählen Sie geringfügig, erheblich oder kritisch",
  "Enter the due date as a date": "Geben Sie das Fälligkeitsdatum als Datum ein",
  "Attach up to five photos": "Hängen Sie bis zu fünf Fotos an",
  "Upload the photos first (JPG or PNG), then attach them.":
    "Laden Sie die Fotos zuerst hoch (JPG oder PNG) und hängen Sie sie dann an.",
  "Defect not found": "Mangel nicht gefunden",
  "Only the supplier marks a defect as fixed": "Nur der Auftragnehmer meldet einen Mangel als behoben",
  "Only open defects can be marked as fixed": "Nur offene Mängel können als behoben gemeldet werden",
  "Add a photo of the fixed defect": "Fügen Sie ein Foto des behobenen Mangels hinzu",
  "Only the customer verifies or reopens a defect":
    "Nur der Auftraggeber bestätigt oder öffnet einen Mangel wieder",
  "The supplier has to mark the defect as fixed first":
    "Der Auftragnehmer muss den Mangel zuerst als behoben melden",
  "Say what is still wrong before reopening": "Sagen Sie, was noch nicht stimmt, bevor Sie wieder öffnen",
  "Choose fixed, verified or reopen": "Wählen Sie behoben, bestätigt oder wieder öffnen",
  "Accept work": "Leistung abnehmen",
  "Work accepted": "Leistung abgenommen",
  "Accepted with defects": "Abgenommen mit Mängeln",
  "Not accepted": "Nicht abgenommen",
  "Acceptance report": "Abnahmeprotokoll",
  "Deliverables and documents checked": "Geprüfte Leistungen und Unterlagen",
  "No deliverables or documents on this task yet.":
    "Zu dieser Aufgabe gibt es noch keine Leistungen oder Unterlagen.",
  "Open defects (listed in the report)": "Offene Mängel (stehen im Protokoll)",
  "Other defects (one per line)": "Weitere Mängel (einer pro Zeile)",
  "e.g. Paint scratch on panel 3": "z. B. Lackkratzer an Paneel 3",
  Result: "Ergebnis",
  "Note (required when the work is not accepted)": "Bemerkung (Pflicht, wenn die Abnahme verweigert wird)",
  "Signed by": "Unterzeichnet von",
  Place: "Ort",
  "e.g. Plant Regensburg": "z. B. Werk Regensburg",
  Signature: "Unterschrift",
  "Clear signature": "Unterschrift löschen",
  "Sign and save report": "Unterschreiben und Protokoll speichern",
  "Sign in the signature box before saving": "Unterschreiben Sie im Unterschriftsfeld, bevor Sie speichern",
  "Sent back to the supplier": "An den Auftragnehmer zurückgegeben",
  "Acceptance report saved": "Abnahmeprotokoll gespeichert",
  "Only the customer accepts work": "Nur der Auftraggeber nimmt Leistungen ab",
  "This task has no supplier working on it yet.": "An dieser Aufgabe arbeitet noch kein Auftragnehmer.",
  "The supplier has not handed this work over yet. Accept it once the task is Under Review or Completed.":
    "Der Auftragnehmer hat die Leistung noch nicht übergeben. Nehmen Sie sie ab, sobald die Aufgabe „In Prüfung“ oder „Abgeschlossen“ ist.",
  "Choose accepted, accepted with defects or rejected":
    "Wählen Sie abgenommen, abgenommen mit Mängeln oder verweigert",
  "Enter the name of the person signing": "Geben Sie den Namen der unterschreibenden Person ein",
  "Enter the place where the work was accepted": "Geben Sie den Ort der Abnahme ein",
  "Enter the acceptance date as a date": "Geben Sie das Abnahmedatum als Datum ein",
  "The signature image is too large. Clear it and sign again.":
    "Die Unterschrift ist zu groß. Löschen Sie sie und unterschreiben Sie erneut.",
  "The signature could not be read. Clear it and sign again.":
    "Die Unterschrift konnte nicht gelesen werden. Löschen Sie sie und unterschreiben Sie erneut.",
  "List at least one defect, or choose Accepted":
    "Nennen Sie mindestens einen Mangel oder wählen Sie „Abgenommen“",
  "Explain in the note why the work is not accepted":
    "Begründen Sie in der Bemerkung, warum die Abnahme verweigert wird",
  "Turn invoices after acceptance on or off": "Schalten Sie „Rechnungen erst nach Abnahme“ ein oder aus",
  "This project pays invoices only after the work is accepted. Ask the customer to sign the acceptance report first.":
    "In diesem Projekt werden Rechnungen erst nach der Abnahme bezahlt. Bitten Sie den Auftraggeber, zuerst das Abnahmeprotokoll zu unterschreiben.",
  "Task not found": "Aufgabe nicht gefunden",
  Radius: "Umkreis",
  Clear: "Leeren",
  Services: "Leistungen",
  "Hourly rate": "Stundensatz",
  Reliability: "Zuverlässigkeit",
  "Lead time": "Vorlaufzeit",
  Availability: "Verfügbarkeit",
  Detail: "Detail",
  "One request to:": "Eine Anfrage an:",
  Description: "Beschreibung",
  "Attach up to five files": "Hängen Sie bis zu fünf Dateien an",
  "Only customers keep a supplier shortlist": "Nur Kunden führen eine Merkliste",
  "Send the shortlist as a list of supplier ids": "Senden Sie die Merkliste als Liste von Anbieter-IDs",
  "A shortlist can hold up to 50 suppliers": "Eine Merkliste kann bis zu 50 Anbieter enthalten",
  "on time": "termingerecht",
  "customer reviews": "Kundenbewertungen",
  "Minimum liability coverage in € (optional)": "Mindestdeckung der Haftpflicht in € (optional)",
  "Liability coverage below the site minimum": "Haftpflichtdeckung unter dem Minimum des Standorts",
  "Not checked with VIES yet": "Noch nicht mit VIES geprüft",
  "VIES not reachable – check manually": "VIES nicht erreichbar – bitte manuell prüfen",
  "VIES: VAT ID valid": "VIES: USt-IdNr. gültig",
  "VIES: VAT ID not valid": "VIES: USt-IdNr. ungültig",
  "Check now": "Jetzt prüfen",
  "VIES check finished": "VIES-Prüfung abgeschlossen",
  "These checks validate submitted fields and files. The VAT ID is also checked with the EU VIES service; credit and sanctions databases are not queried.":
    "Diese Prüfungen kontrollieren die eingereichten Angaben und Dateien. Die USt-IdNr. wird zusätzlich über den EU-Dienst VIES geprüft; Auskunfteien und Sanktionslisten werden nicht abgefragt.",
  "This application has no VAT ID to check.": "Diese Bewerbung enthält keine USt-IdNr. zum Prüfen.",
  "Enter the minimum liability coverage in euros, or leave it empty":
    "Geben Sie die Mindestdeckung in Euro ein oder lassen Sie das Feld leer",
  // German interface gaps (T58)
  'Required before going live in Germany (§ 5 DDG Impressum, Art. 13 GDPR privacy notice). Plain text: blank line = new paragraph, a line starting with "# " = heading. Have the final texts checked by a lawyer or a trusted generator.':
    "Vor dem Livegang in Deutschland erforderlich (§ 5 DDG Impressum, Art. 13 DSGVO Datenschutzhinweis). Reiner Text: Leerzeile = neuer Absatz, eine Zeile mit „# “ am Anfang = Überschrift. Lassen Sie die endgültigen Texte von einer Anwältin, einem Anwalt oder einem verlässlichen Generator prüfen.",
  "Gross invoice volume": "Brutto-Rechnungsvolumen",
  "Total project budget": "Gesamtes Projektbudget",
  "Approved invoice value": "Freigegebener Rechnungswert",
  "Review file": "Akte prüfen",
  "Project / supplier": "Projekt / Lieferant",
  "Payment / payout status": "Zahlungs- / Auszahlungsstatus",
  "Create invoice": "Rechnung erstellen",
  "Link this invoice to its exact project task. The customer can compare the positions with the task order amount.":
    "Verknüpfen Sie diese Rechnung mit der genauen Projektaufgabe. Der Kunde kann die Positionen mit dem Auftragswert der Aufgabe vergleichen.",
  "Accepted project task *": "Angenommene Projektaufgabe *",
  "Select a task to see the customer and order cap.":
    "Wählen Sie eine Aufgabe, um Kunde und Auftragsobergrenze zu sehen.",
  "Choose an order to compare this invoice.": "Wählen Sie einen Auftrag, um diese Rechnung zu vergleichen.",
  "Submit invoice": "Rechnung einreichen",
  "Choose assigned work": "Zugewiesene Arbeit wählen",
  "Choose service": "Leistung wählen",
  "Approved value": "Freigegebener Wert",
  "Approved hours": "Freigegebene Stunden",
  "Phase / task": "Phase / Aufgabe",
  "Project / task": "Projekt / Aufgabe",
  "Submitted time": "Eingereichte Zeit",
  "Approved order cap": "Freigegebene Auftragsobergrenze",
  // Accessibility labels (T57)
  "Filter by read state": "Nach Lesestatus filtern",
  "Filter by type": "Nach Typ filtern",
  "Bar chart": "Balkendiagramm",
  Table: "Tabelle",
  "Service categories, one per line": "Leistungskategorien, eine pro Zeile",
  // Suppliers not yet verified (T55)
  "Not yet verified": "Noch nicht verifiziert",
  Verified: "Verifiziert",
  "Your company is not verified yet. Complete your application to receive bid invitations.":
    "Ihr Unternehmen ist noch nicht verifiziert. Schließen Sie Ihre Bewerbung ab, um Angebotsanfragen zu erhalten.",
  "Complete your application": "Bewerbung abschließen",
  "View application status": "Bewerbungsstatus ansehen",
  // Safer destructive actions (T56)
  "Delete phase?": "Phase löschen?",
  "Delete phase": "Phase löschen",
  "This phase cannot be deleted": "Diese Phase kann nicht gelöscht werden",
  "It has supplier assignments or invoices. Remove the assignments and resolve the invoices first.":
    "Sie hat Lieferantenzuweisungen oder Rechnungen. Entfernen Sie zuerst die Zuweisungen und klären Sie die Rechnungen.",
  "Sign out all your other sessions? Other browsers and devices will need to sign in again.":
    "Alle anderen Sitzungen abmelden? Andere Browser und Geräte müssen sich erneut anmelden.",
  "Sign out others": "Andere abmelden",
  // Dashboard action queue (T53)
  "Action queue": "Zu erledigen",
  "Next deadline:": "Nächste Frist:",
  Compare: "Vergleichen",
  Respond: "Antworten",
  Revise: "Überarbeiten",
  Fix: "Korrigieren",
  Renew: "Erneuern",
  Handle: "Bearbeiten",
  "Show all steps": "Alle Schritte anzeigen",
  "Show fewer": "Weniger anzeigen",
  "Next:": "Als Nächstes:",
  // Not found and expired sessions (T54)
  "Page not found": "Seite nicht gefunden",
  "The page you opened does not exist. Check the link or go back.":
    "Die aufgerufene Seite gibt es nicht. Prüfen Sie den Link oder gehen Sie zurück.",
  "Go to dashboard": "Zur Übersicht",
  "Go to the home page": "Zur Startseite",
  "Project not found": "Projekt nicht gefunden",
  "This project does not exist or you no longer have access to it.":
    "Dieses Projekt gibt es nicht oder Sie haben keinen Zugriff mehr darauf.",
  "Back to projects": "Zurück zu den Projekten",
  "Invoice not found": "Rechnung nicht gefunden",
  "This invoice does not exist or you no longer have access to it.":
    "Diese Rechnung gibt es nicht oder Sie haben keinen Zugriff mehr darauf.",
  "Back to invoices": "Zurück zu den Rechnungen",
  "Supplier not found": "Lieferant nicht gefunden",
  "This supplier profile does not exist or is no longer listed.":
    "Dieses Lieferantenprofil gibt es nicht oder es ist nicht mehr gelistet.",
  "Back to suppliers": "Zurück zu den Lieferanten",
  Back: "Zurück",
  // Phone navigation (T51)
  More: "Mehr",
  Vetting: "Prüfung",
  Payments: "Zahlungen",
  // Sidebar groups (T52)
  Work: "Arbeit",
  Buying: "Einkauf",
  Money: "Finanzen",
  "Site safety": "Standortsicherheit",
  Sales: "Vertrieb",
  "Suppliers & users": "Lieferanten & Benutzer",
  Platform: "Plattform",
  // XRechnung e-invoices (T43)
  "Download e-invoice (XRechnung)": "E-Rechnung herunterladen (XRechnung)",
  "This invoice has no VAT data. E-invoices need an invoice created with a VAT mode.":
    "Diese Rechnung enthält keine Umsatzsteuerdaten. E-Rechnungen brauchen eine Rechnung mit Umsatzsteuerangabe.",
  "Add your company address with street, postcode and city to your company profile.":
    "Tragen Sie Ihre Firmenanschrift mit Straße, Postleitzahl und Ort im Unternehmensprofil ein.",
  "Add your tax number or VAT ID to your company profile.":
    "Tragen Sie Ihre Steuernummer oder USt-IdNr. im Unternehmensprofil ein.",
  "Add a phone number and email address to your company profile; e-invoices need a contact.":
    "Tragen Sie Telefonnummer und E-Mail-Adresse im Unternehmensprofil ein; E-Rechnungen brauchen einen Kontakt.",
  "Add your bank account (IBAN) under payout details; e-invoices need payment details.":
    "Hinterlegen Sie Ihr Bankkonto (IBAN) bei den Auszahlungsdaten; E-Rechnungen brauchen Zahlungsangaben.",
  "The customer's company address with postcode and city is missing from their company profile.":
    "Im Unternehmensprofil des Kunden fehlt die Anschrift mit Postleitzahl und Ort.",
  "The customer's email address is missing.": "Die E-Mail-Adresse des Kunden fehlt.",
  "Reverse charge needs the customer's VAT ID (for example DE123456789) in their company profile.":
    "Für Reverse Charge wird die USt-IdNr. des Kunden (zum Beispiel DE123456789) im Unternehmensprofil benötigt.",
  // Invoice reminders (T44)
  Overdue: "Überfällig",
  // Design 2026 (T92)
  "1 day late": "1 Tag verspätet",
  // Landing page (T94)
  "Robot Cell Upgrade": "Modernisierung Roboterzelle",
  Engineering: "Engineering",
  "Build & integration": "Bau & Integration",
  "Site acceptance": "Abnahme vor Ort",
  Describe: "Beschreiben",
  Run: "Umsetzen",
  "Strategic sourcing": "Strategische Beschaffung",
  Suppliers: "Lieferanten",
  // Dashboards (T95)
  Message: "Nachricht",
  // Supplier dashboard (T96)
  Dates: "Termine",
  Decline: "Ablehnen",
  // Admin dashboard (T97)
  "Live suppliers": "Aktive Lieferanten",
  "Invoice volume": "Rechnungsvolumen",
  // Project workspace (T98)
  Phases: "Phasen",
  Progress: "Fortschritt",
  Working: "In Arbeit",
  Late: "Verspätet",
  "1 document to approve": "1 Dokument freizugeben",
  "1 invoice": "1 Rechnung",
  // Task board (T99)
  Board: "Board",
  Order: "Auftrag",
  // Offer comparison (T100)
  Includes: "Enthält",
  // Invoice review (T101)
  INVOICE: "RECHNUNG",
  "BILL TO": "RECHNUNG AN",
  Rate: "Preis",
  Net: "Netto",
  "not recorded": "nicht erfasst",
  new: "neu",
  Checks: "Prüfungen",
  "Within order cap": "Innerhalb des Auftragsrahmens",
  "Over the order cap": "Über dem Auftragsrahmen",
  "Hours match approved time": "Stunden passen zur freigegebenen Zeit",
  "More hours than approved time": "Mehr Stunden als freigegeben",
  "Request Changes": "Änderungen anfordern",
  VAT: "USt.",
  PDF: "PDF",
  XRechnung: "XRechnung",
  // Phone Today (T102)
  Jobs: "Aufträge",
  "Log Time": "Zeit erfassen",
  Photo: "Foto",
  // GDPR self-service (T120)
  "Your data": "Ihre Daten",
  "Download a copy of the personal data CraftCrew stores about you: your account, messages, notifications, projects, invoices and activity. Passwords and security keys are never included.":
    "Laden Sie eine Kopie der personenbezogenen Daten herunter, die CraftCrew über Sie speichert: Konto, Nachrichten, Benachrichtigungen, Projekte, Rechnungen und Aktivitäten. Passwörter und Sicherheitsschlüssel sind nie enthalten.",
  "Download my data": "Meine Daten herunterladen",
  // Privacy rights and admin view (T123)
  "Pending account deletions": "Anstehende Kontolöschungen",
  "With the main account": "Mit dem Hauptkonto",
  "Deleted on": "Gelöscht am",
  "No account is waiting to be deleted.": "Kein Konto wartet auf die Löschung.",
  "People cancel a deletion themselves by signing in before the date. After it, the account is anonymised automatically; invoices are kept with their legal details.": "Personen heben eine Löschung selbst auf, indem sie sich vor dem Datum anmelden. Danach wird das Konto automatisch anonymisiert; Rechnungen bleiben mit ihren rechtlichen Angaben erhalten.",
  "This account was deleted and can't be changed.": "Dieses Konto wurde gelöscht und kann nicht geändert werden.",
  "Deleted user": "Gelöschter Nutzer",
  "Deleted supplier": "Gelöschter Lieferant",
  "Deleted company": "Gelöschtes Unternehmen",
  "Deleted worker": "Gelöschte Arbeitskraft",
  "Deleted": "Gelöscht",
  "Invalid email or password": "E-Mail oder Passwort ist falsch",
  // Account deletion (T121)
  "Delete account": "Konto löschen",
  "This deletes your own login. The company account and its data stay.":
    "Damit wird nur Ihr eigener Zugang gelöscht. Das Firmenkonto und seine Daten bleiben erhalten.",
  "Finish or hand over these first:": "Schließen Sie zuerst Folgendes ab oder übergeben Sie es:",
  "Finish or hand over these first.": "Schließen Sie zuerst Folgendes ab oder übergeben Sie es.",
  "Your password": "Ihr Passwort",
  "Code from your authenticator app": "Code aus Ihrer Authenticator-App",
  "Delete my account": "Mein Konto löschen",
  "The password is not right.": "Das Passwort ist nicht richtig.",
  "Enter the current code from your authenticator app.": "Geben Sie den aktuellen Code aus Ihrer Authenticator-App ein.",
  "Admin accounts can't be deleted this way. Ask another admin.":
    "Admin-Konten können nicht auf diesem Weg gelöscht werden. Wenden Sie sich an einen anderen Admin.",
  "Too many attempts. Please try again later.": "Zu viele Versuche. Bitte versuchen Sie es später erneut.",
  "Your account deletion was cancelled because you signed in.":
    "Die Löschung Ihres Kontos wurde aufgehoben, weil Sie sich angemeldet haben.",
  "This company account is being deleted. Contact your account owner.":
    "Dieses Firmenkonto wird gelöscht. Wenden Sie sich an den Inhaber des Kontos.",
  "This account is being deleted.": "Dieses Konto wird gelöscht.",
  "An escalation is still open": "Eine Eskalation ist noch offen",
  "Your data was downloaded": "Ihre Daten wurden heruntergeladen",
  "You can download your data 5 times per hour. Please try again later.":
    "Sie können Ihre Daten 5-mal pro Stunde herunterladen. Bitte versuchen Sie es später erneut.",
  // Share a project (T110)
  Share: "Teilen",
  "Share project": "Projekt teilen",
  Invite: "Einladen",
  Owner: "Inhaber",
  "This project": "Dieses Projekt",
  "Enter the colleague's name": "Geben Sie den Namen der Person ein",
  "Only the project owner can share it": "Nur der Projektinhaber kann es teilen",
  "This is the project owner's own account": "Das ist das Konto des Projektinhabers",
  "This person is in your team and already sees every project":
    "Diese Person ist in Ihrem Team und sieht bereits alle Projekte",
  "Share projects with colleagues on customer accounts. Suppliers get access through task invitations.":
    "Teilen Sie Projekte mit Kolleginnen und Kollegen mit Kundenkonto. Lieferanten erhalten Zugriff über Aufgabeneinladungen.",
  "This colleague already has access": "Diese Person hat bereits Zugriff",
  "A project can be shared with up to 30 colleagues": "Ein Projekt kann mit bis zu 30 Personen geteilt werden",
  "This colleague has no access to the project": "Diese Person hat keinen Zugriff auf das Projekt",
  // Photos on time entries (T106)
  Photos: "Fotos",
  "Add photo": "Foto hinzufügen",
  "Attach up to 6 photos": "Hängen Sie bis zu 6 Fotos an",
  "Choose JPG or PNG photos.": "Wählen Sie Fotos im JPG- oder PNG-Format.",
  "This photo could not be read.": "Dieses Foto konnte nicht gelesen werden.",
  Defect: "Mangel",
  Profile: "Profil",
  // Log time sheet (T103)
  "Billable time": "Abrechenbare Zeit",
  "Calculated from start/end minus break": "Berechnet aus Beginn/Ende abzüglich Pause",
  Date: "Datum",
  Break: "Pause",
  "Find job": "Auftrag suchen",
  Employee: "Mitarbeiter",
  "Break (min)": "Pause (Min.)",
  "No signal. Saved on this phone and sent later.": "Kein Empfang. Auf diesem Telefon gespeichert und später gesendet.",
  "Submit time for approval": "Zeit zur Freigabe senden",
  // Approvals (T104)
  Changes: "Änderungen",
  Corrected: "Korrigiert",
  Show: "Anzeigen",
  // Sidebar (T93)
  Reports: "Berichte",
  // VAT on invoices (T41)
  "Net amounts – VAT not recorded": "Nettobeträge – Umsatzsteuer nicht erfasst",
  "Net amount": "Nettobetrag",
  "Value added tax": "Umsatzsteuer",
  Subtotal: "Zwischensumme",
  "Tax / VAT": "Steuer / USt.",
  "Total due": "Fälliger Betrag",
  "Service period": "Leistungszeitraum",
  "Service date": "Leistungsdatum",
  "VAT *": "Umsatzsteuer *",
  "Service from *": "Leistung von *",
  "Service to *": "Leistung bis *",
  "Invoice total (gross)": "Rechnungsbetrag (brutto)",
  "19 % VAT (standard rate)": "19 % USt. (Regelsteuersatz)",
  "7 % VAT (reduced rate)": "7 % USt. (ermäßigter Steuersatz)",
  "Reverse charge (§13b UStG)": "Steuerschuldnerschaft des Leistungsempfängers (§13b UStG)",
  "Small business (§19 UStG)": "Kleinunternehmer (§19 UStG)",
  "Intra-EU service (reverse charge)": "Innergemeinschaftliche Leistung (Reverse Charge)",
  "Standard rate: 19 % VAT is added to the net amount.":
    "Regelsteuersatz: 19 % Umsatzsteuer werden auf den Nettobetrag aufgeschlagen.",
  "Reduced rate: 7 % VAT, only for goods and services that qualify for it.":
    "Ermäßigter Steuersatz: 7 % Umsatzsteuer, nur für begünstigte Waren und Leistungen.",
  "Reverse charge (§13b UStG): no VAT on the invoice; the business customer pays the VAT. Common for construction and installation work between companies.":
    "Steuerschuldnerschaft des Leistungsempfängers (§13b UStG): keine Umsatzsteuer auf der Rechnung, der Unternehmer als Kunde schuldet die Steuer. Üblich bei Bau- und Montageleistungen zwischen Unternehmen.",
  "Small-business rule (§19 UStG): you charge no VAT because your turnover is below the limit.":
    "Kleinunternehmerregelung (§19 UStG): Sie berechnen keine Umsatzsteuer, weil Ihr Umsatz unter der Grenze liegt.",
  "Intra-EU service: no German VAT; the business customer in another EU country pays the VAT. Both VAT IDs must be on the invoice.":
    "Innergemeinschaftliche Leistung: keine deutsche Umsatzsteuer, der Unternehmer als Kunde in einem anderen EU-Land schuldet die Steuer. Beide USt-IdNrn. müssen auf der Rechnung stehen.",
  "Reverse charge: intra-EU service, VAT is payable by the recipient.":
    "Steuerschuldnerschaft des Leistungsempfängers (innergemeinschaftliche Leistung).",
  "Add your legal company name, address and tax number or VAT ID to your company profile before creating an invoice.":
    "Tragen Sie Ihren rechtlichen Firmennamen, Ihre Anschrift und Ihre Steuernummer oder USt-IdNr. im Unternehmensprofil ein, bevor Sie eine Rechnung erstellen.",
  "Open company profile": "Unternehmensprofil öffnen",
  "Choose a VAT mode: 19 %, 7 %, reverse charge (§13b), small business (§19) or intra-EU.":
    "Wählen Sie die Umsatzsteuer: 19 %, 7 %, Reverse Charge (§13b), Kleinunternehmer (§19) oder innergemeinschaftlich.",
  "Enter the service date or period as dates, with the end on or after the start.":
    "Geben Sie das Leistungsdatum oder den Leistungszeitraum als Datum an, das Ende am oder nach dem Beginn.",
  "This invoice was just submitted. Check your invoices before sending it again.":
    "Diese Rechnung wurde gerade eingereicht. Prüfen Sie Ihre Rechnungen, bevor Sie sie erneut senden.",
  // Escalations (T25)
  "Escalation resolved": "Eskalation gelöst",
  Support: "Unterstützung",
  Quality: "Qualität",
  Payment: "Zahlung",
  Safety: "Sicherheit",
  "Describe the issue in at least 10 characters.": "Beschreiben Sie das Problem mit mindestens 10 Zeichen.",
  "Choose a supplier who works on this project.":
    "Wählen Sie einen Lieferanten, der an diesem Projekt arbeitet.",
  // Backup import (T24)
  "Import backup?": "Sicherung importieren?",
  "Import backup": "Sicherung importieren",
  "Backup imported": "Sicherung importiert",
  "This is not a CraftCrew backup: users, projects, invoices and suppliers are missing.":
    "Dies ist keine CraftCrew-Sicherung: Benutzer, Projekte, Rechnungen und Lieferanten fehlen.",
  "The backup has no active admin account, so nobody could sign in.":
    "Die Sicherung enthält kein aktives Admin-Konto, daher könnte sich niemand anmelden.",
  // Supplier profile validation (T20)
  "Services: up to 30 entries of up to 80 characters each.":
    "Leistungen: bis zu 30 Einträge mit je bis zu 80 Zeichen.",
  "Certifications: up to 30 entries of up to 80 characters each.":
    "Zertifizierungen: bis zu 30 Einträge mit je bis zu 80 Zeichen.",
  "Availability must be Available, Busy or Unavailable.":
    "Verfügbarkeit muss Verfügbar, Ausgelastet oder Nicht verfügbar sein.",
  "Hourly rate must be a number of at least 0.": "Der Stundensatz muss eine Zahl von mindestens 0 sein.",
  "Project rate must be a number of at least 0.": "Der Projektpreis muss eine Zahl von mindestens 0 sein.",
  "Team members: up to 50 people.": "Teammitglieder: bis zu 50 Personen.",
  "Team members: each entry needs a name.": "Teammitglieder: Jeder Eintrag braucht einen Namen.",
  "Team members: name, role and experience must be text.":
    "Teammitglieder: Name, Rolle und Erfahrung müssen Text sein.",
  "Team members: each field can have up to 120 characters.":
    "Teammitglieder: Jedes Feld darf bis zu 120 Zeichen haben.",
  "Service catalog: up to 50 services.": "Leistungskatalog: bis zu 50 Leistungen.",
  "Service catalog: each service needs a name.": "Leistungskatalog: Jede Leistung braucht einen Namen.",
  "Service catalog: unit must be hour, day, project, unit or fixed.":
    "Leistungskatalog: Einheit muss Stunde, Tag, Projekt, Einheit oder Pauschal sein.",
  "Service catalog: rate must be a number of at least 0.":
    "Leistungskatalog: Der Preis muss eine Zahl von mindestens 0 sein.",
  hour: "Stunde",
  day: "Tag",
  project: "Projekt",
  unit: "Einheit",
  fixed: "Pauschal",
  "Your password was reset by an administrator. Please choose a new password to continue.":
    "Ihr Passwort wurde von einem Administrator zurückgesetzt. Bitte wählen Sie ein neues Passwort, um fortzufahren.",
  "The new passwords do not match": "Die neuen Passwörter stimmen nicht überein",
  "Send phaseIds as a list of this project's phase ids, each once.":
    "Senden Sie phaseIds als Liste der Phasen-IDs dieses Projekts, jede nur einmal.",
  "Phase deleted": "Phase gelöscht",
  Archived: "Archiviert",
  "This project is archived and can no longer be changed.":
    "Dieses Projekt ist archiviert und kann nicht mehr geändert werden.",
  "This task has invoices, so it cannot be deleted.":
    "Diese Aufgabe hat Rechnungen und kann daher nicht gelöscht werden.",
  "Remove supplier assignments and resolve invoices before deleting this phase.":
    "Entfernen Sie Lieferantenzuweisungen und klären Sie Rechnungen, bevor Sie diese Phase löschen.",
  "Add a short quote or next step (optional)": "Kurzes Angebot oder nächster Schritt (optional)",
  "Reason for declining (optional)": "Grund der Ablehnung (optional)",
  "Progress complete (0–100)": "Fortschritt (0–100)",
  Customize: "Anpassen",
});
const I18N_CM_PATTERNS = [
  [/^(\d+) company visit\(s\)$/, "$1 Firmeneinsätze"],
  [/^(\d+) supplier link\(s\)$/, "$1 Lieferantenverknüpfung(en)"],
  [/^(\d+) on site$/, "$1 vor Ort"],
  [/^(\d+) request\(s\)$/, "$1 Anfrage(n)"],
  [/^(\d+) supplier\(s\) · (\d+) project\(s\)$/, "$1 Lieferant(en) · $2 Projekt(e)"],
  [/^valid until (.+)$/, "gültig bis $1"],
  [/^since (.+)$/, "seit $1"],
  [/^Emergency (.+)$/, "Notruf $1"],
  [/^Contact (.+)$/, "Kontakt $1"],
  [/^updated (.+)$/, "aktualisiert $1"],
  [/^(\d+) requirement\(s\) on this site$/, "$1 Anforderung(en) an diesem Standort"],
  [/^(\d+)\/(\d+) company documents$/, "$1/$2 Unternehmensnachweise"],
  [/^(\d+)\/(\d+) workers ready$/, "$1/$2 Mitarbeitende bereit"],
  [/^(\d+) expiring soon$/, "$1 laufen bald ab"],
  [/^Safety briefing · version (\d+)$/, "Sicherheitsunterweisung · Version $1"],
  [/^Safety briefing · (.+)$/, "Sicherheitsunterweisung · $1"],
  [/^posted from abroad \(A1 needed\)$/, "aus dem Ausland entsandt (A1 nötig)"],
];
// Task and phase invitations
Object.assign(I18N_DE, {
  "Accepted work": "Angenommene Arbeiten",
  "Task invitation": "Aufgabeneinladung",
  "Phase invitation": "Phaseneinladung",
  Invited: "Eingeladen",
  "Decline task": "Aufgabe ablehnen",
  "Decline this task? You can tell the customer why (optional).":
    "Diese Aufgabe ablehnen? Sie können dem Kunden den Grund nennen (optional).",
  "Decline this phase invitation?": "Diese Phaseneinladung ablehnen?",
  "Task accepted — it is now in your assigned work": "Aufgabe angenommen – sie steht jetzt bei Ihren Aufträgen",
  "Phase accepted": "Phase angenommen",
  "Invitation declined": "Einladung abgelehnt",
  Withdraw: "Zurückziehen",
  "The supplier has not accepted this task yet. Wait for the answer or withdraw the invitation.":
    "Der Lieferant hat diese Aufgabe noch nicht angenommen. Warten Sie die Antwort ab oder ziehen Sie die Einladung zurück.",
  "Accept the invitation before invoicing this work.": "Nehmen Sie die Einladung an, bevor Sie diese Arbeit abrechnen.",
  "This invitation has already been answered.": "Diese Einladung wurde bereits beantwortet.",
  "There is no open invitation on this task.": "Für diese Aufgabe gibt es keine offene Einladung.",
});
const I18N_STATUS = { ...I18N_DE, Open: "Offen", Completed: "Abgeschlossen", Paid: "Bezahlt", New: "Neu" };
const I18N_PATTERNS = [
  ...I18N_CM_PATTERNS,
  [/^Invitation sent to (.+) on (.+)\. Work, time sheets and invoices start once they accept\.$/, "Einladung an $1 am $2 gesendet. Arbeit, Zeitnachweise und Rechnungen beginnen nach der Zusage."],
  [/^(.+) declined this task: “(.+)” Choose another supplier or request bids\.$/, "$1 hat diese Aufgabe abgelehnt: „$2“ Wählen Sie einen anderen Lieferanten oder holen Sie Angebote ein."],
  [/^(.+) declined this task\. Choose another supplier or request bids\.$/, "$1 hat diese Aufgabe abgelehnt. Wählen Sie einen anderen Lieferanten oder holen Sie Angebote ein."],
  [/^Task invitation · (.+)$/, "Aufgabeneinladung · $1"],
  [/^(.+) invoiced by you$/, "$1 von Ihnen abgerechnet"],
  [/^(\d+) invoice\(s\) from you$/, "$1 Rechnung(en) von Ihnen"],
  [/^You are invited to a task on this project\. Accept to see the full scope, documents and messages\.$/, "Sie sind zu einer Aufgabe in diesem Projekt eingeladen. Nehmen Sie an, um Umfang, Dokumente und Nachrichten zu sehen."],
  [/^You are invited to (\d+) tasks on this project\. Accept to see the full scope, documents and messages\.$/, "Sie sind zu $1 Aufgaben in diesem Projekt eingeladen. Nehmen Sie an, um Umfang, Dokumente und Nachrichten zu sehen."],
  [/^Phase invitation · (.+)$/, "Phaseneinladung · $1"],
  [/^Phase invitation: (.+)$/, "Phaseneinladung: $1"],
  [/^(.+) is already invited and has not answered yet\.$/, "$1 ist bereits eingeladen und hat noch nicht geantwortet."],
  [/^(.+) already accepted this task\.$/, "$1 hat diese Aufgabe bereits angenommen."],
  [/^(\d+) person\(s\) planned$/, "$1 Person(en) eingeplant"],
  [/^Valid until (.+)$/, "Gültig bis $1"],
  [/^Expires (.+)$/, "Läuft ab $1"],
  [/^Expired (.+)$/, "Abgelaufen $1"],
  [/^(\d+) item\(s\)$/, "$1 Element(e)"],
  [/^(\d+) selected$/, "$1 ausgewählt"],
  [/^(\d+) file\(s\)$/, "$1 Datei(en)"],
  [/^Earlier versions \((\d+)\)$/, "Frühere Versionen ($1)"],
  [/^Version (\d+)$/, "Version $1"],
  [/^(\d+) people$/, "$1 Personen"],
  [/^(\d+) field worker\(s\)$/, "$1 Monteur(e)"],
  [/^(\d+) double booking\(s\)$/, "$1 Doppelbuchung(en)"],
  [/^(\d+) task folder\(s\)$/, "$1 Aufgabenordner"],
  [/^Moved to (.+)$/, "Verschoben nach $1"],
  [/^was (.+)$/, "vorher $1"],
  [/^Last sign-in (.+)$/, "Letzte Anmeldung $1"],
  [/^Invitation sent to (.+)$/, "Einladung an $1 gesendet"],
  [/^Removed members \((\d+)\)$/, "Entfernte Mitglieder ($1)"],
  [/^Edit (.+)$/, "$1 bearbeiten"],
  [
    /^(.+) can now sign in\. Share these sign-in details personally — the temporary password is shown only once and must be changed at the first sign-in\.$/,
    "$1 kann sich jetzt anmelden. Geben Sie die Zugangsdaten persönlich weiter – das temporäre Passwort wird nur einmal angezeigt und muss bei der ersten Anmeldung geändert werden.",
  ],
  [/^(\d+) suppliers found$/, "$1 Lieferanten gefunden"],
  [/^(\d+) day\(s\) left$/, "noch $1 Tag(e)"],
  [/^(\d+) days left$/, "noch $1 Tage"],
  [/^(\d+)d late$/, "$1 T. verspätet"],
  [/^(\d+) days late$/, "$1 Tage verspätet"],
  [/^See all (\d+) suppliers ›$/, "Alle $1 Lieferanten ansehen ›"],
  [/^Good morning, (.+)\.$/, "Guten Morgen, $1."],
  [/^Good afternoon, (.+)\.$/, "Guten Tag, $1."],
  [/^Good evening, (.+)\.$/, "Guten Abend, $1."],
  [/^(\d+) things need a decision\. Everything else is on track\.$/, "$1 Dinge brauchen eine Entscheidung. Alles andere läuft nach Plan."],
  [/^Invoice (\d{4}-\d{4}) · (.+)$/, "Rechnung $1 · $2"],
  [/^Invoice (\d{4}-\d{4}) due$/, "Rechnung $1 fällig"],
  [/^1 offer · (.+)$/, "1 Angebot · $1"],
  [/^(\d+) offers · (.+)$/, "$1 Angebote · $2"],
  [/^Best (.+) from (.+) · closes (.+)$/, "Bestes Angebot $1 von $2 · endet $3"],
  [/^Best (.+) from (.+)$/, "Bestes Angebot $1 von $2"],
  [/^1 time entry · (.+) h$/, "1 Zeiteintrag · $1 h"],
  [/^(\d+) time entries · (.+) h$/, "$1 Zeiteinträge · $2 h"],
  [/^(.+) is 1 day late$/, "$1 ist 1 Tag verspätet"],
  [/^(.+) is (\d+) days late$/, "$1 ist $2 Tage verspätet"],
  [/^(.+) crew on site$/, "Team von $1 vor Ort"],
  [/^(\d+) % · on track$/, "$1 % · im Plan"],
  [/^(\d+) % · late$/, "$1 % · verspätet"],
  [/^(\d+) new jobs are waiting for your answer\.$/, "$1 neue Aufträge warten auf Ihre Antwort."],
  [/^New invitation · (.+)$/, "Neue Einladung · $1"],
  [/^(\d+) of (\d+) free$/, "$1 von $2 frei"],
  [/^\+ (.+) approved, paid (.+)$/, "+ $1 freigegeben, Zahlung am $2"],
  [/^\+ (.+) approved$/, "+ $1 freigegeben"],
  [/^Files \((\d+)\)$/, "Dateien ($1)"],
  [/^(.+) is waiting for (.+)$/, "$1 wartet auf $2"],
  [/^(\d+) documents to approve$/, "$1 Dokumente freizugeben"],
  [/^(.+) · 1 day late$/, "$1 · 1 Tag verspätet"],
  [/^(.+) · (\d+) days late$/, "$1 · $2 Tage verspätet"],
  [/^(.+) · invitation$/, "$1 · Einladung"],
  [/^(\d+) of 1 task$/, "$1 von 1 Aufgabe"],
  [/^(\d+) of (\d+) tasks$/, "$1 von $2 Aufgaben"],
  [/^(\d+) of (\d+) tasks · (\d+) late$/, "$1 von $2 Aufgaben · $3 verspätet"],
  [/^(\d+) of 1 task · (\d+) late$/, "$1 von 1 Aufgabe · $2 verspätet"],
  [/^complete · 1 day left$/, "erledigt · noch 1 Tag"],
  [/^complete · (\d+) days left$/, "erledigt · noch $1 Tage"],
  [/^complete · 1 day over$/, "erledigt · 1 Tag überzogen"],
  [/^complete · (\d+) days over$/, "erledigt · $1 Tage überzogen"],
  [/^(\d+) of (\d+) tasks complete$/, "$1 von $2 Aufgaben erledigt"],
  [/^(\d+) overdue · (\d+) open tasks$/, "$1 überfällig · $2 offene Aufgaben"],
  [/^(.+) of budget remaining · (.+) invoiced$/, "$1 Budget übrig · $2 abgerechnet"],
  [/^(\d+) documents · (\d+) to approve$/, "$1 Dokumente · $2 freizugeben"],
  [/^(\d+) invoices$/, "$1 Rechnungen"],
  [/^(\d+) available suppliers$/, "$1 verfügbare Lieferanten"],
  [/^Awaiting (.+)$/, "Wartet auf $1"],
  [/^due (.+)$/, "fällig $1"],
  [/^Accepted (\d.+)$/, "Abgenommen $1"],
  [/^Checklist · (\d+) of (\d+)$/, "Checkliste · $1 von $2"],
  [/^Ranked by price (\d+) %, delivery (\d+) %, track record (\d+) % and experience (\d+) %\.$/, "Gewichtet nach Preis $1 %, Lieferzeit $2 %, Leistung $3 % und Erfahrung $4 %."],
  [/^closes (.+)$/, "endet $1"],
  [/^Best match · (\d+)$/, "Beste Wahl · $1"],
  [/^Revised · (\d+)$/, "Überarbeitet · $1"],
  [/^Fastest · (\d+)$/, "Am schnellsten · $1"],
  [/^(.+) under your budget$/, "$1 unter Ihrem Budget"],
  [/^(.+) over your budget$/, "$1 über Ihrem Budget"],
  // Only "Was €1,234" (an earlier amount); a German sentence starting with "Was" must stay as it is
  [/^Was (€\s?[\d.,]+|[\d.,]+\s?€)$/, "Vorher $1"],
  [/^1 job with you$/, "1 Auftrag mit Ihnen"],
  [/^(\d+) jobs with you$/, "$1 Aufträge mit Ihnen"],
  [/^1 expires (.+)$/, "1 läuft ab $1"],
  [/^Award (.+)$/, "$1 beauftragen"],
  [/^Version (\d+) · corrected by (.+)$/, "Version $1 · korrigiert von $2"],
  [/^From (.+)$/, "Von $1"],
  [/^(\d+) % used$/, "$1 % genutzt"],
  [/^(.+) over$/, "$1 darüber"],
  [/^(.+) h of (.+) h$/, "$1 h von $2 h"],
  [/^task (\d+) % done$/, "Aufgabe zu $1 % erledigt"],
  [/^Due (\d.+)$/, "Fällig $1"],
  [/^incl\. (\d+) % VAT$/, "inkl. $1 % USt."],
  [/^Note to (.+) \(optional\)$/, "Nachricht an $1 (optional)"],
  [/^service (.+)$/, "Leistung $1"],
  [/^The total changed by (.+)\.$/, "Der Gesamtbetrag hat sich um $1 geändert."],
  [/^VAT (\d+) %$/, "USt. $1 %"],
  [/^VAT ID (.+)$/, "USt-IdNr. $1"],
  [/^Site visit · today$/, "Baustellenbesuch · heute"],
  [/^Site visit · checked in$/, "Baustellenbesuch · eingecheckt"],
  [/^Site visit · (\d\d:\d\d)$/, "Baustellenbesuch · $1"],
  [/^Messages · (\d+)$/, "Nachrichten · $1"],
  [/^Remove access for (.+)$/, "Zugriff für $1 entfernen"],
  [
    /^Your account is locked at once and deleted after (\d+) days\. Signing in before then cancels the deletion\. Invoices are kept for the legal retention period of 10 years, without your contact details\.( Your team members' logins are deleted too\.)?$/,
    (m, n, team) =>
      `Ihr Konto wird sofort gesperrt und nach ${n} Tagen gelöscht. Wenn Sie sich vorher anmelden, wird die Löschung aufgehoben. Rechnungen werden für die gesetzliche Aufbewahrungsfrist von 10 Jahren aufbewahrt, ohne Ihre Kontaktdaten.${team ? " Die Zugänge Ihrer Teammitglieder werden ebenfalls gelöscht." : ""}`,
  ],
  [/^Delete your account\? It is locked now and deleted after (\d+) days\.$/, "Konto löschen? Es wird jetzt gesperrt und nach $1 Tagen gelöscht."],
  [/^Your account will be deleted on (.+)\. Sign in before then to cancel\.$/, "Ihr Konto wird am $1 gelöscht. Melden Sie sich vorher an, um die Löschung aufzuheben."],
  [/^Project "(.+)" is still (.+)$/, 'Projekt „$1“ ist noch nicht abgeschlossen ($2)'],
  [/^Invoice (\S+) is approved but not paid$/, "Rechnung $1 ist freigegeben, aber nicht bezahlt"],
  [/^Invoice (\S+) is not decided yet$/, "Über Rechnung $1 ist noch nicht entschieden"],
  [/^Invoice (\S+) is not paid yet$/, "Rechnung $1 ist noch nicht bezahlt"],
  [/^Phase "(.+)" \((.+)\) is not completed$/, 'Phase „$1“ ($2) ist nicht abgeschlossen'],
  [/^Task "(.+)" \((.+)\) is not completed$/, 'Aufgabe „$1“ ($2) ist nicht abgeschlossen'],
  [/^A site visit on (\S+) is still (planned|checked in)$/, (m, d, s) => `Ein Baustellenbesuch am ${d} ist noch ${s === "planned" ? "geplant" : "eingecheckt"}`],
  [/^(.+) can sign in with the temporary password (\S+) and will choose a new one\.$/, "$1 kann sich mit dem vorläufigen Passwort $2 anmelden und wählt dann ein neues."],
  [/^We emailed (\S+) a link to set a password\.$/, "Wir haben $1 einen Link zum Festlegen des Passworts geschickt."],
  [/^(.+) can open the project now\.$/, "$1 kann das Projekt jetzt öffnen."],
  [/^(\d+) workers$/, "$1 Monteure"],
  [/^(\d+) % · due (.+)$/, "$1 % · fällig $2"],
  [/^Submit (\d+[.,]\d) Hours$/, "$1 Stunden senden"],
  [/^All · (\d+)$/, "Alle · $1"],
  [/^Invoice (\d{4}-\d{4})$/, "Rechnung $1"],
  [/^(\d+[.,]\d) h · (.+)$/, "$1 h · $2"],
  [/^(\d+) d waiting$/, "wartet seit $1 T."],
  [/^today$/, "heute"],
  [/^(\d+) recorded action\(s\)$/, "$1 protokollierte Aktion(en)"],
  [/^(\d+) invoice\(s\)$/, "$1 Rechnung(en)"],
  [/^(\d+) project\(s\)$/, "$1 Projekt(e)"],
  [/^(\d+) done · (\d+) overdue$/, "$1 erledigt · $2 überfällig"],
  [/^Nice progress — (\d+) steps? to go$/, "Gut gemacht – noch $1 Schritt(e)"],
  [/^Welcome to CraftCrew, (.+)$/, "Willkommen bei CraftCrew, $1"],
  [/^Welcome to CraftCrew$/, "Willkommen bei CraftCrew"],
  [/^(\d+)% complete$/, "$1 % abgeschlossen"],
  [/^Due (.+)$/, "Fällig $1"],
  [/^due (.+)$/, "fällig $1"],
  [/^(\d+) tasks · (\d+) complete · (\d+) documents$/, "$1 Aufgaben · $2 erledigt · $3 Dokumente"],
  [/^Savings (\d{4})$/, "Einsparungen $1"],
  [/^Page (\d+) of (\d+)$/, "Seite $1 von $2"],
  [
    /^(\d+) decision\(s\) waiting for you, oldest first\.$/,
    "$1 Entscheidung(en) warten auf Sie, älteste zuerst.",
  ],
  [/^(\d+) new this week$/, "$1 neu diese Woche"],
  [/^(\d+) renewing soon$/, "$1 laufen bald aus"],
  [/^(\d+)% of budget$/, "$1 % des Budgets"],
  [/^(\d+)% left$/, "$1 % übrig"],
  [/^Showing the latest (\d+)$/, "Die neuesten $1"],
  [/^Overdue: (.+)$/, "Überfällig: $1"],
  [/^Submitted (.+)$/, "Eingereicht $1"],
  [/^Typical rate for (.+): (.+)–(.+)\/h \(median (.+)\)$/, "Üblicher Satz für $1: $2–$3/h (Median $4)"],
  [/^(.+)\/h — within the typical range (.+)–(.+)\/h$/, "$1/h – im üblichen Bereich $2–$3/h"],
  [/^(.+)\/h — above the typical range (.+)–(.+)\/h$/, "$1/h – über dem üblichen Bereich $2–$3/h"],
  [/^(.+)\/h — below the typical range (.+)–(.+)\/h$/, "$1/h – unter dem üblichen Bereich $2–$3/h"],
  [/^Invite my preferred suppliers \((\d+)\)$/, "Meine bevorzugten Anbieter einladen ($1)"],
  [/^Recovery code used\. (\d+) left\.$/, "Wiederherstellungscode verwendet. Noch $1 übrig."],
  [
    /^A calendar link was created on (.+)\. For safety it is only shown once\. Create a new link if you need it again; the old one then stops working\.$/,
    "Am $1 wurde ein Kalenderlink erstellt. Aus Sicherheitsgründen wird er nur einmal angezeigt. Erstellen Sie bei Bedarf einen neuen Link; der alte funktioniert dann nicht mehr.",
  ],
  [/^📷 Photo (\d+)$/, "📷 Foto $1"],
  [/^Photo (\d+)$/, "Foto $1"],
  [/^Remove photo (\d+)$/, "Foto $1 entfernen"],
  [/^📷 Fix photo (\d+)$/, "📷 Foto der Behebung $1"],
  [/^Send request to (\d+) supplier\(s\)$/, "Anfrage an $1 Anbieter senden"],
  [/^Quote request sent to (\d+) supplier\(s\)$/, "Angebotsanfrage an $1 Anbieter gesendet"],
  [/^(.+) of (.+) required$/, "$1 von $2 erforderlich"],
  [/^([\d.,]+ €) \/ hour$/, "$1 / Stunde"],
  [/^([\d.,]+ €) \/ project$/, "$1 / Projekt"],
  [/^(\d+) project teams?$/, "$1 Projektteam(s)"],
  [
    /^(\d+) registered worker\(s\) with (\d+) qualification document\(s\)\.$/,
    "$1 registrierte Mitarbeitende mit $2 Qualifikationsnachweis(en).",
  ],
  [/^([\d.,]+) h pending approval$/, "$1 h warten auf Freigabe"],
  [/^of (\d+)$/, "von $1"],
  [/^Compliance document expires on (\S+): (.+)$/, "Nachweis läuft ab am $1: $2"],
  [/^application (Approved|Rejected|New|On Hold)$/, "Bewerbung $1"],
  [/^invoice (Submitted|Approved|Paid|Rejected)$/, "Rechnung $1"],
  [/^Review$/, "Prüfen"],
  [/^Open$/, "Öffnen"],
  [/^Overdue$/, "Überfällig"],
  [/^Submitted$/, "Eingereicht"],
  [/^Approved$/, "Freigegeben"],
  [/^of (.+ €)$/, "von $1"],
  [/^(\d+) days$/, "$1 Tage"],
  [/^(\d+) hours$/, "$1 Stunden"],
  [/^(\d+) projects?$/, "$1 Projekt(e)"],
  [/^(.*) · (\d+) days remaining$/, "$1 · noch $2 Tage"],
  [/^Order not set · (.+)$/, "Kein Auftrag festgelegt · $1"],
  [/^([\d.,]+) \/ ([\d.,]+) h approved estimate$/, "$1 / $2 h freigegeben von der Schätzung"],
  [/^(.*) · Payment terms: (\d+) days net\.$/, "$1 · Zahlungsbedingungen: $2 Tage netto."],
  [
    /^(.*) · Payment terms: As agreed in the project order\.$/,
    "$1 · Zahlungsbedingungen: Gemäß Projektauftrag.",
  ],
  [/^Linked task: (.+)$/, "Verknüpfte Aufgabe: $1"],
  [/^Submitted · issued (.+)$/, "Eingereicht · ausgestellt $1"],
  [/^Approved · issued (.+)$/, "Freigegeben · ausgestellt $1"],
  [/^Paid · issued (.+)$/, "Bezahlt · ausgestellt $1"],
  [/^Rejected · issued (.+)$/, "Abgelehnt · ausgestellt $1"],
  [/^Changes Requested · issued (.+)$/, "Änderungen angefordert · ausgestellt $1"],
  [/^Status: Submitted$/, "Status: Eingereicht"],
  [/^Status: Approved$/, "Status: Freigegeben"],
  [/^Status: Paid$/, "Status: Bezahlt"],
  [/^Status: Rejected$/, "Status: Abgelehnt"],
  [/^Status: Changes Requested$/, "Status: Änderungen angefordert"],
  [
    /^This project has (\d+) invoice\(s\), (\d+) document\(s\) and (\d+) supplier\(s\)\. It will be archived, not deleted\.$/,
    "Dieses Projekt hat $1 Rechnung(en), $2 Dokument(e) und $3 Lieferant(en). Es wird archiviert, nicht gelöscht.",
  ],
  [
    /^"(.+)" has no invoices, documents or suppliers, so it will be deleted for good\. Type the project name to confirm\.$/,
    "„$1“ hat keine Rechnungen, Dokumente oder Lieferanten und wird endgültig gelöscht. Geben Sie zur Bestätigung den Projektnamen ein.",
  ],
  [
    /^"(.+)" and its (\d+) task\(s\) will be deleted for good\. Type the phase name to confirm\.$/,
    "„$1“ und die $2 Aufgabe(n) darin werden endgültig gelöscht. Geben Sie zur Bestätigung den Phasennamen ein.",
  ],
  [
    /^"(.+)" will be deleted for good\. Type the task name to confirm\.$/,
    "„$1“ wird endgültig gelöscht. Geben Sie zur Bestätigung den Aufgabennamen ein.",
  ],
  [/^Review invoice (.+)$/, "Rechnung $1 prüfen"],
  [/^Decide on offers for (.+)$/, "Über Angebote für $1 entscheiden"],
  [/^Approve (\d+) time entr(?:y|ies)$/, "$1 Zeiteintrag/-einträge freigeben"],
  [/^Approve document (.+)$/, "Dokument $1 freigeben"],
  [/^Task invitation: (.+)$/, "Aufgabeneinladung: $1"],
  [/^Bid request: (.+)$/, "Angebotsanfrage: $1"],
  [/^Changes requested on your offer for (.+)$/, "Änderungen an Ihrem Angebot für $1 angefragt"],
  [/^Changes requested on invoice (.+)$/, "Änderungen an Rechnung $1 angefragt"],
  [/^Expiring: (.+)$/, "Läuft ab: $1"],
  [/^Expired: (.+)$/, "Abgelaufen: $1"],
  [/^Vet application: (.+)$/, "Bewerbung prüfen: $1"],
  [/^Escalation: (.+)$/, "Eskalation: $1"],
  [/^Mark invoice (.+) as paid$/, "Rechnung $1 als bezahlt markieren"],
  [/^(\d+) offer\(s\) received$/, "$1 Angebot(e) erhalten"],
  [/^Deadline (.+)$/, "Frist $1"],
  [/^([\d.]+) h submitted$/, "$1 h eingereicht"],
  [/^Due (\d{4}-\d{2}-\d{2})$/, "Fällig $1"],
  [/^\+ (\d+) more$/, "+ $1 weitere"],
  [/^(\d+) of (\d+) steps done$/, "$1 von $2 Schritten erledigt"],
  [/^Waiting for review since (\d+) days?$/, "Wartet seit $1 Tag(en) auf Prüfung"],
  [/^Reminder: invoice (.+) is waiting for your review$/, "Erinnerung: Rechnung $1 wartet auf Ihre Prüfung"],
  [
    /^Second reminder: invoice (.+) has been waiting for your review for 7 days$/,
    "Zweite Erinnerung: Rechnung $1 wartet seit 7 Tagen auf Ihre Prüfung",
  ],
  [
    /^Invoice (.+) has been waiting for customer review for 7 days$/,
    "Rechnung $1 wartet seit 7 Tagen auf die Prüfung durch den Kunden",
  ],
  [/^Invoice (.+) is overdue: payment was due (.+)$/, "Rechnung $1 ist überfällig: Zahlung war fällig am $2"],
  [/^Invoice waiting > 7 days: (.+)$/, "Rechnung wartet > 7 Tage: $1"],
  [/^Application waiting > 3 days: (.+)$/, "Bewerbung wartet > 3 Tage: $1"],
  [/^Open escalation: (.+)$/, "Offene Eskalation: $1"],
  [/^(\d+) overdue tasks? · (\d+) open tasks?$/, "$1 überfällig · $2 offene Aufgaben"],
  [
    /^(\d+) overdue task\(s\)\. Review dependent dates, supplier schedules and remaining budget\.$/,
    "$1 überfällige Aufgabe(n). Prüfen Sie abhängige Termine, Lieferantenpläne und das Restbudget.",
  ],
  [
    /^(\d+) tasks · approved supplier time compared with estimates$/,
    "$1 Aufgaben · freigegebene Lieferantenzeit im Vergleich zur Schätzung",
  ],
  [
    /^([\d.,]+) of ([\d.,]+) hours approved \((\d+)%\)\. (.+) approved time value\.$/,
    "$1 von $2 Stunden freigegeben ($3 %). $4 freigegebener Zeitwert.",
  ],
  [
    /^No hour estimate is set for this work item\. (.+) approved time value\.$/,
    "Für diese Aufgabe ist keine Stundenschätzung hinterlegt. $1 freigegebener Zeitwert.",
  ],
  [/^(\d+) won · (\d+) lost · (\d+) open$/, "$1 gewonnen · $2 verloren · $3 offen"],
  [/^(.+) approved · (.+) in review$/, "$1 freigegeben · $2 in Prüfung"],
  [/^(.+) paid · (.+) approved$/, "$1 bezahlt · $2 freigegeben"],
  [/^All activity \((\d+)\)$/, "Alle Aktivitäten ($1)"],
  [
    /^(\d+)% of applications approved · (\d+) rejected · (\d+) on hold$/,
    "$1 % der Bewerbungen freigegeben · $2 abgelehnt · $3 zurückgestellt",
  ],
  [/^(\d+) rejected or returned$/, "$1 abgelehnt oder zurückgegeben"],
  [
    /^(.+) in fees on approved and paid invoices over 6 months \(([\d.]+)% rate\)\.$/,
    "$1 Gebühren aus freigegebenen und bezahlten Rechnungen in 6 Monaten (Satz $2 %).",
  ],
  [/^Application status: (.+)$/, "Bewerbungsstatus: $1"],
  [/^(\d+) completed · (\d+) overdue work items$/, "$1 erledigt · $2 überfällige Arbeitspakete"],
  [/^(\d+) in progress$/, "$1 in Bearbeitung"],
  [/^(\d+) on hold$/, "$1 pausiert"],
  [/^(\d+) completed$/, "$1 abgeschlossen"],
  [/^(\d+) awarded event\(s\) vs\. baseline$/, "$1 vergebene Ausschreibung(en) vs. Referenz"],
  [/^request → award$/, "Anfrage → Zuschlag"],
  [/^(\d+) offer\(s\) · deadline (.+)$/, "$1 Angebot(e) · Frist $2"],
  [/^(\d+) sent$/, "$1 gesendet"],
  [/^(\d+) h pending approval$/, "$1 h warten auf Freigabe"],
  [/^(\d+) decided invoice\(s\)$/, "$1 entschiedene Rechnung(en)"],
  [/^ends (.+)$/, "endet $1"],
  [/^notice by (.+)$/, "Kündigung bis $1"],
  [
    /^Completed (.+) · the project is closed for new work\.$/,
    "Abgeschlossen am $1 · keine neuen Arbeiten mehr.",
  ],
];
/* Composite texts: "Build & integration · In Progress", "In Progress: 3" — translate the known parts. */
function i18nComposite(t, el) {
  if (t.includes(" · ")) {
    const parts = t.split(" · "),
      out = parts.map((p) => i18nText(p, el).trim());
    return out.join(" · ") !== t ? out.join(" · ") : null;
  }
  const m = t.match(/^([^:]{2,40}): (.+)$/);
  if (m && Object.prototype.hasOwnProperty.call(I18N_DE, m[1]))
    return `${I18N_DE[m[1]]}: ${i18nText(m[2], el).trim()}`;
  return null;
}
const I18N_MONTHS = {
  Jan: "Jan.",
  Feb: "Feb.",
  Mar: "März",
  Apr: "Apr.",
  May: "Mai",
  Jun: "Juni",
  Jul: "Juli",
  Aug: "Aug.",
  Sep: "Sept.",
  Sept: "Sept.",
  Oct: "Okt.",
  Nov: "Nov.",
  Dec: "Dez.",
};
const I18N_MONTHS_LONG = {
  January: "Januar",
  February: "Februar",
  March: "März",
  April: "April",
  May: "Mai",
  June: "Juni",
  July: "Juli",
  August: "August",
  September: "September",
  October: "Oktober",
  November: "November",
  December: "Dezember",
};

let i18nLang = (() => {
  try {
    return (
      localStorage.getItem("cc_lang") ||
      ((navigator.language || "").toLowerCase().startsWith("de") && "de") ||
      "en"
    );
  } catch {
    return "en";
  }
})();
const I18N_ORIGINAL = new WeakMap();

function i18nFormat(text) {
  // Dates (en-GB "12 Oct 2026", "October 2026") and amounts ("€12,500", "EUR 1,234.50").
  return text
    .replace(
      /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec) (\d{4})\b/g,
      (_, d, m, y) => `${d}. ${I18N_MONTHS[m]} ${y}`,
    )
    .replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)( \d{4})?\b/g,
      (_, m, y = "") => I18N_MONTHS_LONG[m] + y,
    )
    .replace(
      /([−+-]?)€\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g,
      (_, sign, n) => `${sign}${n.replace(/,/g, "X").replace(/\./g, ",").replace(/X/g, ".")} €`,
    );
}
function i18nText(raw, el) {
  const lead = raw.match(/^\s*/)[0],
    trail = raw.match(/\s*$/)[0],
    t = raw.trim();
  if (!t) return raw;
  let out = null;
  // Status badges have their own vocabulary ("Open" = "Offen", not "Öffnen").
  if (
    el?.closest?.(".status, .tag, .pa-pill, .sr-risk") &&
    Object.prototype.hasOwnProperty.call(I18N_STATUS, t)
  )
    out = I18N_STATUS[t];
  // Multi-word phrases translate anywhere; single words only inside interface elements.
  else if (Object.prototype.hasOwnProperty.call(I18N_DE, t) && (/\s/.test(t) || el?.closest?.(I18N_UI_SCOPE)))
    out = I18N_DE[t];
  if (out === null)
    for (const [re, rep] of I18N_PATTERNS)
      if (re.test(t)) {
        out = i18nFormat(t.replace(re, rep));
        break;
      }
  if (out === null) out = i18nComposite(t, el);
  if (out === null) {
    const f = i18nFormat(t);
    if (f !== t) out = f;
  }
  return out === null ? raw : lead + out + trail;
}
// Pages drawn with translation keys (T125) are already in the right language; the nearest data-i18n decides,
// so data-i18n="dom" inside such a page marks text from the server (error messages) that still needs this layer.
const i18nKeyPage = (el) => el.closest("[data-i18n]")?.dataset.i18n === "keys";
function i18nApply(root = document.body) {
  if (i18nLang !== "de" || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (
        !p ||
        !n.nodeValue.trim() ||
        p.closest(
          "script, style, textarea, code, pre, [contenteditable], [data-no-i18n], .cc-chat-bubble p, .legal-body, .sr-note p, input",
        ) ||
        i18nKeyPage(p)
      )
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const next = i18nText(n.nodeValue, n.parentElement);
    if (next !== n.nodeValue) {
      if (!I18N_ORIGINAL.has(n)) I18N_ORIGINAL.set(n, n.nodeValue);
      n.nodeValue = next;
    }
  }
  for (const el of root.querySelectorAll("[placeholder], [title], [aria-label]"))
    for (const attr of i18nKeyPage(el) ? [] : ["placeholder", "title", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      const t = v.trim(),
        next =
          I18N_DE[t] || (I18N_DE[t.replace(/…$/, "").trim()] && I18N_DE[t.replace(/…$/, "").trim()] + "…");
      if (next) el.setAttribute(attr, next);
    }
  document.documentElement.lang = "de";
}
function i18nSet(lang) {
  try {
    localStorage.setItem("cc_lang", lang);
  } catch {}
  location.reload();
}
function i18nSwitch() {
  const html = `<div class="i18n-switch" role="group" aria-label="Language"><button type="button" class="${i18nLang === "de" ? "on" : ""}" onclick="i18nSet('de')" data-no-i18n>DE</button><button type="button" class="${i18nLang === "en" ? "on" : ""}" onclick="i18nSet('en')" data-no-i18n>EN</button></div>`;
  const top = document.getElementById("topActions");
  if (top && !top.querySelector(".i18n-switch")) top.insertAdjacentHTML("afterbegin", html);
}
/* Translate toasts, modals and every re-render. */
let i18nPending = false;
new MutationObserver(() => {
  if (i18nPending) return;
  i18nPending = true;
  requestAnimationFrame(() => {
    i18nPending = false;
    i18nSwitch();
    i18nApply(document.body);
  });
}).observe(document.body, { childList: true, subtree: true, characterData: false });
const i18nBaseToast = toast;
// opts.translated: the text comes from t() (tToast) and is already in the right language
toast = function (msg, type, opts) {
  return i18nBaseToast(i18nLang === "de" && !opts?.translated ? i18nText(String(msg)) : msg, type);
};
/* The chosen language travels with sign-ups and applications (for German emails) and is kept on the account. */
const i18nBaseApi = api;
api = async function (path, opts = {}) {
  if (
    opts.method === "POST" &&
    ["/auth/signup", "/applications"].includes(path) &&
    opts.body &&
    typeof opts.body === "object"
  )
    opts.body = { ...opts.body, language: i18nLang };
  const result = await i18nBaseApi(path, opts);
  if (path === "/auth/login" && result?.user && state.token !== result.token)
    setTimeout(i18nSyncAccount, 500);
  return result;
};
function i18nSyncAccount() {
  if (state.token && state.user && state.user.language !== i18nLang)
    i18nBaseApi("/account/preferences", { method: "PUT", body: { language: i18nLang } })
      .then(() => {
        state.user.language = i18nLang;
      })
      .catch(() => {});
}
document.documentElement.lang = i18nLang;
i18nSwitch();
i18nApply();
setTimeout(i18nSyncAccount, 1500);
