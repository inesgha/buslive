import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { FavoriteToggle } from '@/favorites/favorites';
import { useFavorites } from '@/favorites/useFavorites';

import { IconButton } from './IconButton';

type FavoriteTarget =
  | Omit<Extract<FavoriteToggle, { kind: 'lines' }>, 'favorite'>
  | Omit<Extract<FavoriteToggle, { kind: 'stops' }>, 'favorite'>;

/**
 * Étoile « favori » d'une ligne ou d'un arrêt. Sans compte, elle mène à la
 * connexion : les favoris sont liés au compte (retrouvés sur un autre téléphone).
 */
export function FavoriteButton({ target }: { target: FavoriteTarget }) {
  const { t } = useTranslation();
  const { signedIn, isFavorite, toggle } = useFavorites();
  const active = isFavorite(target.kind, target.id);

  return (
    <IconButton
      icon={active ? 'star' : 'star-outline'}
      color={active ? 'delay' : 'text'}
      selected={active}
      accessibilityLabel={active ? t('favorites.remove') : t('favorites.add')}
      onPress={() => {
        if (!signedIn) {
          router.push('/auth/login');
          return;
        }
        toggle({ ...target, favorite: !active } as FavoriteToggle);
      }}
    />
  );
}
