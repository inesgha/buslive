import {
  AdminDashboardSchema,
  AdminGovernorateSchema,
  AdminLouageStationSchema,
  AdminReportSchema,
  AdminRideFlagSchema,
  AdminStopProposalSchema,
  AdminStopSchema,
  AdminUserSchema,
  LocalityOptionSchema,
  ModerationActionSchema,
  type ModerateReportInput,
  type ResolveRideFlagsInput,
  type ReviewStopProposalInput,
  type Role,
  StopMoveSchema,
  type UpdateStopInput,
  type UpsertLouageStationInput,
} from '@buslive/shared';
import { z } from 'zod';

import { api } from './http';

/** Routes /admin/… de l'API (et les localités, publiques). */

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  return search ? `?${search}` : '';
};

export const adminApi = {
  dashboard: () => api('/admin/dashboard', { schema: AdminDashboardSchema }),
  moderationLog: () =>
    api('/admin/moderation-log?limit=200', { schema: z.array(ModerationActionSchema) }),

  reports: (filters: { status?: string; contested?: boolean }) =>
    api(
      `/admin/reports${query({ status: filters.status, contested: filters.contested ? 'true' : undefined })}`,
      { schema: z.array(AdminReportSchema) },
    ),
  moderateReport: (id: string, input: ModerateReportInput) =>
    api(`/admin/reports/${id}/decision`, { method: 'POST', body: input }),

  stopMoves: () => api('/admin/stop-moves', { schema: z.array(StopMoveSchema) }),
  decideStopMove: (reportId: string, apply: boolean) =>
    api(`/admin/stop-moves/${reportId}/decision`, { method: 'POST', body: { apply } }),
  stopProposals: () => api('/admin/stop-proposals', { schema: z.array(AdminStopProposalSchema) }),
  reviewStopProposal: (id: string, input: ReviewStopProposalInput) =>
    api(`/admin/stop-proposals/${id}/decision`, { method: 'POST', body: input }),

  rideFlags: () => api('/admin/ride-flags', { schema: z.array(AdminRideFlagSchema) }),
  resolveRideFlags: (offerId: string, input: ResolveRideFlagsInput) =>
    api(`/admin/ride-flags/${offerId}/decision`, { method: 'POST', body: input }),

  users: (q?: string) => api(`/admin/users${query({ q })}`, { schema: z.array(AdminUserSchema) }),
  suspend: (id: string, suspended: boolean) =>
    api(`/admin/users/${id}/suspension`, {
      method: 'POST',
      body: { suspended },
      schema: AdminUserSchema,
    }),
  changeRole: (id: string, role: Role) =>
    api(`/admin/users/${id}/role`, { method: 'PUT', body: { role }, schema: AdminUserSchema }),

  governorates: () => api('/admin/governorates', { schema: z.array(AdminGovernorateSchema) }),
  setGovernorate: (code: string, isActive: boolean) =>
    api(`/admin/governorates/${code}`, { method: 'PATCH', body: { isActive } }),
  stops: (q?: string) => api(`/admin/stops${query({ q })}`, { schema: z.array(AdminStopSchema) }),
  updateStop: (id: string, input: UpdateStopInput) =>
    api(`/admin/stops/${id}`, { method: 'PATCH', body: input }),
  louageStations: () =>
    api('/admin/louage-stations', { schema: z.array(AdminLouageStationSchema) }),
  saveLouageStation: (input: UpsertLouageStationInput, id?: string) =>
    api(id ? `/admin/louage-stations/${id}` : '/admin/louage-stations', {
      method: id ? 'PUT' : 'POST',
      body: input,
      schema: AdminLouageStationSchema,
    }),
  archiveLouageStation: (id: string) => api(`/admin/louage-stations/${id}`, { method: 'DELETE' }),
  localities: () => api('/localities', { schema: z.array(LocalityOptionSchema) }),
};
