<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowRight, Check, ChevronRight, CircleHelp, Download, Eye, EyeOff, IdCard,
  LogOut, Maximize, QrCode, ScanLine, ShieldCheck, Smartphone, UserRound, X,
} from 'lucide-vue-next'
import QRCode from 'qrcode'
import { installAvailable, installInstructions, isInstalled, promptInstall } from './install.js'
import { createPass, DEMO_CREDENTIALS, getSession, PASS_PERIOD_MS, signIn, signOut } from './pass.js'

const appUrl = import.meta.env.BASE_URL
const session = ref(getSession())
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loginError = ref('')
const loginPending = ref(false)
const qr = ref(null)
const qrError = ref('')
const now = ref(Date.now())
const installDialog = ref(null)
const qrDialog = ref(null)
const heading = ref(null)
let qrRequested = ''
let clock

const currentQr = computed(() => qr.value?.expiresAt > now.value ? qr.value : null)
const remaining = computed(() => Math.ceil(Math.max(0, (qr.value?.expiresAt ?? 0) - now.value) / 1000))
const elapsedPercent = computed(() => Math.max(0, ((qr.value?.expiresAt ?? 0) - now.value) / PASS_PERIOD_MS) * 100)
const timer = computed(() => `00:${String(remaining.value).padStart(2, '0')}`)
const deviceSuffix = computed(() => session.value?.uuid.slice(-8).toUpperCase())
const secondsPerCode = PASS_PERIOD_MS / 1000

async function refreshQr() {
  const timestamp = Date.now()
  now.value = timestamp
  if (!session.value) return

  const activeSession = session.value
  const request = `${activeSession.uuid}:${Math.floor(timestamp / PASS_PERIOD_MS)}`
  if (qrRequested === request) return
  qrRequested = request
  qrError.value = ''

  try {
    const pass = await createPass(activeSession, timestamp)
    const image = await QRCode.toDataURL(pass.payload, {
      errorCorrectionLevel: 'M',
      scale: 8,
      margin: 4,
      color: { dark: '#101b34', light: '#ffffff' },
    })
    if (qrRequested === request && session.value === activeSession) qr.value = { ...pass, image }
  } catch (error) {
    if (qrRequested === request && session.value === activeSession) {
      qrError.value = error.message || 'Не удалось создать QR-код.'
    }
  }
}

watch(session, () => {
  qr.value = null
  qrRequested = ''
  void refreshQr()
}, { flush: 'sync' })

onMounted(() => {
  document.addEventListener('visibilitychange', refreshQr)
  window.addEventListener('storage', syncSession)
  clock = window.setInterval(refreshQr, 200)
  void refreshQr()
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', refreshQr)
  window.removeEventListener('storage', syncSession)
  window.clearInterval(clock)
})

function syncSession() {
  const nextSession = getSession()
  if (nextSession?.uuid !== session.value?.uuid) session.value = nextSession
}

async function logIn() {
  if (loginPending.value) return
  loginPending.value = true
  loginError.value = ''
  try {
    session.value = await signIn(email.value, password.value)
    password.value = ''
    showPassword.value = false
    await nextTick()
    heading.value?.focus()
  } catch (error) {
    loginError.value = error.message || 'Не удалось войти.'
  } finally {
    loginPending.value = false
  }
}

function enterDemo() {
  email.value = DEMO_CREDENTIALS.email
  password.value = DEMO_CREDENTIALS.password
  void logIn()
}

async function logOut() {
  try {
    signOut()
    session.value = null
    await nextTick()
    heading.value?.focus()
  } catch (error) {
    loginError.value = error.message || 'Не удалось выйти.'
  }
}

async function installApp() {
  if (installAvailable.value) {
    await promptInstall()
    return
  }
  installDialog.value.showModal()
}
</script>

<template>
  <header class="topbar">
    <div class="shell topbar-inner">
      <a class="brand" :href="appUrl" aria-label="НовГУ — цифровой пропуск">
        <span class="brand-icon"><QrCode :size="24" :stroke-width="1.9" /></span>
        <span class="brand-wordmark">НовГУ<span>Цифровой пропуск</span></span>
      </a>

      <div class="top-actions">
        <button v-if="!isInstalled" type="button" class="button button-install" title="Установить приложение" aria-label="Установить приложение" @click="installApp">
          <Download :size="17" /> <span>Установить</span>
        </button>
        <span v-else class="installed-indicator" title="Приложение установлено"><Check :size="17" /><span>Установлено</span></span>
      </div>
    </div>
  </header>

  <main class="shell pass-shell">
    <section class="cover" aria-labelledby="page-title">
      <div class="cover-image" aria-hidden="true"></div>
      <div class="cover-inner">
        <span class="cover-tag"><span></span> Тестовая версия</span>
        <h1 id="page-title">Цифровой пропуск</h1>
        <p>Новгородский государственный университет<br class="cover-break" /> имени Ярослава Мудрого</p>
      </div>
    </section>

    <div v-if="!session" class="content-grid login-grid">
      <section class="card login-card" aria-labelledby="login-title">
        <div class="section-icon"><UserRound :size="22" /></div>
        <h2 id="login-title" ref="heading" tabindex="-1">Вход в приложение</h2>
        <p class="card-intro">Войдите, чтобы открыть свой QR-пропуск.</p>
        <form class="login-form" @submit.prevent="logIn">
          <label for="email">Электронная почта</label>
          <input id="email" v-model="email" type="email" name="email" autocomplete="username" placeholder="name@example.com" required />
          <label for="password">Пароль</label>
          <div class="password-field">
            <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" name="password" autocomplete="current-password" placeholder="Введите пароль" required />
            <button type="button" :aria-label="showPassword ? 'Скрыть пароль' : 'Показать пароль'" @click="showPassword = !showPassword">
              <EyeOff v-if="showPassword" :size="19" /><Eye v-else :size="19" />
            </button>
          </div>
          <p v-if="loginError" class="error-message" role="alert">{{ loginError }}</p>
          <button class="button button-primary" type="submit" :disabled="loginPending">
            {{ loginPending ? 'Входим…' : 'Войти' }} <ArrowRight :size="18" />
          </button>
        </form>
        <div class="demo-access">
          <button type="button" class="text-button" :disabled="loginPending" @click="enterDemo">Войти в демо <ChevronRight :size="17" /></button>
        </div>
      </section>

      <aside class="card guide-card" aria-labelledby="guide-title">
        <h2 id="guide-title">Как пользоваться</h2>
        <ol class="guide-list">
          <li><span class="section-icon"><QrCode :size="21" /></span><div><strong>Откройте пропуск</strong><p>После входа приложение выпустит QR-код для этого устройства.</p></div></li>
          <li><span class="section-icon"><ScanLine :size="21" /></span><div><strong>Покажите QR на проходной</strong><p>Поднесите экран к считывателю. При необходимости увеличьте код кнопкой «Развернуть».</p></div></li>
          <li><span class="section-icon"><ShieldCheck :size="21" /></span><div><strong>Дождитесь ответа</strong><p>Результат проверки покажет терминал на проходной.</p></div></li>
        </ol>
        <div class="note"><CircleHelp :size="20" /><p>В демо используется вымышленный профиль студента.</p></div>
      </aside>
    </div>

    <div v-else class="content-grid">
      <section class="card qr-card" aria-labelledby="qr-title">
        <div class="card-heading">
          <div class="heading-group"><span class="section-icon"><QrCode :size="22" /></span><h2 id="qr-title" ref="heading" tabindex="-1">QR-пропуск</h2></div>
          <span v-if="currentQr" class="active-label"><span></span> Активен</span>
        </div>
        <div class="qr-stage">
          <div class="qr-frame">
            <img v-if="currentQr" :src="currentQr.image" width="276" height="276" alt="QR-код студенческого пропуска" />
            <p v-else-if="qrError" class="error-message" role="alert">{{ qrError }}</p>
            <p v-else class="muted">Обновляем QR-код…</p>
          </div>
        </div>
        <div class="qr-controls">
          <div class="timer-line"><span>До обновления</span><strong>{{ currentQr ? timer : '—' }}</strong></div>
          <div class="timer-track" aria-hidden="true"><span :style="{ width: `${elapsedPercent}%` }"></span></div>
          <div class="qr-buttons">
            <button class="button button-quiet" type="button" :disabled="!currentQr" @click="qrDialog.showModal()"><Maximize :size="17" /> Развернуть</button>
            <a v-if="currentQr" class="button button-quiet icon-button" :href="currentQr.image" download="novsu-pass.png" aria-label="Скачать QR-код PNG" title="Скачать QR-код PNG"><Download :size="18" /></a>
          </div>
        </div>
      </section>

      <div class="side-stack">
        <section class="card profile-card" aria-labelledby="profile-title">
          <div class="card-heading">
            <div class="heading-group"><span class="section-icon"><IdCard :size="22" /></span><h2 id="profile-title">Студент</h2></div>
            <button type="button" class="button button-plain icon-button" title="Выйти" aria-label="Выйти из приложения" @click="logOut"><LogOut :size="19" /></button>
          </div>
          <div class="profile-person">
            <img :src="session.student.photo" alt="Фото тестового студента" width="76" height="76" />
            <div><span class="muted">Фамилия, имя, отчество</span><strong>{{ session.student.fullName }}</strong></div>
          </div>
          <dl class="profile-details">
            <div><dt>Год рождения</dt><dd>{{ session.student.birthYear }}</dd></div>
            <div><dt>Группа</dt><dd>{{ session.student.group }}</dd></div>
            <div class="profile-specialty"><dt>Специальность</dt><dd>{{ session.student.specialty }}</dd></div>
          </dl>
          <div class="device-line"><Smartphone :size="17" /> <span>Устройство</span><code>{{ deviceSuffix }}</code></div>
          <p v-if="loginError" class="error-message" role="alert">{{ loginError }}</p>
        </section>

        <section class="note pass-note">
          <span class="section-icon"><ScanLine :size="22" /></span>
          <div><h2>Покажите QR на проходной</h2><p>Поднесите экран к считывателю. Код обновляется каждые {{ secondsPerCode }} секунд.</p></div>
        </section>
      </div>
    </div>
  </main>

  <footer class="shell footer"><span>НовГУ · Цифровой пропуск</span><span>Демо v0.1</span></footer>

  <dialog ref="installDialog" class="modal" aria-labelledby="install-title">
    <div class="card-heading"><h2 id="install-title">Установка приложения</h2><form method="dialog"><button aria-label="Закрыть" class="button button-plain icon-button"><X :size="21" /></button></form></div>
    <p>{{ installInstructions() }}</p>
    <form method="dialog"><button class="button button-primary">Понятно</button></form>
  </dialog>

  <dialog ref="qrDialog" class="modal qr-modal" aria-labelledby="large-qr-title">
    <div class="card-heading"><h2 id="large-qr-title">QR-пропуск</h2><form method="dialog"><button aria-label="Закрыть" class="button button-plain icon-button"><X :size="21" /></button></form></div>
    <img v-if="currentQr" :src="currentQr.image" width="420" height="420" alt="QR-код студенческого пропуска" />
    <p v-else class="qr-modal-loading">Обновляем QR-код…</p>
    <div class="timer-line"><span>До обновления</span><strong>{{ currentQr ? timer : '—' }}</strong></div>
    <div class="timer-track" aria-hidden="true"><span :style="{ width: `${elapsedPercent}%` }"></span></div>
  </dialog>
</template>
