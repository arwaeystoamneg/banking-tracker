import "server-only";
import { google, sheets_v4 } from "googleapis";

/**
 * Service-account auth per CLAUDE.md's architecture decision. This module must never be imported from
 * client code — the `server-only` import throws a build error if it is. The private key never gets a
 * NEXT_PUBLIC_ prefix and is never bundled to the client.
 */

const globalForSheets = globalThis as unknown as { __sheetsClient?: sheets_v4.Sheets };

export function hasSheetsCredentials(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.SHEET_ID);
}

export function getSheetsClient(): sheets_v4.Sheets {
  if (globalForSheets.__sheetsClient) return globalForSheets.__sheetsClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY are not set");
  }

  const auth = new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  globalForSheets.__sheetsClient = google.sheets({ version: "v4", auth });
  return globalForSheets.__sheetsClient;
}

export function getSheetId(): string {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error("SHEET_ID is not set");
  return id;
}
