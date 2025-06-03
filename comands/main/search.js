const { i18next } = require('../../i18n');
const { getUserSettings } = require('../../database/settingsDb');
const {
  searchProductNearby,
  getUserLocation,
  sendProductCard,
  updateProductCard
} = require('../../events');
const userSessions = require('../../userSessions');

module.exports = {
  name: '/search',

  execute: async (bot, chatId, userId, productName) => {
    const userSettings = await getUserSettings(userId);

    if (!userSessions[userId]) {
      userSessions[userId] = {
        products: [],
        currentIndex: 0,
        isProcessing: false,
        lastMessageId: null,
        awaitingProductName: false,
        language: userSettings?.language || 'rus',
      };
    }

    const userSession = userSessions[userId];

    try {
      if (!productName || productName.trim() === '') {
        await bot.sendMessage(chatId, i18next.t('search.enter_product_name'));
        userSession.awaitingProductName = true;
        return false;
      }

      userSession.awaitingProductName = false;

      const userLocation = await getUserLocation(userId);
      const results = await searchProductNearby(productName, userLocation);

      if (!Array.isArray(results) || results.length === 0) {
        await bot.sendMessage(chatId, i18next.t('search.no_results'));
        await bot.sendMessage(chatId, i18next.t('search.enter_product_name'));
        userSession.awaitingProductName = true;
        return false;
      }

      userSession.products = results;
      userSession.currentIndex = 0;

      await sendProductCard(bot, chatId, userSession);
      return true;

    } catch (error) {
      console.error(`Ошибка при обработке команды /search для пользователя ${userId}:`, error);
      await bot.sendMessage(chatId, i18next.t('error.command_execution'));
      return false;
    }
  },

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

      await updateProductCard(bot, chatId, userSession);
    } catch (error) {
      console.error(`Ошибка при обработке callback для пользователя ${userId}:`, error);
      await bot.sendMessage(chatId, i18next.t('error.command_execution'));
    }
  },
};
