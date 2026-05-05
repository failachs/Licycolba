import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function parseIntSafe(v: string | null, fallback: number) {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isNaN(n) ? fallback : n;
}

function normalizarTexto(valor: string) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toArr(raw: string | null | undefined): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'all');
}

function modalidadCondition(mod: string) {
  const m = normalizarTexto(mod);

  if (m.includes('minima')) {
    return {
      OR: [
        { modalidad: { contains: mod, mode: 'insensitive' } },
        { nombre: { contains: 'cuant', mode: 'insensitive' } },
      ],
    };
  }

  if (m.includes('licitaci')) {
    return {
      OR: [
        { modalidad: { contains: mod, mode: 'insensitive' } },
        { nombre: { startsWith: 'Licitaci', mode: 'insensitive' } },
      ],
    };
  }

  if (m.includes('seleccion')) {
    return {
      OR: [
        { modalidad: { contains: mod, mode: 'insensitive' } },
        { nombre: { startsWith: 'Selecci', mode: 'insensitive' } },
      ],
    };
  }

  if (m.includes('directa')) {
    return {
      OR: [
        { modalidad: { contains: mod, mode: 'insensitive' } },
        { nombre: { startsWith: 'Contratación Directa', mode: 'insensitive' } },
        { nombre: { contains: 'CONTRATACION DIRECTA', mode: 'insensitive' } },
      ],
    };
  }

  if (m.includes('meritos')) {
    return {
      OR: [
        { modalidad: { contains: mod, mode: 'insensitive' } },
        { nombre: { startsWith: 'Concurso', mode: 'insensitive' } },
      ],
    };
  }

  if (m.includes('subasta')) {
    return {
      OR: [
        { modalidad: { contains: mod, mode: 'insensitive' } },
        { nombre: { startsWith: 'Subasta', mode: 'insensitive' } },
      ],
    };
  }

  if (m.includes('especial')) {
    return {
      OR: [
        { modalidad: { contains: mod, mode: 'insensitive' } },
        { nombre: { startsWith: 'Régimen', mode: 'insensitive' } },
      ],
    };
  }

  return {
    OR: [
      { modalidad: { contains: mod, mode: 'insensitive' } },
      { nombre: { contains: mod, mode: 'insensitive' } },
    ],
  };
}

function fuenteCondition(f: string) {
  const fl = normalizarTexto(f);

  if (fl.includes('secop ii')) {
    return { aliasFuente: { equals: 'S2' } };
  }

  if (fl.includes('secop i')) {
    return { aliasFuente: { equals: 'S1' } };
  }

  if (fl.includes('no centralizado') || fl.includes('no centralizado')) {
    return { aliasFuente: { contains: 'NC', mode: 'insensitive' } };
  }

  if (fl.includes('contrato privado')) {
    return { aliasFuente: { contains: 'CP', mode: 'insensitive' } };
  }

  return {
    AND: [
      { aliasFuente: { not: 'S1' } },
      { aliasFuente: { not: 'S2' } },
    ],
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseIntSafe(searchParams.get('page'), 1));
    const limit = Math.min(100, Math.max(1, parseIntSafe(searchParams.get('limit'), 30)));

    /**
     * Búsqueda libre.
     * Soporta query, q y busqueda.
     */
    const query =
      searchParams.get('query')?.trim() ||
      searchParams.get('q')?.trim() ||
      searchParams.get('busqueda')?.trim() ||
      '';

    const fechaDesde = searchParams.get('fechaDesde')?.trim() ?? '';
    const fechaHasta = searchParams.get('fechaHasta')?.trim() ?? '';

    /**
     * Parámetros simples y múltiples.
     * Importante:
     * El frontend puede enviar:
     * perfil=aseocolba,vigicolba
     * perfiles=aseocolba,vigicolba
     *
     * departamento=Atlántico,Bolívar
     * dpto=Atlántico,Bolívar
     * dptos=Atlántico,Bolívar
     */
    const perfilParam =
      searchParams.get('perfiles') ||
      searchParams.get('perfil') ||
      searchParams.get('entidadGrupo') ||
      '';

    const fuenteParam =
      searchParams.get('fuentes') ||
      searchParams.get('fuente') ||
      searchParams.get('portal') ||
      '';

    const estadoParam =
      searchParams.get('estados') ||
      searchParams.get('estado') ||
      '';

    const modalidadParam =
      searchParams.get('modalidades') ||
      searchParams.get('modalidad') ||
      '';

    const departamentoParam =
      searchParams.get('departamentos') ||
      searchParams.get('departamento') ||
      searchParams.get('dptos') ||
      searchParams.get('dpto') ||
      '';

    const perfilesArr = toArr(perfilParam);
    const fuentesArr = toArr(fuenteParam);
    const estadosArr = toArr(estadoParam);
    const modalsArr = toArr(modalidadParam);
    const dptosArr = toArr(departamentoParam);

    const andConditions: Record<string, unknown>[] = [];

    /**
     * Query libre
     */
    if (query) {
      andConditions.push({
        OR: [
          { entidad: { contains: query, mode: 'insensitive' } },
          { objeto: { contains: query, mode: 'insensitive' } },
          { codigoProceso: { contains: query, mode: 'insensitive' } },
          { nombre: { contains: query, mode: 'insensitive' } },
          { departamento: { contains: query, mode: 'insensitive' } },
          { perfil: { contains: query, mode: 'insensitive' } },
        ],
      });
    }

    /**
     * Perfil múltiple.
     * Ejemplo:
     * perfil=aseocolba,vigicolba
     */
    if (perfilesArr.length > 0) {
      andConditions.push({
        OR: perfilesArr.map((p) => ({
          perfil: {
            contains: p,
            mode: 'insensitive',
          },
        })),
      });
    }

    /**
     * Fuente múltiple.
     * Ejemplo:
     * fuente=secop ii,no centralizado
     */
    if (fuentesArr.length > 0) {
      andConditions.push({
        OR: fuentesArr.map((f) => fuenteCondition(f)),
      });
    }

    /**
     * Departamento múltiple.
     * Tu campo viene compuesto, por ejemplo:
     * "Atlántico : Barranquilla; Bolívar : Cartagena de Indias"
     *
     * Por eso se usa contains.
     */
    if (dptosArr.length > 0) {
      andConditions.push({
        OR: dptosArr.map((d) => ({
          departamento: {
            contains: d,
            mode: 'insensitive',
          },
        })),
      });
    }

    /**
     * Estado múltiple.
     */
    if (estadosArr.length > 0) {
      andConditions.push({
        OR: estadosArr.map((e) => ({
          estadoFuente: {
            contains: e,
            mode: 'insensitive',
          },
        })),
      });
    }

    /**
     * Modalidad múltiple.
     */
    if (modalsArr.length > 0) {
      andConditions.push({
        OR: modalsArr.map((m) => modalidadCondition(m)),
      });
    }

    /**
     * Fechas
     */
    if (fechaDesde || fechaHasta) {
      andConditions.push({
        fechaPublicacion: {
          ...(fechaDesde ? { gte: new Date(`${fechaDesde}T00:00:00`) } : {}),
          ...(fechaHasta ? { lte: new Date(`${fechaHasta}T23:59:59`) } : {}),
        },
      });
    }

    const where: Record<string, unknown> =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [total, registros] = await Promise.all([
      prisma.proceso.count({ where }),
      prisma.proceso.findMany({
        where,
        orderBy: {
          fechaPublicacion: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          externalId: true,
          codigoProceso: true,
          nombre: true,
          entidad: true,
          objeto: true,
          fuente: true,
          aliasFuente: true,
          modalidad: true,
          perfil: true,
          departamento: true,
          estadoFuente: true,
          fechaPublicacion: true,
          fechaVencimiento: true,
          valor: true,
          linkDetalle: true,
          linkSecop: true,
          linkSecopReg: true,
          totalCronogramas: true,
          totalDocumentos: true,
          lastSyncedAt: true,
          rawJson: true,
        },
      }),
    ]);

    const procesos = registros.map((r: unknown) => {
      const row = r as Record<string, unknown>;

      let raw: Record<string, unknown> = {};

      try {
        raw = row.rawJson
          ? (JSON.parse(String(row.rawJson)) as Record<string, unknown>)
          : {};
      } catch {
        raw = {};
      }

      const rawDocs =
        Array.isArray(raw['documentos_proceso'])
          ? (raw['documentos_proceso'] as Record<string, unknown>[])
          : Array.isArray(raw['Documentos'])
            ? (raw['Documentos'] as Record<string, unknown>[])
            : Array.isArray(raw['documentos'])
              ? (raw['documentos'] as Record<string, unknown>[])
              : [];

      const documentos = rawDocs.map((d) => ({
        nombre: String(d['nombre'] ?? d['Nombre'] ?? ''),
        ruta: String(d['ruta'] ?? d['Ruta'] ?? d['url'] ?? d['Url'] ?? ''),
        url: String(d['ruta'] ?? d['Ruta'] ?? d['url'] ?? d['Url'] ?? ''),
      }));

      const rawCron =
        Array.isArray(raw['cronogramas'])
          ? (raw['cronogramas'] as Record<string, unknown>[])
          : Array.isArray(raw['Cronograma'])
            ? (raw['Cronograma'] as Record<string, unknown>[])
            : [];

      const cronogramas = rawCron.map((cr) => ({
        nombre: String(cr['label'] ?? cr['nombre'] ?? cr['Nombre'] ?? ''),
        fecha: String(cr['fecha'] ?? cr['Fecha'] ?? ''),
      }));

      return {
        id: row.externalId ? Number(row.externalId) : row.id,

        nombre: row.nombre ?? '',
        codigoProceso: row.codigoProceso ?? '',
        fuente: row.fuente ?? '',
        aliasFuente: row.aliasFuente ?? '',
        modalidad: row.modalidad ?? '',

        fechaPublicacion:
          row.fechaPublicacion instanceof Date
            ? row.fechaPublicacion.toISOString().replace('T', ' ').slice(0, 19)
            : row.fechaPublicacion ?? null,

        fechaVencimiento:
          row.fechaVencimiento instanceof Date
            ? row.fechaVencimiento.toISOString().replace('T', ' ').slice(0, 19)
            : row.fechaVencimiento ?? null,

        entidad: row.entidad ?? '',
        objeto: row.objeto ?? '',
        valor: row.valor != null ? Number(row.valor) : null,
        departamento: row.departamento ?? '',
        estado: row.estadoFuente ?? '',
        perfil: row.perfil ?? '',

        linkDetalle: row.linkDetalle ?? '',
        linkSecop: row.linkSecop ?? '',
        linkSecopReg: row.linkSecopReg ?? '',

        fuentes: [],

        totalCronogramas: row.totalCronogramas ?? 0,
        totalDocumentos: row.totalDocumentos ?? 0,

        cronogramas,
        documentos,

        _dbId: row.id,
        lastSyncedAt: row.lastSyncedAt ?? null,

        duracionContrato:
          raw['duracion_contrato'] ??
          raw['duracionContrato'] ??
          raw['Duracion_Contrato'] ??
          null,
      };
    });

    return NextResponse.json({
      ok: true,
      page,
      limit,
      total_resultados_api: total,
      total_resultados_filtrados: procesos.length,
      total_resultados_entregados: procesos.length,
      totalPages: Math.ceil(total / limit),
      procesos,
    });
  } catch (error) {
    console.error('[GET /api/procesos]', error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Error al consultar procesos.',
      },
      { status: 500 }
    );
  }
}