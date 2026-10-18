// Typage des clés de traduction : t('tabs.map') est vérifié à la compilation,
// une clé mal orthographiée devient une erreur TypeScript.
import 'i18next';

import type fr from './locales/fr.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof fr };
  }
}
