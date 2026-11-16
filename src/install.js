import { ref } from 'vue'

const standalone = window.matchMedia('(display-mode: standalone)')
let installPrompt

export const installAvailable = ref(false)
export const isInstalled = ref(standalone.matches || Boolean(navigator.standalone))

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  installPrompt = event
  installAvailable.value = true
})

window.addEventListener('appinstalled', () => {
  isInstalled.value = true
  installAvailable.value = false
  installPrompt = undefined
})

export async function promptInstall() {
  if (!installPrompt) return false

  const prompt = installPrompt
  installPrompt = undefined
  installAvailable.value = false

  try {
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    return outcome === 'accepted'
  } catch {
    return false
  }
}

export function installInstructions() {
  const browser = navigator.userAgent
  const isIPad = /Macintosh/i.test(browser) && navigator.maxTouchPoints > 1

  if (/iPhone|iPad|iPod/i.test(browser) || isIPad) {
    return 'Откройте пропуск в Safari. Нажмите «Поделиться», выберите «На экран “Домой”» и нажмите «Добавить».'
  }
  if (/Android/i.test(browser)) {
    return 'В меню браузера выберите «Установить приложение» или «Добавить на главный экран».'
  }
  if (/Macintosh.*Safari/i.test(browser) && !/Chrome|Chromium/i.test(browser)) {
    return 'В Safari откройте меню «Файл» и выберите «Добавить в Dock».'
  }
  return 'Нажмите значок установки в адресной строке или откройте меню браузера и выберите «Установить приложение».'
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
    console.warn('Не удалось включить офлайн-режим пропуска.', error)
  })
}
