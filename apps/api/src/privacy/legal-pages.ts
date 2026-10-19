import { type Locale, RETENTION_RULES } from '@buslive/shared';

/**
 * Pages légales servies par l'API (liens exigés par Google Play) :
 * - /legal/privacy : politique de confidentialité ;
 * - /legal/account-deletion : comment supprimer son compte.
 *
 * ⚠️ Texte de départ, rédigé à partir du fonctionnement réel de l'app, à faire
 * relire par une personne compétente (loi organique n° 2004-63 sur la
 * protection des données personnelles, INPDP).
 * Les durées viennent de RETENTION_RULES : la page suit le code.
 */

/** Échappe une valeur insérée dans le HTML (l'email vient de la configuration). */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

function layout(locale: Locale, title: string, body: string): string {
  const ar = locale === 'ar';
  return `<!doctype html>
<html lang="${locale}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · BusLive</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 26px; } h2 { font-size: 19px; margin-top: 28px; }
  table { border-collapse: collapse; width: 100%; } td { border-bottom: 1px solid #8884; padding: 6px 4px; }
  nav { font-size: 14px; }
</style>
</head>
<body><main>
<nav><a href="?lang=fr">Français</a> · <a href="?lang=ar">العربية</a></nav>
${body}
</main></body>
</html>`;
}

const R = RETENTION_RULES;

export function privacyPage(locale: Locale, contactEmail?: string): string {
  const contact = contactEmail
    ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>`
    : null;

  if (locale === 'ar') {
    return layout(
      'ar',
      'سياسة الخصوصية',
      `<h1>سياسة الخصوصية</h1>
<p>يساعد BusLive الركّاب في تونس على معرفة مكان الحافلات بفضل المواقع التي يشاركها ركّاب آخرون. نجمع أقلّ ما يمكن من البيانات، ولا نبيعها، ولا نعرض إشهارًا.</p>
<h2>البيانات التي نعالجها</h2>
<ul>
<li><strong>الحساب</strong>: البريد الإلكتروني، الاسم الظاهر، كلمة المرور (محفوظة مشفّرة بطريقة لا رجعة فيها)، اللغة. رقم الهاتف اختياري، ولا يُستعمل إلا لمشاركة السيارة.</li>
<li><strong>الموقع</strong>: لعرض المحطات القريبة، يُرسل موقعك دون حفظه. أثناء «أنا في الحافلة» فقط، تُستعمل مواقعك لحساب موقع الحافلة؛ تبقى في الذاكرة ولا يُحفظ إلا آخر موقع، ويُمحى بعد ${R.liveSessionPositionDays} أيام. لا يرى الآخرون أبدًا هويّتك.</li>
<li><strong>البلاغات والأصوات</strong>: نوع المشكلة والخط والمحطة، دون أيّ نص حرّ. يُحفظ بُعدك عن المحطة فقط، لا موقعك.</li>
<li><strong>الإشعارات</strong>: رمز الهاتف الذي تمنحه Google Firebase، وتنبيهاتك ومفضّلاتك.</li>
<li><strong>مشاركة السيارة</strong>: لا يُعطى رقم هاتفك إلا للشخص الذي تقبل طلبه أو الذي يقبل طلبك.</li>
<li><strong>مرور الحافلات</strong>: تُحفظ أوقات مرور الحافلات بالمحطات دون أيّ صلة بالركّاب، لحساب الإحصائيات.</li>
</ul>
<h2>الخدمات الخارجية</h2>
<ul>
<li>خرائط Google (Google Maps) لعرض الخريطة في التطبيق.</li>
<li>Google Firebase Cloud Messaging لإرسال الإشعارات.</li>
</ul>
<h2>مدّة الحفظ</h2>
<table>
<tr><td>آخر موقع لمشاركة منتهية</td><td>${R.liveSessionPositionDays} أيام</td></tr>
<tr><td>البلاغات والأصوات</td><td>${R.reportDays} يومًا</td></tr>
<tr><td>رحلات مشاركة السيارة (بعد تاريخها)</td><td>${R.rideOfferDays} يومًا</td></tr>
<tr><td>سجلّ الإشعارات</td><td>${R.notificationDays} يومًا</td></tr>
<tr><td>روابط «مشاركة رحلتي» (بعد انتهائها)</td><td>${R.tripShareDays} أيام</td></tr>
<tr><td>مرور الحافلات (مجهول الهوية)</td><td>${R.observationDays} يومًا</td></tr>
</table>
<h2>حقوقك</h2>
<p>وفق القانون الأساسي عدد 63 لسنة 2004 المتعلّق بحماية المعطيات الشخصية، يحقّ لك النفاذ إلى بياناتك وتصحيحها والاعتراض على معالجتها وطلب حذفها. يمكنك حذف حسابك في أيّ وقت من التطبيق (حسابي ← حذف حسابي)${contact ? `، أو بمراسلتنا على ${contact}` : ''}. عند الحذف، تبقى البلاغات دون أيّ صلة بك.</p>`,
    );
  }

  return layout(
    'fr',
    'Politique de confidentialité',
    `<h1>Politique de confidentialité</h1>
<p>BusLive aide les voyageurs en Tunisie à savoir où sont les bus, grâce aux positions partagées par d'autres passagers. Nous collectons le moins de données possible, nous ne les vendons pas, et il n'y a pas de publicité.</p>
<h2>Données traitées</h2>
<ul>
<li><strong>Compte</strong> : email, nom affiché, mot de passe (enregistré sous une forme irréversible), langue. Le téléphone est facultatif et ne sert qu'au covoiturage.</li>
<li><strong>Position</strong> : pour afficher les arrêts proches, ta position est envoyée sans être enregistrée. Seulement pendant « Je suis dans le bus », tes positions servent à calculer celle du bus : elles restent en mémoire, seule la dernière est enregistrée, puis effacée après ${R.liveSessionPositionDays} jours. Les autres ne voient jamais qui partage.</li>
<li><strong>Signalements et votes</strong> : type de problème, ligne, arrêt, sans aucun texte libre. Seule ta distance à l'arrêt est gardée, pas ta position.</li>
<li><strong>Notifications</strong> : le jeton du téléphone fourni par Google Firebase, tes alertes et tes favoris.</li>
<li><strong>Covoiturage</strong> : ton numéro n'est donné qu'à la personne dont tu acceptes la demande, ou qui accepte la tienne.</li>
<li><strong>Passages de bus</strong> : les heures de passage aux arrêts sont gardées sans aucun lien avec les passagers, pour les statistiques.</li>
</ul>
<h2>Services extérieurs</h2>
<ul>
<li>Google Maps, pour afficher la carte dans l'app.</li>
<li>Google Firebase Cloud Messaging, pour envoyer les notifications.</li>
</ul>
<h2>Durées de conservation</h2>
<table>
<tr><td>Dernière position d'un partage terminé</td><td>${R.liveSessionPositionDays} jours</td></tr>
<tr><td>Signalements et votes</td><td>${R.reportDays} jours</td></tr>
<tr><td>Trajets de covoiturage (après leur date)</td><td>${R.rideOfferDays} jours</td></tr>
<tr><td>Historique des notifications</td><td>${R.notificationDays} jours</td></tr>
<tr><td>Liens « Partager mon trajet » (après expiration)</td><td>${R.tripShareDays} jours</td></tr>
<tr><td>Passages de bus (anonymes)</td><td>${R.observationDays} jours</td></tr>
</table>
<h2>Tes droits</h2>
<p>Selon la loi organique n° 2004-63 sur la protection des données à caractère personnel, tu peux accéder à tes données, les corriger, t'opposer à leur traitement et demander leur suppression. Tu peux supprimer ton compte à tout moment dans l'app (Profil → Supprimer mon compte)${contact ? `, ou en nous écrivant à ${contact}` : ''}. Après la suppression, tes signalements restent visibles mais sans aucun lien avec toi.</p>`,
  );
}

export function accountDeletionPage(locale: Locale, contactEmail?: string): string {
  const contact = contactEmail
    ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>`
    : null;
  if (locale === 'ar') {
    return layout(
      'ar',
      'حذف الحساب',
      `<h1>حذف حسابك في BusLive</h1>
<ol>
<li>افتح تطبيق BusLive وسجّل الدخول.</li>
<li>اذهب إلى «حسابي» ثمّ «حذف حسابي».</li>
<li>أكّد بكلمة المرور.</li>
</ol>
<p>يُحذف فورًا: حسابك، مفضّلاتك، تنبيهاتك، إشعاراتك، نقاط الثقة، رحلات مشاركة السيارة القادمة (يُعلَم الركّاب). تبقى البلاغات دون أيّ صلة بك.</p>
${contact ? `<p>لا يمكنك الدخول إلى التطبيق؟ راسلنا من بريد حسابك على ${contact}.</p>` : ''}`,
    );
  }
  return layout(
    'fr',
    'Supprimer son compte',
    `<h1>Supprimer ton compte BusLive</h1>
<ol>
<li>Ouvre l'app BusLive et connecte-toi.</li>
<li>Va dans « Profil », puis « Supprimer mon compte ».</li>
<li>Confirme avec ton mot de passe.</li>
</ol>
<p>Sont supprimés immédiatement : ton compte, tes favoris, tes alertes, tes notifications, tes points de confiance et tes trajets de covoiturage à venir (les passagers sont prévenus). Tes signalements restent, sans aucun lien avec toi.</p>
${contact ? `<p>Tu ne peux plus accéder à l'app ? Écris-nous depuis l'adresse de ton compte à ${contact}.</p>` : ''}`,
  );
}
