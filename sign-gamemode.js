'use strict'
/**
 * sign-gamemode.js
 *
 * Signs gamemode.js with the Ed25519 private key and appends the signature
 * as a comment on the last line so the SkyMP client can verify it.
 *
 * Usage:
 *   node sign-gamemode.js                   # signs gamemode.js in-place
 *   node sign-gamemode.js path/to/file.js   # signs a specific file in-place
 *
 * The signature line format expected by the client (ServerJsVerificationService):
 *   // skymp:sig:y:<keyId>:<base64signature>
 *
 * The private key must be in signing-private.pem (Ed25519 PKCS#8 PEM).
 * The key ID ("frostfall") must match the key in the backend's data/public-keys.json.
 */

const fs   = require('fs')
const path = require('path')
const { sign } = require('crypto')

const KEY_ID      = 'frostfall'
const PRIVATE_KEY = fs.readFileSync(path.join(__dirname, 'signing-private.pem'), 'utf8')
const SIG_PREFIX  = '// skymp:sig:y:'

const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'gamemode.js')

let src = fs.readFileSync(target, 'utf8')

// Strip any existing signature line so re-signing is idempotent.
const lines = src.split('\n')
if (lines[lines.length - 1].startsWith(SIG_PREFIX)) {
  lines.pop()
  src = lines.join('\n')
}

// Ensure the source ends with a newline before we sign it.
if (!src.endsWith('\n')) src += '\n'

const sig = sign(null, Buffer.from(src, 'utf8'), PRIVATE_KEY).toString('base64')
const signed = src + `${SIG_PREFIX}${KEY_ID}:${sig}\n`

fs.writeFileSync(target, signed)
console.log(`Signed ${path.basename(target)} with key "${KEY_ID}"`)
