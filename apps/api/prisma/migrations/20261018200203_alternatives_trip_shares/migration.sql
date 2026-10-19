-- CreateEnum
CREATE TYPE "RideOfferStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RideRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RideFlagReason" AS ENUM ('FAKE', 'UNSAFE', 'INAPPROPRIATE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'RIDE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'RIDE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'RIDE_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'RIDE_CANCELLED';

-- CreateTable
CREATE TABLE "louage_stations" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "governorate_id" UUID NOT NULL,
    "locality_id" UUID,
    "name_fr" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point, 4326),
    "opening_minutes" INTEGER,
    "closing_minutes" INTEGER,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "louage_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "louage_routes" (
    "id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "destination_locality_id" UUID NOT NULL,
    "price_millimes" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,

    CONSTRAINT "louage_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_offers" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "from_locality_id" UUID NOT NULL,
    "to_locality_id" UUID NOT NULL,
    "departure_at" TIMESTAMPTZ(3) NOT NULL,
    "seats" INTEGER NOT NULL,
    "price_millimes" INTEGER NOT NULL,
    "status" "RideOfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "ride_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_requests" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" "RideRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(3),

    CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_flags" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "RideFlagReason" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_shares" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "destination_stop_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "arrived_at" TIMESTAMPTZ(3),

    CONSTRAINT "trip_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "louage_stations_code_key" ON "louage_stations"("code");

-- CreateIndex
CREATE INDEX "louage_stations_location_idx" ON "louage_stations" USING GIST ("location");

-- CreateIndex
CREATE INDEX "louage_routes_destination_locality_id_idx" ON "louage_routes"("destination_locality_id");

-- CreateIndex
CREATE UNIQUE INDEX "louage_routes_station_id_destination_locality_id_key" ON "louage_routes"("station_id", "destination_locality_id");

-- CreateIndex
CREATE INDEX "ride_offers_status_departure_at_idx" ON "ride_offers"("status", "departure_at");

-- CreateIndex
CREATE INDEX "ride_offers_driver_id_status_idx" ON "ride_offers"("driver_id", "status");

-- CreateIndex
CREATE INDEX "ride_requests_passenger_id_created_at_idx" ON "ride_requests"("passenger_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ride_requests_offer_id_passenger_id_key" ON "ride_requests"("offer_id", "passenger_id");

-- CreateIndex
CREATE UNIQUE INDEX "ride_flags_offer_id_reporter_id_key" ON "ride_flags"("offer_id", "reporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_shares_token_hash_key" ON "trip_shares"("token_hash");

-- CreateIndex
CREATE INDEX "trip_shares_session_id_idx" ON "trip_shares"("session_id");

-- CreateIndex
CREATE INDEX "trip_shares_user_id_idx" ON "trip_shares"("user_id");

-- AddForeignKey
ALTER TABLE "louage_stations" ADD CONSTRAINT "louage_stations_governorate_id_fkey" FOREIGN KEY ("governorate_id") REFERENCES "governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "louage_stations" ADD CONSTRAINT "louage_stations_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "louage_routes" ADD CONSTRAINT "louage_routes_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "louage_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "louage_routes" ADD CONSTRAINT "louage_routes_destination_locality_id_fkey" FOREIGN KEY ("destination_locality_id") REFERENCES "localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_from_locality_id_fkey" FOREIGN KEY ("from_locality_id") REFERENCES "localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_to_locality_id_fkey" FOREIGN KEY ("to_locality_id") REFERENCES "localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "ride_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_flags" ADD CONSTRAINT "ride_flags_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "ride_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_flags" ADD CONSTRAINT "ride_flags_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_shares" ADD CONSTRAINT "trip_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_shares" ADD CONSTRAINT "trip_shares_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_shares" ADD CONSTRAINT "trip_shares_destination_stop_id_fkey" FOREIGN KEY ("destination_stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ajouts écrits à la main (Prisma ne sait pas les déclarer).
-- ---------------------------------------------------------------------------

-- louage_stations.location est calculée à partir de latitude/longitude, comme
-- stops.location (voir la migration « stops_location_trigger ») : Prisma
-- n'écrit jamais cette colonne.
CREATE FUNCTION louage_stations_set_location() RETURNS trigger AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER louage_stations_set_location
BEFORE INSERT OR UPDATE ON "louage_stations"
FOR EACH ROW EXECUTE FUNCTION louage_stations_set_location();

-- Garde-fous : mêmes règles que les schémas de @buslive/shared (louage.ts, rides.ts).
ALTER TABLE "louage_stations" ADD CONSTRAINT "louage_stations_hours_check"
  CHECK (
    ("opening_minutes" IS NULL AND "closing_minutes" IS NULL)
    OR ("opening_minutes" >= 0 AND "opening_minutes" < "closing_minutes" AND "closing_minutes" <= 1440)
  );
ALTER TABLE "louage_routes" ADD CONSTRAINT "louage_routes_values_check"
  CHECK ("price_millimes" >= 0 AND "duration_minutes" > 0);
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_values_check"
  CHECK ("seats" BETWEEN 1 AND 6 AND "price_millimes" >= 0 AND "from_locality_id" <> "to_locality_id");
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_seats_check"
  CHECK ("seats" BETWEEN 1 AND 6);
