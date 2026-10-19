import type { Locale, LocalityOption } from '@buslive/shared';

import { localizedName } from '@/i18n/localized';

import { ChoiceChips } from './ChoiceChips';

interface LocalityChipsProps {
  localities: LocalityOption[];
  selected?: string;
  onSelect: (id: string | undefined) => void;
  locale: Locale;
  accessibilityLabel: string;
  /** Libellé d'une puce « toutes » (aucun filtre), si on la veut. */
  anyLabel?: string;
}

/**
 * Choix d'une localité. Le réseau de lancement en compte peu : des puces
 * suffisent. Avec toute la Tunisie, il faudra une recherche (phase 11).
 */
export function LocalityChips({
  localities,
  selected,
  onSelect,
  locale,
  accessibilityLabel,
  anyLabel,
}: LocalityChipsProps) {
  const ANY = '';
  const choices = [
    ...(anyLabel ? [{ value: ANY, label: anyLabel }] : []),
    ...localities.map((locality) => ({
      value: locality.id,
      label: localizedName(locality, locale),
    })),
  ];
  return (
    <ChoiceChips
      accessibilityLabel={accessibilityLabel}
      choices={choices}
      selected={[selected ?? ANY]}
      onPress={(value) => onSelect(value === ANY ? undefined : value)}
    />
  );
}
