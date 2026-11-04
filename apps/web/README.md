# MCL Dashboard

Admin web app for a small lending business: track clients, balances and collector payments in real time.
Built with **React + Vite + TypeScript** and **Firebase** (Authentication + Firestore), shared with a separate
Android app that collectors use to enter payments.

For Android integration, data contracts and the new daily-payment policy, read the
[Android development context](./docs/android-development-context.md). Implementation
and setup for reports/settings are covered in the [workspace guide](./docs/print-studio.md).
The website uses Firebase Authentication and Firestore directly and can run on the Spark
plan, within its usage quotas. No Cloud Functions deployment or Blaze upgrade is required.
Admin-only loan renewal and cycle isolation are covered in the
[renewal guide](./docs/renewals.md). Publish the rules and website to enable changes.
Android must send loanId before servicing renewed borrowers.

## 1. One-time Firebase setup

1. In the [Firebase Console](https://console.firebase.google.com), create a project (or use your existing one).
2. **Authentication → Sign-in method →** enable **Email/Password**.
3. **Firestore Database →** create a database (production mode).
4. **Rules:** open the *Rules* tab and paste the contents of [`firestore.rules`](./firestore.rules), then **Publish**.
   From `apps/web`, deploy with `npx firebase-tools deploy --only firestore:rules --config firebase.print-studio.json --project YOUR_PROJECT_ID`.
5. **Project settings → General → Your apps →** add a **Web app** and copy its config values.
6. Copy `.env.example` to `.env` and paste the values in.

### Create your admin account (once)

Create the first admin by hand; existing active admins can then add more admins from the website:

1. **Authentication → Users → Add user** (your email + a strong password). Copy the **User UID**.
2. **Firestore → Start collection** `users` → document ID = that **UID**, with fields:

   | Field      | Type   | Value               |
   | ---------- | ------ | ------------------- |
   | `role`     | string | `admin`             |
   | `fullName` | string | your name           |
   | `email`    | string | your email          |

You can now sign in to the web app. Open **Collectors & Admins** to add collector or admin
accounts, edit their names and phone numbers, send password reset emails, or deactivate or
delete other accounts. Your own account is marked **(You)** and cannot be deleted or
deactivated; Firestore rules enforce this even for direct SDK requests. Account roles cannot
be changed after creation. Publish the updated Firestore rules before using these features.

### Developer account (manual setup only)

Create an Email/Password login in Firebase Authentication, then create `users/{uid}` in
Firestore using that login's exact UID. Set `role` to the lowercase string `developer`,
`active` to `true`, and add `fullName`, `email`, and `phone` (an empty string is allowed).
Optionally add `createdAt` as a timestamp.

Developer accounts have the same website permissions as admins, including
renewals, receipts, settings, and Trash. They are excluded from **Collectors & Admins**
and collector selectors. Application users cannot create, edit, delete, or change the role
of a Developer profile, even through direct SDK requests. Admins also cannot read these
profiles by UID. Manage them through privileged Firebase Console/Admin SDK access only.
Their business actions retain the usual receipt, renewal, and Trash attribution.

Deploy the updated Firestore rules and web build together before using
a Developer login. As with admins, setting `active` to `false` revokes application access.

## 2. Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the loan / due-date logic
npm run test:spark # Firestore rules and real web-service transactions in the emulator
npm run typecheck
npm run build      # production build in dist/
```

Build first, then deploy from `apps/web` with
`npx firebase-tools deploy --only hosting --config firebase.print-studio.json --project YOUR_PROJECT_ID`.
The configuration serves `dist/`, supports refreshed SPA routes, revalidates HTML/logo assets,
and caches hashed JS/CSS/document assets. Deployment is a separate approval step.

For a complete web release after building, deploy only Firestore rules and hosting:

```powershell
npx.cmd firebase-tools deploy --only "firestore:rules,hosting" --config firebase.print-studio.json --project YOUR_PROJECT_ID
```

Receipt retry/deletion behavior and the limits of direct writes are documented in
the [receipt guide](./docs/receipt-rollout.md). The retired `VITE_RECEIPT_BACKEND` variable
and `receiptPolicy.backendOnly` flag are ignored by this build and its rules.

## 3. Business rules (all in `src/lib/loan.ts`, covered by tests)

- **Total payable** = principal + fixed interest (a peso amount, not a percentage). 10,000 + 1,250 = 11,250.
- **Outstanding balance** = total payable − sum of all payments. It is *calculated live* from the payments, so
  it can never drift out of sync with what collectors entered.
- **Collection days** are every day except **Sundays** and **holidays** (managed on the *Holidays* page).
- **Due date** = the Nth collection day after the date of approval (N = 45, 50 or 58).
- **Status:** `Paid` (green) = nothing left to pay · `Due` (red) = due date reached or passed with a balance left ·
  `Pending` (yellow) = still inside the loan term with a balance left.
- Whether the approval date itself counts as day 1 is one setting: `COUNT_APPROVAL_DATE_AS_DAY_ONE` in
  `src/config/app.ts` (default `false`: day 1 is the first collection day *after* approval).

## 4. Data model (shared with the Android app)

All dates are plain `"YYYY-MM-DD"` strings. Money is a number in pesos.

**`users/{uid}`** – one per login. `role`: `"admin"`, `"collector"`, or `"developer"`; `fullName`, `email`, `phone`, `active` (boolean).
The collector app signs in with Firebase Authentication (email + password).

**`clients/{id}`** – `lastName`, `firstName`, `middleName`, `address`, `cellphone`, `principal` (number),
`interest` (number), `loanTermDays` (45 | 50 | 58), `approvalDate`, `dailyAmount`, `clientNumber` and
`transactionNumber`. Collectors have **read-only** access. Preserve legacy document IDs in payment references.

**`payments/{id}`** – what the Android app **creates** (it cannot edit or delete):

| Field           | Type      | Notes                                                       |
| --------------- | --------- | ----------------------------------------------------------- |
| `clientId`      | string    | id of a document in `clients`                               |
| `amount`        | number    | greater than 0                                              |
| `paymentDate`   | string    | `"YYYY-MM-DD"` – the day the money was collected            |
| `collectorId`   | string    | **must equal the signed-in collector's uid**                |
| `collectorName` | string    | the collector's `fullName`                                  |
| `createdAt`     | timestamp | **must be the server timestamp** (`FieldValue.serverTimestamp()`) |

The six fields are required. `loanId` is also required after a client's first renewal;
missing or `initial` belongs to the original loan. Optional `notes` (preferred) or legacy `note` may contain
up to 1,500 characters. Other fields are rejected for collector writes. The collector
minimum setting lives in `settings/Configurations/elements/paymentPolicy`; active
collectors may read that one settings document.

**`holidays/{yyyy-MM-dd}`** – `date`, `name`. Collectors may read them.

## 5. Project structure

```
src/
  config/       app constants, env validation, Firebase init
  lib/          pure logic (dates, money, loan rules, stats, validation) + tests
  services/     all Firestore/Auth access (the only files that talk to Firebase)
  context/      auth session + shared live data
  components/   reusable UI (Modal, ConfirmDialog, FormField, StatusBadge, ...)
  pages/        Dashboard, Clients, Collectors, Holidays, Printables, Liquidation
```

## 6. Known limitations

Web client selection, bulk deletion, restore and permanent deletion are documented in
[Client Trash](docs/client-trash.md). Publish the updated Firestore rules before
publishing the updated web build. Android files remain unchanged.

- **Deleting a collector or admin** removes their profile (this blocks them from the data immediately), but the Firebase
  Authentication login can only be deleted from the Firebase Console (Authentication → Users). Prefer
  **Deactivate** when someone leaves; it is reversible.
- Account **email and password** cannot be edited from the website (that needs a trusted server). Use
  **Reset password**, which emails the account holder a reset link, so use real, reachable emails.
- Payments are loaded into the browser to compute balances. Firestore's Spark read/write quotas
  still apply. Aggregate balance and repayment-history checks run in the web services; rules
  enforce roles, field validation, loan-cycle boundaries, and paired changes. Browser transactions
  cannot lock queries against new matching receipts from another writer, so this configuration
  does not guarantee global overpayment prevention across simultaneous devices.
- Consolidation / Liquidation is a live, paginated 58-day ledger. Its balance is
  principal minus current-loan payments; the dashboard's loan outstanding also includes interest.
- The daily-payable minimum is optional and applies to collector receipts. Web admins
  may enter smaller partial/final settlements. The prepared rules must be published
  to enforce this in Android; its UI remains unchanged. See the Android context above.
