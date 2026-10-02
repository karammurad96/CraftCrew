/* English texts by key (T125). Every key here must exist in de.js with the same {placeholders}
   (test/locales.test.js checks it). Keys are grouped by area: common, nav, and one group per area task. */
var LOCALES = window.LOCALES || (window.LOCALES = {});
LOCALES.en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    delete: "Delete",
    edit: "Edit",
    back: "Back",
    loading: "Loading…",
    retry: "Try again",
    yes: "Yes",
    no: "No",
    items: { one: "{n} item", other: "{n} items" },
    badge: { Gold: "Gold", Silver: "Silver", Bronze: "Bronze", verified: "Verified", notVerified: "Not yet verified" },
  },
  errors: {
    pageFailed: "We could not open this page",
    signInFirst: "Please sign in first.",
    wrongAccount: "This page belongs to another type of account.",
  },
  // Public pages (T126)
  public: {
    "home": {
      "kicker": "Industrial services, coordinated.",
      "title": "Every crew. One project. Zero chaos.",
      "sub": "Find vetted industrial specialists, compare their offers side by side and run the whole job — from site safety to the final invoice — in one place.",
      "start": "Start a project",
      "explore": "Explore suppliers ›",
      "window": {
        "bar": "craftcrew · Regensburg Line 4",
        "project": "Project",
        "projectName": "Robot Cell Upgrade",
        "engineering": "Engineering",
        "build": "Build & integration",
        "acceptance": "Site acceptance",
        "done": "Done",
        "oct": "Oct",
        "waiting": "Waiting for you",
        "invoice": "Invoice 2026-0001 · €8,806",
        "checksPassed": "All checks passed",
        "onSite": "On site today",
        "people": "2 people · Keller Automation",
        "briefed": "Briefed and checked in"
      },
      "stepsTitle": "From request to paid invoice.",
      "stepsTitleMore": "Without the spreadsheets.",
      "describe": "Describe",
      "describeLead": "Phases, tasks and budget from a template.",
      "describeText": "Commissioning, retrofit or shutdown — set up in minutes.",
      "compare": "Compare",
      "compareLead": "Vetted offers, side by side.",
      "compareText": "Price, delivery and track record, weighted the way you decide.",
      "run": "Run",
      "runLead": "One workspace for everyone.",
      "runText": "Each company sees only its own part — nothing more.",
      "sourcing": "Sourcing",
      "sourcingTitle": "The best offer is obvious.",
      "safety": "Site safety",
      "safetyTitle": "Who's on site. Right now.",
      "invoices": "Invoices",
      "invoicesTitle": "Checked against the order before you approve.",
      "invoicesText": "VAT, sequential numbers and XRechnung export included.",
      "fieldApp": "Field app",
      "fieldAppTitle": "Time and photos in two taps.",
      "fieldAppText": "Works without signal on the shop floor and syncs later.",
      "partnersTitle": "Vetted partners for your next project.",
      "partnersAll": "See all {n} suppliers ›",
      "strategicKicker": "Strategic sourcing",
      "strategicTitle": "From sourcing event to signed contract",
      "strategicText": "Run competitive sourcing the way large procurement teams do — sized for industrial SMEs.",
      "tiles": {
        "events": "Sourcing events",
        "eventsText": "RFQ, RFP and RFI with supplier questionnaires, multiple rounds and clarifications.",
        "weighted": "Weighted evaluation",
        "weightedText": "Rank offers on price, delivery, supplier performance and experience — with an automatic summary.",
        "contracts": "Contract management",
        "contractsText": "Awarded offers become contracts with value, term, notice deadline and renewal alerts.",
        "scorecards": "Scorecards & risk",
        "scorecardsText": "On-time delivery, invoice quality, responsiveness and insurance or vetting risk per supplier.",
        "approvals": "Approvals inbox",
        "approvalsText": "Invoices, documents, time entries, offers and contracts waiting for you — in one list.",
        "audit": "Full audit trail",
        "auditText": "Every change is recorded with who, what and when for compliance and disputes.",
        "smes": "For SMEs",
        "smesText": "Find vetted specialists, coordinate phases, approve invoices and close projects with reviews.",
        "suppliers": "For suppliers",
        "suppliersText": "Show your capabilities, receive phase invitations, deliver work and get paid through one workflow.",
        "operations": "For operations teams",
        "operationsText": "Use badges, vetting stages, metrics and activity data to maintain marketplace quality."
      },
      "bothKicker": "For both sides",
      "bothTitle": "A professional operating layer for industrial work.",
      "finalTitle": "Your next project starts here.",
      "finalText": "Free for customers. Suppliers join after a 5-step verification.",
      "apply": "Apply as a supplier ›"
    },
    "pricing": {
      "eyebrow": "PRICING",
      "title": "Simple fees, clear responsibilities.",
      "intro": "Start without a subscription. The coordination fee is visible before approval and follows the work actually accepted.",
      "recommended": "WORKFLOW FEE",
      "included": "Included",
      "notIncluded": "Not included",
      "note": "The 3% fee is an example setting for this demo marketplace. Final commercial terms should be confirmed in the project offer before work begins.",
      "customer": {
        "name": "Customer workspace",
        "price": "Free",
        "sub": "Plan and manage projects with no platform subscription.",
        "items": [
          "Create unlimited projects and tasks",
          "Invite suppliers or run structured bid rounds",
          "Project files, phase chats and progress tracking",
          "Review time logs, invoices and delivery milestones",
          "No monthly fee and no setup charge"
        ],
        "not": [
          "Supplier service fees are agreed directly in each offer",
          "Bank transfer fees charged by your bank are not included"
        ],
        "cta": "Create a project"
      },
      "managed": {
        "name": "Managed workflow",
        "price": "3% per approved invoice",
        "sub": "A clear coordination fee when an invoice is approved.",
        "items": [
          "Supplier discovery and verified company profiles",
          "Task assignment, bid comparison and award trail",
          "Shared project documents and decisions",
          "Time and invoice approval workflow",
          "One activity history for the project team"
        ],
        "not": [
          "No payment processing or escrow is included in the demo",
          "VAT is added where legally applicable",
          "Any provider transfer fees are shown separately when connected"
        ],
        "cta": "Start a project"
      },
      "supplier": {
        "name": "Supplier account",
        "price": "Free to apply",
        "sub": "Create a profile and respond to suitable project work.",
        "items": [
          "No fee to apply or maintain a profile",
          "Publish services, capability and indicative rates",
          "Receive task invitations and quote requests",
          "Submit offers with line items and supporting files",
          "Track assigned work, time logs and invoices"
        ],
        "not": [
          "Supplier verification must be completed before directory listing",
          "A coordination fee may be shown on awarded project terms"
        ],
        "cta": "Apply as supplier"
      }
    },
    "how": {
      "eyebrow": "HOW IT WORKS",
      "title": "From project brief to accepted delivery.",
      "intro": "Every decision stays connected to the phase and task it belongs to.",
      "mapLabel": "Six-step project workflow from defining scope through closing delivery",
      "steps": {
        "define": "Define",
        "defineText": "Create a project, set its site and dates, then break delivery into phases and tasks.",
        "source": "Source",
        "sourceText": "Find vetted suppliers, invite them to a task or open a bid round.",
        "agree": "Agree",
        "agreeText": "Compare scope, price, lead time and documents; award the selected offer.",
        "deliver": "Deliver",
        "deliverText": "Suppliers report progress, log time and share evidence in the task workspace.",
        "approve": "Approve",
        "approveText": "Review work, time and invoice details with a clear change history.",
        "close": "Close",
        "closeText": "Accept the final phase, complete the project and leave a supplier review."
      },
      "flow": "One shared workflow",
      "flowProject": "Project",
      "flowPhase": "Phase",
      "flowTask": "Task",
      "flowEvidence": "Evidence & approval"
    },
    "faq": {
      "eyebrow": "faq",
      "title": "FAQ / HELP",
      "payment": "Is this a real payment gateway?",
      "paymentText": "The MVP has a backend payment state machine. Connect Stripe or another provider for live money movement.",
      "vetting": "How does vetting work?",
      "vettingText": "Application → New → Verified → References → Approved/Rejected → badge assignment → live supplier.",
      "bid": "Can suppliers bid?",
      "bidText": "Customers can publish a bid against a project task. Suppliers submit comparable scope, price and delivery offers, and the customer awards one supplier per task.",
      "documents": "What are documents?",
      "documentsText": "Project files are organized by phase, task and supplier. Each upload can be shared directly or sent through customer approval, with change requests and version tracking.",
      "helpEyebrow": "FAQ / HELP CENTER",
      "helpTitle": "Help & support",
      "moreHelp": "Need more help? Contact"
    },
    "legal": {
      "eyebrow": "LEGAL",
      "imprint": "Impressum / Legal notice",
      "privacy": "Privacy policy",
      "terms": "Terms of use",
      "notPublished": "This page has not been published yet. Please contact us via the support address.",
      "rights": {
        "title": "Your rights on CraftCrew",
        "access": "Access and a copy of your data",
        "accessText": "Under Art. 15 and 20 GDPR you can see the personal data we store about you and take it with you. Signed in, open your profile and choose \"Download my data\". You get a JSON file with your account, messages, notifications, projects, invoices and activity. Passwords and security keys are never included.",
        "correct": "Correcting your data",
        "correctText": "You can change your name, contact details and company profile on your profile page at any time (Art. 16 GDPR). For verified suppliers, changes to legal details are checked again before they show as verified.",
        "delete": "Deleting your account",
        "deleteText": "You can delete your account on your profile page (Art. 17 GDPR). While projects, accepted work, unpaid invoices or escalations are still open, they have to be finished or handed over first, because the other party depends on them.",
        "deleteText2": "After you confirm with your password, your account is locked at once and deleted after 14 days. Signing in during these 14 days cancels the deletion. Then your name, email, phone, company profile, notifications and files are removed. Messages you sent stay visible to their recipients as coming from \"Deleted user\".",
        "keep": "What we have to keep",
        "keepText": "Invoices must be kept for 10 years (§ 147 AO, § 14b UStG). They keep the company name, address and tax ID they were issued with, but not your personal contact details. Time entries that back an invoice are kept for the same reason.",
        "team": "Team members",
        "teamText": "A team member who deletes their account removes only their own login. When the main account is deleted, its team members' logins are deleted with it.",
        "questions": "Questions and complaints",
        "complain": "You also have the right to complain to a data protection supervisory authority.",
        "contact": "Contact:"
      }
    }
  },
};
