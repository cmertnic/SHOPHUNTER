// Подключаем необходимые библиотеки
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');
const { getUserSettings } = require('./database/settingsDb');

/**
 * Инициализация i18next
 * @param {string} currentLanguage - Текущий язык
 */
async function initializeI18next(currentLanguage) {
  await i18next
    .use(Backend)
    .init({
      lng: currentLanguage, // Устанавливаем текущий язык
      fallbackLng: 'eng', // Язык по умолчанию, если текущий не найден
      backend: {
        loadPath: path.join(__dirname, 'locales/{{lng}}/translation.json'), // Путь к файлам локализации
      },
      initImmediate: false, // Откладываем инициализацию, чтобы можно было изменить язык до фактической инициализации
    });
}

/**
 * Обновление языка i18next на основе настроек сервера
 * @param {string} chatId - ID чата (или ID сервера)
 */
async function updateI18nextLanguage(chatId) {
  try {
    // Получаем настройки сервера
    const serverSettings = await getUserSettings(chatId);
    const language = serverSettings.language; // Получаем язык из настроек сервера

    // Изменяем язык i18next
    await i18next.changeLanguage(language);
  } catch (error) {
    console.error('Ошибка при обновлении языка:', error); // Логируем ошибку, если она произойдет
  }
}

// Экспортируем i18next, функцию перевода t, а также функции инициализации и обновления языка
module.exports = {
  i18next,
  t: (key, options) => i18next.t(key, options), // Функция перевода текста с помощью i18next
  initializeI18next,
  updateI18nextLanguage,
};
