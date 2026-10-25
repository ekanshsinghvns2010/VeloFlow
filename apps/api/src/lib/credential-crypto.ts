import {
createCipheriv,
createDecipheriv,
randomBytes,
} from "node:crypto";
import { env } from "./env.js";

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, "hex");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

if (KEY.length !== 32) {
throw new Error(
"CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes.",
);
}

export function encryptCredential(
value: Record<string, unknown>,
): string {
const iv = randomBytes(IV_LENGTH);
const cipher = createCipheriv(ALGORITHM, KEY, iv);

const plaintext = Buffer.from(JSON.stringify(value), "utf8");
const encrypted = Buffer.concat([
cipher.update(plaintext),
cipher.final(),
]);
const tag = cipher.getAuthTag();

return [
"v1",
iv.toString("base64"),
tag.toString("base64"),
encrypted.toString("base64"),
].join(".");
}

export function decryptCredential(
payload: string,
): Record<string, unknown> {
const parts = payload.split(".");

if (parts.length !== 4 || parts[0] !== "v1") {
throw new Error("Unsupported or invalid credential format.");
}

const [, ivEncoded, tagEncoded, encryptedEncoded] = parts;
const iv = Buffer.from(ivEncoded, "base64");
const tag = Buffer.from(tagEncoded, "base64");
const encrypted = Buffer.from(encryptedEncoded, "base64");

if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
throw new Error("Invalid encrypted credential.");
}

const decipher = createDecipheriv(ALGORITHM, KEY, iv);
decipher.setAuthTag(tag);

const plaintext = Buffer.concat([
decipher.update(encrypted),
decipher.final(),
]);

const parsed: unknown = JSON.parse(plaintext.toString("utf8"));

if (
parsed === null ||
typeof parsed !== "object" ||
Array.isArray(parsed)
) {
throw new Error("Credential payload must be an object.");
}

return parsed as Record<string, unknown>;
}