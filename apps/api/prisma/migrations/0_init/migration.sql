-- Première migration : extensions PostgreSQL utilisées par BusLive.
-- « IF NOT EXISTS » : sans effet en local, où le script Docker les a déjà créées,
-- mais indispensable sur une base de production neuve.

-- Types et fonctions géographiques (geography(Point), ST_DWithin, ST_Distance…).
CREATE EXTENSION IF NOT EXISTS postgis;

-- Recherche approximative de noms d'arrêts (similarité de trigrammes).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Recherche insensible aux accents.
CREATE EXTENSION IF NOT EXISTS unaccent;
