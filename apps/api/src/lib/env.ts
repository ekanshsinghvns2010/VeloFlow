
import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  WEB_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(32),
  CREDENTIAL_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:8081"),
  LOG_LEVEL: z.enum([
    "fatal",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
    "silent"
  ]).default("info")
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => {
    return `${issue.path.join(".")}: ${issue.message}`;
  });

  throw new Error(
    `Invalid VeloFlow environment configuration:\n${details.join("\n")}`
  );
}

export const env = parsed.data;

if (env.NODE_ENV === "production") {
  const forbidden = [
    "change_this_password",
    "replace_with_a_long_random_secret",
    "replace_with_a_64_character_hex_key"
  ];

  for (const value of [env.JWT_SECRET, env.CREDENTIAL_ENCRYPTION_KEY]) {
    if (forbidden.some((placeholder) => value.includes(placeholder))) {
      throw new Error(
        "Production configuration contains a placeholder secret."
      );
    }
  }
}

export const corsOrigins = env.CORS_ORIGINS
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
