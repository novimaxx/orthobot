const express = require('express');
const app = express();
const port = 3001;
const crypto = require('crypto');

// Твоя функция генерации HTML-формы
function generateWayForPayForm(userId, courseName, amount) {
    const merchantAccount = 'stomat_podcast_com_ua';
    const secretKey = 'cbab689d5545a0ce0b5d8e3ca780466139677db0';
    const domain = 'stomat-podcast.com.ua';
    const orderReference = `order-${userId}-${Date.now()}`;
    const orderDate = Math.floor(Date.now() / 1000);

    const productName = [courseName];
    const productCount = [1];
    const productPrice = [amount];

    const signatureSource = [
        merchantAccount,
        domain,
        orderReference,
        orderDate,
        amount,
        'UAH',
        productName.join(';'),
        productCount.join(';'),
        productPrice.join(';'),
    ].join(';');

    const signature = crypto
        .createHmac('md5', secretKey)
        .update(signatureSource)
        .digest('hex');

    return `
        <html>
        <body>
<form id="payForm" method="POST" action="https://secure.wayforpay.com/pay" style="display:none">
        <input type="hidden" name="merchantAccount" value="${merchantAccount}" />
        <input type="hidden" name="merchantDomainName" value="${domain}" />
        <input type="hidden" name="orderReference" value="${orderReference}" />
        <input type="hidden" name="orderDate" value="${orderDate}" />
        <input type="hidden" name="amount" value="${amount}" />
        <input type="hidden" name="currency" value="UAH" />
        <input type="hidden" name="productName" value="${productName.join(';')}" />
        <input type="hidden" name="productCount" value="${productCount.join(';')}" />
        <input type="hidden" name="productPrice" value="${productPrice.join(';')}" />
        <input type="hidden" name="orderDesc" value="Оплата за онлайн навчання: ${courseName}" />
        <input type="hidden" name="merchantSignature" value="${signature}" />
    </form>
            <script>document.getElementById('payForm').submit();</script>
        </body>
        </html>
    `;
}

// Роут для оплаты
app.get('/pay', (req, res) => {
    const { userId, courseName, amount } = req.query;

    if (!userId || !courseName || !amount) {
        return res.status(400).send('Missing parameters');
    }

    const formHtml = generateWayForPayForm(userId, courseName, amount);
    res.send(formHtml);
});

app.listen(port, () => {
    console.log(`💳 Payment server running at http://localhost:${port}`);
});