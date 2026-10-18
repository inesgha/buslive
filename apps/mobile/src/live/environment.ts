import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * L'app tourne-t-elle dans Expo Go ? Sur Android, Expo Go ne permet PAS la
 * localisation en arrière-plan : le partage ne fonctionne alors qu'app ouverte.
 * Avec un build de développement (EAS Build) ou l'app publiée, l'arrière-plan marche.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}
