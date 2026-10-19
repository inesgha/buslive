/**
 * Test de charge LÉGER de l'API (lectures publiques + temps réel).
 *
 * Simule des passagers qui ouvrent l'app : arrêts proches, prochains passages,
 * liste et détail des lignes ; en parallèle, des clients Socket.io suivent les
 * bus en direct d'une ligne. Mesure le débit, les temps de réponse (p50, p95,
 * p99) et les erreurs.
 *
 *   pnpm --filter @buslive/api load:test                      # API locale, 20 utilisateurs, 30 s
 *   pnpm --filter @buslive/api load:test -- --users 50 --duration 60 --watchers 200
 *   pnpm --filter @buslive/api load:test -- --url https://buslive.example.tn
 *
 * Prérequis : API démarrée et seed de démonstration (arrêts autour de Mahdia).
 * ⚠ Ne viser un serveur de production qu'avec son accord, en dehors des heures de pointe.
 */
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

import { io, type Socket } from 'socket.io-client';

const { values } = parseArgs({
  // pnpm transmet le séparateur « -- » tel quel : on l'ignore.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    users: { type: 'string', default: '20' },
    duration: { type: 'string', default: '30' },
    watchers: { type: 'string', default: '50' },
  },
});

const BASE = values.url.replace(/\/+$/, '');
const API = `${BASE}/api/v1`;
const USERS = Number(values.users);
const DURATION_MS = Number(values.duration) * 1000;
const WATCHERS = Number(values.watchers);
// Centre de Mahdia (données de démonstration).
const HERE = { lat: 35.504, lng: 11.062 };

type Sample = { scenario: string; ms: number; ok: boolean };
const samples: Sample[] = [];

async function timed(scenario: string, path: string): Promise<unknown> {
  const start = performance.now();
  let ok = false;
  try {
    const response = await fetch(`${API}${path}`);
    ok = response.ok;
    return ok ? await response.json() : undefined;
  } catch {
    return undefined;
  } finally {
    samples.push({ scenario, ms: performance.now() - start, ok });
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

/** Un « passager » enchaîne les écrans de l'app jusqu'à la fin du test. */
async function passenger(deadline: number): Promise<void> {
  while (performance.now() < deadline) {
    const stops = (await timed(
      'arrêts proches',
      `/stops/nearby?lat=${HERE.lat}&lng=${HERE.lng}&radius=2000`,
    )) as { id: string }[] | undefined;
    const stop = stops?.[Math.floor(Math.random() * stops.length)];
    if (stop) await timed('prochains passages', `/stops/${stop.id}/departures`);
    const lines = (await timed('lignes', '/lines')) as { id: string }[] | undefined;
    const line = lines?.[Math.floor(Math.random() * lines.length)];
    if (line) await timed('détail ligne', `/lines/${line.id}`);
  }
}

async function openWatchers(lineId: string): Promise<{ sockets: Socket[]; failed: number }> {
  const sockets: Socket[] = [];
  let failed = 0;
  await Promise.all(
    Array.from({ length: WATCHERS }, async () => {
      const socket = io(`${BASE}/live`, { transports: ['websocket'], reconnection: false });
      sockets.push(socket);
      const ack = await new Promise<{ ok: boolean } | undefined>((resolve) => {
        socket.on('connect_error', () => resolve(undefined));
        socket.on('connect', () => {
          socket
            .timeout(5000)
            .emit('watch:line', { lineId }, (err: unknown, res: { ok: boolean }) =>
              resolve(err ? undefined : res),
            );
        });
      });
      if (!ack?.ok) failed += 1;
    }),
  );
  return { sockets, failed };
}

async function main(): Promise<void> {
  const health = await fetch(`${API}/health/ready`).catch(() => undefined);
  if (!health?.ok) throw new Error(`API injoignable ou pas prête : ${API}/health/ready`);
  const lines = (await (await fetch(`${API}/lines`)).json()) as { id: string }[];
  if (lines.length === 0) throw new Error('Aucune ligne : lancer le seed de démonstration.');

  console.log(
    `Charge : ${USERS} passagers pendant ${DURATION_MS / 1000} s, ${WATCHERS} clients temps réel → ${BASE}`,
  );
  const watchStart = performance.now();
  const { sockets, failed } = await openWatchers(lines[0]!.id);
  console.log(
    `Temps réel : ${WATCHERS - failed}/${WATCHERS} abonnés en ${Math.round(performance.now() - watchStart)} ms`,
  );

  const start = performance.now();
  const deadline = start + DURATION_MS;
  await Promise.all(Array.from({ length: USERS }, () => passenger(deadline)));
  const elapsedSeconds = (performance.now() - start) / 1000;
  for (const socket of sockets) socket.close();

  // Résultats par scénario, puis total.
  const rows = [...new Set(samples.map((s) => s.scenario)), 'TOTAL'].map((scenario) => {
    const list = scenario === 'TOTAL' ? samples : samples.filter((s) => s.scenario === scenario);
    const sorted = list.map((s) => s.ms).sort((a, b) => a - b);
    return {
      scénario: scenario,
      requêtes: list.length,
      'req/s': Math.round(list.length / elapsedSeconds),
      'p50 ms': Math.round(percentile(sorted, 50)),
      'p95 ms': Math.round(percentile(sorted, 95)),
      'p99 ms': Math.round(percentile(sorted, 99)),
      erreurs: list.filter((s) => !s.ok).length,
    };
  });
  console.table(rows);

  const errors = samples.filter((s) => !s.ok).length;
  if (errors > 0 || failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
