import { useNetInfo } from '@react-native-community/netinfo';

/**
 * Le téléphone a-t-il accès à Internet ? Tant que l'état est inconnu (null),
 * on suppose que oui, pour ne pas afficher le bandeau « hors ligne » à tort.
 */
export function useIsOnline(): boolean {
  const { isConnected, isInternetReachable } = useNetInfo();
  return isConnected !== false && isInternetReachable !== false;
}
