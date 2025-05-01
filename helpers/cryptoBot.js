const axios = require('axios');
require('dotenv').config();

const CRYPTO_BOT_TOKEN = process.env.CRYPTO_BOT_TOKEN;
const CRYPTO_BOT_API_URL = 'https://pay.crypt.bot/api/';

async function createInvoice(amount, userId) {
    try {
        const response = await axios.post(
            `${CRYPTO_BOT_API_URL}createInvoice`,
            {
                asset: 'USDT', // меняем на USDT!
                amount,
                description: `Оплата курсу OrthoSchool для користувача ${userId}`
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Crypto-Pay-API-Token': CRYPTO_BOT_TOKEN
                }
            }
        );

        if (response.data.ok && response.data.result) {
            return response.data.result.pay_url; // Ссылка на оплату
        } else {
            console.error('❗ Помилка при створенні інвойсу:', response.data);
            return null;
        }
    } catch (error) {
        console.error('❗ Помилка створення інвойсу через API:', error.message);
        return null;
    }
}

module.exports = { createInvoice };
