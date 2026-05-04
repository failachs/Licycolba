/**
 * src/lib/procesos-sync.ts
 * Sincronización inteligente con Licitaciones.Info.
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function hashProceso(p: ReturnType<typeof normalizarProceso>): string {
  const campos = [
    p.codigoProceso ?? '',
    p.nombre ?? '',
    p.entidad ?? '',
    p.objeto ?? '',
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

function parseFecha(fecha?: string | null): Date | null {
  if (!fecha) return null;

  const parsed = new Date(String(fecha).replace(' ', 'T'));

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseValor(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;

  if (typeof valor === 'string') {
    const limpio = valor.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(limpio);

    return Number.isFinite(n) ? n : null;
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
 * Normaliza el código del proceso cuando la fuente no entrega identificador explícito.
 * Para procesos NC, el nombre funciona como identificador operativo cuando codigoProceso viene vacío.
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

  if (alias === 'NC' && nombre) {
    return nombre;
  }

  return null;
}

/**
 * Respeta el linkDetalle editado manualmente en base de datos.
 * Si ya existe un valor en BD, no se reemplaza por el valor de la API.
 */
function resolverLinkDetalle(
  enBD: string | null | undefined,
  deAPI: string | null | undefined
): string | null {
  const bdVal = (enBD ?? '').trim();
  if (bdVal) return bdVal;

  const apiVal = (deAPI ?? '').trim();

  return apiVal || null;
}

async function sincronizarDocumentos(
  procesoId: number,
  codigoProceso: string | null,
  entidad: string | null,
  perfil: string | null,
  sourceKey: string,
  documentos: Array<{ nombre: string; ruta: string; url: string }>
): Promise<number> {
  let nuevos = 0;

  for (const doc of documentos) {
    const url = doc.url || doc.ruta || '';
    const nombre = doc.nombre || '';

    if (!url && !nombre) continue;

    try {
      const existing = await prisma.procesoDocumentoSecop.findFirst({
        where: {
          procesoId,
          OR: [
            ...(url ? [{ urlDocumento: url }] : []),
            ...(nombre ? [{ nombre }] : []),
          ],
        },
      });

      if (!existing) {
        const nuevo = await prisma.procesoDocumentoSecop.create({
          data: {
            procesoId,
            nombre: nombre || 'Sin nombre',
            urlDocumento: url || null,
            fechaDetectado: new Date(),
          },
        });

        nuevos++;

        console.log('[sync] documento nuevo', codigoProceso, nombre);

        await prisma.notificacion.create({
          data: {
            tipo: 'documento_nuevo',
            titulo: 'Nuevo documento detectado',
            descripcion: `Se detectó un nuevo documento en el proceso ${codigoProceso ?? '—'}: ${nombre}.`,
            codigoProceso,
            procesoId,
            entidad,
            perfil,
            datos: {
              sourceKey,
              documentoId: nuevo.id,
              nombreDocumento: nombre,
              urlDocumento: url || null,
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

  return nuevos;
}

async function sincronizarCronograma(
  procesoId: number,
  codigoProceso: string | null,
  cronogramas: Array<{ nombre: string; fecha: string }>
): Promise<boolean> {
  if (cronogramas.length === 0) return false;

  try {
    const existentes = await prisma.procesoCronogramaSecop.findMany({
      where: { procesoId },
      select: { evento: true, valorTexto: true },
    });

    const hashExistente = crypto
      .createHash('md5')
      .update(JSON.stringify(existentes.map((e) => `${e.evento}|${e.valorTexto}`).sort()))
      .digest('hex');

    const hashNuevo = crypto
      .createHash('md5')
      .update(JSON.stringify(cronogramas.map((c) => `${c.nombre}|${c.fecha}`).sort()))
      .digest('hex');

    if (hashExistente === hashNuevo) return false;

    await prisma.procesoCronogramaSecop.deleteMany({ where: { procesoId } });

    await prisma.procesoCronogramaSecop.createMany({
      data: cronogramas.map((cr, i) => ({
        procesoId,
        evento: cr.nombre || `Etapa ${i + 1}`,
        valorTexto: cr.fecha || null,
        orden: i,
      })),
    });

    console.log('[sync] cronograma actualizado', codigoProceso);

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

  if (!existing) {
    const creado = await prisma.proceso.create({ data: dataBase });

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

    const docsNuevos = await sincronizarDocumentos(
      creado.id,
      codigoProceso,
      entidad,
      perfil,
      sourceKey,
      p.documentos
    );

    metrics.documentosNuevos += docsNuevos;

    if (p.cronogramas.length > 0) {
      await prisma.procesoCronogramaSecop.createMany({
        data: p.cronogramas.map((cr, i) => ({
          procesoId: creado.id,
          evento: cr.nombre || `Etapa ${i + 1}`,
          valorTexto: cr.fecha || null,
          orden: i,
        })),
      });
    }

    await prisma.proceso.update({
      where: { id: creado.id },
      data: {
        totalDocumentos: docsNuevos,
        totalCronogramas: p.cronogramas.length,
      },
    });

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
          datos: { sourceKey, estadoAnterior, estadoNuevo },
        },
      });
    }

    const fechaAnterior = existing.fechaVencimiento?.toISOString() ?? null;
    const fechaNueva = dataBase.fechaVencimiento?.toISOString() ?? null;

    if (fechaAnterior !== fechaNueva) {
      metrics.cambiosFechaCierre++;

      console.log('[sync] cambio fecha cierre', codigoProceso, fechaAnterior, fechaNueva);

      await prisma.notificacion.create({
        data: {
          tipo: 'cambio_fecha_cierre',
          titulo: 'Cambio de fecha de cierre',
          descripcion: `El proceso ${codigoProceso ?? '—'} cambió su fecha de vencimiento.`,
          codigoProceso,
          procesoId: existing.id,
          entidad,
          perfil,
          datos: { sourceKey, fechaAnterior, fechaNueva },
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
          datos: { sourceKey, valorAnterior, valorNuevo },
        },
      });
    }

    const docsNuevos = await sincronizarDocumentos(
      existing.id,
      codigoProceso,
      entidad,
      perfil,
      sourceKey,
      p.documentos
    );

    metrics.documentosNuevos += docsNuevos;

    const cronoCambio = await sincronizarCronograma(
      existing.id,
      codigoProceso,
      p.cronogramas
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
          datos: { sourceKey },
        },
      });
    }

    const totalDocs = await prisma.procesoDocumentoSecop.count({
      where: { procesoId: existing.id },
    });

    const totalCron = await prisma.procesoCronogramaSecop.count({
      where: { procesoId: existing.id },
    });

    await prisma.proceso.update({
      where: { id: existing.id },
      data: {
        totalDocumentos: totalDocs,
        totalCronogramas: totalCron,
      },
    });

    return;
  }

  const codigoExistente = String(existing.codigoProceso ?? '').trim();
  const codigoNormalizado = String(codigoProceso ?? '').trim();

  const debeCorregirCodigo = Boolean(
    codigoNormalizado && codigoExistente !== codigoNormalizado
  );

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
        data: { codigoProceso: codigoNormalizado },
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