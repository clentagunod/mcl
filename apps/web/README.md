# MCL Dashboard

Admin web app for a small lending business: track clients, balances and collector payments in real time.
Built with **React + Vite + TypeScript** and **Firebase** (Authentication + Firestore), shared with a separate
Android app that collectors use to enter payments.

For Android integration, data contracts and the new daily-payment policy, read the
[Android development context](./docs/android-development-context.md). Implementation
and setup for reports/settings are covered in the [workspace guide](./docs/print-studio.md).

## 1. One-time Firebase setup

1. In the [Firebase Console](https://console.firebase.google.com), create a project (or use your existing one).
2. **Authentication → Sign-in method →** enable **Email/Password**.
3. **Firestore Database →** create a database (production mode).
4. **Rules:** open the *Rules* tab and paste the contents of [`firestore.rules`](./firestore.rules), then **Publish**.
   From `apps/web`, deploy with `npx firebase-tools deploy --only firestore:rules --config firebase.print-studio.json --project YOUR_PROJECT_ID`.
5. **Project settings → General → Your apps →** add a **Web app** and copy its config values.
6. Copy `.env.example` to `.env` and paste the values in.

### Create your admin account (once)

Rules never let the website create an admin, so you create the first one by hand:

1. **Authentication → Users → Add user** (your email + a strong password). Copy the **User UID**.
2. **Firestore → Start collection** `users` → document ID = that **UID**, with fields:

   | Field      | Type   | Value               |
   | ---------- | ------ | ------------------- |
   | `role`     | string | `admin`             |
   | `fullName` | string | your name           |
   | `email`    | string | your email          |

You can now sign in to the web app. Collector accounts are created from the **Collectors** page.

## 2. Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the loan / due-date logic
npm run typecheck
npm run build      # production build in dist/
```

Deploy (optional): `firebase deploy --only hosting` (uses `firebase.json`; serves `dist/`).

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

**`users/{uid}`** – one per login. `role`: `"admin"` or `"collector"`; `fullName`, `email`, `phone`, `active` (boolean).
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

The six fields are required. Optional `notes` (preferred) or legacy `note` may contain
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

- **Deleting a collector** removes their profile (this blocks them from the data immediately), but the Firebase
  Authentication login can only be deleted from the Firebase Console (Authentication → Users). Prefer
  **Deactivate** when someone leaves; it is reversible.
- Collector **email and password** cannot be edited from the website (that needs a trusted server). Use
  **Reset password**, which emails the collector a reset link, so give collectors real, reachable emails.
- All payments are loaded into the browser to compute balances. This is fine for a small business
  (thousands of payments); for much larger volumes, store a running total per client with a Cloud Function.
- Consolidation / Liquidation is a live, paginated 58-day ledger. Its balance is
  principal minus all payments; the dashboard's loan outstanding also includes interest.
- The daily-payable minimum is optional and applies to collector receipts. Web admins
  may enter smaller partial/final settlements. The prepared rules must be published
  to enforce this in Android; its UI remains unchanged. See the Android context above.
