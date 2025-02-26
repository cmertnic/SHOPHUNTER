const { i18next, updateI18nextLanguage } = require('../../i18n');
const { getUserSettings } = require('../../database/settingsDb');
const axios = require('axios');
const {
  searchProductNearby,
  getUserLocation,
  parsePrice
} = require('../../events');

module.exports = {
  name: '/search',
  execute: async (bot, chatId, userId, productName) => {

    const userSettings = await getUserSettings(userId);
    await updateI18nextLanguage(chatId, userSettings.language);
    try {
      const userLocation = await getUserLocation(userId);

      const results = productName
        ? await searchProductNearby(productName)
        : await searchProductNearby(null, 100);

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
  let lastMessageId = null;

  const sendCard = async (index) => {
    const product = products[index];
    const responseMessage = `
      ${product.img ? `<a href="${product.img}">&#8203;</a>` : ''}
      <b>${product.name}</b>
      <b>${i18next.t('search.cost')}:</b> <i>${product.price}</i>
    `;
  
    const inlineOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: `${i18next.t('search.product')} ${index + 1} ${i18next.t('search.of')} ${totalProducts}`, callback_data: 'no_action' },
          ],
          [
            { text: i18next.t('search.previous'), callback_data: 'prev' },
            { text: i18next.t('search.next'), callback_data: 'next' },
          ],
          [
            { text: i18next.t('search.sort_ascending'), callback_data: 'sort_asc' },
            { text: i18next.t('search.sort_descending'), callback_data: 'sort_desc' },
          ],
          [
            { text: i18next.t('search.open_product'), url: product.url },
          ],
        ],
      },
    };
  
    const keyboardOptions = {
      reply_markup: {
        keyboard: [
          [
            {
              text: i18next.t('settings.back'),
            },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
  
    try {
      if (lastMessageId === null) {
        // Отправка сообщения с inline_keyboard
        const sentMessage = await bot.sendMessage(chatId, responseMessage, {
          parse_mode: 'HTML',
          reply_markup: inlineOptions.reply_markup,
        });
        lastMessageId = sentMessage.message_id;
  
        // Отправка второго сообщения с обычной клавиатурой
        await bot.sendMessage(chatId, i18next.t('.'), keyboardOptions);
      } else {
        // Обновление первого сообщения с inline_keyboard
        await bot.editMessageText(responseMessage, {
          chat_id: chatId,
          message_id: lastMessageId,
          parse_mode: 'HTML',
          reply_markup: inlineOptions.reply_markup,
        });
      }
    } catch (error) {
      console.error(`Ошибка при отправке сообщений: ${error.message}`);
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
        products.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
        currentIndex = 0;
        await sendCard(currentIndex);
      } else if (query.data === 'sort_desc') {
        products.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
        currentIndex = 0;
        await sendCard(currentIndex);
      }
      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      console.error(`Ошибка при обработке callback_query: ${error.message}`);
      await bot.sendMessage(chatId, i18next.t('error.callback_processing'));
    }
  });

  await navigateProducts();
}
