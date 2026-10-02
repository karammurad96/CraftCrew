/* Deutsche Texte nach Schlüssel (T125). Gleiche Schlüssel und {Platzhalter} wie en.js. */
var LOCALES = window.LOCALES || (window.LOCALES = {});
LOCALES.de = {
  common: {
    save: "Speichern",
    cancel: "Abbrechen",
    close: "Schließen",
    delete: "Löschen",
    edit: "Bearbeiten",
    back: "Zurück",
    loading: "Wird geladen …",
    retry: "Erneut versuchen",
    yes: "Ja",
    no: "Nein",
    items: { one: "{n} Eintrag", other: "{n} Einträge" },
    badge: { Gold: "Gold", Silver: "Silver", Bronze: "Bronze", verified: "Verifiziert", notVerified: "Noch nicht verifiziert" },
  },
  errors: {
    pageFailed: "Diese Seite konnte nicht geöffnet werden",
    signInFirst: "Bitte melden Sie sich zuerst an.",
    wrongAccount: "Diese Seite gehört zu einer anderen Kontoart.",
  },
  // Public pages (T126)
  public: {
    "home": {
      "kicker": "Industrielle Dienstleistungen, koordiniert.",
      "title": "Jedes Team. Ein Projekt. Null Chaos.",
      "sub": "Finden Sie geprüfte Industriespezialisten, vergleichen Sie ihre Angebote direkt nebeneinander und steuern Sie den ganzen Auftrag – von der Arbeitssicherheit bis zur Schlussrechnung – an einem Ort.",
      "start": "Projekt starten",
      "explore": "Lieferanten entdecken ›",
      "window": {
        "bar": "craftcrew · Regensburg Linie 4",
        "project": "Projekt",
        "projectName": "Modernisierung Roboterzelle",
        "engineering": "Engineering",
        "build": "Bau & Integration",
        "acceptance": "Abnahme vor Ort",
        "done": "Fertig",
        "oct": "Okt.",
        "waiting": "Wartet auf Sie",
        "invoice": "Rechnung 2026-0001 · 8.806 €",
        "checksPassed": "Alle Prüfungen bestanden",
        "onSite": "Heute vor Ort",
        "people": "2 Personen · Keller Automation",
        "briefed": "Unterwiesen und eingecheckt"
      },
      "stepsTitle": "Von der Anfrage bis zur bezahlten Rechnung.",
      "stepsTitleMore": "Ohne Tabellenchaos.",
      "describe": "Beschreiben",
      "describeLead": "Phasen, Aufgaben und Budget aus einer Vorlage.",
      "describeText": "Inbetriebnahme, Retrofit oder Stillstand – in Minuten angelegt.",
      "compare": "Vergleichen",
      "compareLead": "Geprüfte Angebote, direkt nebeneinander.",
      "compareText": "Preis, Lieferzeit und Erfahrung – gewichtet, wie Sie entscheiden.",
      "run": "Umsetzen",
      "runLead": "Ein Arbeitsbereich für alle.",
      "runText": "Jedes Unternehmen sieht nur seinen eigenen Teil – nicht mehr.",
      "sourcing": "Beschaffung",
      "sourcingTitle": "Das beste Angebot ist offensichtlich.",
      "safety": "Standortsicherheit",
      "safetyTitle": "Wer ist vor Ort. Genau jetzt.",
      "invoices": "Rechnungen",
      "invoicesTitle": "Gegen den Auftrag geprüft, bevor Sie freigeben.",
      "invoicesText": "Umsatzsteuer, fortlaufende Nummern und XRechnung-Export inklusive.",
      "fieldApp": "Feld-App",
      "fieldAppTitle": "Zeiten und Fotos mit zwei Fingertipps.",
      "fieldAppText": "Funktioniert ohne Empfang in der Werkhalle und synchronisiert später.",
      "partnersTitle": "Geprüfte Partner für Ihr nächstes Projekt.",
      "partnersAll": "Alle {n} Lieferanten ansehen ›",
      "strategicKicker": "Strategische Beschaffung",
      "strategicTitle": "Von der Ausschreibung zum unterschriebenen Vertrag",
      "strategicText": "Wettbewerbliche Beschaffung wie in großen Einkaufsabteilungen – zugeschnitten auf industrielle KMU.",
      "tiles": {
        "events": "Ausschreibungen",
        "eventsText": "RFQ, RFP und RFI mit Lieferantenfragebögen, mehreren Runden und Rückfragen.",
        "weighted": "Gewichtete Bewertung",
        "weightedText": "Angebote nach Preis, Lieferzeit, Leistung und Erfahrung ranken – mit automatischer Zusammenfassung.",
        "contracts": "Vertragsmanagement",
        "contractsText": "Bezuschlagte Angebote werden zu Verträgen mit Wert, Laufzeit, Kündigungsfrist und Verlängerungshinweisen.",
        "scorecards": "Scorecards & Risiko",
        "scorecardsText": "Termintreue, Rechnungsqualität, Reaktionszeit sowie Versicherungs- und Prüfrisiko je Lieferant.",
        "approvals": "Freigabe-Eingang",
        "approvalsText": "Rechnungen, Dokumente, Zeiten, Angebote und Verträge, die auf Sie warten – in einer Liste.",
        "audit": "Lückenloser Audit-Trail",
        "auditText": "Jede Änderung wird mit Wer, Was und Wann für Compliance und Streitfälle protokolliert.",
        "smes": "Für KMU",
        "smesText": "Geprüfte Spezialisten finden, Phasen koordinieren, Rechnungen freigeben und Projekte mit Bewertung abschließen.",
        "suppliers": "Für Lieferanten",
        "suppliersText": "Kompetenzen zeigen, Einladungen erhalten, liefern und bezahlt werden – in einem Workflow.",
        "operations": "Für Betriebsteams",
        "operationsText": "Mit Badges, Prüfstufen, Kennzahlen und Aktivitätsdaten die Qualität sichern."
      },
      "bothKicker": "Für beide Seiten",
      "bothTitle": "Eine professionelle Arbeitsumgebung für industrielle Projekte.",
      "finalTitle": "Ihr nächstes Projekt beginnt hier.",
      "finalText": "Kostenlos für Kunden. Lieferanten kommen nach einer 5-stufigen Prüfung dazu.",
      "apply": "Als Lieferant bewerben ›"
    },
    "pricing": {
      "eyebrow": "PREISE",
      "title": "Einfache Gebühren, klare Verantwortlichkeiten.",
      "intro": "Ohne Abo starten. Die Koordinationsgebühr ist vor der Freigabe sichtbar und richtet sich nach der tatsächlich abgenommenen Leistung.",
      "recommended": "WORKFLOW-GEBÜHR",
      "included": "Enthalten",
      "notIncluded": "Nicht enthalten",
      "note": "Die Gebühr von 3 % ist eine Beispieleinstellung dieses Demo-Marktplatzes. Die endgültigen Konditionen sollten vor Arbeitsbeginn im Projektangebot bestätigt werden.",
      "customer": {
        "name": "Kunden-Arbeitsbereich",
        "price": "Kostenlos",
        "sub": "Projekte ohne Plattform-Abo planen und steuern.",
        "items": [
          "Unbegrenzt Projekte und Aufgaben anlegen",
          "Lieferanten einladen oder strukturierte Ausschreibungen durchführen",
          "Projektdateien, Phasen-Chats und Fortschrittsverfolgung",
          "Zeiten, Rechnungen und Liefermeilensteine prüfen",
          "Keine Monats- und keine Einrichtungsgebühr"
        ],
        "not": [
          "Lieferantenpreise werden im jeweiligen Angebot vereinbart",
          "Überweisungsgebühren Ihrer Bank sind nicht enthalten"
        ],
        "cta": "Projekt anlegen"
      },
      "managed": {
        "name": "Begleiteter Workflow",
        "price": "3 % je freigegebener Rechnung",
        "sub": "Eine klare Koordinationsgebühr bei Rechnungsfreigabe.",
        "items": [
          "Lieferantensuche und geprüfte Unternehmensprofile",
          "Aufgabenvergabe, Angebotsvergleich und Zuschlagsdokumentation",
          "Gemeinsame Projektdokumente und Entscheidungen",
          "Freigabe-Workflow für Zeiten und Rechnungen",
          "Eine Aktivitätshistorie für das Projektteam"
        ],
        "not": [
          "Zahlungsabwicklung oder Treuhand ist nicht enthalten",
          "Zzgl. gesetzlicher USt., sofern anwendbar",
          "Gebühren eines Zahlungsanbieters werden separat ausgewiesen"
        ],
        "cta": "Projekt starten"
      },
      "supplier": {
        "name": "Lieferantenkonto",
        "price": "Kostenlose Bewerbung",
        "sub": "Profil anlegen und auf passende Projekte antworten.",
        "items": [
          "Keine Gebühr für Bewerbung oder Profil",
          "Leistungen, Kompetenzen und Richtpreise veröffentlichen",
          "Aufgabeneinladungen und Angebotsanfragen erhalten",
          "Angebote mit Positionen und Anlagen abgeben",
          "Zugewiesene Arbeit, Zeiten und Rechnungen verfolgen"
        ],
        "not": [
          "Die Lieferantenprüfung muss vor der Listung abgeschlossen sein",
          "Eine Koordinationsgebühr kann in den Auftragsbedingungen ausgewiesen sein"
        ],
        "cta": "Als Lieferant bewerben"
      }
    },
    "how": {
      "eyebrow": "SO FUNKTIONIERT ES",
      "title": "Vom Projektbriefing bis zur abgenommenen Lieferung.",
      "intro": "Jede Entscheidung bleibt mit ihrer Phase und Aufgabe verknüpft.",
      "mapLabel": "Projektablauf in sechs Schritten, vom Festlegen des Umfangs bis zum Abschluss der Lieferung",
      "steps": {
        "define": "Definieren",
        "defineText": "Projekt anlegen, Standort und Termine festlegen und die Lieferung in Phasen und Aufgaben gliedern.",
        "source": "Beschaffen",
        "sourceText": "Geprüfte Lieferanten finden, zu einer Aufgabe einladen oder eine Ausschreibung starten.",
        "agree": "Vereinbaren",
        "agreeText": "Umfang, Preis, Lieferzeit und Dokumente vergleichen und den Zuschlag erteilen.",
        "deliver": "Liefern",
        "deliverText": "Lieferanten melden Fortschritt, erfassen Zeiten und teilen Nachweise im Aufgabenbereich.",
        "approve": "Freigeben",
        "approveText": "Arbeit, Zeiten und Rechnungen mit klarer Änderungshistorie prüfen.",
        "close": "Abschließen",
        "closeText": "Letzte Phase abnehmen, Projekt abschließen und Lieferanten bewerten."
      },
      "flow": "Ein gemeinsamer Ablauf",
      "flowProject": "Projekt",
      "flowPhase": "Phase",
      "flowTask": "Aufgabe",
      "flowEvidence": "Nachweise & Freigabe"
    },
    "faq": {
      "eyebrow": "FAQ",
      "title": "FAQ / HILFE",
      "payment": "Ist das ein echtes Zahlungssystem?",
      "paymentText": "Die MVP-Version hat eine Zahlungsstatus-Logik im Backend. Für echte Zahlungen binden Sie Stripe oder einen anderen Anbieter an.",
      "vetting": "Wie funktioniert die Prüfung?",
      "vettingText": "Bewerbung → Neu → Verifiziert → Referenzen → Freigegeben/Abgelehnt → Abzeichen → Lieferant ist live.",
      "bid": "Können Lieferanten Angebote abgeben?",
      "bidText": "Kunden können zu einer Projektaufgabe eine Ausschreibung veröffentlichen. Lieferanten reichen vergleichbare Angebote zu Umfang, Preis und Lieferzeit ein, und der Kunde vergibt die Aufgabe an einen Lieferanten.",
      "documents": "Was sind Dokumente?",
      "documentsText": "Projektdateien sind nach Phase, Aufgabe und Lieferant geordnet. Jeder Upload kann direkt geteilt oder zur Freigabe an den Kunden geschickt werden, mit Änderungswünschen und Versionsverlauf.",
      "helpEyebrow": "FAQ / HILFECENTER",
      "helpTitle": "Hilfe & Support",
      "moreHelp": "Brauchen Sie weitere Hilfe? Kontakt:"
    },
    "legal": {
      "eyebrow": "RECHTLICHES",
      "imprint": "Impressum",
      "privacy": "Datenschutzerklärung",
      "terms": "Nutzungsbedingungen",
      "notPublished": "Diese Seite ist noch nicht veröffentlicht. Bitte kontaktieren Sie uns über die Support-Adresse.",
      "rights": {
        "title": "Ihre Rechte bei CraftCrew",
        "access": "Auskunft und Kopie Ihrer Daten",
        "accessText": "Nach Art. 15 und 20 DSGVO können Sie die personenbezogenen Daten einsehen, die wir über Sie speichern, und sie mitnehmen. Öffnen Sie angemeldet Ihr Profil und wählen Sie „Meine Daten herunterladen“. Sie erhalten eine JSON-Datei mit Konto, Nachrichten, Benachrichtigungen, Projekten, Rechnungen und Aktivitäten. Passwörter und Sicherheitsschlüssel sind nie enthalten.",
        "correct": "Ihre Daten berichtigen",
        "correctText": "Name, Kontaktdaten und Firmenprofil können Sie jederzeit auf Ihrer Profilseite ändern (Art. 16 DSGVO). Bei verifizierten Lieferanten werden Änderungen an rechtlichen Angaben erneut geprüft, bevor sie als verifiziert erscheinen.",
        "delete": "Ihr Konto löschen",
        "deleteText": "Sie können Ihr Konto auf Ihrer Profilseite löschen (Art. 17 DSGVO). Solange Projekte, angenommene Aufträge, unbezahlte Rechnungen oder Eskalationen offen sind, müssen sie zuerst abgeschlossen oder übergeben werden, weil die andere Seite darauf angewiesen ist.",
        "deleteText2": "Nachdem Sie mit Ihrem Passwort bestätigt haben, wird Ihr Konto sofort gesperrt und nach 14 Tagen gelöscht. Wenn Sie sich in diesen 14 Tagen anmelden, wird die Löschung aufgehoben. Danach werden Name, E-Mail, Telefon, Firmenprofil, Benachrichtigungen und Dateien entfernt. Von Ihnen gesendete Nachrichten bleiben für die Empfänger sichtbar, als „Gelöschter Nutzer“.",
        "keep": "Was wir aufbewahren müssen",
        "keepText": "Rechnungen müssen 10 Jahre aufbewahrt werden (§ 147 AO, § 14b UStG). Sie behalten Firmenname, Anschrift und Steuernummer, mit denen sie ausgestellt wurden, aber nicht Ihre persönlichen Kontaktdaten. Zeiteinträge, die einer Rechnung zugrunde liegen, werden aus demselben Grund aufbewahrt.",
        "team": "Teammitglieder",
        "teamText": "Ein Teammitglied, das sein Konto löscht, entfernt nur den eigenen Zugang. Wird das Hauptkonto gelöscht, werden die Zugänge seiner Teammitglieder mitgelöscht.",
        "questions": "Fragen und Beschwerden",
        "complain": "Sie haben außerdem das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.",
        "contact": "Kontakt:"
      }
    }
  },
};
