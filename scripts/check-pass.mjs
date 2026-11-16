import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import {
  createPass, DEMO_CREDENTIALS, getSession, PASS_PERIOD_MS, signIn, signOut, verifyPass,
} from '../src/pass.js'

function useBrowserStorage() {
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

useBrowserStorage()
const { email, password } = DEMO_CREDENTIALS
const now = Date.UTC(2026, 10, 16, 12, 0, 20)
const expectedStep = Math.floor(now / PASS_PERIOD_MS)

assert.equal(getSession(), null)
await assert.rejects(signIn(email, 'wrong password'))
const first = await signIn(email.toUpperCase(), password)
assert.deepEqual(getSession(), first)
signOut()
assert.equal(getSession(), null)
assert.equal((await signIn(email, password)).uuid, first.uuid)

const { payload, expiresAt } = await createPass(first, now)
const data = JSON.parse(payload)
assert.deepEqual(data, {
  v: 1, uuid: first.uuid, totp: data.totp, step: expectedStep, ...first.student, photo: data.photo,
})
assert.match(data.photo, /^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/)
const thumbnail = Buffer.from(data.photo.split(',')[1], 'base64')
assert.equal(thumbnail.toString('ascii', 0, 4), 'RIFF')
assert.equal(thumbnail.toString('ascii', 8, 12), 'WEBP')
assert.ok(Buffer.byteLength(payload) <= 500, 'QR payload should stay small enough for phone screens')
assert.equal(expiresAt, now + 10_000)

const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' })
const quietZone = 4
const pixelsPerModule = 8
const width = (modules.size + 2 * quietZone) * pixelsPerModule
const pixels = new Uint8ClampedArray(width * width * 4).fill(255)
for (let row = 0; row < width; row++) {
  const y = Math.floor(row / pixelsPerModule) - quietZone
  if (y < 0 || y >= modules.size) continue

  for (let column = 0; column < width; column++) {
    const x = Math.floor(column / pixelsPerModule) - quietZone
    if (x < 0 || x >= modules.size || !modules.get(y, x)) continue

    const offset = (row * width + column) * 4
    pixels.set([16, 27, 52], offset)
  }
}
assert.equal(jsQR(pixels, width, width)?.data, payload)

const seed = createHash('sha256').update(`novsu-pass.demo.v1:${first.uuid}`).digest()
const counter = Buffer.alloc(8)
counter.writeBigUInt64BE(BigInt(expectedStep))
const mac = createHmac('sha1', seed).update(counter).digest()
const offset = mac.at(-1) & 0x0f
const expectedTotp = String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
assert.equal(data.totp, expectedTotp)

useBrowserStorage()
assert.equal(getSession(), null)
assert.equal((await verifyPass(payload, now)).accepted, true)
const second = await signIn(email, password)
assert.notEqual(second.uuid, first.uuid)
assert.notEqual((await createPass(second, now)).payload, payload)
assert.notEqual((await createPass(first, expiresAt)).payload, payload)

assert.equal((await verifyPass(payload, expiresAt)).accepted, false)
assert.equal((await verifyPass(payload, now - PASS_PERIOD_MS)).accepted, false)
assert.equal((await verifyPass('https://novsu.ru', now)).accepted, false)
const wrongTotp = data.totp === '000000' ? '111111' : '000000'
for (const edits of [{ totp: wrongTotp }, { birthYear: 1990 }, { photo: 'https://example.org/photo' }, { v: 2 }]) {
  assert.equal((await verifyPass(JSON.stringify({ ...data, ...edits }), now)).accepted, false)
}

console.log('Pass checks passed: login, device identity, TOTP, QR decoding, verification, expiry and tampering.')
