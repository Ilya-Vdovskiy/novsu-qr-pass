import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const [checkout, baseUrl = 'http://localhost:8080'] = process.argv.slice(2)

if (!checkout) {
  console.error('Usage: node scripts/check-smocker.mjs <qr-smocker checkout> [base URL]')
  process.exit(1)
}

const endpoint = new URL('/enter', baseUrl)
const scenarios = [
  ['accept_enterance_for_user_1.yaml', 'ACCEPTED'],
  ['reject_enterance_for_user_2.yaml', 'REJECTED'],
]

for (const [fixture, expected] of scenarios) {
  const yaml = await readFile(join(checkout, 'mocks', fixture), 'utf8')
  // Read the literal JSON body from the upstream fixture without handling RSA private keys.
  const match = /^ {6}value: >[ \t]*\r?\n([\s\S]+?)^ {2}response:/m.exec(yaml)
  if (!match) throw new Error(`Cannot read request body from ${fixture}.`)

  const body = JSON.parse(match[1])
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) throw new Error(`${fixture}: HTTP ${response.status} from ${endpoint}.`)

  const { result } = await response.json()
  if (result !== expected) throw new Error(`${fixture}: expected ${expected}, received ${result}.`)

  console.log(`${fixture}: ${result}`)
}
