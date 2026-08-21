import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

function envValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n")
      .find((entry) => entry.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

/** Mints the current admin `cbt_auth` cookie for import scripts. */
export function mintAdminCookie() {
  const passphrase = envValue("APP_PASSPHRASE");
  if (!passphrase) throw new Error("APP_PASSPHRASE is required");
  const signingSecret = envValue("AUTH_COOKIE_SECRET") ?? `development-only:${passphrase}`;
  if (signingSecret.length < 32) throw new Error("AUTH_COOKIE_SECRET must be at least 32 characters");

  const accountVersion = createHmac("sha256", signingSecret).update(`credential:${passphrase}`).digest("hex");
  const issuedAt = Date.now();
  const payload = Buffer.from(
    JSON.stringify({
      role: "admin",
      userId: "admin",
      name: "Admin",
      accountVersion,
      issuedAt,
      expiresAt: issuedAt + 90 * 24 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(payload).digest("hex");
  return `cbt_auth=${payload}.${signature}`;
}
