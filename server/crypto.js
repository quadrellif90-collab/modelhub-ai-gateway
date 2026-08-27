// Crittografia chiavi (AES-256-GCM, key derivata dalla macchina)
const crypto = require("node:crypto");
const os = require("node:os");

function deriveAuthKey() {
  const src = process.env.MODELHUB_AUTH_KEY || `${os.hostname() || ""}:${os.userInfo().username || ""}:modelhub-v1`;
  return crypto.createHash("sha256").update(src).digest();
}
function encryptAuth(obj) {
  const key = deriveAuthKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const json = JSON.stringify(obj);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, iv: iv.toString("base64"), tag: tag.toString("base64"), cipher: enc.toString("base64") };
}
function decryptAuth(w) {
  const key = deriveAuthKey();
  const iv = Buffer.from(w.iv, "base64");
  const tag = Buffer.from(w.tag, "base64");
  const enc = Buffer.from(w.cipher, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(json.toString("utf8"));
}
function looksLikeAuth(obj) {
  if (!obj || typeof obj !== "object") return false;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === "string") return true;
    if (v && typeof v === "object" && typeof v.key === "string") return true;
    if (v && typeof v === "object" && v.v === 1 && v.iv && v.cipher) return true;
  }
  return false;
}

module.exports = { deriveAuthKey, encryptAuth, decryptAuth, looksLikeAuth };
