/**
 * src/lib/procesos-sync.ts
 * Sincronización centralizada de procesos desde Licitaciones.Info.
 */

import crypto from 'crypto';
import prisma from '@/lib/prisma';
import {
  liciGetPerfiles,
  filtrarPerfilesObjetivo,
  liciGetProcesos,
  normalizarProceso,
} from '@/lib/licitaciones-info';
import type { LiciProcesoRaw } from '@/lib/licitaciones-info';

export interface SyncMetrics {
  ok: boolean;
  totalApi: number;
  paginasConsultadas: number;
  recibidos: number;
  creados: number;
  actualizados: number;
  sinCambios: number;
  ignorados: number;
  nuevosRegistrados: number;
  cambiosEstado: number;
  cambiosFechaCierre: number;
  cambiosValor: number;
  documentosNuevos: number;
  cronogramasActualizados: number;
  errores: string[];
  duracionMs: number;
}

type DocumentoSync = {
  nombre: string;
  ruta: string;
  url: string;
};

type CronogramaSync = {
  nombre: string;
  fecha: string;
};

type TipoDocumentoSync = 'base' | 'adenda';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function hashProceso(p: ReturnType<typeof normalizarProceso>): string {
  const campos = [
    p.codigoProceso ?? '',
    p.nombre ?? '',
    p.entidad ?? '',
    p.objeto ?? '',
    p.duracion ?? '',
    p.fuente ?? '',
    p.aliasFuente ?? '',
    p.modalidad ?? '',
    p.perfil ?? '',
    p.departamento ?? '',
    p.estado ?? '',
    p.fechaPublicacion ?? '',
    p.fechaVencimiento ?? '',
    String(p.valor ?? ''),
  ].join('|');

  return crypto.createHash('md5').update(campos).digest('hex');
}

function extraerLote(resp: Record<string, unknown>): LiciProcesoRaw[] {
  for (const key of ['data', 'procesos', 'contratos', 'results', 'items', 'records']) {
    const val = resp[key];
    if (Array.isArray(val) && val.length > 0) return val as LiciProcesoRaw[];
  }

  for (const val of Object.values(resp)) {
    if (Array.isArray(val) && val.length > 0) return val as LiciProcesoRaw[];
  }

  return [];
}

function extraerTotal(resp: Record<string, unknown>, fallback: number): number {
  for (const key of ['count', 'total', 'totalCount']) {
    if (typeof resp[key] === 'number') return resp[key] as number;
  }

  return fallback;
}

/**
 * Convierte fechas de Licitaciones.Info en Date sin desplazar horas por zona local.
 * Evita falsos positivos entre timestamp without time zone de PostgreSQL y fechas de API.
 */
function parseFecha(fecha?: string | null): Date | null {
  if (!fecha) return null;

  const texto = String(fecha).trim();
  if (!texto) return null;

  const normalizado = texto.replace(' ', 'T');

  const match = normalizado.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (match) {
    const [, y, m, d, hh = '00', mm = '00', ss = '00'] = match;

    const parsed = new Date(
      Date.UTC(
        Number(y),
        Number(m) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss)
      )
    );

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(normalizado);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseValor(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;

  if (typeof valor === 'string') {
    const limpio = valor.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = Number(limpio);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function buildSourceKey(raw: LiciProcesoRaw, p: ReturnType<typeof normalizarProceso>) {
  const externalId = String(p.id ?? '').trim();

  if (externalId && externalId !== '0') return `ext:${externalId}`;

  const codigo = String(p.codigoProceso ?? '').trim();
  const alias = String(p.aliasFuente ?? '').trim().toUpperCase();
  const entidad = String(p.entidad ?? '').trim();
  const fecha = String(p.fechaPublicacion ?? '').trim();
  const nombre = String(p.nombre ?? '').trim();

  if (codigo || alias || entidad || fecha || nombre) {
    return `mix:${codigo}||${alias}||${entidad}||${fecha}||${nombre}`;
  }

  return `raw:${crypto.createHash('md5').update(JSON.stringify(raw)).digest('hex')}`;
}

/**
 * Normaliza código de proceso cuando la fuente no entrega identificador explícito.
 * Para procesos NC, el nombre funciona como identificador operativo.
 */
function resolverCodigoProceso(params: {
  codigoProceso?: string | null;
  nombre?: string | null;
  aliasFuente?: string | null;
}): string | null {
  const codigo = String(params.codigoProceso ?? '').trim();
  const nombre = String(params.nombre ?? '').trim();
  const alias = String(params.aliasFuente ?? '').trim().toUpperCase();

  if (codigo) return codigo;

  if (alias === 'NC' && nombre) return nombre;

  return null;
}

/**
 * Conserva el linkDetalle cargado manualmente en base de datos.
 * El valor existente en BD tiene prioridad sobre el valor de la API.
 */
function resolverLinkDetalle(
  enBD: string | null | undefined,
  deAPI: string | null | undefined
): string | null {
  const bdVal = String(enBD ?? '').trim();
  if (bdVal) return bdVal;

  const apiVal = String(deAPI ?? '').trim();
  return apiVal || null;
}

function normalizarTexto(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizarTextoKey(value: unknown): string {
  return normalizarTexto(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarUrl(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, '');
}

/**
 * Clasifica automáticamente documentos que por nombre corresponden a adendas.
 * Aplica tanto para documentos iniciales como para documentos nuevos detectados.
 */
function detectarTipoDocumentoPorNombre(
  nombre: string,
  tipoDocumentoDefault: TipoDocumentoSync
): TipoDocumentoSync {
  const texto = normalizarTextoKey(nombre);

  const palabrasAdenda = [
    'adenda',
    'adendo',
    'modificacion',
    'modificatorio',
    'alcance',
  ];

  if (palabrasAdenda.some((palabra) => texto.includes(palabra))) {
    return 'adenda';
  }

  return tipoDocumentoDefault;
}

/**
 * Deduplica documentos antes de comparar o insertar.
 * La clave prioriza URL; si no existe URL, usa el nombre.
 */
function deduplicarDocumentos(documentos: DocumentoSync[]): DocumentoSync[] {
  const vistos = new Set<string>();
  const resultado: DocumentoSync[] = [];

  for (const doc of documentos) {
    const nombre = normalizarTexto(doc.nombre);
    const url = normalizarUrl(doc.url || doc.ruta);
    const ruta = normalizarUrl(doc.ruta || doc.url);

    if (!nombre && !url && !ruta) continue;

    const keyUrl = url || ruta;
    const keyNombre = normalizarTextoKey(nombre);
    const key = keyUrl ? `url:${keyUrl.toLowerCase()}` : `nombre:${keyNombre}`;

    if (vistos.has(key)) continue;

    vistos.add(key);

    resultado.push({
      nombre: nombre || 'Sin nombre',
      ruta,
      url: url || ruta,
    });
  }

  return resultado;
}

/**
 * Deduplica cronogramas por evento + fecha.
 */
function deduplicarCronogramas(cronogramas: CronogramaSync[]): CronogramaSync[] {
  const vistos = new Set<string>();
  const resultado: CronogramaSync[] = [];

  for (const item of cronogramas) {
    const nombre = normalizarTexto(item.nombre);
    const fecha = normalizarTexto(item.fecha);

    if (!nombre && !fecha) continue;

    const key = `${normalizarTextoKey(nombre)}|${normalizarTextoKey(fecha)}`;
    if (vistos.has(key)) continue;

    vistos.add(key);

    resultado.push({
      nombre: nombre || 'Etapa sin nombre',
      fecha,
    });
  }

  return resultado;
}

async function recalcularTotalesProceso(procesoId: number): Promise<{
  totalDocumentos: number;
  totalCronogramas: number;
}> {
  const [totalDocumentos, totalCronogramas] = await Promise.all([
    prisma.procesoDocumentoSecop.count({
      where: { procesoId },
    }),
    prisma.procesoCronogramaSecop.count({
      where: { procesoId },
    }),
  ]);

  await prisma.proceso.update({
    where: { id: procesoId },
    data: {
      totalDocumentos,
      totalCronogramas,
    },
  });

  return {
    totalDocumentos,
    totalCronogramas,
  };
}

async function sincronizarDocumentos(
  procesoId: number,
  codigoProceso: string | null,
  entidad: string | null,
  perfil: string | null,
  sourceKey: string,
  documentos: DocumentoSync[],
  tipoDocumentoNuevo: TipoDocumentoSync
): Promise<number> {
  const documentosNormalizados = deduplicarDocumentos(documentos);

  if (documentosNormalizados.length === 0) return 0;

  let nuevos = 0;

  const existentes = await prisma.procesoDocumentoSecop.findMany({
    where: { procesoId },
    select: {
      id: true,
      nombre: true,
      urlDocumento: true,
    },
  });

  const keysExistentes = new Set<string>();

  for (const doc of existentes) {
    const url = normalizarUrl(doc.urlDocumento);
    const nombre = normalizarTextoKey(doc.nombre);
    const key = url ? `url:${url.toLowerCase()}` : `nombre:${nombre}`;
    keysExistentes.add(key);
  }

  for (const doc of documentosNormalizados) {
    const url = normalizarUrl(doc.url || doc.ruta);
    const nombre = normalizarTexto(doc.nombre);
    const key = url ? `url:${url.toLowerCase()}` : `nombre:${normalizarTextoKey(nombre)}`;

    if (keysExistentes.has(key)) continue;

    const tipoDocumentoFinal = detectarTipoDocumentoPorNombre(
      nombre,
      tipoDocumentoNuevo
    );

    try {
      const nuevo = await prisma.procesoDocumentoSecop.create({
        data: {
          procesoId,
          nombre: nombre || 'Sin nombre',
          urlDocumento: url || null,
          tipoDocumento: tipoDocumentoFinal,
          fechaDetectado: new Date(),
        },
      });

      keysExistentes.add(key);
      nuevos++;

      if (tipoDocumentoFinal === 'adenda') {
        console.log('[sync] adenda detectada', codigoProceso, nombre);

        await prisma.notificacion.create({
          data: {
            tipo: 'documento_nuevo',
            titulo: 'Nueva adenda detectada',
            descripcion: `Se detectó un documento/adenda en el proceso ${codigoProceso ?? '—'}: ${nombre}.`,
            codigoProceso,
            procesoId,
            entidad,
            perfil,
            datos: {
              sourceKey,
              documentoId: nuevo.id,
              nombreDocumento: nombre,
              urlDocumento: url || null,
              tipoDocumento: tipoDocumentoFinal,
            },
          },
        });
      }
    } catch (err) {
      console.warn(
        '[sync] error documento',
        codigoProceso,
        nombre,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (nuevos > 0) {
    console.log('[sync] documentos sincronizados', codigoProceso, {
      tipoDocumentoNuevo,
      recibidos: documentos.length,
      normalizados: documentosNormalizados.length,
      nuevos,
    });
  }

  return nuevos;
}

async function sincronizarCronograma(
  procesoId: number,
  codigoProceso: string | null,
  cronogramas: CronogramaSync[]
): Promise<boolean> {
  const cronogramasNormalizados = deduplicarCronogramas(cronogramas);

  try {
    const existentes = await prisma.procesoCronogramaSecop.findMany({
      where: { procesoId },
      select: {
        evento: true,
        valorTexto: true,
      },
    });

    const hashExistente = crypto
      .createHash('md5')
      .update(
        JSON.stringify(
          existentes
            .map((e) => {
              const evento = normalizarTextoKey(e.evento);
              const fecha = normalizarTextoKey(e.valorTexto);
              return `${evento}|${fecha}`;
            })
            .sort()
        )
      )
      .digest('hex');

    const hashNuevo = crypto
      .createHash('md5')
      .update(
        JSON.stringify(
          cronogramasNormalizados
            .map((c) => {
              const evento = normalizarTextoKey(c.nombre);
              const fecha = normalizarTextoKey(c.fecha);
              return `${evento}|${fecha}`;
            })
            .sort()
        )
      )
      .digest('hex');

    if (hashExistente === hashNuevo) return false;

    await prisma.procesoCronogramaSecop.deleteMany({
      where: { procesoId },
    });

    if (cronogramasNormalizados.length > 0) {
      await prisma.procesoCronogramaSecop.createMany({
        data: cronogramasNormalizados.map((cr, i) => ({
          procesoId,
          evento: cr.nombre || `Etapa ${i + 1}`,
          valorTexto: cr.fecha || null,
          orden: i,
        })),
      });
    }

    console.log('[sync] cronograma actualizado', codigoProceso, {
      recibidos: cronogramas.length,
      guardados: cronogramasNormalizados.length,
    });

    return true;
  } catch (err) {
    console.warn(
      '[sync] error cronograma',
      codigoProceso,
      err instanceof Error ? err.message : err
    );

    return false;
  }
}

async function upsertProceso(raw: LiciProcesoRaw, metrics: SyncMetrics): Promise<void> {
  const p = normalizarProceso(raw);
  const sourceKey = buildSourceKey(raw, p);
  const hashContenido = hashProceso(p);

  const aliasFuente = String(p.aliasFuente ?? '').trim().toUpperCase() || null;

  const codigoProceso = resolverCodigoProceso({
    codigoProceso: p.codigoProceso,
    nombre: p.nombre,
    aliasFuente,
  });

  const entidad = p.entidad ?? null;
  const perfil = p.perfil ?? null;

  const existing = await prisma.proceso.findUnique({
    where: { sourceKey },
    select: {
      id: true,
      codigoProceso: true,
      hashContenido: true,
      linkDetalle: true,
      estadoFuente: true,
      fechaVencimiento: true,
      valor: true,
    },
  });

  const linkDetalleProtegido = resolverLinkDetalle(existing?.linkDetalle, p.linkDetalle);

  const dataBase = {
    sourceKey,
    externalId: p.id && p.id !== 0 ? String(p.id) : null,
    codigoProceso,
    nombre: p.nombre ?? null,
    entidad,
    objeto: p.objeto ?? null,
    duracion: p.duracion ?? null,
    fuente: p.fuente ?? null,
    aliasFuente,
    modalidad: p.modalidad ?? null,
    perfil,
    departamento: p.departamento ?? null,
    estadoFuente: p.estado ?? null,
    fechaPublicacion: parseFecha(p.fechaPublicacion),
    fechaVencimiento: parseFecha(p.fechaVencimiento),
    valor: parseValor(p.valor),
    linkDetalle: linkDetalleProtegido,
    linkSecop: null,
    linkSecopReg: p.linkSecopReg ?? null,
    rawJson: JSON.stringify(raw),
    hashContenido,
    lastSyncedAt: new Date(),
  };

  const documentosNormalizados = deduplicarDocumentos(p.documentos);
  const cronogramasNormalizados = deduplicarCronogramas(p.cronogramas);

  if (!existing) {
    const creado = await prisma.proceso.create({
      data: {
        ...dataBase,
        totalDocumentos: documentosNormalizados.length,
        totalCronogramas: cronogramasNormalizados.length,
      },
    });

    metrics.creados++;

    console.log('[sync] proceso creado', codigoProceso);

    try {
      await prisma.procesoNuevo.upsert({
        where: { sourceKey },
        update: {
          codigoProceso: dataBase.codigoProceso,
          nombre: dataBase.nombre,
          entidad: dataBase.entidad,
          objeto: dataBase.objeto,
          duracion: dataBase.duracion,
          fuente: dataBase.fuente,
          aliasFuente: dataBase.aliasFuente,
          modalidad: dataBase.modalidad,
          perfil: dataBase.perfil,
          departamento: dataBase.departamento,
          estadoFuente: dataBase.estadoFuente,
          fechaPublicacion: dataBase.fechaPublicacion,
          fechaVencimiento: dataBase.fechaVencimiento,
          valor: dataBase.valor,
          linkDetalle: dataBase.linkDetalle,
          linkSecop: null,
          linkSecopReg: dataBase.linkSecopReg,
        },
        create: {
          procesoId: creado.id,
          sourceKey,
          codigoProceso: dataBase.codigoProceso,
          nombre: dataBase.nombre,
          entidad: dataBase.entidad,
          objeto: dataBase.objeto,
          duracion: dataBase.duracion,
          fuente: dataBase.fuente,
          aliasFuente: dataBase.aliasFuente,
          modalidad: dataBase.modalidad,
          perfil: dataBase.perfil,
          departamento: dataBase.departamento,
          estadoFuente: dataBase.estadoFuente,
          fechaPublicacion: dataBase.fechaPublicacion,
          fechaVencimiento: dataBase.fechaVencimiento,
          valor: dataBase.valor,
          linkDetalle: dataBase.linkDetalle,
          linkSecop: null,
          linkSecopReg: dataBase.linkSecopReg,
          fechaDeteccion: new Date(),
        },
      });

      metrics.nuevosRegistrados++;
    } catch (err) {
      console.warn(
        '[sync] error ProcesoNuevo',
        codigoProceso,
        err instanceof Error ? err.message : err
      );
    }

    await prisma.notificacion.create({
      data: {
        tipo: 'proceso_nuevo',
        titulo: 'Nuevo proceso detectado',
        descripcion: `Se detectó un nuevo proceso: ${codigoProceso ?? '—'}.`,
        codigoProceso,
        procesoId: creado.id,
        entidad,
        perfil,
        datos: {
          sourceKey,
          fechaPublicacion: dataBase.fechaPublicacion?.toISOString() ?? null,
        },
      },
    });

    const docsInsertados = await sincronizarDocumentos(
      creado.id,
      codigoProceso,
      entidad,
      perfil,
      sourceKey,
      documentosNormalizados,
      'base'
    );

    metrics.documentosNuevos += docsInsertados;

    if (cronogramasNormalizados.length > 0) {
      await prisma.procesoCronogramaSecop.createMany({
        data: cronogramasNormalizados.map((cr, i) => ({
          procesoId: creado.id,
          evento: cr.nombre || `Etapa ${i + 1}`,
          valorTexto: cr.fecha || null,
          orden: i,
        })),
      });
    }

    await recalcularTotalesProceso(creado.id);

    return;
  }

  if (existing.hashContenido !== hashContenido) {
    const procesoActual = await prisma.proceso.findUnique({
      where: { id: existing.id },
      select: { linkDetalle: true },
    });

    const linkDetalleActual = resolverLinkDetalle(procesoActual?.linkDetalle, p.linkDetalle);

    console.log('[sync] linkDetalle check', codigoProceso, {
      enBD: procesoActual?.linkDetalle,
      deAPI: p.linkDetalle,
      queSeGuarda: linkDetalleActual,
    });

    await prisma.proceso.update({
      where: { id: existing.id },
      data: {
        ...dataBase,
        linkDetalle: linkDetalleActual,
      },
    });

    metrics.actualizados++;

    console.log('[sync] proceso actualizado', codigoProceso);

    const estadoAnterior = existing.estadoFuente;
    const estadoNuevo = dataBase.estadoFuente;

    if (estadoAnterior && estadoNuevo && estadoAnterior !== estadoNuevo) {
      metrics.cambiosEstado++;

      console.log('[sync] cambio estado', codigoProceso, estadoAnterior, estadoNuevo);

      await prisma.notificacion.create({
        data: {
          tipo: 'cambio_estado',
          titulo: 'Cambio de estado en proceso',
          descripcion: `El proceso ${codigoProceso ?? '—'} cambió de "${estadoAnterior}" a "${estadoNuevo}".`,
          codigoProceso,
          procesoId: existing.id,
          entidad,
          perfil,
          datos: {
            sourceKey,
            estadoAnterior,
            estadoNuevo,
          },
        },
      });
    }

    const fechaAnteriorDate = existing.fechaVencimiento ?? null;
    const fechaNuevaDate = dataBase.fechaVencimiento ?? null;

    const fechaAnteriorTime = fechaAnteriorDate?.getTime() ?? null;
    const fechaNuevaTime = fechaNuevaDate?.getTime() ?? null;

    const hayCambioFechaCierre =
      fechaAnteriorTime !== null &&
      fechaNuevaTime !== null &&
      fechaAnteriorTime !== fechaNuevaTime;

    if (hayCambioFechaCierre) {
      metrics.cambiosFechaCierre++;

      console.log(
        '[sync] cambio fecha cierre',
        codigoProceso,
        fechaAnteriorDate?.toISOString() ?? null,
        fechaNuevaDate?.toISOString() ?? null
      );

      await prisma.proceso.update({
        where: { id: existing.id },
        data: {
          fechaVencimientoAnterior: fechaAnteriorDate,
          fechaCambioFechaCierre: new Date(),
          tieneCambioFechaCierre: true,
        },
      });

      await prisma.notificacion.create({
        data: {
          tipo: 'cambio_fecha_cierre',
          titulo: 'Cambio de fecha de cierre',
          descripcion: `El proceso ${codigoProceso ?? '—'} cambió su fecha de vencimiento.`,
          codigoProceso,
          procesoId: existing.id,
          entidad,
          perfil,
          datos: {
            sourceKey,
            fechaAnterior: fechaAnteriorDate?.toISOString() ?? null,
            fechaNueva: fechaNuevaDate?.toISOString() ?? null,
          },
        },
      });
    }

    const valorAnterior = existing.valor;
    const valorNuevo = dataBase.valor;

    if (valorAnterior !== valorNuevo && valorNuevo !== null) {
      metrics.cambiosValor++;

      console.log('[sync] cambio valor', codigoProceso, valorAnterior, valorNuevo);

      await prisma.notificacion.create({
        data: {
          tipo: 'cambio_valor',
          titulo: 'Cambio de valor del proceso',
          descripcion: `El proceso ${codigoProceso ?? '—'} cambió su valor.`,
          codigoProceso,
          procesoId: existing.id,
          entidad,
          perfil,
          datos: {
            sourceKey,
            valorAnterior,
            valorNuevo,
          },
        },
      });
    }

    const docsInsertados = await sincronizarDocumentos(
      existing.id,
      codigoProceso,
      entidad,
      perfil,
      sourceKey,
      documentosNormalizados,
      'adenda'
    );

    metrics.documentosNuevos += docsInsertados;

    const cronoCambio = await sincronizarCronograma(
      existing.id,
      codigoProceso,
      cronogramasNormalizados
    );

    if (cronoCambio) {
      metrics.cronogramasActualizados++;

      await prisma.notificacion.create({
        data: {
          tipo: 'cambio_cronograma',
          titulo: 'Cambio en cronograma',
          descripcion: `El proceso ${codigoProceso ?? '—'} actualizó su cronograma.`,
          codigoProceso,
          procesoId: existing.id,
          entidad,
          perfil,
          datos: {
            sourceKey,
          },
        },
      });
    }

    await recalcularTotalesProceso(existing.id);

    return;
  }

  const codigoExistente = String(existing.codigoProceso ?? '').trim();
  const codigoNormalizado = String(codigoProceso ?? '').trim();

  const debeCorregirCodigo = Boolean(
    codigoNormalizado && codigoExistente !== codigoNormalizado
  );

  const docsInsertados = await sincronizarDocumentos(
    existing.id,
    codigoProceso,
    entidad,
    perfil,
    sourceKey,
    documentosNormalizados,
    'adenda'
  );

  metrics.documentosNuevos += docsInsertados;

  const cronoCambio = await sincronizarCronograma(
    existing.id,
    codigoProceso,
    cronogramasNormalizados
  );

  if (cronoCambio) {
    metrics.cronogramasActualizados++;

    await prisma.notificacion.create({
      data: {
        tipo: 'cambio_cronograma',
        titulo: 'Cambio en cronograma',
        descripcion: `El proceso ${codigoProceso ?? '—'} actualizó su cronograma.`,
        codigoProceso,
        procesoId: existing.id,
        entidad,
        perfil,
        datos: {
          sourceKey,
        },
      },
    });
  }

  await prisma.proceso.update({
    where: { id: existing.id },
    data: {
      lastSyncedAt: new Date(),
      ...(debeCorregirCodigo ? { codigoProceso: codigoNormalizado } : {}),
    },
  });

  if (debeCorregirCodigo) {
    await prisma.procesoNuevo
      .updateMany({
        where: { sourceKey },
        data: {
          codigoProceso: codigoNormalizado,
        },
      })
      .catch((err: unknown) => {
        console.warn(
          '[sync] no se pudo corregir codigoProceso en ProcesoNuevo',
          sourceKey,
          err instanceof Error ? err.message : err
        );
      });

    metrics.actualizados++;

    console.log('[sync] codigoProceso corregido', {
      sourceKey,
      anterior: codigoExistente || null,
      nuevo: codigoNormalizado,
    });

    await recalcularTotalesProceso(existing.id);

    return;
  }

  await recalcularTotalesProceso(existing.id);

  if (docsInsertados > 0 || cronoCambio) {
    metrics.actualizados++;
    return;
  }

  metrics.sinCambios++;
  metrics.ignorados++;

  console.log('[sync] proceso sin cambios', codigoProceso);
}

export async function sincronizarProcesos(params?: {
  maxResultados?: number;
  limitPorPagina?: number;
}): Promise<SyncMetrics> {
  const inicio = Date.now();

  const metrics: SyncMetrics = {
    ok: false,
    totalApi: 0,
    paginasConsultadas: 0,
    recibidos: 0,
    creados: 0,
    actualizados: 0,
    sinCambios: 0,
    ignorados: 0,
    nuevosRegistrados: 0,
    cambiosEstado: 0,
    cambiosFechaCierre: 0,
    cambiosValor: 0,
    documentosNuevos: 0,
    cronogramasActualizados: 0,
    errores: [],
    duracionMs: 0,
  };

  try {
    const maxResultados = params?.maxResultados ?? 3000;
    const limitPorPagina = params?.limitPorPagina ?? 30;

    const todosPerfiles = await liciGetPerfiles();
    const perfilesFiltrados = filtrarPerfilesObjetivo(todosPerfiles);

    if (perfilesFiltrados.length === 0) {
      metrics.errores.push('No se encontraron perfiles objetivo.');
      metrics.duracionMs = Date.now() - inicio;
      return metrics;
    }

    const paramsApi = {
      limit: limitPorPagina,
      camposAdicionales: 'fechas,documentos,fuentes',
      ascending: 0 as const,
    };

    const acumulados: LiciProcesoRaw[] = [];

    for (const perfil of perfilesFiltrados) {
      const perfilStr = String(perfil.id_perfil);
      const nombrePerfil = String(perfil.nombre_perfil).toLowerCase();
      let pag = 1;

      while (true) {
        try {
          const resp = (await liciGetProcesos({
            ...paramsApi,
            perfiles: perfilStr,
            page: pag,
          })) as Record<string, unknown>;

          const lote = extraerLote(resp);

          if (pag === 1) {
            metrics.totalApi += extraerTotal(resp, lote.length);
          }

          const etiquetados = lote.map((item) => ({
            ...item,
            _perfil: nombrePerfil,
          }));

          acumulados.push(...etiquetados);
          metrics.paginasConsultadas++;

          if (
            lote.length < paramsApi.limit ||
            pag >= 100 ||
            acumulados.length >= maxResultados
          ) {
            break;
          }

          pag++;
          await sleep(350);
        } catch (err) {
          const msg = `Perfil ${nombrePerfil} pág ${pag}: ${
            err instanceof Error ? err.message : String(err)
          }`;

          metrics.errores.push(msg);
          console.error('[sync]', msg);

          break;
        }
      }

      if (acumulados.length >= maxResultados) break;
    }

    const procesosRaw = acumulados.slice(0, maxResultados);

    metrics.recibidos = procesosRaw.length;

    for (const raw of procesosRaw) {
      try {
        await upsertProceso(raw, metrics);
      } catch (err) {
        const msg = `Proceso: ${err instanceof Error ? err.message : String(err)}`;
        metrics.errores.push(msg);
        console.warn('[sync] error proceso', msg);
      }
    }

    metrics.ok = metrics.errores.length === 0;
    metrics.duracionMs = Date.now() - inicio;

    return metrics;
  } catch (err) {
    metrics.errores.push(err instanceof Error ? err.message : String(err));
    metrics.ok = false;
    metrics.duracionMs = Date.now() - inicio;

    return metrics;
  }
}