This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Accounts and data access

- **Admin:** sign in as `admin` (or leave the username blank) with `APP_PASSPHRASE`. Admin can change all live data.
- **Individuals:** configured through `APP_USERS_JSON`. They can read all live data, create games and sessions, and change only records they own.
- **Demo:** enter `demo` as the username or use **View public demo**. Demo access is read-only and never opens the live spreadsheet.

Example environment configuration:

```bash
APP_PASSPHRASE="admin-password"
AUTH_COOKIE_SECRET="generate-at-least-32-random-characters"
APP_USERS_JSON='[
  {"id":"ray","name":"Ray Tang","password":"individual-password"},
  {"id":"partner","name":"Partner Name","password":"another-password"}
]'
SHEET_ID="live-google-sheet-id"
DEMO_SHEET_ID="sanitized-demo-google-sheet-id"
GOOGLE_SERVICE_ACCOUNT_EMAIL="...@....iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`AUTH_COOKIE_SECRET` must be independent from every login password. Generate it as a random secret (for
example, `openssl rand -base64 48`) and configure it in Vercel before deploying.

Share both spreadsheets with the service-account email. The demo spreadsheet should have the same six-tab
schema as the live sheet and contain only public or synthetic data. If `DEMO_SHEET_ID` is absent, the bundled
public fixture is used instead.

New Games and Sessions rows include an `owner_id` column. The Sheets adapter adds the column automatically on
the first write. For older rows without `owner_id`, an individual can claim their existing work when their
configured `name` exactly matches the row's `edited_by` or `logged_by` value; the stable account id is stamped
on the next edit.

Sessions also have `player` and `player_id` columns, added automatically on the first write. Anyone with an
account can log a session for themselves, for a teammate, or for someone outside the team. The person who
logged it, the teammate it was logged for, and admin can update it.

The **Pay** tab has four sections: Payroll, Overtime, Reimbursements and Loans.

Pay is in dollars once Ray or admin sets a person's rates on Payroll (base $/h; overtime and double time default
to 1.5× and 2× base). Rates live in the `PayrollMembers` tab (`hourly_rate`, `overtime_rate`,
`double_time_rate`). **Overtime** applies California rules (Labor Code §510) per Sunday–Saturday workweek:
over 8h/day and over 40 regular hours/week at overtime, over 12h/day at double time, and the 7th day worked in a
week at overtime (double past 8h). Each session is priced by the hours it actually pushed over a limit. These are
estimates for planning pay, not payroll or legal advice. **Payroll** lists sessions played by people on payroll with hours (time in
to time out) and whether each one has been paid. Sessions dated before `PAYROLL_START_DATE` (Oct 1, 2026, in
`src/lib/payroll.ts`) count as already paid. Employee accounts are always on payroll; Ray and admin can add anyone else with an
account (individuals included) from the "Who's on payroll" list on the Payroll page, which is stored in a
`PayrollMembers` tab. A session can only be marked paid if whoever played it is on payroll. Only Ray (account id or name `ray`) and admin can check a session
off as paid; the server stamps who and when into the Sessions columns `payroll_paid_at` / `payroll_paid_by`, and
a paid session is locked against the employee's edits.

The **Loans** section is a ledger of money lent between people (`Loans` tab). Each row is a loan (lender →
borrower) or a repayment (borrower → lender); "Who owes whom" nets every pair, and **Repay** prefills a
repayment for the outstanding amount. Anyone with an account records entries; whoever recorded one, either
person in it, or admin can edit or delete it.

The **Reimbursements** section tracks money someone fronted for the team and is owed back. It lives in a
`Reimbursements` tab that the app creates on the first write. Anyone with an account can file one for
themselves or a teammate. Individuals and admin mark them paid; employees can file but not settle. Whoever filed
it and the person owed can edit or delete it while it's unpaid; a paid one is locked except to admin.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
