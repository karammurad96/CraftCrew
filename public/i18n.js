/* Interface language (English / German).
   The UI is rendered from English templates; this layer translates the rendered DOM after every
   render: exact phrases, a few patterns, dates and amounts. Single-word entries are applied only
   inside interface elements (buttons, labels, headers, menus, badges) so user content such as a
   phase called "Design" is never changed. */
const I18N_UI_SCOPE =
  "button, a.btn, th, label, legend, summary, option, nav a, .status, .tag, .cc-label, .eyebrow, .pa-pill, .sr-risk, .in-col header b, .ui-count, .stage-flow span, .sr-chips a, .ob-count, h1, h2, h3, h4, dt, .panel-title small, kbd";
const I18N_DE = {
  // Navigation & shell
  Dashboard: "Übersicht",
  Analytics: "Analysen",
  Approvals: "Freigaben",
  Projects: "Projekte",
  Sourcing: "Beschaffung",
  Contracts: "Verträge",
  "Offers overview": "Angebotsübersicht",
  "Find Suppliers": "Lieferanten finden",
  "Find suppliers": "Lieferanten finden",
  Invoices: "Rechnungen",
  Inbox: "Posteingang",
  "Time approvals": "Zeitfreigaben",
  Messages: "Nachrichten",
  "Profile / Settings": "Profil / Einstellungen",
  "Bid opportunities": "Ausschreibungen",
  "Quote Requests": "Angebotsanfragen",
  "Assigned work": "Zugewiesene Arbeit",
  "Service Catalog": "Leistungskatalog",
  "Time & approvals": "Zeiten & Freigaben",
  "Profile / Billing": "Profil / Abrechnung",
  "Admin Dashboard": "Admin-Übersicht",
  "Vetting Queue": "Prüfwarteschlange",
  Users: "Benutzer",
  "Payments & Billing": "Zahlungen & Abrechnung",
  "Platform Management": "Plattformverwaltung",
  "Reports & Analytics": "Berichte & Analysen",
  "Audit log": "Audit-Protokoll",
  Escalations: "Eskalationen",
  Settings: "Einstellungen",
  Search: "Suche",
  "Help & FAQ": "Hilfe & FAQ",
  "Log out": "Abmelden",
  "Log in": "Anmelden",
  "How it works": "So funktioniert es",
  Pricing: "Preise",
  FAQ: "FAQ",
  "Industrial services, coordinated end-to-end.": "Industrielle Dienstleistungen, durchgängig koordiniert.",
  "Getting started checklist": "Checkliste für den Start",
  Notifications: "Benachrichtigungen",
  "Mark all as read": "Alle als gelesen markieren",
  "Open inbox": "Posteingang öffnen",
  "You are all caught up.": "Alles erledigt.",
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
  "List view": "Listenansicht",
  "Board view": "Board-Ansicht",
  "▦ Board view": "▦ Board-Ansicht",
  "Open in new tab": "In neuem Tab öffnen",
  Send: "Senden",
  Submit: "Absenden",
  Approve: "Freigeben",
  Reject: "Ablehnen",
  "Request changes": "Änderungen anfordern",
  Award: "Zuschlag erteilen",
  Evaluate: "Bewerten",
  "View profile": "Profil ansehen",
  "Request quote": "Angebot anfragen",
  "Request a quote": "Angebot anfragen",
  "Request bids": "Angebote einholen",
  Documents: "Dokumente",
  "Edit task": "Aufgabe bearbeiten",
  "Edit phase": "Phase bearbeiten",
  "Edit project": "Projekt bearbeiten",
  "Change supplier": "Lieferant wechseln",
  "Select supplier": "Lieferant auswählen",
  "+ Add task": "+ Aufgabe hinzufügen",
  "+ Add phase": "+ Phase hinzufügen",
  "+ New project": "+ Neues Projekt",
  "+ New contract": "+ Neuer Vertrag",
  "+ New chat": "+ Neuer Chat",
  "+ Create invoice": "+ Rechnung erstellen",
  "+ Invite suppliers": "+ Lieferanten einladen",
  "+ Request bids for a task": "+ Angebote für Aufgabe einholen",
  "+ Log time": "+ Zeit erfassen",
  "+ Upload document": "+ Dokument hochladen",
  "Open project": "Projekt öffnen",
  "Open phase documents": "Phasendokumente öffnen",
  "Mark project complete": "Projekt abschließen",
  "Escalate / support": "Eskalieren / Support",
  "Project documents": "Projektdokumente",
  "Project invoices": "Projektrechnungen",
  "Project messages": "Projektnachrichten",
  "Compare offers": "Angebote vergleichen",
  "Edit & resend request": "Anfrage bearbeiten & erneut senden",
  "Close bidding": "Ausschreibung schließen",
  "Post update": "Update veröffentlichen",
  "Update progress": "Fortschritt aktualisieren",
  "Save progress": "Fortschritt speichern",
  "Upload deliverable": "Ergebnis hochladen",
  "Save weights": "Gewichtung speichern",
  "Close without award": "Ohne Zuschlag schließen",
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
  "Create project": "Projekt erstellen",
  "Publish event": "Ausschreibung veröffentlichen",
  "Send offer": "Angebot senden",
  "Save and resend": "Speichern & erneut senden",
  "Create contract": "Vertrag anlegen",
  "Save contract": "Vertrag speichern",
  "Submit review": "Bewertung absenden",
  "Start a project": "Projekt starten",
  "Explore suppliers": "Lieferanten entdecken",
  "Start as a customer": "Als Kunde starten",
  "Apply as a supplier": "Als Lieferant bewerben",
  "Browse the full directory →": "Zum vollständigen Verzeichnis →",
  "Sign up": "Registrieren",
  "Create account": "Konto erstellen",
  "Forgot password?": "Passwort vergessen?",
  "Send reset link": "Link zum Zurücksetzen senden",
  "Save new password": "Neues Passwort speichern",
  "Send the link again": "Link erneut senden",
  "Back to sign in": "Zurück zur Anmeldung",
  "Go to sign in": "Zur Anmeldung",
  "Sign in": "Anmelden",
  "Try again": "Erneut versuchen",
  Retry: "Erneut versuchen",
  "Get started": "Loslegen",
  "Search chats or people": "Chats oder Personen suchen",
  "Write a message...": "Nachricht schreiben …",
  "Drag files here": "Dateien hierher ziehen",
  browse: "durchsuchen",
  "Open project": "Projekt öffnen",
  // Dashboards & panels
  "Customer dashboard": "Kunden-Übersicht",
  "Supplier dashboard": "Lieferanten-Übersicht",
  "Admin dashboard": "Admin-Übersicht",
  "Coordinate active projects, phases and payments.": "Aktive Projekte, Phasen und Zahlungen koordinieren.",
  "Active projects": "Aktive Projekte",
  Completed: "Abgeschlossen",
  "Pending invoices": "Offene Rechnungen",
  "Project value": "Projektvolumen",
  "View all": "Alle ansehen",
  "Delayed work": "Verzögerte Arbeiten",
  "Upcoming deadlines": "Anstehende Termine",
  "Invoices to review": "Zu prüfende Rechnungen",
  "Recent messages": "Neueste Nachrichten",
  "Nothing is overdue.": "Nichts ist überfällig.",
  "No deadlines in the next 14 days.": "Keine Termine in den nächsten 14 Tagen.",
  "No invoices are waiting for you.": "Keine Rechnungen warten auf Sie.",
  "No messages yet.": "Noch keine Nachrichten.",
  "Revenue overview · platform fees": "Umsatzübersicht · Plattformgebühren",
  Alerts: "Hinweise",
  "Recent activity": "Letzte Aktivitäten",
  "No alerts. Everything is on track.": "Keine Hinweise. Alles im Plan.",
  "Vetting queue": "Prüfwarteschlange",
  "Queue is clear.": "Warteschlange ist leer.",
  "Paid out": "Ausgezahlt",
  "Approved · awaiting payment": "Freigegeben · Zahlung ausstehend",
  "In review": "In Prüfung",
  "Paid this month": "Diesen Monat bezahlt",
  "Pending invitations": "Offene Einladungen",
  "Assigned projects": "Zugewiesene Projekte",
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
  "HOW IT WORKS": "SO FUNKTIONIERT ES",
  "From supplier application to project completion.":
    "Von der Lieferantenbewerbung bis zum Projektabschluss.",
  "FOR BOTH SIDES": "FÜR BEIDE SEITEN",
  "A professional operating layer for industrial work.":
    "Eine professionelle Arbeitsumgebung für industrielle Projekte.",
  "For SMEs": "Für KMU",
  "For suppliers": "Für Lieferanten",
  "For operations teams": "Für Betriebsteams",
  "FEATURED SUPPLIERS": "AUSGEWÄHLTE LIEFERANTEN",
  "Vetted partners ready for your next project": "Geprüfte Partner für Ihr nächstes Projekt",
  "STRATEGIC SOURCING": "STRATEGISCHE BESCHAFFUNG",
  "From sourcing event to signed contract": "Von der Ausschreibung zum unterschriebenen Vertrag",
  "Run competitive sourcing the way large procurement teams do — sized for industrial SMEs.":
    "Wettbewerbliche Beschaffung wie in großen Einkaufsabteilungen – zugeschnitten auf industrielle KMU.",
  "Sourcing events": "Ausschreibungen",
  "Weighted evaluation": "Gewichtete Bewertung",
  "Contract management": "Vertragsmanagement",
  "Scorecards & risk": "Scorecards & Risiko",
  "Approvals inbox": "Freigabe-Eingang",
  "Full audit trail": "Lückenloser Audit-Trail",
  "Ready to coordinate your next industrial project?": "Bereit für Ihr nächstes Industrieprojekt?",
  "Customers start free. Suppliers join after a 5-step verification.":
    "Kunden starten kostenlos. Lieferanten nach einer 5-stufigen Prüfung.",
  "vetted suppliers": "geprüfte Lieferanten",
  "supplier vetting": "Lieferantenprüfung",
  "waterfall delivery": "Phasenplanung",
  "projects & payments": "Projekte & Zahlungen",
  "SUPPLIER DIRECTORY": "LIEFERANTENVERZEICHNIS",
  "Find the right industrial specialist.": "Den passenden Industriespezialisten finden.",
  "Explore service, workforce, certifications, rate and location.":
    "Leistungen, Personal, Zertifikate, Stundensätze und Standort vergleichen.",
  "All services": "Alle Leistungen",
  "All badges": "Alle Badges",
  "Available now": "Jetzt verfügbar",
  "More filters": "Weitere Filter",
  Service: "Leistung",
  Badge: "Badge",
  "Welcome back": "Willkommen zurück",
  "Sign in to your CraftCrew workspace.": "Melden Sie sich bei Ihrem CraftCrew-Arbeitsbereich an.",
  "Create your account": "Konto erstellen",
  "Start coordinating industrial work.": "Starten Sie mit der Koordination industrieller Arbeit.",
  Name: "Name",
  Company: "Unternehmen",
  "Account type": "Kontotyp",
  Customer: "Kunde",
  Supplier: "Lieferant",
  Email: "E-Mail",
  Password: "Passwort",
  "No account?": "Noch kein Konto?",
  "Already registered?": "Bereits registriert?",
  "Check your inbox": "Prüfen Sie Ihr Postfach",
  "Forgot your password?": "Passwort vergessen?",
  "Choose a new password": "Neues Passwort wählen",
  "Password changed": "Passwort geändert",
  // Projects & work
  "Project phases": "Projektphasen",
  "Project schedule": "Projektzeitplan",
  Budget: "Budget",
  Schedule: "Zeitplan",
  Delivery: "Lieferung",
  "Project desk": "Projektschreibtisch",
  "ASSIGNABLE TASK": "ZUWEISBARE AUFGABE",
  "ASSIGNED TASK": "ZUGEWIESENE AUFGABE",
  "PROJECT WORKSPACE": "PROJEKTARBEITSBEREICH",
  "TASK BOARD": "AUFGABEN-BOARD",
  Tasks: "Aufgaben",
  Status: "Status",
  "Order amount": "Auftragswert",
  "Approved time": "Freigegebene Zeit",
  Estimate: "Schätzung",
  "Time vs estimate": "Zeit vs. Schätzung",
  "Not set": "Nicht gesetzt",
  "Supplier request history": "Anfragehistorie",
  "Activity log": "Aktivitätsprotokoll",
  "Progress updates": "Fortschrittsmeldungen",
  "No progress updates posted yet.": "Noch keine Fortschrittsmeldungen.",
  "Phase order": "Phasenreihenfolge",
  "All phases": "Alle Phasen",
  "Drop cards here": "Karten hier ablegen",
  Unassigned: "Nicht zugewiesen",
  "Create new project": "Neues Projekt anlegen",
  "Project name *": "Projektname *",
  "Budget (€) *": "Budget (€) *",
  "Description *": "Beschreibung *",
  Requirements: "Anforderungen",
  "Site location": "Standort",
  "Project template": "Projektvorlage",
  "Start date": "Startdatum",
  "Due date *": "Fälligkeitsdatum *",
  Project: "Projekt",
  Phase: "Phase",
  Task: "Aufgabe",
  "Progress complete (%)": "Fortschritt (%)",
  "Work status": "Arbeitsstatus",
  "Milestone reached (optional)": "Erreichter Meilenstein (optional)",
  "Progress note for the customer": "Fortschrittsnotiz für den Kunden",
  "Update task progress": "Aufgabenfortschritt aktualisieren",
  "Review supplier performance": "Lieferantenleistung bewerten",
  "Overall rating": "Gesamtbewertung",
  "Quality of work": "Arbeitsqualität",
  "Schedule reliability": "Termintreue",
  Communication: "Kommunikation",
  Comment: "Kommentar",
  Folders: "Ordner",
  "All files": "Alle Dateien",
  "Project root": "Projektebene",
  "Search this project": "Projekt durchsuchen",
  // Sourcing & contracts
  "Active events": "Aktive Ausschreibungen",
  "In contract": "Unter Vertrag",
  "Avg. cycle time": "Ø Durchlaufzeit",
  Event: "Ausschreibung",
  Category: "Kategorie",
  Baseline: "Referenzbudget",
  Bids: "Angebote",
  Deadline: "Frist",
  "Spend by category": "Ausgaben nach Kategorie",
  "Contracts renewing": "Auslaufende Verträge",
  "All contracts": "Alle Verträge",
  "Supplier scorecards": "Lieferanten-Scorecards",
  "Supplier scorecard": "Lieferanten-Scorecard",
  "Supplier scorecards & risk": "Lieferanten-Scorecards & Risiko",
  Score: "Score",
  Rating: "Bewertung",
  "On time": "Pünktlich",
  "Invoices right first time": "Rechnungen ohne Korrektur",
  "Response rate": "Antwortquote",
  Risk: "Risiko",
  "Evaluation weights": "Bewertungsgewichtung",
  "Offers ranked": "Angebote nach Rang",
  "Automatic evaluation": "Automatische Bewertung",
  Price: "Preis",
  "Delivery time": "Lieferzeit",
  "Supplier performance": "Lieferantenleistung",
  "Experience & badge": "Erfahrung & Badge",
  "Weighted score": "Gewichteter Score",
  Offer: "Angebot",
  "vs. baseline": "vs. Referenz",
  Recommended: "Empfohlen",
  "Answers side by side": "Antworten im Vergleich",
  "Scope notes": "Leistungsumfang",
  Scope: "Leistungsumfang",
  Question: "Frage",
  "Create sourcing event": "Ausschreibung anlegen",
  "Event type": "Ausschreibungsart",
  Title: "Titel",
  "Response deadline": "Antwortfrist",
  "Baseline budget (€)": "Referenzbudget (€)",
  "Submit offer": "Angebot abgeben",
  "Revise offer": "Angebot überarbeiten",
  "Total offer (€)": "Angebotssumme (€)",
  "Delivery days": "Liefertage",
  "Included scope & assumptions": "Enthaltener Umfang & Annahmen",
  "Offer document": "Angebotsdokument",
  Contract: "Vertrag",
  Value: "Wert",
  Term: "Laufzeit",
  "Notice by": "Kündigung bis",
  "New contract": "Neuer Vertrag",
  "Edit contract": "Vertrag bearbeiten",
  "Value (€)": "Wert (€)",
  Start: "Beginn",
  End: "Ende",
  "Notice period (days)": "Kündigungsfrist (Tage)",
  "Renews automatically unless cancelled": "Verlängert sich automatisch, sofern nicht gekündigt",
  "Key terms": "Wesentliche Bedingungen",
  "Signed contract (PDF)": "Unterschriebener Vertrag (PDF)",
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
  "Visible invoices": "Angezeigte Rechnungen",
  "Visible total": "Angezeigte Summe",
  "Awaiting review": "Warten auf Prüfung",
  "Over order cap": "Über Auftragsgrenze",
  Find: "Suchen",
  From: "Von",
  To: "Bis",
  "Sort by": "Sortieren nach",
  Newest: "Neueste",
  Invoice: "Rechnung",
  "Customer / supplier": "Kunde / Lieferant",
  "Project / phase / task": "Projekt / Phase / Aufgabe",
  Positions: "Positionen",
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
  "Low risk": "Niedriges Risiko",
  "Medium risk": "Mittleres Risiko",
  "High risk": "Hohes Risiko",
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
  "No invoices.": "Keine Rechnungen.",
  "Budget, spend, schedule health and supplier spend across your projects.":
    "Budget, Ausgaben, Terminlage und Lieferantenausgaben über alle Projekte.",
  "Every sourcing event, contract and supplier in one view.":
    "Alle Ausschreibungen, Verträge und Lieferanten auf einen Blick.",
  "+ New event from a task": "+ Neue Ausschreibung aus Aufgabe",
  "No contracts end in the next 60 days.": "In den nächsten 60 Tagen laufen keine Verträge aus.",
  "Suppliers you have worked with or received offers from":
    "Lieferanten, mit denen Sie gearbeitet oder von denen Sie Angebote erhalten haben",
  "No insurance evidence on file": "Kein Versicherungsnachweis hinterlegt",
  "No certifications listed": "Keine Zertifikate angegeben",
  "Currently marked as busy": "Derzeit als ausgelastet markiert",
  "Not verified or not live in the directory": "Nicht geprüft oder nicht im Verzeichnis",
  "No risk flags.": "Keine Risikohinweise.",
  "Scores are relative within this event: the best price and the fastest delivery score 100. Supplier performance uses the scorecard (rating, on-time delivery, invoice quality, responsiveness).":
    "Die Werte sind relativ innerhalb dieser Ausschreibung: bester Preis und schnellste Lieferung erhalten 100. Die Lieferantenleistung stammt aus der Scorecard (Bewertung, Termintreue, Rechnungsqualität, Reaktionsfähigkeit).",
  "Agreements with your suppliers, their value, terms and renewal deadlines.":
    "Vereinbarungen mit Ihren Lieferanten: Wert, Bedingungen und Verlängerungsfristen.",
  "No contracts yet. Awarding a sourcing event creates a draft automatically.":
    "Noch keine Verträge. Ein Zuschlag erzeugt automatisch einen Entwurf.",
  "Active agreements with your customers.": "Aktive Vereinbarungen mit Ihren Kunden.",
  "No contracts shared with you yet.": "Noch keine Verträge mit Ihnen geteilt.",
  "Plan phases and tasks, manage supplier offers, documents and delivery.":
    "Phasen und Aufgaben planen, Lieferantenangebote, Dokumente und Lieferung steuern.",
  "Open project →": "Projekt öffnen →",
  "Phases contain tasks · dependency and delay warnings":
    "Phasen enthalten Aufgaben · Abhängigkeits- und Verzugswarnungen",
  "downstream risk": "Folgerisiko",
  "Break each phase into supplier-assignable tasks": "Jede Phase in zuweisbare Aufgaben gliedern",
  "Schedule warning: overdue tasks may affect this phase, its successors and the project budget.":
    "Terminwarnung: Überfällige Aufgaben können diese Phase, Folgephasen und das Budget beeinflussen.",
  "This task is overdue. Dependent work may slip and extend project cost.":
    "Diese Aufgabe ist überfällig. Abhängige Arbeiten können sich verschieben und Kosten erhöhen.",
  "No supplier assigned": "Kein Lieferant zugewiesen",
  "Depends on phases": "Abhängig von Phasen",
  "Depends on": "Abhängig von",
  "Drag cards between columns to update their status. Drag phases on the right to change the delivery order.":
    "Karten zwischen Spalten ziehen, um den Status zu ändern. Phasen rechts ziehen, um die Reihenfolge zu ändern.",
  "Drag cards between columns to update their status. You can move the work assigned to your company.":
    "Karten zwischen Spalten ziehen, um den Status zu ändern. Sie können die Ihrem Unternehmen zugewiesene Arbeit verschieben.",
  "Drag to reorder the waterfall sequence.": "Ziehen, um die Phasenreihenfolge zu ändern.",
  "← Back to projects": "← Zurück zu den Projekten",
  "← Sourcing": "← Beschaffung",
  "Describe the work, pick a template to generate phases and tasks, then assign suppliers from the project page.":
    "Beschreiben Sie die Arbeit, wählen Sie eine Vorlage für Phasen und Aufgaben und weisen Sie dann auf der Projektseite Lieferanten zu.",
  "Compare price, delivery, supplier documents and scope.":
    "Preis, Lieferzeit, Lieferantendokumente und Umfang vergleichen.",
  "Waiting for supplier offers.": "Warten auf Lieferantenangebote.",
  "Ask for details": "Details anfragen",
  "Search, compare, open, export and review professional invoice records.":
    "Rechnungen suchen, vergleichen, öffnen, exportieren und prüfen.",
  "Amount: high to low": "Betrag: absteigend",
  "Amount: low to high": "Betrag: aufsteigend",
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
  "Review work requests from customers.": "Arbeitsanfragen von Kunden prüfen.",
  "No pending invitations.": "Keine offenen Einladungen.",
  "Browse tasks and create an offer": "Aufgaben durchsuchen und Angebot erstellen",
  "+ Find / create an offer": "+ Angebot finden / erstellen",
  "Find task bids": "Ausschreibungen finden",
  "Open a record for its full details, PDF and email draft.":
    "Datensatz öffnen für Details, PDF und E-Mail-Entwurf.",
  "All invoices": "Alle Rechnungen",
  "Filter by issue date, customer, project and amount.": "Nach Datum, Kunde, Projekt und Betrag filtern.",
  "Revenue, pipeline, bid success, delivery performance and team utilisation.":
    "Umsatz, Pipeline, Angebotserfolg, Lieferleistung und Teamauslastung.",
  "Respond to service enquiries, project-linked requests and certificate checks.":
    "Auf Leistungsanfragen, projektbezogene Anfragen und Zertifikatsprüfungen antworten.",
  "Task invitations, supplier commitments, documentation and progress.":
    "Aufgabeneinladungen, Zusagen, Dokumentation und Fortschritt.",
  "Find more work": "Weitere Aufträge finden",
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
  "Open queue": "Warteschlange öffnen",
  "Signed in": "Angemeldet",
  "Every approved supplier receives an explicit Bronze, Silver or Gold badge.":
    "Jeder freigegebene Lieferant erhält ein Bronze-, Silber- oder Gold-Badge.",
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
  "Find vetted specialists, coordinate phases, approve invoices and close projects with reviews.":
    "Geprüfte Spezialisten finden, Phasen koordinieren, Rechnungen freigeben und Projekte mit Bewertung abschließen.",
  "Show your capabilities, receive phase invitations, deliver work and get paid through one workflow.":
    "Kompetenzen zeigen, Einladungen erhalten, liefern und bezahlt werden – in einem Workflow.",
  "Use badges, vetting stages, metrics and activity data to maintain marketplace quality.":
    "Mit Badges, Prüfstufen, Kennzahlen und Aktivitätsdaten die Qualität sichern.",
  "A professional operating layer for": "Eine professionelle Arbeitsumgebung für",
  "industrial work.": "industrielle Projekte.",
  "RFQ, RFP and RFI with supplier questionnaires, multiple rounds and clarifications.":
    "RFQ, RFP und RFI mit Lieferantenfragebögen, mehreren Runden und Rückfragen.",
  "Rank offers on price, delivery, supplier performance and experience — with an automatic summary.":
    "Angebote nach Preis, Lieferzeit, Leistung und Erfahrung ranken – mit automatischer Zusammenfassung.",
  "Awarded offers become contracts with value, term, notice deadline and renewal alerts.":
    "Bezuschlagte Angebote werden zu Verträgen mit Wert, Laufzeit, Kündigungsfrist und Verlängerungshinweisen.",
  "On-time delivery, invoice quality, responsiveness and insurance or vetting risk per supplier.":
    "Termintreue, Rechnungsqualität, Reaktionszeit sowie Versicherungs- und Prüfrisiko je Lieferant.",
  "Invoices, documents, time entries, offers and contracts waiting for you — in one list.":
    "Rechnungen, Dokumente, Zeiten, Angebote und Verträge, die auf Sie warten – in einer Liste.",
  "Every change is recorded with who, what and when for compliance and disputes.":
    "Jede Änderung wird mit Wer, Was und Wann für Compliance und Streitfälle protokolliert.",
  "Join the vetted network.": "Werden Sie Teil des geprüften Netzwerks.",
  "Complete your company profile and start the verification process.":
    "Unternehmensprofil vervollständigen und die Prüfung starten.",
  "SUPPLIER APPLICATION": "LIEFERANTENBEWERBUNG",
  "Company verification": "Unternehmensprüfung",
  "These details help verify the legal entity, tax status, insurance and delivery capability.":
    "Diese Angaben helfen, Rechtsform, Steuerstatus, Versicherung und Leistungsfähigkeit zu prüfen.",
  "Legal, insurance or certification evidence (PDF/JPG/PNG, max. 1 MB each)":
    "Rechts-, Versicherungs- oder Zertifikatsnachweise (PDF/JPG/PNG, je max. 1 MB)",
  "Provide documents you are authorized to share. External registration, tax and sanctions checks are recorded by the review team.":
    "Nur Dokumente hochladen, die Sie teilen dürfen. Register-, Steuer- und Sanktionsprüfungen erfasst das Prüfteam.",
  "Years in business *": "Jahre am Markt *",
  "Company name *": "Firmenname *",
  "Contact name": "Ansprechpartner",
  "Email *": "E-Mail *",
  "Phone *": "Telefon *",
  Location: "Standort",
  "Services offered *": "Angebotene Leistungen *",
  Certifications: "Zertifizierungen",
  "Portfolio / past work *": "Referenzprojekte *",
  "Reference contact name *": "Referenzkontakt *",
  "Reference contact email *": "E-Mail des Referenzkontakts *",
  "Company registration number *": "Handelsregisternummer *",
  "Legal representative / director": "Gesetzlicher Vertreter / Geschäftsführer",
  "Registered business address": "Geschäftsadresse",
  "Insurance provider": "Versicherer",
  "Policy number": "Policennummer",
  "Coverage (€)": "Deckungssumme (€)",
  "Insurance expiry": "Versicherung gültig bis",
  "Second reference contact (optional)": "Zweiter Referenzkontakt (optional)",
  "Submit application": "Bewerbung absenden",
  "Start without a subscription. The coordination fee is visible before approval and follows the work actually accepted.":
    "Ohne Abo starten. Die Koordinationsgebühr ist vor der Freigabe sichtbar und richtet sich nach der tatsächlich abgenommenen Leistung.",
  "Plan and manage projects with no platform subscription.":
    "Projekte ohne Plattform-Abo planen und steuern.",
  "Create unlimited projects and tasks": "Unbegrenzt Projekte und Aufgaben anlegen",
  "Invite suppliers or run structured bid rounds":
    "Lieferanten einladen oder strukturierte Ausschreibungen durchführen",
  "Project files, phase chats and progress tracking":
    "Projektdateien, Phasen-Chats und Fortschrittsverfolgung",
  "Review time logs, invoices and delivery milestones": "Zeiten, Rechnungen und Liefermeilensteine prüfen",
  "No monthly fee and no setup charge": "Keine Monats- und keine Einrichtungsgebühr",
  "Not included": "Nicht enthalten",
  "Supplier service fees are agreed directly in each offer":
    "Lieferantenpreise werden im jeweiligen Angebot vereinbart",
  "Bank transfer fees charged by your bank are not included":
    "Überweisungsgebühren Ihrer Bank sind nicht enthalten",
  "Create a project": "Projekt anlegen",
  "3% per approved invoice": "3 % je freigegebener Rechnung",
  "A clear coordination fee when an invoice is approved.":
    "Eine klare Koordinationsgebühr bei Rechnungsfreigabe.",
  "Supplier discovery and verified company profiles": "Lieferantensuche und geprüfte Unternehmensprofile",
  "Task assignment, bid comparison and award trail":
    "Aufgabenvergabe, Angebotsvergleich und Zuschlagsdokumentation",
  "Shared project documents and decisions": "Gemeinsame Projektdokumente und Entscheidungen",
  "Time and invoice approval workflow": "Freigabe-Workflow für Zeiten und Rechnungen",
  "One activity history for the project team": "Eine Aktivitätshistorie für das Projektteam",
  "No payment processing or escrow is included in the demo":
    "Zahlungsabwicklung oder Treuhand ist nicht enthalten",
  "VAT is added where legally applicable": "Zzgl. gesetzlicher USt., sofern anwendbar",
  "Any provider transfer fees are shown separately when connected":
    "Gebühren eines Zahlungsanbieters werden separat ausgewiesen",
  "Free to apply": "Kostenlose Bewerbung",
  "Create a profile and respond to suitable project work.":
    "Profil anlegen und auf passende Projekte antworten.",
  "No fee to apply or maintain a profile": "Keine Gebühr für Bewerbung oder Profil",
  "Publish services, capability and indicative rates":
    "Leistungen, Kompetenzen und Richtpreise veröffentlichen",
  "Receive task invitations and quote requests": "Aufgabeneinladungen und Angebotsanfragen erhalten",
  "Submit offers with line items and supporting files": "Angebote mit Positionen und Anlagen abgeben",
  "Track assigned work, time logs and invoices": "Zugewiesene Arbeit, Zeiten und Rechnungen verfolgen",
  "Supplier verification must be completed before directory listing":
    "Die Lieferantenprüfung muss vor der Listung abgeschlossen sein",
  "A coordination fee may be shown on awarded project terms":
    "Eine Koordinationsgebühr kann in den Auftragsbedingungen ausgewiesen sein",
  "From project brief to accepted delivery.": "Vom Projektbriefing bis zur abgenommenen Lieferung.",
  "Every decision stays connected to the phase and task it belongs to.":
    "Jede Entscheidung bleibt mit ihrer Phase und Aufgabe verknüpft.",
  "Create a project, set its site and dates, then break delivery into phases and tasks.":
    "Projekt anlegen, Standort und Termine festlegen und die Lieferung in Phasen und Aufgaben gliedern.",
  "Find vetted suppliers, invite them to a task or open a bid round.":
    "Geprüfte Lieferanten finden, zu einer Aufgabe einladen oder eine Ausschreibung starten.",
  "Compare scope, price, lead time and documents; award the selected offer.":
    "Umfang, Preis, Lieferzeit und Dokumente vergleichen und den Zuschlag erteilen.",
  "Suppliers report progress, log time and share evidence in the task workspace.":
    "Lieferanten melden Fortschritt, erfassen Zeiten und teilen Nachweise im Aufgabenbereich.",
  "Review work, time and invoice details with a clear change history.":
    "Arbeit, Zeiten und Rechnungen mit klarer Änderungshistorie prüfen.",
  "Accept the final phase, complete the project and leave a supplier review.":
    "Letzte Phase abnehmen, Projekt abschließen und Lieferanten bewerten.",
  Define: "Definieren",
  Source: "Beschaffen",
  Agree: "Vereinbaren",
  Deliver: "Liefern",
  "Close out": "Abschließen",
  "I accept the": "Ich akzeptiere die",
  "terms of use": "Nutzungsbedingungen",
  "and have read the": "und habe die",
  "privacy policy": "Datenschutzerklärung",
  "This page has not been published yet. Please contact us via the support address.":
    "Diese Seite ist noch nicht veröffentlicht. Bitte kontaktieren Sie uns über die Support-Adresse.",
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
  "Fix & resubmit": "Korrigieren & erneut einreichen",
  "Fix & resubmit invoice": "Rechnung korrigieren & erneut einreichen",
  "Requested changes": "Angeforderte Änderungen",
  "Reason for rejection": "Ablehnungsgrund",
  Position: "Position",
  Qty: "Menge",
  Unit: "Einheit",
  "Unit price €": "Einzelpreis €",
  Total: "Summe",
  "+ Add position": "+ Position hinzufügen",
  "New total": "Neue Summe",
  "Invoice description": "Rechnungsbeschreibung",
  "What did you change?": "Was wurde geändert?",
  "shown to the customer": "für den Kunden sichtbar",
  "Replace attachment": "Anhang ersetzen",
  "Resubmit for approval": "Zur Freigabe erneut einreichen",
  "Invoice corrected and resubmitted": "Rechnung korrigiert und erneut eingereicht",
  "Add at least one position": "Mindestens eine Position hinzufügen",
  "Changes requested": "Änderungen angefordert",
  Rejected: "Abgelehnt",
  "Revise offer": "Angebot überarbeiten",
  "Request changes": "Änderungen anfordern",
  "Send request": "Anfrage senden",
  "What should the supplier change in this offer? They can then send a revised version.":
    "Was soll der Lieferant an diesem Angebot ändern? Er kann danach eine überarbeitete Fassung senden.",
  "Change request sent to the supplier": "Änderungswunsch an den Lieferanten gesendet",
  "The customer asked for changes:": "Der Kunde wünscht Änderungen:",
  "Save and resend": "Speichern und erneut senden",
  // Supplier certificates & proofs
  "Certificates & proofs": "Zertifikate & Nachweise",
  "+ Add certificate or proof": "+ Zertifikat oder Nachweis hinzufügen",
  "Add certificate or proof": "Zertifikat oder Nachweis hinzufügen",
  "CraftCrew verification": "CraftCrew-Prüfung",
  "On request": "Auf Anfrage",
  Open: "Öffnen",
  "No expiry": "Unbefristet",
  "Make public": "Öffentlich machen",
  "Make partner-only": "Nur für Partner",
  "Compliance evidence": "Compliance-Nachweis",
  "Quality certificate": "Qualitätszertifikat",
  "Trade licence / registration": "Gewerbe / Registrierung",
  Insurance: "Versicherung",
  "Safety certificate": "Sicherheitszertifikat",
  "Training & qualification": "Schulung & Qualifikation",
  "Reference letter": "Referenzschreiben",
  "Other proof": "Sonstiger Nachweis",
  "Issued by": "Ausgestellt von",
  "Issue date": "Ausstellungsdatum",
  "Valid until": "Gültig bis",
  "Who can open it": "Wer darf es öffnen",
  "All signed-in customers (shown on your profile)": "Alle angemeldeten Kunden (in Ihrem Profil sichtbar)",
  "Only customers I work with": "Nur Kunden, mit denen ich arbeite",
  File: "Datei",
  "Save document": "Dokument speichern",
  "Document added": "Dokument hinzugefügt",
  "Document deleted": "Dokument gelöscht",
  "Upload ISO certificates, trade licences, insurance or reference letters so customers can check them.":
    "Laden Sie ISO-Zertifikate, Gewerbenachweise, Versicherungen oder Referenzen hoch, damit Kunden sie prüfen können.",
  "No certificates published yet.": "Noch keine Zertifikate veröffentlicht.",
  "Your vetting documents": "Ihre Prüfunterlagen",
  // File explorer
  "Project files": "Projektdateien",
  Upload: "Hochladen",
  Download: "Herunterladen",
  Rename: "Umbenennen",
  "Move to": "Verschieben nach",
  "Move to…": "Verschieben nach…",
  Delete: "Löschen",
  Approve: "Freigeben",
  Sort: "Sortieren",
  Name: "Name",
  "Date modified": "Änderungsdatum",
  Type: "Typ",
  Size: "Größe",
  Status: "Status",
  "Shared by": "Geteilt von",
  Folder: "Ordner",
  "Quick access": "Schnellzugriff",
  "This project": "Dieses Projekt",
  "All files": "Alle Dateien",
  "Waiting for approval": "Wartet auf Freigabe",
  "File folder": "Dateiordner",
  "Task folder": "Aufgabenordner",
  "This folder is empty.": "Dieser Ordner ist leer.",
  "No files match your search.": "Keine Dateien gefunden.",
  "Drag files here from your computer or use Upload.":
    "Dateien vom Computer hierher ziehen oder „Hochladen“ verwenden.",
  "Search project files": "Projektdateien durchsuchen",
  "Upload files": "Dateien hochladen",
  "Upload into this folder": "In diesen Ordner hochladen",
  Refresh: "Aktualisieren",
  "Large icons": "Große Symbole",
  Details: "Details",
  "Drop files to upload": "Dateien zum Hochladen ablegen",
  "Move to folder": "In Ordner verschieben",
  Destination: "Ziel",
  "Move here": "Hierher verschieben",
  "New file name": "Neuer Dateiname",
  Renamed: "Umbenannt",
  "File deleted": "Datei gelöscht",
  "File uploaded": "Datei hochgeladen",
  "Double-click to open · Drag files onto a folder to move them · Drop files from your computer to upload":
    "Doppelklick zum Öffnen · Dateien auf einen Ordner ziehen zum Verschieben · Dateien vom Computer ablegen zum Hochladen",
  "Ask the customer to approve": "Freigabe durch den Kunden anfordern",
  "Maximize window": "Fenster maximieren",
  "Restore window": "Fenster wiederherstellen",
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
  "What should the supplier change?": "Was soll der Lieferant ändern?",
  "What should be changed?": "Was soll geändert werden?",
  "Reason for rejection?": "Grund der Ablehnung?",
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
  "Project archived": "Projekt archiviert",
  "Please choose a new password first.": "Bitte wählen Sie zuerst ein neues Passwort.",
  // Escalations (T25)
  "Issue type": "Art des Problems",
  "Open escalation": "Eskalation eröffnen",
  "Support escalation opened": "Eskalation eröffnet",
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
  "Project deleted": "Projekt gelöscht",
  "Phase deleted": "Phase gelöscht",
  "Show archived": "Archivierte anzeigen",
  Archived: "Archiviert",
  "This project is archived and can no longer be changed.":
    "Dieses Projekt ist archiviert und kann nicht mehr geändert werden.",
  "This task has invoices, so it cannot be deleted.":
    "Diese Aufgabe hat Rechnungen und kann daher nicht gelöscht werden.",
  "Remove supplier assignments and resolve invoices before deleting this phase.":
    "Entfernen Sie Lieferantenzuweisungen und klären Sie Rechnungen, bevor Sie diese Phase löschen.",
  "Decline this service request?": "Diese Anfrage ablehnen?",
  "Close this event without an award? Open offers are marked as not selected.":
    "Ausschreibung ohne Zuschlag schließen? Offene Angebote werden als nicht ausgewählt markiert.",
  "Add a short quote or next step (optional)": "Kurzes Angebot oder nächster Schritt (optional)",
  "Reason for declining (optional)": "Grund der Ablehnung (optional)",
  "Progress complete (0–100)": "Fortschritt (0–100)",
  "Awarding confirms this task will be assigned to the selected supplier. Other offers will be marked not selected. Continue?":
    "Mit dem Zuschlag wird die Aufgabe dem ausgewählten Lieferanten zugewiesen. Andere Angebote werden als nicht ausgewählt markiert. Fortfahren?",
  "Closing bidding will stop new offers and close outstanding offers. Continue?":
    "Das Schließen beendet die Ausschreibung und schließt offene Angebote. Fortfahren?",
  Customize: "Anpassen",
  "Customize this page": "Seite anpassen",
  "Drag cards to rearrange them, use the eye to hide or show a card, and the arrows to move whole sections.":
    "Karten per Drag & Drop anordnen, mit dem Auge aus- oder einblenden und ganze Bereiche mit den Pfeilen verschieben.",
  "Layout saved": "Layout gespeichert",
  "Layout reset": "Layout zurückgesetzt",
  "Move section up": "Bereich nach oben",
  "Move section down": "Bereich nach unten",
  "Hide or show card": "Karte aus-/einblenden",
  "Hide or show section": "Bereich aus-/einblenden",
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
const I18N_STATUS = { ...I18N_DE, Open: "Offen", Completed: "Abgeschlossen", Paid: "Bezahlt", New: "Neu" };
const I18N_PATTERNS = [
  ...I18N_CM_PATTERNS,
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
        )
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
    for (const attr of ["placeholder", "title", "aria-label"]) {
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
  const help = document.querySelector(".sidebar .help");
  if (help && !help.querySelector(".i18n-switch")) help.insertAdjacentHTML("afterbegin", html);
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
toast = function (msg, type) {
  return i18nBaseToast(i18nLang === "de" ? i18nText(String(msg)) : msg, type);
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
