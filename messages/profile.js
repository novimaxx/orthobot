const premiumStatus = user.is_premium ? '⭐️ Premium' : '—';

const profile = `👤 <b>Профіль</b>

<b>Ім’я:</b> ${user.name || '—'}
<b>Email:</b> ${user.email || '—'}
<b>Телефон:</b> ${user.phone || '—'}

<b>Освіта:</b> ${user.education || '—'}
<b>Місто:</b> ${user.city || '—'}
<b>Дата нар.:</b> ${user.birth || '—'}

<b>Робота:</b> ${user.job || '—'}
<b>Посада:</b> ${user.position || '—'}

<b>Курс:</b> 📘 ${user.course || '—'}
<b>Статус:</b> ${premiumStatus}

<b>Заповнено:</b> ${new Date(user.created_at).toLocaleString('uk-UA')}`;