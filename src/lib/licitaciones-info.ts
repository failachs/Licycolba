/**
 * src/lib/licitaciones-info.ts
 */

export interface LiciPerfil {
  id_perfil:     number;
  nombre_perfil: string;
}

export interface LiciCronograma {
  nombre?: string;
  fecha?:  string;
  [key: string]: unknown;
}

export interface LiciDocumento {
  nombre?:           string;
  ruta?:             string;
  url?:              string;
  tipo?:             string;
  extension?:        string;
  tamano?:           string;
  size?:             number;
  fechaPublicacion?: string;
  [key: string]: unknown;
}

export interface LiciProcesoRaw {
  idContrato?:              number;
  Nombre?:                  string;
  CodigoProceso?:           string;
  FechaPublicacion?:        string | null;
  FechaVencimiento?:        string | null;
  EntidadContratante?:      string;
  Objeto?:                  string;
  Valor?:                   string | number | null;
  TextoDepartamento?:       string;
  estado_agrupado?:         string;
  alias_fuente?:            string;
  nombre_fuente?:           string | null;
  link?:                    string;
  tipo?:                    number;
  _perfil?:                 string;
  UrlFuente?:               string;
  url_fuente?:              string;
  LinkFuente?:              string;
  link_fuente?:             string;
  UrlFuenteRegistrado?:     string;
  url_fuente_registrado?:   string;
  LinkFuenteRegistrado?:    string;
  link_fuente_registrado?:  string;
  fuentes?:                 Array<{ nombre?: string; url?: string; link?: string; registrado?: boolean; [k: string]: unknown }>;
  Documentos?:              Array<{ Nombre?: string; nombre?: string; Url?: string; url?: string; Ruta?: string; ruta?: string; [k: string]: unknown }>;
  documentos?:              Array<{ Nombre?: string; nombre?: string; Url?: string; url?: string; Ruta?: string; ruta?: string; [k: string]: unknown }>;
  TotalDocumentos?:         number;
  total_documentos?:        number;
  Cronograma?:              Array<{ Nombre?: string; nombre?: string; Fecha?: string; fecha?: string; [k: string]: unknown }>;
  cronograma?:              Array<{ Nombre?: string; nombre?: string; Fecha?: string; fecha?: string; [k: string]: unknown }>;
  Fechas?:                  Array<{ Nombre?: string; nombre?: string; Fecha?: string; fecha?: string; [k: string]: unknown }>;
  fechas?:                  Array<{ Nombre?: string; nombre?: string; Fecha?: string; fecha?: string; [k: string]: unknown }>;
  [key: string]: unknown;
}

export interface LiciProcesosApiResponse {
  success?: boolean;
  count?:   number;
  total?:   number;
  data?:    LiciProcesoRaw[];
  [key: string]: unknown;
}

// ── Config ──────────────────────────────────────────────────────────────────

const PERFILES_DEFAULT: LiciPerfil[] = [
  { id_perfil: 843884, nombre_perfil: 'Vigicolba'  },
  { id_perfil: 843918, nombre_perfil: 'Tempocolba' },
  { id_perfil: 843818, nombre_perfil: 'Aseocolba'  },
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
  const base     = process.env.LICI_INFO_BASE_URL?.replace(/\/$/, '');
  const email    = process.env.LICI_INFO_EMAIL;
  const password = process.env.LICI_INFO_PASSWORD;

  if (!base || !email || !password) {
    throw new Error('Variables faltantes: LICI_INFO_BASE_URL, LICI_INFO_EMAIL, LICI_INFO_PASSWORD');
  }

  return { base, email, password };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function readJson<T>(res: Response, ctx: string): Promise<T> {
  const ct  = (res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.text();

  if (raw.trimStart().startsWith('<')) {
    throw new Error(`[${ctx}] HTML (HTTP ${res.status}): ${raw.slice(0, 150)}`);
  }

  if (
    !ct.includes('application/json') &&
    !raw.trimStart().startsWith('{') &&
    !raw.trimStart().startsWith('[')
  ) {
    throw new Error(`[${ctx}] Inesperado (HTTP ${res.status}, ct:${ct}): ${raw.slice(0, 150)}`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`[${ctx}] JSON inválido (HTTP ${res.status}): ${raw.slice(0, 200)}`);
  }
}

// ── Login ────────────────────────────────────────────────────────────────────

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
      const p = new Date((to.expires_at as string).replace(' ', 'T'));
      if (!Number.isNaN(p.getTime())) expiresAt = p;
    }
  } else if (typeof d.accessToken === 'string') {
    token = d.accessToken;
  }

  if (!token || token.trim().length < 10) {
    throw new Error(`[liciLogin] Token inválido: ${JSON.stringify(data).slice(0, 300)}`);
  }

  _tokenCache = { value: token.trim(), expiresAt };
  return _tokenCache.value;
}

// ── Perfiles ─────────────────────────────────────────────────────────────────

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
    res   = await fetchPerfiles(token);
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
        : Array.isArray((data as { results?: unknown[] }).results)
          ? (data as { results: LiciPerfil[] }).results
          : PERFILES_DEFAULT;
}

export function filtrarPerfilesObjetivo(perfiles: LiciPerfil[]): LiciPerfil[] {
  return perfiles.filter((p) =>
    PERFILES_OBJETIVO.includes(String(p.nombre_perfil ?? '').toLowerCase().trim())
  );
}

// ── Procesos ──────────────────────────────────────────────────────────────────

export async function liciGetProcesos(params: {
  perfiles:           string;
  page?:              number;
  limit?:             number;
  filtrarNuevos?:     boolean;
  query?:             string;
  ascending?:         0 | 1;
  camposAdicionales?: string;
}): Promise<LiciProcesosApiResponse> {
  const { base } = cfg();

  if (!params.perfiles?.trim()) {
    throw new Error('[liciGetProcesos] Parámetro perfiles requerido');
  }

  let token = await liciLogin();

  const buildBody = (t: string) => {
    const body: Record<string, unknown> = {
      token:    t,
      perfiles: params.perfiles,
      page:     params.page ?? 1,
      limit:    Math.min(params.limit ?? 10, 30),
    };

    if (params.filtrarNuevos)                    body.filtrar_nuevos     = 1;
    if (params.query?.trim())                    body.query              = params.query.trim();
    if (typeof params.ascending !== 'undefined') body.ascending          = params.ascending;
    if (params.camposAdicionales?.trim())        body.campos_adicionales = params.camposAdicionales.trim();

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
    res   = await fetchProcesos(token);
  }

  const data = await readJson<LiciProcesosApiResponse>(res, 'liciGetProcesos');

  if (!res.ok) {
    throw new Error(`[liciGetProcesos] HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return data;
}

// ── Paginación automática ─────────────────────────────────────────────────────

export async function liciGetTodosProcesos(params: {
  perfiles:           string;
  limitPorPagina?:    number;
  maxResultados?:     number;
  delayMs?:           number;
  filtrarNuevos?:     boolean;
  query?:             string;
  ascending?:         0 | 1;
  camposAdicionales?: string;
}): Promise<{ procesos: LiciProcesoRaw[]; paginasConsultadas: number; totalApi: number }> {
  const limit = Math.min(params.limitPorPagina ?? 10, 30);
  const max   = params.maxResultados ?? 300;
  const delay = params.delayMs ?? 800;

  let page = 1;
  let pages = 0;
  let total = 0;
  const acc: LiciProcesoRaw[] = [];

  while (true) {
    if (page > 1) await sleep(delay);

    const resp = await liciGetProcesos({ ...params, page, limit });
    pages++;

    const lote: LiciProcesoRaw[] = Array.isArray(resp.data) ? resp.data : [];

    if (page === 1) {
      total = resp.count ?? resp.total ?? lote.length;
    }

    acc.push(...lote);

    if (
      !lote.length ||
      lote.length < limit ||
      acc.length >= max ||
      (total > 0 && acc.length >= total) ||
      pages >= 200
    ) {
      break;
    }

    page++;
  }

  return {
    procesos: acc.slice(0, max),
    paginasConsultadas: pages,
    totalApi: total,
  };
}

// ── Helpers de links ─────────────────────────────────────────────────────────

function normalizeUrl(url: unknown): string {
  return String(url ?? '').trim();
}

function pickFirstNonEmpty(...values: Array<unknown>): string {
  for (const value of values) {
    const s = normalizeUrl(value);
    if (s) return s;
  }
  return '';
}

function isSecop1Url(url: string): boolean {
  return url.includes('contratos.gov.co/consultas/detalleProceso.do?numConstancia=');
}

function isSecop2DetailUrl(url: string): boolean {
  return url.includes('/Public/Tendering/OpportunityDetail/Index?noticeUID=');
}

function isSecop2SearchUrl(url: string): boolean {
  return (
    url.includes('/Public/Tendering/ContractNoticeManagement/Index') ||
    url.includes('searchText=')
  );
}

function isLicitacionesInfoUrl(url: string): boolean {
  return url.includes('licitaciones.info');
}

function collectCandidateUrls(p: LiciProcesoRaw): string[] {
  const directos = [
    p['UrlFuente'],
    p['url_fuente'],
    p['LinkFuente'],
    p['link_fuente'],
    p['UrlFuenteRegistrado'],
    p['url_fuente_registrado'],
    p['LinkFuenteRegistrado'],
    p['link_fuente_registrado'],
    p['link'],
  ]
    .map(normalizeUrl)
    .filter(Boolean);

  const fuentes = Array.isArray(p['fuentes'])
    ? p['fuentes']
        .flatMap((f) => [f?.url, f?.link])
        .map(normalizeUrl)
        .filter(Boolean)
    : [];

  const documentos = [
    ...(Array.isArray(p['Documentos']) ? p['Documentos'] : []),
    ...(Array.isArray(p['documentos']) ? p['documentos'] : []),
  ]
    .flatMap((d) => [d?.Ruta, d?.ruta, d?.Url, d?.url])
    .map(normalizeUrl)
    .filter(Boolean);

  return [...new Set([...directos, ...fuentes, ...documentos])];
}

/**
 * Prioridad:
 * 1) SECOP I directo real
 * 2) SECOP II detalle real (OpportunityDetail)
 * 3) Portal oficial privado / fuente originadora
 * 4) SECOP II búsqueda, solo como fallback
 * 5) licitaciones.info, solo como fallback final
 * 6) cualquier otro candidato no vacío
 *
 * IMPORTANTE:
 * Para SECOP I NO se construye el link usando CodigoProceso,
 * porque CodigoProceso no siempre coincide con numConstancia.
 */
function resolverLinkDetalle(p: LiciProcesoRaw): string {
  const alias  = String(p['alias_fuente'] ?? '').toUpperCase();
  const fuente = String(p['nombre_fuente'] ?? '').toLowerCase();

  const candidates = collectCandidateUrls(p);

  const secop1Directo = candidates.find(isSecop1Url);
  if (secop1Directo) return secop1Directo;

  const secop2Directo = candidates.find(isSecop2DetailUrl);
  if (secop2Directo) return secop2Directo;

  const portalPrivadoOficial = candidates.find(
    (u) => !isLicitacionesInfoUrl(u) && !isSecop2SearchUrl(u)
  );
  if (portalPrivadoOficial) return portalPrivadoOficial;

  if (alias === 'S2' || fuente.includes('secop ii') || fuente.includes('secop2')) {
    const secop2Busqueda = candidates.find(isSecop2SearchUrl);
    if (secop2Busqueda) return secop2Busqueda;
  }

  const liciInfo = candidates.find(isLicitacionesInfoUrl);
  if (liciInfo) return liciInfo;

  return pickFirstNonEmpty(...candidates);
}

// ── Normalizar ────────────────────────────────────────────────────────────────

export function normalizarProceso(p: LiciProcesoRaw) {
  const v = p['Valor'];

  const candidates = collectCandidateUrls(p);

  const linkSecop =
    candidates.find(isSecop2DetailUrl) ||
    candidates.find(isSecop1Url) ||
    '';

  const linkSecopReg = pickFirstNonEmpty(
    p['UrlFuenteRegistrado'],
    p['url_fuente_registrado'],
    p['LinkFuenteRegistrado'],
    p['link_fuente_registrado']
  );

  const linkDetalle = resolverLinkDetalle(p);

  // Documentos
  const rawDocs: Record<string, unknown>[] =
    Array.isArray(p['documentos_proceso']) ? p['documentos_proceso'] as Record<string, unknown>[]
    : Array.isArray(p['Documentos']) ? p['Documentos'] as Record<string, unknown>[]
    : Array.isArray(p['documentos']) ? p['documentos'] as Record<string, unknown>[]
    : [];

  const documentos = rawDocs.map((d) => ({
    nombre: String(d['nombre'] ?? d['Nombre'] ?? ''),
    ruta:   String(d['ruta']   ?? d['Ruta']   ?? d['url'] ?? d['Url'] ?? ''),
    url:    String(d['ruta']   ?? d['Ruta']   ?? d['url'] ?? d['Url'] ?? ''),
  }));

  // Cronogramas
  const rawCron: Record<string, unknown>[] =
    Array.isArray(p['cronogramas']) ? p['cronogramas'] as Record<string, unknown>[]
    : Array.isArray(p['Cronograma']) ? p['Cronograma'] as Record<string, unknown>[]
    : [];

  const cronogramas = rawCron.map((cr) => ({
    nombre: String(cr['label'] ?? cr['nombre'] ?? cr['Nombre'] ?? ''),
    fecha:  String(cr['fecha'] ?? cr['Fecha'] ?? ''),
  }));

  // Fuentes normalizadas
  const fuentes = Array.isArray(p['fuentes']) ? p['fuentes'] : [];

  return {
    id:               Number(p['idContrato'] ?? 0),
    nombre:           String(p['Nombre'] ?? ''),
    codigoProceso:    String(p['CodigoProceso'] ?? ''),
    fuente:           String(p['nombre_fuente'] ?? ''),
    aliasFuente:      String(p['alias_fuente'] ?? ''),
    modalidad:        String(p['tipo'] ?? ''),
    fechaPublicacion: (p['FechaPublicacion'] as string | null) ?? null,
    fechaVencimiento: (p['FechaVencimiento'] as string | null) ?? null,
    entidad:          String(p['EntidadContratante'] ?? ''),
    objeto:           String(p['Objeto'] ?? ''),
    valor:            v != null && String(v).trim() !== '' ? Number(v) : null,
    departamento:     String(p['TextoDepartamento'] ?? ''),
    estado:           String(p['estado_agrupado'] ?? ''),
    perfil:           String(p['_perfil'] ?? ''),
    linkDetalle,
    linkSecop,
    linkSecopReg,
    fuentes,
    totalCronogramas: cronogramas.length,
    totalDocumentos:  documentos.length,
    cronogramas,
    documentos,
  };
}