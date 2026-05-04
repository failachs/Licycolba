/**
 * src/lib/licitaciones-info.ts
 * Cliente y normalizador de procesos desde Licitaciones.Info.
 */

export interface LiciPerfil {
  id_perfil: number;
  nombre_perfil: string;
}

export interface LiciCronograma {
  nombre?: string;
  Nombre?: string;
  label?: string;
  fecha?: string;
  Fecha?: string;
  [key: string]: unknown;
}

export interface LiciDocumento {
  nombre?: string;
  Nombre?: string;
  ruta?: string;
  Ruta?: string;
  url?: string;
  Url?: string;
  tipo?: string;
  extension?: string;
  tamano?: string;
  size?: number;
  fechaPublicacion?: string;
  [key: string]: unknown;
}

export interface LiciProcesoRaw {
  idContrato?: number;

  // Formato histórico / PascalCase
  Nombre?: string;
  CodigoProceso?: string;
  FechaPublicacion?: string | null;
  FechaVencimiento?: string | null;
  EntidadContratante?: string;
  Objeto?: string;
  Valor?: string | number | null;
  TextoDepartamento?: string;
  estado_agrupado?: string;

  // Formato alternativo / snake_case detectado en API
  numero_proceso?: string | null;
  name_proceso?: string | null;
  nombre_proyecto?: string | null;
  entidad_contratante?: string | null;
  objeto?: string | null;
  cuantia?: string | number | null;
  estado_proceso?: string | null;
  adtFechaModificacion?: string | null;
  FechaAdjudicado?: string | null;

  // Duración / plazo contractual
  duracionContrato?: string | number | null;
  DuracionContrato?: string | number | null;
  duracion_contrato?: string | number | null;
  duracion?: string | number | null;
  plazo?: string | number | null;
  plazoEjecucion?: string | number | null;
  plazo_ejecucion?: string | number | null;

  // Fuente / portal
  alias_fuente?: string;
  nombre_fuente?: string | null;
  nombre?: string | null;
  modalidad?: string;
  tipo?: number | string | null;
  canal?: string | null;

  // Links reales desde API
  Link?: string;
  link?: string;
  LinkDocumento?: string | null;
  Random?: string;
  random?: string;
  idUltimaFase?: string | null;
  url_secop2_registrados?: string | null;

  // Auxiliares
  _perfil?: string;
  UrlFuente?: string;
  url_fuente?: string;
  LinkFuente?: string;
  link_fuente?: string;
  UrlFuenteRegistrado?: string;
  url_fuente_registrado?: string;
  LinkFuenteRegistrado?: string;
  link_fuente_registrado?: string;

  ubicaciones?: Array<{
    nombre?: string;
    municipios?: string[];
    [key: string]: unknown;
  }>;

  fuentes?: Array<{
    nombre?: string;
    url?: string;
    link?: string;
    registrado?: boolean;
    [key: string]: unknown;
  }>;

  Documentos?: LiciDocumento[];
  documentos?: LiciDocumento[];
  documentos_proceso?: LiciDocumento[];

  Cronograma?: LiciCronograma[];
  cronograma?: LiciCronograma[];
  cronogramas?: LiciCronograma[];

  [key: string]: unknown;
}

export interface LiciProcesosApiResponse {
  success?: boolean;
  count?: number;
  total?: number;
  data?: LiciProcesoRaw[];
  procesos?: LiciProcesoRaw[];
  contratos?: LiciProcesoRaw[];
  results?: LiciProcesoRaw[];
  items?: LiciProcesoRaw[];
  records?: LiciProcesoRaw[];
  [key: string]: unknown;
}

const PERFILES_DEFAULT: LiciPerfil[] = [
  { id_perfil: 843884, nombre_perfil: 'Vigicolba' },
  { id_perfil: 843918, nombre_perfil: 'Tempocolba' },
  { id_perfil: 843818, nombre_perfil: 'Aseocolba' },
];

const PERFILES_OBJETIVO = ['vigicolba', 'tempocolba', 'failach', 'aseocolba'];

let _tokenCache: { value: string; expiresAt: Date } | null = null;

function tokenVigente(): boolean {
  if (!_tokenCache) return false;
  return _tokenCache.expiresAt.getTime() - Date.now() > 10 * 60 * 1000;
}

function invalidarToken() {
  _tokenCache = null;
}

function cfg() {
  const base = process.env.LICI_INFO_BASE_URL?.replace(/\/$/, '');
  const email = process.env.LICI_INFO_EMAIL;
  const password = process.env.LICI_INFO_PASSWORD;

  if (!base || !email || !password) {
    throw new Error(
      'Variables faltantes: LICI_INFO_BASE_URL, LICI_INFO_EMAIL, LICI_INFO_PASSWORD'
    );
  }

  return { base, email, password };
}

async function readJson<T>(res: Response, ctx: string): Promise<T> {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.text();

  if (raw.trimStart().startsWith('<')) {
    throw new Error(`[${ctx}] HTML (HTTP ${res.status}): ${raw.slice(0, 150)}`);
  }

  if (
    !ct.includes('application/json') &&
    !raw.trimStart().startsWith('{') &&
    !raw.trimStart().startsWith('[')
  ) {
    throw new Error(
      `[${ctx}] Inesperado (HTTP ${res.status}, ct:${ct}): ${raw.slice(0, 150)}`
    );
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`[${ctx}] JSON inválido (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }
}

function pickTexto(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function pickNumberLike(obj: Record<string, unknown>, keys: string[]): string | number | null {
  for (const key of keys) {
    const value = obj[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function pickFecha(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function construirDepartamentoDesdeUbicaciones(ubicaciones: unknown): string {
  if (!Array.isArray(ubicaciones)) return '';

  return ubicaciones
    .map((u) => {
      if (!u || typeof u !== 'object') return '';

      const item = u as Record<string, unknown>;
      const departamento = String(item.nombre ?? '').trim();
      const municipios = Array.isArray(item.municipios)
        ? item.municipios.map((m) => String(m).trim()).filter(Boolean)
        : [];

      if (departamento && municipios.length > 0) {
        return `${departamento} : ${municipios.join(', ')}`;
      }

      return departamento;
    })
    .filter(Boolean)
    .join(' | ');
}

export async function liciLogin(): Promise<string> {
  if (tokenVigente()) return _tokenCache!.value;

  const { base, email, password } = cfg();

  const res = await fetch(`${base}/api/client/auth-token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });

  const data = await readJson<unknown>(res, 'liciLogin');

  if (!res.ok) {
    throw new Error(`[liciLogin] HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }

  const d = data as Record<string, unknown>;

  if (d.success === false) {
    throw new Error(`[liciLogin] Rechazado: ${String(d.message ?? 'sin mensaje')}`);
  }

  let token: string | null = null;
  let expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const t = d.token;

  if (typeof t === 'string') {
    token = t;
  } else if (t && typeof t === 'object') {
    const to = t as Record<string, unknown>;

    if (typeof to.accessToken === 'string') token = to.accessToken;

    if (typeof to.expires_at === 'string') {
      const parsed = new Date(to.expires_at.replace(' ', 'T'));
      if (!Number.isNaN(parsed.getTime())) expiresAt = parsed;
    }
  } else if (typeof d.accessToken === 'string') {
    token = d.accessToken;
  }

  if (!token || token.trim().length < 10) {
    throw new Error(`[liciLogin] Token inválido: ${JSON.stringify(data).slice(0, 300)}`);
  }

  _tokenCache = {
    value: token.trim(),
    expiresAt,
  };

  return _tokenCache.value;
}

export async function liciGetPerfiles(): Promise<LiciPerfil[]> {
  const { base } = cfg();
  let token = await liciLogin();

  const fetchPerfiles = (t: string) =>
    fetch(`${base}/api/client/perfiles/consultar`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${t}`,
      },
      cache: 'no-store',
      redirect: 'follow',
    });

  let res = await fetchPerfiles(token);

  if (res.status === 401) {
    invalidarToken();
    token = await liciLogin();
    res = await fetchPerfiles(token);
  }

  if (!res.ok) {
    console.warn(`[liciGetPerfiles] HTTP ${res.status} — usando perfiles por defecto`);
    return PERFILES_DEFAULT;
  }

  const data = await readJson<unknown>(res, 'liciGetPerfiles');

  return Array.isArray(data)
    ? (data as LiciPerfil[])
    : Array.isArray((data as { perfiles?: unknown[] }).perfiles)
      ? (data as { perfiles: LiciPerfil[] }).perfiles
      : Array.isArray((data as { data?: unknown[] }).data)
        ? (data as { data: LiciPerfil[] }).data
        : PERFILES_DEFAULT;
}

export function filtrarPerfilesObjetivo(perfiles: LiciPerfil[]): LiciPerfil[] {
  return perfiles.filter((p) =>
    PERFILES_OBJETIVO.includes(String(p.nombre_perfil ?? '').toLowerCase().trim())
  );
}

export async function liciGetProcesos(params: {
  perfiles: string;
  page?: number;
  limit?: number;
  filtrarNuevos?: boolean;
  query?: string;
  ascending?: 0 | 1;
  camposAdicionales?: string;
}): Promise<LiciProcesosApiResponse> {
  const { base } = cfg();

  if (!params.perfiles?.trim()) {
    throw new Error('[liciGetProcesos] Parámetro perfiles requerido');
  }

  let token = await liciLogin();

  const buildBody = (t: string) => {
    const body: Record<string, unknown> = {
      token: t,
      perfiles: params.perfiles,
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? 10, 30),
    };

    if (params.filtrarNuevos) body.filtrar_nuevos = 1;
    if (params.query?.trim()) body.query = params.query.trim();
    if (typeof params.ascending !== 'undefined') body.ascending = params.ascending;
    if (params.camposAdicionales?.trim()) {
      body.campos_adicionales = params.camposAdicionales.trim();
    }

    return JSON.stringify(body);
  };

  const fetchProcesos = (t: string) =>
    fetch(`${base}/api/client/contratos/consultar`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
      },
      body: buildBody(t),
      cache: 'no-store',
      redirect: 'follow',
    });

  let res = await fetchProcesos(token);

  if (res.status === 401) {
    invalidarToken();
    token = await liciLogin();
    res = await fetchProcesos(token);
  }

  const data = await readJson<LiciProcesosApiResponse>(res, 'liciGetProcesos');

  if (!res.ok) {
    throw new Error(
      `[liciGetProcesos] HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`
    );
  }

  return data;
}

function normalizeUrl(url: unknown): string {
  return String(url ?? '').trim().replace(/&amp;/g, '&');
}

function construirLinkRegistradosSecop2(base: unknown, notice: unknown): string {
  const baseStr = normalizeUrl(base);
  const noticeStr = normalizeUrl(notice);

  if (!baseStr || !noticeStr) return '';

  return `${baseStr}${noticeStr}`;
}

function normalizarDocumentos(p: LiciProcesoRaw) {
  const rawDocs = Array.isArray(p.Documentos)
    ? p.Documentos
    : Array.isArray(p.documentos)
      ? p.documentos
      : Array.isArray(p.documentos_proceso)
        ? p.documentos_proceso
        : [];

  return rawDocs.map((d) => ({
    nombre: String(d.Nombre ?? d.nombre ?? ''),
    ruta: String(d.Ruta ?? d.ruta ?? d.Url ?? d.url ?? ''),
    url: String(d.Ruta ?? d.ruta ?? d.Url ?? d.url ?? ''),
  }));
}

function normalizarCronogramas(p: LiciProcesoRaw) {
  const rawCron = Array.isArray(p.Cronograma)
    ? p.Cronograma
    : Array.isArray(p.cronograma)
      ? p.cronograma
      : Array.isArray(p.cronogramas)
        ? p.cronogramas
        : [];

  return rawCron.map((cr) => ({
    nombre: String(cr.Nombre ?? cr.nombre ?? cr.label ?? ''),
    fecha: String(cr.Fecha ?? cr.fecha ?? ''),
  }));
}

export function normalizarProceso(p: LiciProcesoRaw) {
  const aliasFuente = String(p.alias_fuente ?? '').trim().toUpperCase();
  const fuente = String(p.nombre ?? p.nombre_fuente ?? '').trim();

  const duracion = pickTexto(p, [
    'duracionContrato',
    'DuracionContrato',
    'duracion_contrato',
    'duracion',
    'plazo',
    'plazoEjecucion',
    'plazo_ejecucion',
  ]);

  const nombreProceso = pickTexto(p, [
    'Nombre',
    'nombre_proyecto',
  ]);

  const codigoProceso = pickTexto(p, [
    'CodigoProceso',
    'numero_proceso',
  ]);

  const modalidad = pickTexto(p, [
    'modalidad',
    'name_proceso',
  ]);

  const entidad = pickTexto(p, [
    'EntidadContratante',
    'entidad_contratante',
  ]);

  const objeto = pickTexto(p, [
    'Objeto',
    'objeto',
  ]);

  const fechaPublicacion = pickFecha(p, [
    'FechaPublicacion',
  ]);

  const fechaVencimiento = pickFecha(p, [
    'FechaVencimiento',
  ]);

  const departamento =
    pickTexto(p, ['TextoDepartamento']) ||
    construirDepartamentoDesdeUbicaciones(p.ubicaciones);

  const estado = pickTexto(p, [
    'estado_agrupado',
    'estado_proceso',
  ]);

  const linkReal = normalizeUrl(p.Link ?? p.link);
  const random = normalizeUrl(p.Random ?? p.random);
  const idUltimaFase = normalizeUrl(p.idUltimaFase);
  const baseRegistrados = normalizeUrl(p.url_secop2_registrados);

  let linkDetalle = linkReal;
  let linkSecop = '';
  let linkSecopReg = '';

  if (aliasFuente === 'S2') {
    linkSecop = linkReal;
    linkSecopReg = construirLinkRegistradosSecop2(baseRegistrados, idUltimaFase);
  } else if (aliasFuente === 'S1') {
    linkSecop = linkReal;
  }

  if (!linkDetalle && random) {
    linkDetalle = `https://col.licitaciones.info/detalle-contrato?random=${random}`;
  }

  const documentos = normalizarDocumentos(p);
  const cronogramas = normalizarCronogramas(p);

  const valorRaw = pickNumberLike(p, [
    'Valor',
    'cuantia',
  ]);

  const valor =
    valorRaw != null && String(valorRaw).trim() !== ''
      ? Number(String(valorRaw).replace(/[^\d.-]/g, ''))
      : null;

  return {
    id: Number(p.idContrato ?? 0),
    nombre: nombreProceso ?? '',
    codigoProceso: codigoProceso ?? '',
    fuente,
    aliasFuente,
    modalidad: modalidad ?? '',
    fechaPublicacion,
    fechaVencimiento,
    entidad: entidad ?? '',
    objeto: objeto ?? '',
    duracion,
    valor: Number.isFinite(valor as number) ? valor : null,
    departamento,
    estado: estado ?? '',
    perfil: String(p._perfil ?? ''),
    linkDetalle,
    linkSecop,
    linkSecopReg,
    totalCronogramas: cronogramas.length,
    totalDocumentos: documentos.length,
    cronogramas,
    documentos,
  };
}