// Préparation commune à tous les tests de l'app mobile.

// Adresse d'API factice (les tests simulent fetch, rien ne part sur le réseau).
process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api/v1';

// AsyncStorage : remplacé par une version en mémoire fournie par la bibliothèque.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-secure-store : coffre-fort simulé en mémoire.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
    __reset: () => store.clear(),
  };
});

// NetInfo (état du réseau) : simulation fournie par la bibliothèque (en ligne).
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

// Icônes : remplacées par un composant vide (elles chargent un fichier de police,
// indisponible dans les tests). Les tests vérifient les textes, pas les icônes.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const Icon = () => null;
  Icon.glyphMap = {};
  return { __esModule: true, default: Icon };
});
