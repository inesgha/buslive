-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('REPORT_CONFIRMED', 'REPORT_REJECTED', 'REPORT_HIDDEN', 'STOP_MOVE_APPLIED', 'STOP_MOVE_DISMISSED', 'STOP_APPROVED', 'STOP_REJECTED', 'STOP_UPDATED', 'RIDE_CANCELLED', 'RIDE_FLAGS_DISMISSED', 'USER_SUSPENDED', 'USER_REINSTATED', 'USER_ROLE_CHANGED', 'GOVERNORATE_UPDATED', 'LOUAGE_STATION_SAVED', 'LOUAGE_STATION_ARCHIVED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STOP_PROPOSAL_REVIEWED';

-- AlterEnum
ALTER TYPE "TrustEventReason" ADD VALUE 'STOP_APPROVED';

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "moderated_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "ride_flags" ADD COLUMN     "resolved_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "stops" ADD COLUMN     "proposed_line_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspended_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "moderator_id" UUID NOT NULL,
    "type" "ModerationActionType" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_actions_created_at_idx" ON "moderation_actions"("created_at");

-- CreateIndex
CREATE INDEX "moderation_actions_target_type_target_id_idx" ON "moderation_actions"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Écrit à la main : le journal de modération est en AJOUT SEUL. Même une requête
-- SQL directe ne peut ni modifier ni effacer une ligne (TRUNCATE reste possible
-- pour la base de test).
CREATE FUNCTION moderation_actions_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Le journal de modération ne peut être ni modifié ni effacé.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER moderation_actions_append_only
BEFORE UPDATE OR DELETE ON "moderation_actions"
FOR EACH ROW EXECUTE FUNCTION moderation_actions_append_only();
