-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('NOT_CAME', 'PASSED', 'FULL', 'DELAYED', 'BREAKDOWN', 'STOP_MOVED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('ACTIVE', 'CONFIRMED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('CONFIRM', 'DENY');

-- CreateEnum
CREATE TYPE "VoteSource" AS ENUM ('USER', 'LIVE');

-- CreateEnum
CREATE TYPE "TrustEventReason" AS ENUM ('REPORT_CONFIRMED', 'REPORT_REJECTED', 'VOTE_CORRECT', 'VOTE_WRONG', 'SHARING_COMPLETED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "trust_score" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'ACTIVE',
    "line_id" UUID NOT NULL,
    "direction_id" UUID,
    "stop_id" UUID,
    "service_date" DATE,
    "scheduled_minutes" INTEGER,
    "delay_minutes" INTEGER,
    "reporter_distance_meters" INTEGER,
    "proposed_latitude" DOUBLE PRECISION,
    "proposed_longitude" DOUBLE PRECISION,
    "confirm_weight" DOUBLE PRECISION NOT NULL,
    "deny_weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confirm_count" INTEGER NOT NULL DEFAULT 0,
    "deny_count" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_votes" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "user_id" UUID,
    "source" "VoteSource" NOT NULL DEFAULT 'USER',
    "value" "VoteValue" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "TrustEventReason" NOT NULL,
    "report_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stop_passage_observations" (
    "id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "direction_id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "service_date" DATE,
    "scheduled_minutes" INTEGER,
    "delay_minutes" INTEGER,

    CONSTRAINT "stop_passage_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_line_id_status_idx" ON "reports"("line_id", "status");

-- CreateIndex
CREATE INDEX "reports_stop_id_status_idx" ON "reports"("stop_id", "status");

-- CreateIndex
CREATE INDEX "reports_status_expires_at_idx" ON "reports"("status", "expires_at");

-- CreateIndex
CREATE INDEX "reports_user_id_created_at_idx" ON "reports"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_votes_report_id_user_id_key" ON "report_votes"("report_id", "user_id");

-- CreateIndex
CREATE INDEX "trust_events_user_id_created_at_idx" ON "trust_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "stop_passage_observations_line_id_observed_at_idx" ON "stop_passage_observations"("line_id", "observed_at");

-- CreateIndex
CREATE INDEX "stop_passage_observations_direction_id_stop_id_observed_at_idx" ON "stop_passage_observations"("direction_id", "stop_id", "observed_at");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "line_directions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_votes" ADD CONSTRAINT "report_votes_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_votes" ADD CONSTRAINT "report_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop_passage_observations" ADD CONSTRAINT "stop_passage_observations_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop_passage_observations" ADD CONSTRAINT "stop_passage_observations_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "line_directions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stop_passage_observations" ADD CONSTRAINT "stop_passage_observations_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
