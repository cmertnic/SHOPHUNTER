const { i18next, updateI18nextLanguage } = require('../../i18n');
const { getUserSettings } = require('../../database/settingsDb');
const axios = require('axios');
const {
  handleTextMessage,
  searchProductNearby,
  getUserLocation,
  changeLanguage,
  sendMainMenu,
  handleManualLocationInput
} = require('../../events');

module.exports = {
  name: '/search',
  execute: async (bot, chatId, userId, productName) => {
    try {
      const userSettings = await getUserSettings(userId);
      await updateI18nextLanguage(chatId, userSettings.language);

      const userLocation = await getUserLocation(userId);
      if (!userLocation) {
        await bot.sendMessage(chatId, i18next.t('error.no_location'));
        return;
      }

      const results = await searchProductNearby(productName);
      if (!Array.isArray(results) || results.length === 0) {
        console.error(`Результат поиска не является массивом или пуст: ${JSON.stringify(results)}`);
        await bot.sendMessage(chatId, i18next.t('search.no_results'));
        return;
      }

      await sendProductCards(bot, chatId, results);
    } catch (error) {
      console.error(`Ошибка при обработке команды /search для пользователя ${userId}: ${error.message}`);
      await bot.sendMessage(chatId, i18next.t('error.command_execution'));
    }
  },
};

async function sendProductCards(bot, chatId, products) {
  const totalProducts = products.length;
  let currentIndex = 0;
  let lastMessageId = null; // Переменная для хранения ID последнего сообщения

  const sendCard = async (index) => {
    const product = products[index];
    const responseMessage = `
      <b>${product.name}</b>
      <i>Цена: ${product.price} ₽</i>
      ${product.description ? `<i>Описание: ${product.description}</i>` : ''}
      <i>Ссылка на товар: <a href="${product.url}">${product.url}</a></i>
    `;

    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Товар ' + (index + 1) + ' из ' + totalProducts, callback_data: 'no_action' },
          ],
          [
            { text: 'Предыдущий', callback_data: 'prev' },
            { text: 'Следующий', callback_data: 'next' },
          ],
          [
            { text: 'Сортировать по возрастанию', callback_data: 'sort_asc' },
            { text: 'Сортировать по убыванию', callback_data: 'sort_desc' },
          ],
          [
            { text: 'Открыть товар', url: product.url },
          ],
        ],
      },
    };

    if (lastMessageId === null) {
      const sentMessage = await bot.sendMessage(chatId, responseMessage, { parse_mode: 'HTML', reply_markup: options.reply_markup });
      lastMessageId = sentMessage.message_id; // Сохраняем ID отправленного сообщения
    } else {
      try {
        await bot.editMessageText(responseMessage, {
          chat_id: chatId,
          message_id: lastMessageId,
          parse_mode: 'HTML',
          reply_markup: options.reply_markup,
        });
      } catch (error) {
        console.error(`Ошибка при редактировании сообщения: ${error.message}`);
        // Если редактирование не удалось, отправляем новое сообщение
        const sentMessage = await bot.sendMessage(chatId, responseMessage, { parse_mode: 'HTML', reply_markup: options.reply_markup });
        lastMessageId = sentMessage.message_id; // Обновляем ID на новый
      }
    }
  };

  const navigateProducts = async () => {
    await sendCard(currentIndex);
  };

  bot.on('callback_query', async (query) => {
    try {
      if (query.data === 'prev' && currentIndex > 0) {
        currentIndex--;
        await sendCard(currentIndex);
      } else if (query.data === 'next' && currentIndex < totalProducts - 1) {
        currentIndex++;
        await sendCard(currentIndex);
      } else if (query.data === 'sort_asc') {
        products.sort((a, b) => a.price - b.price); // Сортировка по возрастанию
        currentIndex = 0; // Сбрасываем индекс
        await sendCard(currentIndex);
      } else if (query.data === 'sort_desc') {
        products.sort((a, b) => b.price - a.price); // Сортировка по убыванию
        currentIndex = 0; // Сбрасываем индекс
        await sendCard(currentIndex);
      }
      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      console.error(`Ошибка при обработке callback_query: ${error.message}`);
      await bot.sendMessage(chatId, 'Произошла ошибка при обновлении информации о товаре. Пожалуйста, попробуйте еще раз позже.'); // Уведомляем пользователя
    }
  });

  // Отправляем первую карточку при инициализации
  await navigateProducts();
}

