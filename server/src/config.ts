import path from "node:path";

export interface AppConfig {
  port: number;
  databasePath: string;
  appOrigin?: string;
  cookieSecure: boolean;
  isProduction: boolean;
  sessionTtlMs: number;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value.trim().toLowerCase() === "true";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === "production";
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const cookieSecure = parseBoolean(env.COOKIE_SECURE) ?? isProduction;

  return {
    port,
    databasePath: env.DATABASE_PATH?.trim() || path.resolve("data/folio.db"),
    appOrigin: env.APP_ORIGIN?.trim().replace(/\/+$/, "") || undefined,
    cookieSecure,
    isProduction,
    sessionTtlMs: SESSION_TTL_MS,
  };
}
