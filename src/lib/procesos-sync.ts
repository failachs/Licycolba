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
  ignorados: number;
  nuevosRegistrados: number;
  errores: string[];
  duracionMs: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function hashProceso(p: ReturnType<typeof normalizarProceso>): string {
  const campos = [
    p.id ?? '',
    p.codigoProceso ?? '',
    p.aliasFuente ?? '',
    p.nombre ?? '',
    p.entidad ?? '',
    p.objeto ?? '',
    p.estado ?? '',
    p.fechaPublicacion ?? '',
    p.fechaVencimiento ?? '',
    String(p.valor ?? ''),
    p.linkDetalle ?? '',
    p.linkSecop ?? '',
    p.linkSecopReg ?? '',
    String(p.totalDocumentos ?? 0),
    String(p.totalCronogramas ?? 0),
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
    const limpio = valor
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const n = Number(limpio);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function buildSourceKey(raw: LiciProcesoRaw, p: ReturnType<typeof normalizarProceso>) {
  const externalId = String(p.id ?? '').trim();
  if (externalId) return `ext:${externalId}`;

  const linkDetalle = String(p.linkDetalle ?? '').trim();
  if (linkDetalle) return `detalle:${linkDetalle}`;

  const linkSecop = String(p.linkSecop ?? '').trim();
  if (linkSecop) return `secop:${linkSecop}`;

  const linkSecopReg = String(p.linkSecopReg ?? '').trim();
  if (linkSecopReg) return `secopreg:${linkSecopReg}`;

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
    ignorados: 0,
    nuevosRegistrados: 0,
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
          const msg = `Perfil ${nombrePerfil} pág ${pag}: ${err instanceof Error ? err.message : String(err)}`;
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
        const p = normalizarProceso(raw);
        const sourceKey = buildSourceKey(raw, p);
        const hashContenido = hashProceso(p);

        const existing = await prisma.proceso.findUnique({
          where: { sourceKey },
          select: {
            id: true,
            hashContenido: true,
          },
        });

        const data = {
          sourceKey,
          externalId: p.id ? String(p.id) : null,
          codigoProceso: String(p.codigoProceso ?? '').trim() || null,
          nombre: p.nombre ?? null,
          entidad: p.entidad ?? null,
          objeto: p.objeto ?? null,
          fuente: p.fuente ?? null,
          aliasFuente: String(p.aliasFuente ?? '').trim().toUpperCase() || null,
          modalidad: p.modalidad ?? null,
          perfil: p.perfil ?? null,
          departamento: p.departamento ?? null,
          estadoFuente: p.estado ?? null,
          fechaPublicacion: parseFecha(p.fechaPublicacion),
          fechaVencimiento: parseFecha(p.fechaVencimiento),
          valor: parseValor(p.valor),
          linkDetalle: p.linkDetalle ?? null,
          linkSecop: p.linkSecop ?? null,
          linkSecopReg: p.linkSecopReg ?? null,
          totalCronogramas: p.totalCronogramas ?? 0,
          totalDocumentos: p.totalDocumentos ?? 0,
          rawJson: JSON.stringify(raw),
          hashContenido,
          lastSyncedAt: new Date(),
        };

        if (!existing) {
          // ── Proceso nuevo: crear en tabla principal ──────────────────
          const creado = await prisma.proceso.create({ data });
          metrics.creados++;

          // ── Registrar en ProcesoNuevo (sin duplicados por sourceKey) ──
          try {
            await prisma.procesoNuevo.upsert({
              where: { sourceKey },
              // Si ya existe un registro previo con este sourceKey
              // (edge case: proceso borrado y re-detectado), no sobreescribir
              // la fechaDeteccion original — se preserva la primera detección.
              update: {},
              create: {
                procesoId:        creado.id,
                sourceKey,
                codigoProceso:    data.codigoProceso,
                nombre:           data.nombre,
                entidad:          data.entidad,
                objeto:           data.objeto,
                fuente:           data.fuente,
                aliasFuente:      data.aliasFuente,
                modalidad:        data.modalidad,
                perfil:           data.perfil,
                departamento:     data.departamento,
                estadoFuente:     data.estadoFuente,
                fechaPublicacion: data.fechaPublicacion,
                fechaVencimiento: data.fechaVencimiento,
                valor:            data.valor,
                linkDetalle:      data.linkDetalle,
                linkSecop:        data.linkSecop,
                linkSecopReg:     data.linkSecopReg,
                fechaDeteccion:   new Date(), // momento exacto de detección
              },
            });
            metrics.nuevosRegistrados++;
          } catch (errNuevo) {
            // No interrumpir el sync si falla solo el registro auxiliar
            const msg = `ProcesoNuevo upsert (${sourceKey}): ${errNuevo instanceof Error ? errNuevo.message : String(errNuevo)}`;
            metrics.errores.push(msg);
            console.error('[sync][ProcesoNuevo]', msg);
          }

        } else if (existing.hashContenido !== hashContenido) {
          // ── Proceso existente con cambios: actualizar tabla principal ──
          await prisma.proceso.update({
            where: { id: existing.id },
            data,
          });
          metrics.actualizados++;

        } else {
          // ── Sin cambios: solo actualizar timestamp de sync ──
          await prisma.proceso.update({
            where: { id: existing.id },
            data: { lastSyncedAt: new Date() },
          });
          metrics.ignorados++;
        }
      } catch (err) {
        const msg = `Persistencia proceso: ${err instanceof Error ? err.message : String(err)}`;
        metrics.errores.push(msg);
        console.error('[sync]', msg);
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