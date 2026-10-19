/**
 * Page de suivi « Partager mon trajet », servie par l'API sur /t/<jeton>.
 *
 * - Aucune dépendance extérieure (ni carte, ni police, ni statistiques) :
 *   l'adresse IP du visiteur n'est envoyée à personne d'autre que BusLive, et
 *   la page reste légère sur un réseau mobile faible.
 * - Le script est un fichier séparé (/t/assets/trip.js) : la politique de
 *   sécurité du contenu (CSP, posée par helmet) interdit les scripts intégrés.
 * - Les données sont insérées avec textContent (jamais innerHTML) : un nom
 *   d'arrêt ne peut pas injecter de code.
 * - Français ou arabe selon la langue du navigateur.
 */

export const TRIP_PAGE_HTML = `<!doctype html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>BusLive</title>
<style>
  :root { --bg: #F3F5F4; --card: #FFFFFF; --text: #0E1B2C; --muted: #4A5868; --border: #DCE2E0;
          --accent: #FFC52E; --live: #0B7A5E; --warn: #B45309; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0B1522; --card: #14243A; --text: #F3F5F4; --muted: #A9B6C4; --border: #24364F;
            --live: #34C79A; --warn: #F59E4B; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
         font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif; }
  main { max-width: 520px; margin: 0 auto; padding: 16px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px;
          padding: 16px; margin-bottom: 16px; }
  .head { display: flex; align-items: center; gap: 12px; }
  .badge { min-width: 44px; height: 44px; padding: 0 8px; border-radius: 8px; display: flex;
           align-items: center; justify-content: center; font-weight: 700; font-size: 18px; }
  h1 { font-size: 20px; margin: 0; }
  .muted { color: var(--muted); font-size: 14px; }
  .eta { font-size: 28px; font-weight: 700; margin: 8px 0 0; }
  .status-LIVE { color: var(--live); } .status-STALE { color: var(--warn); }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 12px; min-height: 36px; }
  .dot { width: 12px; height: 12px; border-radius: 6px; border: 2px solid var(--muted); flex: none; }
  li.passed .dot { background: var(--muted); }
  li.passed span { color: var(--muted); }
  li.bus .dot { background: var(--accent); border-color: var(--accent); width: 16px; height: 16px; border-radius: 8px; }
  li.destination span { font-weight: 700; }
  .brand { text-align: center; font-size: 13px; color: var(--muted); }
</style>
</head>
<body>
<main>
  <section class="card">
    <div class="head">
      <div class="badge" id="badge">…</div>
      <div><h1 id="title">BusLive</h1><div class="muted" id="headsign"></div></div>
    </div>
    <p class="eta" id="eta"></p>
    <p class="muted" id="detail"></p>
  </section>
  <section class="card"><ol id="stops"></ol></section>
  <p class="brand" id="brand"></p>
</main>
<script src="/t/assets/trip.js"></script>
</body>
</html>
`;

export const TRIP_PAGE_SCRIPT = `(function () {
  'use strict';
  var REFRESH_MS = 10000;
  var token = location.pathname.split('/').filter(Boolean).pop() || '';
  var ar = (navigator.language || '').toLowerCase().indexOf('ar') === 0;
  document.documentElement.lang = ar ? 'ar' : 'fr';
  document.documentElement.dir = ar ? 'rtl' : 'ltr';

  var T = ar ? {
    title: 'الحافلة', to: 'النزول في', eta: function (m) { return m < 1 ? 'تصل الآن' : 'الوصول بعد حوالي ' + m + ' د'; },
    LIVE: 'مباشر، حسب موقع يشاركه راكب.', STALE: 'لم يصل موقع جديد منذ قليل (شبكة ضعيفة؟).',
    ARRIVED: 'وصلت الحافلة إلى المحطة.', ENDED: 'توقّفت مشاركة الموقع.',
    expired: 'انتهت صلاحية هذا الرابط أو لم يعد موجودًا.', error: 'تعذّر الاتصال، إعادة المحاولة…',
    updated: 'آخر تحديث: ', brand: 'BusLive · الحافلات في الوقت الحقيقي'
  } : {
    title: 'Bus', to: 'Descente à', eta: function (m) { return m < 1 ? 'Il arrive' : 'Arrivée dans ~' + m + ' min'; },
    LIVE: 'En direct, d’après la position partagée par un passager.',
    STALE: 'Pas de nouvelle position depuis un moment (réseau faible ?).',
    ARRIVED: 'Le bus est arrivé à l’arrêt.', ENDED: 'Le partage de position s’est arrêté.',
    expired: 'Ce lien a expiré ou n’existe plus.', error: 'Connexion impossible, nouvel essai…',
    updated: 'Dernière mise à jour : ', brand: 'BusLive · les bus en temps réel'
  };
  function $(id) { return document.getElementById(id); }
  function name(item) { return ar ? item.nameAr : item.nameFr; }
  function time(iso) {
    var d = new Date(iso);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  /** Texte foncé ou clair selon la couleur de la ligne (lisibilité). */
  function textOn(hex) {
    var n = parseInt(hex.slice(1), 16);
    var l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return l > 0.6 ? '#0E1B2C' : '#FFFFFF';
  }
  $('brand').textContent = T.brand;

  var timer = null;
  function render(data) {
    var badge = $('badge');
    badge.textContent = data.line.code;
    badge.style.background = data.line.color;
    badge.style.color = textOn(data.line.color);
    $('title').textContent = T.title + ' ' + data.line.code + ' · ' + name(data.line);
    $('headsign').textContent = (ar ? data.direction.headsignAr : data.direction.headsignFr) +
      ' · ' + T.to + ' ' + name(data.destination);
    var eta = $('eta');
    eta.className = 'eta status-' + data.status;
    eta.textContent = data.status === 'ARRIVED' ? T.ARRIVED
      : data.etaMinutes === null ? '' : T.eta(data.etaMinutes);
    $('detail').textContent = (data.status === 'ARRIVED' ? '' : T[data.status]) +
      (data.updatedAt ? ' ' + T.updated + time(data.updatedAt) : '');

    var list = $('stops');
    while (list.firstChild) list.removeChild(list.firstChild);
    var lastPassed = -1;
    data.stops.forEach(function (stop, i) { if (stop.passed) lastPassed = i; });
    data.stops.forEach(function (stop, i) {
      var li = document.createElement('li');
      if (stop.passed) li.className = 'passed';
      if (i === lastPassed && data.status !== 'ENDED') li.className = 'bus';
      if (i === data.stops.length - 1) li.className += ' destination';
      var dot = document.createElement('span');
      dot.className = 'dot';
      var label = document.createElement('span');
      label.textContent = name(stop);
      li.appendChild(dot);
      li.appendChild(label);
      list.appendChild(li);
    });
    if (data.status === 'ARRIVED' || data.status === 'ENDED') stop();
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function load() {
    fetch('/api/v1/trips/' + encodeURIComponent(token), { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (response.status === 404 || response.status === 400) {
          stop();
          $('eta').textContent = '';
          $('detail').textContent = T.expired;
          return null;
        }
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then(function (data) { if (data) render(data); })
      .catch(function () { $('detail').textContent = T.error; });
  }
  load();
  timer = setInterval(load, REFRESH_MS);
})();
`;
