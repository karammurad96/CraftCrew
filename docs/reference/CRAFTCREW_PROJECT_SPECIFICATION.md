# CraftCrew - Project Specification

## Executive Summary
CraftCrew is a B2B industrial services marketplace platform connecting vetted suppliers (mechanical/electrical work, PLC/SPS programming, design, logistics, project management) with SME customers. Core differentiator: waterfall project management where customers create projects, break them into phases, assign vetted suppliers to phases, and track invoices through an approval workflow.

---

## Business Model

### Platform Revenue
- **Supplier subscriptions:** Monthly fee for supplier listings (tier-based: Bronze/Silver/Gold)
- **Transaction fee:** 3-5% of invoices approved through platform
- **Optional:** Lead generation, premium supplier badges

### Supplier Vetting (5-Step Process)
1. **Online application** - Supplier fills company info, services, certifications
2. **Auto-checks** - Platform validates business registry, reference verification
3. **Reference calls** - Founder/admin calls provided references
4. **Founder call** - Direct conversation with supplier leadership
5. **Badge assignment** - Bronze/Silver/Gold based on track record

### Badge System
- **Bronze:** Verified business (application + auto-checks passed)
- **Silver:** Bronze + industry certifications (ISO, safety, trade licenses)
- **Gold:** Silver + 5+ years track record + strong reference calls + CEO vouching

---

## Platform Users & Roles

### 1. **Customer (SME/Manufacturer)**
- Browse verified suppliers filtered by service category and badge level
- Create projects with waterfall phases
- Assign suppliers to specific phases
- Track phase progress and supplier communication
- Review and approve/reject invoices
- Download project reports and documents

### 2. **Supplier (Service Provider)**
- Complete and manage supplier profile/certifications
- Receive phase invitations from customers
- Accept/decline phase assignments
- Report progress on assigned phases
- Submit invoices to customers
- Track payment status
- Message customers about phase work
- Upload phase-related documents

### 3. **Admin (Founder)**
- View supplier vetting queue
- Approve/reject supplier applications
- Assign badges to suppliers
- Monitor platform metrics (active projects, revenue, supplier count)
- Send announcements to suppliers/customers
- Access reports and analytics

---

## Core Features

### Feature 1: Supplier Directory
- **Search & filter:** By service type, location, badge level, certifications
- **Supplier card:** Company name, badge, certifications, rating, response time
- **Supplier detail page:** Full profile, past projects, customer reviews, contact info
- **"Request Quote" button** → generates RFQ to supplier inbox

### Feature 2: Project Management (Waterfall)
- **Project creation:** Customer defines project name, description, budget, timeline, services needed
- **Phase creation:** Customer breaks project into sequential phases (e.g., Design → Procurement → Assembly → Testing → Deployment)
- **Phase assignment:** Customer assigns one or more suppliers to each phase
- **Phase status:** Not Started → In Progress → Under Review → Completed
- **Supplier acceptance:** Supplier receives invite → accepts/declines phase
- **Progress tracking:** Supplier updates phase status, attaches documents (CAD, reports, photos)

### Feature 3: Invoice Management
- **Invoice submission:** Supplier creates invoice for completed phase
  - Line items (hours, materials, services)
  - Attachments (timesheets, receipts, reports)
  - Amount and due date
- **Invoice review:** Customer reviews invoice against phase deliverables
- **Approval workflow:**
  - Approve (payment scheduled)
  - Request revision (supplier resubmits)
  - Reject (with reason)
- **Payment tracking:** Invoice status visible to both parties
- **Reporting:** Dashboard shows invoiced amount, approved amount, pending approvals

### Feature 4: Messaging
- **Phase-level communication:** Threaded messages between customer and assigned suppliers
- **Project-level announcements:** Customer can notify all suppliers on project
- **Notifications:** Real-time alerts for new messages, invoice submissions, phase status changes
- **File sharing:** Upload files directly in message threads

### Feature 5: Document Management
- **Project documents:** Centralized folder per project (specs, contracts, safety docs, drawings)
- **Phase documents:** Linked to phases (test reports, certificates, completion proofs)
- **Access control:** Only project participants can view project documents

### Feature 6: Supplier Vetting Dashboard (Admin)
- **Application queue:** New supplier applications with status (Pending → Auto-Checks → References → Approved/Rejected)
- **Approve/reject interface:** Admin can see full application, mark reference calls completed, assign badge
- **Supplier metrics:** List of all suppliers with badge level, active phases, revenue generated

---

## Data Model

### Users Table
```
id (PK)
email (UNIQUE)
password_hash
role (customer | supplier | admin)
first_name
last_name
phone
company_name (if supplier)
profile_bio
created_at
updated_at
```

### Suppliers Table
```
id (PK)
user_id (FK → Users)
company_name
industry_category (mechanical | electrical | plc | design | logistics | project-management)
certifications (JSON array: ISO9001, ISO45001, etc.)
badge_level (bronze | silver | gold | none)
application_status (pending | auto-checks | references | approved | rejected)
verification_date
rating (1-5)
total_projects_completed
profile_picture_url
website_url
created_at
updated_at
```

### Customers Table
```
id (PK)
user_id (FK → Users)
company_name
industry
employees_count
website
created_at
updated_at
```

### Projects Table
```
id (PK)
customer_id (FK → Customers)
name
description
budget
start_date
end_date
status (active | completed | paused)
created_at
updated_at
```

### Phases Table
```
id (PK)
project_id (FK → Projects)
name
description
order (1, 2, 3...)
status (not_started | in_progress | under_review | completed)
start_date
end_date
assigned_supplier_id (FK → Suppliers) [nullable for multi-supplier]
created_at
updated_at
```

### Phase_Suppliers Table (for multi-supplier phases)
```
phase_id (FK → Phases)
supplier_id (FK → Suppliers)
status (invited | accepted | declined | working | completed)
joined_date
completed_date
```

### Invoices Table
```
id (PK)
phase_id (FK → Phases)
supplier_id (FK → Suppliers)
customer_id (FK → Customers)
amount
description
line_items (JSON: [{item, hours/qty, unit_price, total}])
status (draft | submitted | approved | rejected | paid)
submitted_date
approval_date
payment_date
rejection_reason
created_at
updated_at
```

### Messages Table
```
id (PK)
phase_id (FK → Phases) [nullable for project-level]
sender_id (FK → Users)
recipient_id (FK → Users) [nullable for broadcast]
subject
body
attachments (JSON array: [file_urls])
created_at
read_at
```

### Documents Table
```
id (PK)
project_id (FK → Projects) [nullable if phase-level]
phase_id (FK → Phases) [nullable if project-level]
uploaded_by_id (FK → Users)
file_name
file_url
file_type (pdf | image | cad | doc)
created_at
```

---

## API Endpoints

### Authentication
```
POST   /auth/signup          - Register new user (customer/supplier)
POST   /auth/login           - Login, return JWT token
POST   /auth/logout          - Logout
GET    /auth/me              - Get current user profile
```

### Suppliers
```
GET    /suppliers            - List all suppliers (with filters: badge, category, location)
GET    /suppliers/:id        - Get supplier detail
POST   /suppliers/apply      - Submit supplier application
GET    /suppliers/me         - Get current supplier profile (supplier role)
PUT    /suppliers/me         - Update supplier profile
GET    /suppliers/applications (admin only)
PUT    /suppliers/:id/badge  - Assign badge to supplier (admin only)
```

### Projects
```
GET    /projects            - Get all projects for current user
POST   /projects            - Create new project (customer only)
GET    /projects/:id        - Get project details
PUT    /projects/:id        - Update project
DELETE /projects/:id        - Delete project
GET    /projects/:id/summary - Get project summary (phases, invoices, progress)
```

### Phases
```
GET    /projects/:id/phases      - List phases for project
POST   /projects/:id/phases      - Create new phase
PUT    /phases/:id               - Update phase
DELETE /phases/:id               - Delete phase
PUT    /phases/:id/status        - Update phase status
POST   /phases/:id/assign        - Assign supplier to phase
PUT    /phases/:id/accept        - Supplier accepts phase invitation
PUT    /phases/:id/decline       - Supplier declines phase invitation
```

### Invoices
```
GET    /invoices                 - Get invoices for current user
POST   /phases/:id/invoices      - Create invoice for phase
GET    /invoices/:id             - Get invoice detail
PUT    /invoices/:id             - Update invoice
PUT    /invoices/:id/approve     - Customer approves invoice
PUT    /invoices/:id/reject      - Customer rejects invoice (with reason)
PUT    /invoices/:id/submit      - Supplier submits invoice
```

### Messages
```
GET    /phases/:id/messages      - Get messages for phase thread
POST   /phases/:id/messages      - Post message to phase thread
POST   /projects/:id/broadcast   - Post project-wide message (customer only)
GET    /messages/inbox           - Get user inbox (unread messages)
PUT    /messages/:id/read        - Mark message as read
```

### Documents
```
GET    /projects/:id/documents   - List project documents
POST   /projects/:id/documents   - Upload project document
GET    /phases/:id/documents     - List phase documents
POST   /phases/:id/documents     - Upload phase document
DELETE /documents/:id            - Delete document
```

### Admin Dashboard
```
GET    /admin/suppliers/applications  - Get vetting queue
GET    /admin/metrics                 - Platform metrics (users, projects, revenue)
GET    /admin/reports                 - Analytics and reports
```

---

## Frontend Pages & Routes

### Public Pages
- **`/`** - Landing page (features, pricing, trust indicators, CTA)

### Auth Pages
- **`/login`** - Login form
- **`/signup`** - Sign up form (role selection: Customer/Supplier)

### Customer Pages
- **`/dashboard`** - Customer dashboard (active projects, recent invoices)
- **`/suppliers`** - Supplier directory (search, filter, sort)
- **`/suppliers/:id`** - Supplier detail (profile, reviews, certifications)
- **`/projects/new`** - Create new project
- **`/projects/:id`** - Project detail (phases, invoices, timeline)
- **`/projects/:id/phases/:phaseId`** - Phase detail (assign supplier, track progress)
- **`/invoices`** - Invoice list and approval dashboard
- **`/invoices/:id`** - Invoice detail (approve/reject/request revision)
- **`/messages`** - Inbox and message threads
- **`/profile`** - Customer profile settings

### Supplier Pages
- **`/supplier-dashboard`** - Supplier dashboard (active phases, pending invoices)
- **`/supplier/apply`** - Supplier application form
- **`/supplier/profile`** - Supplier profile management
- **`/phases`** - List of phases assigned to supplier
- **`/phases/:id`** - Phase detail (update progress, submit documents)
- **`/invoices/create/:phaseId`** - Create invoice for phase
- **`/invoices`** - Invoice list (submitted, pending payment)
- **`/messages`** - Inbox and message threads

### Admin Pages
- **`/admin`** - Admin dashboard (metrics, platform stats)
- **`/admin/applications`** - Supplier vetting queue
- **`/admin/suppliers`** - All suppliers (manage badges, status)
- **`/admin/reports`** - Analytics and reports

### Error Pages
- **`/404`** - Not found
- **`/500`** - Server error

---

## User Journeys

### Journey 1: Customer Creates Project & Assigns Suppliers
1. Customer logs in → Dashboard
2. Click "New Project" → Fill project details (name, budget, timeline, description)
3. Create phases (Design, Procurement, Assembly, Testing)
4. Browse suppliers → Find electrical engineer with Gold badge
5. Assign supplier to "Electrical Work" phase
6. Supplier receives notification → Accepts phase
7. Supplier uploads progress updates → Phase status updates
8. Supplier submits invoice → Customer reviews → Approves
9. Project marked complete

### Journey 2: Supplier Applies & Gets Vetted
1. Supplier visits landing page → Click "Join as Supplier"
2. Sign up → Complete application (company info, certifications, references)
3. System auto-checks business registry
4. Admin receives notification → Calls references
5. Admin schedules call with supplier CEO
6. Admin approves → Assigns Silver badge
7. Supplier now visible in directory with Silver badge

### Journey 3: Customer Approves Invoice
1. Customer receives notification: "Invoice submitted for Phase X"
2. Visit invoices page → Click invoice to review
3. See line items (labor, materials, services)
4. See supplier's supporting documents (timesheets, receipts)
5. Click "Approve" → Invoice status → "Approved"
6. Supplier notified → Can download approval confirmation

---

## Technical Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL 15+
- **Authentication:** JWT (jsonwebtoken)
- **Password Hashing:** bcryptjs
- **Validation:** joi or express-validator
- **File Upload:** multer (local storage or S3)
- **Email:** nodemailer (for notifications)
- **Environment:** dotenv

### Frontend
- **Framework:** React 18+
- **Routing:** React Router v6
- **HTTP Client:** fetch API (or axios)
- **Styling:** CSS-in-JS or Tailwind CSS
- **Form Handling:** useState or react-hook-form
- **Notifications:** Toast library (e.g., react-toastify)

### Deployment
- **Backend:** Docker + Docker Compose (development), AWS ECS/Heroku (production)
- **Frontend:** Docker + Docker Compose (development), Vercel/Netlify (production)
- **Database:** Docker PostgreSQL (development), AWS RDS (production)
- **File Storage:** Local (development), AWS S3 (production)

### DevOps
- **Docker:** Containerized backend, frontend, database
- **docker-compose:** Local development orchestration
- **CI/CD:** GitHub Actions (build, test, deploy)

---

## MVP Success Criteria

### Functional Requirements (Must-Have)
- ✅ User registration and login (customer, supplier, admin)
- ✅ Supplier directory with search/filter
- ✅ Project creation with waterfall phases
- ✅ Supplier assignment to phases
- ✅ Phase progress tracking
- ✅ Invoice creation, submission, approval workflow
- ✅ Messaging between project participants
- ✅ Admin supplier vetting interface
- ✅ Role-based access control

### Performance Requirements
- Page load time < 2 seconds
- API response time < 500ms
- Support 100+ concurrent users

### Security Requirements
- All passwords hashed (bcrypt)
- JWT token-based authentication
- Role-based authorization on all endpoints
- SQL injection prevention (parameterized queries)
- HTTPS enforced in production
- CORS properly configured

### User Experience
- Mobile-responsive design
- Intuitive navigation
- Clear error messages
- Loading indicators for async operations
- Confirmation dialogs for destructive actions

---

## Installation & Setup

```bash
# Clone repository
git clone <repo>
cd craftcrew

# Backend setup
cd craftcrew-backend
npm install
cp .env.example .env
# Edit .env with database credentials, JWT secret
node setup-db.js          # Initialize database
npm start

# Frontend setup (in new terminal)
cd craftcrew-frontend
npm install
cp .env.example .env
# Edit .env with REACT_APP_API_URL=http://localhost:5000
npm start

# Docker (all-in-one)
docker-compose up --build
```

---

## Testing Credentials

### Test Accounts (pre-populated in database)
```
Customer:  email: customer@example.com  password: password123
Supplier:  email: supplier@example.com  password: password123
Admin:     email: admin@example.com     password: password123
```

### Test Data
- 6 sample suppliers (different badges and categories)
- 1 sample project with 5 phases
- 1 sample invoice (pending approval)

---

## Future Enhancements (Post-MVP)

1. **Real-time collaboration:** WebSocket support for live phase updates
2. **Advanced analytics:** Supplier performance scoring, customer satisfaction metrics
3. **Payment integration:** Stripe/PayPal for invoice payments
4. **Mobile app:** React Native for iOS/Android
5. **AI matching:** Recommend suppliers based on project needs
6. **API marketplace:** Allow suppliers to integrate their own systems
7. **Certification marketplace:** Suppliers can sell certifications
8. **Multi-language support:** German, Arabic, Spanish
9. **Advanced reporting:** Export projects, invoices, analytics as PDF
10. **Audit trail:** Track all changes to projects and invoices

---

## Contact & Support

**For technical questions:** Refer to API documentation or code comments  
**For business logic:** Review user journeys and feature descriptions above

---

**Last Updated:** August 28, 2026  
**Version:** 1.0 (MVP Specification)
