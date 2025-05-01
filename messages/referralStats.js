module.exports = (stats) => `
📊 <b>Твоя реферальна статистика</b>

👥 Запрошено: <b>${stats.total}</b>
💰 Нараховано кешбеку: <b>${stats.cashbackUsd} USDT</b>
`;