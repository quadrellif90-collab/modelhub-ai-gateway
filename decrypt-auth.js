const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');

function deriveAuthKey() {
  const src = (process.env.AUTH_KEY_ENV || `${os.hostname()}:${os.userInfo().username}:modelhub-v1`);
  return crypto.createHash('sha256').update(src).digest();
}

function decryptAuth(w) {
  const key = deriveAuthKey();
  const iv = Buffer.from(w.iv, 'base64');
  const tag = Buffer.from(w.tag, 'base64');
  const enc = Buffer.from(w.cipher, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(json.toString('utf8'));
}

const authPath = 'C:\\Users\\Siviglino\\AppData\\Local\\Programs\\ModelHub\\auth.json';
const w = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const plain = decryptAuth(w);
console.log(JSON.stringify(plain, null, 2));