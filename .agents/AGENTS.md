# AltiFlow Codebase Security Guardrails & Architectural Contracts

This document specifies mandatory architectural contracts, security boundaries, and validation requirements for the AltiFlow codebase. Every AI agent and developer modifying this repository must follow these rules without exception.

---

## 1. User Roles & Access Control

AltiFlow enforces two user categories: **Owner Category** (Internal Operations) and **Client Category** (Client Organizations).

### Role Definitions & Hierarchy
- **`Super-Admin`** *(Owner)*: Master platform admin. Full access to User directory, Client CRUD, Deletion Queue approvals, Recycle Bin management, and global workspace operations.
- **`Admin`** *(Owner)*: Internal operations manager. Access to Global Pipeline, Job stage transitions, Round Robin & manual job assignments, and Issue Tracker. **Cannot create users or manage client organizations**.
- **`Client-Admin`** *(Client)*: Admin for a specific Client Organization (e.g., Bayer). Can manage team users and project assignments **strictly within their own organization**.
- **`Client-User`** *(Client)*: Field operator / pilot. Access limited to assigned client workspaces to submit field job cards (flight metrics, image counts, CSV rows, logs), view trackers, and raise support tickets.

---

## 2. Mandatory Security Contracts

### Contract 1: Client-Admin Security & Organization Isolation
- **Frontend (`CreateUserModal` in `app/page.js`)**:
  - When creator is a `Client-Admin`, Owner roles (`Super-Admin` and `Admin`) must be **completely hidden**.
  - The Client Organization picker must be **automatically locked** to `user.client_id` (`Locked to your org`), prohibiting selection of other client organizations.
- **Backend (`POST /api/users` in `app/api/[[...path]]/route.js`)**:
  - Rejects attempts by `Client-Admin` creators to create Owner roles with a `403 Forbidden`.
  - Forces `client_id = user.client_id` for `Client-Admin` creators to prevent cross-organization user creation.

### Contract 2: Universal Confirm Password Validation
- Every password creation, reset, or update screen (**Set New Password Callback**, **Passkey File Reset**, **Force Password Change**) must include:
  - **Password** field
  - **Confirm Password** field
  - Real-time password matching check (`✓ Passwords match` / `✕ Passwords do not match`)
  - Minimum 6-character length enforcement.
  - Submit button disabled until validation passes.

### Contract 3: Resend SMTP & Supabase Auth Email Flow
- User creation dispatches a single onboarding email via Supabase Auth + Resend SMTP (`supabase/templates/invite_user.html`) featuring the branded squircle logo.
- Custom SMTP or secondary invitation email triggers must not be added.

### Contract 4: Dual Forgot Password Mechanisms
- The Forgot Password interface must preserve **both** reset pathways:
  1. **📧 Send Email Link**: Dispatches password recovery email link. Clicking link (`#access_token=...&type=recovery`) opens the dedicated **Set New Password** page.
  2. **🔑 Passkey File**: Validates encrypted `.key` passkey file upload + new password.

### Contract 5: Soft Deletion & Audit Traceability
- Deletions of users, workspaces, or job cards must be archived in `recycle_bin` with `deleted_by` metadata.
- Primary keys must use UUID v4.

---

## 3. Pre-Commit / Build Verification

Before completing any code edits, verify compliance by running:
```bash
npm run check-security
npm run build
```
All automated guardrail checks and Next.js production compilation must pass cleanly with exit code 0.
