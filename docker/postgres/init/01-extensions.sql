-- Exécuté automatiquement par l'image PostgreSQL au premier démarrage
-- (quand le volume de données est vide).

-- Types et fonctions géographiques : geography(Point), ST_DWithin, ST_Distance…
CREATE EXTENSION IF NOT EXISTS postgis;

-- Recherche approximative par similarité de texte
-- (ex. « Ksar Essef » trouve « Ksour Essef »).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Recherche insensible aux accents (ex. « Mahdia » / « Mahdïa »).
CREATE EXTENSION IF NOT EXISTS unaccent;
