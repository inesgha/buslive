import type {
  AdminLouageStation,
  AdminStop,
  LocalityOption,
  UpsertLouageStationInput,
} from '@buslive/shared';
import { UpsertLouageStationSchema } from '@buslive/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { adminApi } from '../api/admin';
import { ErrorText } from '../components/Layout';
import { MAP_COLORS, StopMap } from '../components/StopMap';
import { formatPrice, inputToMinutes, minutesToInput, STATUS_LABELS } from '../lib/format';

/**
 * Réseau (administrateurs) : gouvernorats, arrêts, louages. Les lignes et les
 * horaires viennent du seed (import GTFS prévu en phase 11).
 */
export function NetworkPage() {
  return (
    <>
      <h1>Réseau</h1>
      <Governorates />
      <Stops />
      <LouageStations />
    </>
  );
}

function Governorates() {
  const queryClient = useQueryClient();
  const governorates = useQuery({ queryKey: ['governorates'], queryFn: adminApi.governorates });
  const toggle = useMutation({
    mutationFn: ({ code, isActive }: { code: string; isActive: boolean }) =>
      adminApi.setGovernorate(code, isActive),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['governorates'] }),
  });
  return (
    <>
      <h2>Gouvernorats</h2>
      <p className="muted">
        Ouvrir un gouvernorat rend ses lignes et ses arrêts visibles dans l’app. N’ouvrir qu’une
        fois les données vérifiées.
      </p>
      <ErrorText error={governorates.error ?? toggle.error} />
      <div className="card">
        <table>
          <tbody>
            {governorates.data?.map((governorate) => (
              <tr key={governorate.code}>
                <td>{governorate.code}</td>
                <td>{governorate.nameFr}</td>
                <td className="muted">
                  {governorate.lines} ligne(s) · {governorate.stops} arrêt(s)
                </td>
                <td>
                  <label className="row" style={{ flexDirection: 'row' }}>
                    <input
                      type="checkbox"
                      checked={governorate.isActive}
                      onChange={(event) =>
                        toggle.mutate({ code: governorate.code, isActive: event.target.checked })
                      }
                    />
                    {governorate.isActive ? 'Ouvert' : 'Fermé'}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stops() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<AdminStop | null>(null);
  const stops = useQuery({
    queryKey: ['stops', q],
    queryFn: () => adminApi.stops(q),
    enabled: q.length > 0,
  });
  return (
    <>
      <h2>Arrêts</h2>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(search.trim());
        }}
      >
        <input
          aria-label="Rechercher un arrêt"
          placeholder="Nom ou code"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit">Rechercher</button>
      </form>
      <ErrorText error={stops.error} />
      {editing ? (
        <StopEditor key={editing.id} stop={editing} onClose={() => setEditing(null)} />
      ) : null}
      {stops.data ? (
        <div className="card">
          <table>
            <tbody>
              {stops.data.map((stop) => (
                <tr key={stop.id}>
                  <td>
                    {stop.nameFr}
                    <div className="muted">
                      {stop.nameAr} · {stop.code}
                    </div>
                  </td>
                  <td>
                    {stop.lines.map((line) => (
                      <span key={line.id} className="badge">
                        {line.code}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span className="badge">{STATUS_LABELS[stop.status]}</span>
                  </td>
                  <td>
                    <button type="button" onClick={() => setEditing(stop)}>
                      Modifier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function StopEditor({ stop, onClose }: { stop: AdminStop; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [nameFr, setNameFr] = useState(stop.nameFr);
  const [nameAr, setNameAr] = useState(stop.nameAr);
  const [position, setPosition] = useState({ latitude: stop.latitude, longitude: stop.longitude });
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>(
    stop.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
  );
  const save = useMutation({
    mutationFn: () => adminApi.updateStop(stop.id, { nameFr, nameAr, ...position, status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stops'] });
      onClose();
    },
  });
  return (
    <div className="card">
      <strong>Modifier « {stop.nameFr} »</strong>
      <StopMap
        points={[{ ...position, label: stop.nameFr, color: MAP_COLORS.current }]}
        onPick={setPosition}
      />
      <p className="muted">Clique sur la carte pour déplacer l’arrêt.</p>
      <div className="row">
        <label>
          Nom (français)
          <input value={nameFr} onChange={(event) => setNameFr(event.target.value)} />
        </label>
        <label>
          Nom (arabe)
          <input dir="rtl" value={nameAr} onChange={(event) => setNameAr(event.target.value)} />
        </label>
        <label>
          Statut
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as 'ACTIVE' | 'ARCHIVED')}
          >
            <option value="ACTIVE">Actif</option>
            <option value="ARCHIVED">Archivé (masqué)</option>
          </select>
        </label>
      </div>
      <ErrorText error={save.error} />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" onClick={() => save.mutate()}>
          Enregistrer
        </button>
        <button type="button" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}

function LouageStations() {
  const queryClient = useQueryClient();
  const stations = useQuery({ queryKey: ['louage'], queryFn: adminApi.louageStations });
  const localities = useQuery({ queryKey: ['localities'], queryFn: adminApi.localities });
  const [editing, setEditing] = useState<AdminLouageStation | 'new' | null>(null);
  const archive = useMutation({
    mutationFn: adminApi.archiveLouageStation,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['louage'] }),
  });

  return (
    <>
      <h2>Stations de louage</h2>
      <p className="muted">
        Les données de démonstration sont inventées : remplace-les par les vraies stations et les
        tarifs officiels.
      </p>
      <ErrorText error={stations.error ?? archive.error} />
      {editing && localities.data ? (
        <LouageEditor
          key={editing === 'new' ? 'new' : editing.id}
          station={editing === 'new' ? null : editing}
          localities={localities.data}
          onClose={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="primary" onClick={() => setEditing('new')}>
          Nouvelle station
        </button>
      )}
      <div className="card" style={{ marginTop: 12 }}>
        <table>
          <tbody>
            {stations.data?.map((station) => (
              <tr key={station.id}>
                <td>
                  {station.nameFr}
                  <div className="muted">{station.code}</div>
                </td>
                <td className="muted">
                  {station.routes
                    .map(
                      (route) => `${route.destination.nameFr} ${formatPrice(route.priceMillimes)}`,
                    )
                    .join(' · ')}
                </td>
                <td>
                  <span className="badge">{STATUS_LABELS[station.status]}</span>
                </td>
                <td>
                  <div className="row">
                    <button type="button" onClick={() => setEditing(station)}>
                      Modifier
                    </button>
                    {station.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => archive.mutate(station.id)}
                      >
                        Archiver
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

interface RouteRow {
  destinationLocalityId: string;
  price: string;
  durationMinutes: string;
}

/** Formulaire d'une station (création ou remplacement complet). */
function LouageEditor({
  station,
  localities,
  onClose,
}: {
  station: AdminLouageStation | null;
  localities: LocalityOption[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState(station?.code ?? '');
  const [nameFr, setNameFr] = useState(station?.nameFr ?? '');
  const [nameAr, setNameAr] = useState(station?.nameAr ?? '');
  const [localityId, setLocalityId] = useState(station?.locality?.id ?? localities[0]?.id ?? '');
  const [position, setPosition] = useState({
    latitude: station?.latitude ?? 35.5047,
    longitude: station?.longitude ?? 11.0622,
  });
  const [opening, setOpening] = useState(minutesToInput(station?.openingMinutes ?? null));
  const [closing, setClosing] = useState(minutesToInput(station?.closingMinutes ?? null));
  const [routes, setRoutes] = useState<RouteRow[]>(
    station?.routes.map((route) => ({
      destinationLocalityId: route.destination.id,
      // Saisie en dinars (« 3,5 ») : plus naturel que les millimes.
      price: String(route.priceMillimes / 1000).replace('.', ','),
      durationMinutes: String(route.durationMinutes),
    })) ?? [],
  );
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: UpsertLouageStationInput) => adminApi.saveLouageStation(input, station?.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['louage'] });
      onClose();
    },
  });

  function onSave() {
    const parsed = UpsertLouageStationSchema.safeParse({
      code,
      nameFr,
      nameAr,
      localityId,
      ...position,
      openingMinutes: inputToMinutes(opening),
      closingMinutes: inputToMinutes(closing),
      routes: routes.map((route) => ({
        destinationLocalityId: route.destinationLocalityId,
        priceMillimes: Math.round(Number(route.price.replace(',', '.')) * 1000),
        durationMinutes: Number(route.durationMinutes),
      })),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues.map((issue) => issue.message).join(' · '));
      return;
    }
    setFormError(null);
    save.mutate(parsed.data);
  }

  const updateRoute = (index: number, patch: Partial<RouteRow>) =>
    setRoutes(routes.map((route, i) => (i === index ? { ...route, ...patch } : route)));

  return (
    <div className="card">
      <strong>{station ? `Modifier « ${station.nameFr} »` : 'Nouvelle station'}</strong>
      <StopMap
        points={[{ ...position, label: nameFr || 'Station', color: MAP_COLORS.current }]}
        onPick={setPosition}
      />
      <p className="muted">Clique sur la carte pour placer la station.</p>
      <div className="row">
        <label>
          Code
          <input value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <label>
          Nom (français)
          <input value={nameFr} onChange={(event) => setNameFr(event.target.value)} />
        </label>
        <label>
          Nom (arabe)
          <input dir="rtl" value={nameAr} onChange={(event) => setNameAr(event.target.value)} />
        </label>
        <label>
          Localité
          <select value={localityId} onChange={(event) => setLocalityId(event.target.value)}>
            {localities.map((locality) => (
              <option key={locality.id} value={locality.id}>
                {locality.nameFr}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ouverture (HH:MM)
          <input value={opening} onChange={(event) => setOpening(event.target.value)} />
        </label>
        <label>
          Fermeture (HH:MM)
          <input value={closing} onChange={(event) => setClosing(event.target.value)} />
        </label>
      </div>

      <h2>Destinations</h2>
      {routes.map((route, index) => (
        <div key={index} className="row" style={{ marginBottom: 8 }}>
          <select
            aria-label="Destination"
            value={route.destinationLocalityId}
            onChange={(event) => updateRoute(index, { destinationLocalityId: event.target.value })}
          >
            {localities.map((locality) => (
              <option key={locality.id} value={locality.id}>
                {locality.nameFr}
              </option>
            ))}
          </select>
          <input
            aria-label="Prix (DT)"
            placeholder="Prix (DT)"
            value={route.price}
            onChange={(event) => updateRoute(index, { price: event.target.value })}
          />
          <input
            aria-label="Durée (min)"
            placeholder="Durée (min)"
            value={route.durationMinutes}
            onChange={(event) => updateRoute(index, { durationMinutes: event.target.value })}
          />
          <button type="button" onClick={() => setRoutes(routes.filter((_, i) => i !== index))}>
            Retirer
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setRoutes([
            ...routes,
            { destinationLocalityId: localities[0]?.id ?? '', price: '', durationMinutes: '' },
          ])
        }
      >
        Ajouter une destination
      </button>

      {formError ? <p className="error">{formError}</p> : null}
      <ErrorText error={save.error} />
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="primary" onClick={onSave}>
          Enregistrer
        </button>
        <button type="button" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}
