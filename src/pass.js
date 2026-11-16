export const PASS_PERIOD_MS = 30_000

export const DEMO_CREDENTIALS = Object.freeze({
  email: 'student@novsu.test',
  password: 'novsu2026',
})

const student = Object.freeze({
  fullName: 'Воронов Алексей Андреевич',
  birthYear: 2006,
  group: '4211',
  specialty: 'Прикладная информатика',
  photo: './student.webp',
})

// 36 × 36 WebP from the demo portrait, cropped to keep the face clear in the QR thumbnail.
const passStudent = Object.freeze({
  ...student,
  photo: 'data:image/webp;base64,UklGRqAAAABXRUJQVlA4IJQAAACQBgCdASokACQAP5Gw0V64LSolLjgLMwAyCUAX5wXSW8Zptg9ZTBUBAuhJdkid1vCoReixvH4omjcAHbDAAP6Lhm5wvmQDnvxQQ60nJlUYpQlbVUeZvqqdwyaR+0HNhCouT9F4x/PPmdY4nBgT72nFUI48Vp4fukiGzL3mW6ltIdEeljhcBq5EFuhGw92kBwhLAAAA',
})

const DEVICE_KEY = 'novsu-pass.demo.device.v1'
const PASS_VERSION = 1
const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const TOTP_PATTERN = /^\d{6}$/
const encoder = new TextEncoder()

function readDevice() {
  try {
    const device = JSON.parse(localStorage.getItem(DEVICE_KEY))
    return UUID_V4.test(device?.uuid) ? device : null
  } catch {
    return null
  }
}

function writeDevice(device) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device))
  } catch {
    throw new Error('Разрешите браузеру сохранять данные сайта и попробуйте снова.')
  }
}

function secureCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Откройте приложение по HTTPS или на localhost.')
  }

  return globalThis.crypto
}

export function getSession() {
  const device = readDevice()
  return device?.active === true ? { uuid: device.uuid, student } : null
}

export async function signIn(email, password) {
  if (email.trim().toLowerCase() !== DEMO_CREDENTIALS.email || password !== DEMO_CREDENTIALS.password) {
    throw new Error('Проверьте почту и пароль для тестового аккаунта.')
  }

  const activateDevice = () => {
    const uuid = readDevice()?.uuid ?? secureCrypto().randomUUID()
    writeDevice({ uuid, active: true })
    return { uuid, student }
  }

  const locks = globalThis.navigator?.locks
  return locks ? locks.request(DEVICE_KEY, activateDevice) : activateDevice()
}

export function signOut() {
  const device = readDevice()
  if (device) writeDevice({ uuid: device.uuid, active: false })
}

async function getTotp(uuid, step) {
  const { subtle } = secureCrypto()
  // The public demo seed lets protocol checks derive the same device key.
  const seed = await subtle.digest('SHA-256', encoder.encode(`novsu-pass.demo.v1:${uuid}`))
  const key = await subtle.importKey('raw', seed, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const counter = new DataView(new ArrayBuffer(8))
  counter.setBigUint64(0, BigInt(step), false)

  const mac = new DataView(await subtle.sign('HMAC', key, counter.buffer))
  const offset = mac.getUint8(mac.byteLength - 1) & 0x0f
  const code = (mac.getUint32(offset, false) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, '0')
}

export async function createPass(session, now = Date.now()) {
  const { uuid } = session
  const step = Math.floor(now / PASS_PERIOD_MS)
  const totp = await getTotp(uuid, step)

  return {
    payload: JSON.stringify({ v: PASS_VERSION, uuid, totp, step, ...passStudent }),
    expiresAt: (step + 1) * PASS_PERIOD_MS,
  }
}

export async function verifyPass(raw, now = Date.now()) {
  const malformed = { accepted: false, message: 'Этот QR-код не относится к тестовым пропускам НовГУ.' }
  if (typeof raw !== 'string' || raw.length > 1024) return malformed

  let pass
  try {
    pass = JSON.parse(raw)
  } catch {
    return malformed
  }

  if (pass?.v !== PASS_VERSION || typeof pass.uuid !== 'string' || !UUID_V4.test(pass.uuid) ||
      typeof pass.totp !== 'string' || !TOTP_PATTERN.test(pass.totp) ||
      !Number.isSafeInteger(pass.step) || pass.step < 0) {
    return malformed
  }

  const step = Math.floor(now / PASS_PERIOD_MS)
  if (pass.step < step) {
    return { accepted: false, message: 'Срок действия QR-кода истёк. Попросите показать новый код.' }
  }
  if (pass.step > step) {
    return { accepted: false, message: 'Проверьте время на устройстве, показавшем пропуск.' }
  }

  const matchesStudent = Object.entries(passStudent).every(([field, value]) => pass[field] === value)
  if (!matchesStudent || pass.totp !== await getTotp(pass.uuid, step)) {
    return { accepted: false, message: 'Данные тестового пропуска не прошли проверку.' }
  }

  return { accepted: true, message: 'Тестовый пропуск действителен.', uuid: pass.uuid, student }
}
