-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LineType" AS ENUM ('URBAN', 'SUBURBAN', 'INTERCITY');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateTable
CREATE TABLE "governorates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_fr" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "governorates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localities" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "governorate_id" UUID NOT NULL,
    "name_fr" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operators" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lines" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "governorate_id" UUID NOT NULL,
    "operator_id" UUID,
    "name_fr" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "type" "LineType" NOT NULL,
    "color" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "proposed_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_directions" (
    "id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "direction" "Direction" NOT NULL,
    "headsign_fr" TEXT NOT NULL,
    "headsign_ar" TEXT NOT NULL,
    "shape" geography(LineString, 4326),

    CONSTRAINT "line_directions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stops" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "governorate_id" UUID NOT NULL,
    "locality_id" UUID,
    "name_fr" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    -- MODIFIÉ À LA MAIN : colonne générée. PostgreSQL calcule le point PostGIS à
    -- partir de latitude/longitude à chaque écriture ; Prisma ne l'écrit jamais.
    "location" geography(Point, 4326)
        GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography) STORED,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "proposed_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stops_pkey" PRIMARY KEY ("id"),
    -- AJOUTÉ À LA MAIN : coordonnées toujours plausibles, même en cas d'écriture hors API.
    CONSTRAINT "stops_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "stops_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);

-- CreateTable
CREATE TABLE "line_stops" (
    "direction_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stop_id" UUID NOT NULL,
    "minutes_from_start" INTEGER NOT NULL,

    CONSTRAINT "line_stops_pkey" PRIMARY KEY ("direction_id","sequence")
);

-- CreateTable
CREATE TABLE "service_calendars" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_fr" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "monday" BOOLEAN NOT NULL DEFAULT false,
    "tuesday" BOOLEAN NOT NULL DEFAULT false,
    "wednesday" BOOLEAN NOT NULL DEFAULT false,
    "thursday" BOOLEAN NOT NULL DEFAULT false,
    "friday" BOOLEAN NOT NULL DEFAULT false,
    "saturday" BOOLEAN NOT NULL DEFAULT false,
    "sunday" BOOLEAN NOT NULL DEFAULT false,
    "start_date" DATE,
    "end_date" DATE,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departures" (
    "id" UUID NOT NULL,
    "direction_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "departure_minutes" INTEGER NOT NULL,

    CONSTRAINT "departures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "governorates_code_key" ON "governorates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "localities_code_key" ON "localities"("code");

-- CreateIndex
CREATE INDEX "localities_governorate_id_idx" ON "localities"("governorate_id");

-- CreateIndex
CREATE UNIQUE INDEX "operators_code_key" ON "operators"("code");

-- CreateIndex
CREATE INDEX "lines_status_idx" ON "lines"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lines_governorate_id_code_key" ON "lines"("governorate_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "line_directions_line_id_direction_key" ON "line_directions"("line_id", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "stops_code_key" ON "stops"("code");

-- CreateIndex
CREATE INDEX "stops_location_idx" ON "stops" USING GIST ("location");

-- CreateIndex
CREATE INDEX "stops_governorate_id_status_idx" ON "stops"("governorate_id", "status");

-- CreateIndex
CREATE INDEX "line_stops_stop_id_idx" ON "line_stops"("stop_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_calendars_code_key" ON "service_calendars"("code");

-- CreateIndex
CREATE INDEX "departures_calendar_id_idx" ON "departures"("calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "departures_direction_id_calendar_id_departure_minutes_key" ON "departures"("direction_id", "calendar_id", "departure_minutes");

-- AddForeignKey
ALTER TABLE "localities" ADD CONSTRAINT "localities_governorate_id_fkey" FOREIGN KEY ("governorate_id") REFERENCES "governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lines" ADD CONSTRAINT "lines_governorate_id_fkey" FOREIGN KEY ("governorate_id") REFERENCES "governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lines" ADD CONSTRAINT "lines_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lines" ADD CONSTRAINT "lines_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_directions" ADD CONSTRAINT "line_directions_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stops" ADD CONSTRAINT "stops_governorate_id_fkey" FOREIGN KEY ("governorate_id") REFERENCES "governorates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stops" ADD CONSTRAINT "stops_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "localities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stops" ADD CONSTRAINT "stops_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_stops" ADD CONSTRAINT "line_stops_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "line_directions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_stops" ADD CONSTRAINT "line_stops_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departures" ADD CONSTRAINT "departures_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "line_directions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departures" ADD CONSTRAINT "departures_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "service_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;
