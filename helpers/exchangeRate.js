const axios = require('axios');

let cachedRate = null;
let cachedAt = 0;
const CACHE_TTL = 3600000; // 1 hour

async function getUsdToUahRate() {
    const now = Date.now();
    if (cachedRate && (now - cachedAt) < CACHE_TTL) {
        return cachedRate;
    }

    try {
        const { data } = await axios.get(
            'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json'
        );
        if (data && data[0] && data[0].rate) {
            cachedRate = data[0].rate;
            cachedAt = now;
            return cachedRate;
        }
    } catch (err) {
        console.error('❗ Failed to fetch NBU rate:', err.message);
    }

    return cachedRate || 41.5; // fallback
}

async function convertUsdToUah(usdAmount) {
    const rate = await getUsdToUahRate();
    return Math.round(usdAmount * rate);
}

module.exports = { getUsdToUahRate, convertUsdToUah };
