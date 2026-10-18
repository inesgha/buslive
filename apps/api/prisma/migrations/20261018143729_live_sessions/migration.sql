-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "LiveSessionEndReason" AS ENUM ('USER', 'TERMINUS', 'INACTIVE', 'MAX_DURATION', 'REPLACED');

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "line_id" UUID NOT NULL,
    "direction_id" UUID NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "end_reason" "LiveSessionEndReason",
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "last_latitude" DOUBLE PRECISION,
    "last_longitude" DOUBLE PRECISION,
    "last_position_at" TIMESTAMPTZ(3),
    "accepted_positions" INTEGER NOT NULL DEFAULT 0,
    "rejected_positions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_sessions_user_id_status_idx" ON "live_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "live_sessions_line_id_status_idx" ON "live_sessions"("line_id", "status");

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "line_directions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
