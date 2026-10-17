// Exécuté avant chaque fichier de test e2e, avant ses imports : l'application
// démarrée par le test lit donc la base de test et non la base de développement.
require('./test-env.cjs').applyTestEnv();
