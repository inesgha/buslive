-- ÉCRITE À LA MAIN : stops.location devient une colonne normale remplie par un trigger.
--
-- Pourquoi ? La migration « network » créait une colonne GÉNÉRÉE. Prisma confond
-- l'expression d'une colonne générée avec une valeur par défaut et chercherait à
-- la supprimer à chaque nouvelle migration. Il ignore en revanche les triggers.
-- Le résultat est le même : PostgreSQL calcule le point PostGIS à partir de
-- latitude/longitude à chaque écriture ; Prisma n'écrit jamais « location ».

-- Transforme la colonne générée en colonne normale (les valeurs sont conservées).
ALTER TABLE "stops" ALTER COLUMN "location" DROP EXPRESSION;

CREATE FUNCTION stops_set_location() RETURNS trigger AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stops_set_location
BEFORE INSERT OR UPDATE ON "stops"
FOR EACH ROW EXECUTE FUNCTION stops_set_location();
