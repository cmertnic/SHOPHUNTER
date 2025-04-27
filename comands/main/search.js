const { i18next, updateI18nextLanguage } = require('../../i18n');
const { getUserSettings } = require('../../database/settingsDb');
const axios = require('axios');
const {
  searchProductNearby,
  getUserLocation,
  parsePrice,
  sendProductCard,
  updateProductCard
} = require('../../events');
const userSessions = require('../../userSessions');

module.exports = {
  name: '/search',
  execute: async (bot, chatId, userId, productName) => {
    const userSettings = await getUserSettings(userId);

    // Создаем уникальную сессию для пользователя
    if (!userSessions[userId]) {
      userSessions[userId] = {
        products: [],
        currentIndex: 0,
        isProcessing: false,
        lastMessageId: null,
      };
    }

    const userSession = userSessions[userId];

    try {
      // Если название товара не указано, запрашиваем его
      if (!productName) {
        await bot.sendMessage(chatId, i18next.t('search.enter_product_name'));
        return;
      }

      const userLocation = await getUserLocation(userId);
      const results = await searchProductNearby(productName, userLocation);

      if (!Array.isArray(results) || results.length === 0) {
        console.error(`Результат поиска не является массивом или пуст: ${JSON.stringify(results)}`);
        await bot.sendMessage(chatId, i18next.t('search.no_results'));
        return;
      }

      userSession.products = results; // Сохраняем результаты в сессию
      userSession.currentIndex = 0; // Сбрасываем индекс

      // Отправляем первую карточку продукта
      await sendProductCard(bot, chatId, userSession);
    } catch (error) {
      console.error(`Ошибка при обработке команды /search для пользователя ${userId}: ${error.message}`);
      await bot.sendMessage(chatId, i18next.t('error.command_execution'));
    }
  },

  // Функция для обработки действий пользователя (перелистывание)
  handleCallbackQuery: async (bot, chatId, userId, callbackData) => {
    const userSession = userSessions[userId];

    if (!userSession) {
      await bot.sendMessage(chatId, i18next.t('error.session_not_found'));
      return;
    }

    try {
      if (callbackData === 'prev') {
        userSession.currentIndex = Math.max(userSession.currentIndex - 1, 0);
      } else if (callbackData === 'next') {
        userSession.currentIndex = Math.min(userSession.currentIndex + 1, userSession.products.length - 1);
      } else {
        return; 
      }

      // Обновляем карточку продукта
      await updateProductCard(bot, chatId, userSession);
    } catch (error) {
      console.error(`Ошибка при обработке callback для пользователя ${userId}: ${error.message}`);
      await bot.sendMessage(chatId, i18next.t('error.command_execution'));
    }
  },
};
