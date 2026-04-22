import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

function parseIntSafe(v: string | null, fb: number) {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isNaN(n) ? fb : n;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseIntSafe(searchParams.get('page'), 1));
    const limit = Math.min(100, Math.max(1, parseIntSafe(searchParams.get('limit'), 30)));
    const filtro = searchParams.get('filtro') ?? 'hoy';
    const desde = searchParams.get('desde') ?? null;
    const hasta = searchParams.get('hasta') ?? null;
    const perfil = searchParams.get('perfil') ?? null;
    const fuente = searchParams.get('fuente') ?? null;

    const now = new Date();

    let fechaDesde: Date | undefined;
    let fechaHasta: Date | undefined;

    if (filtro === 'hoy') {
      fechaDesde = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      fechaHasta = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (filtro === 'ayer') {
      const ayer = new Date(now);
      ayer.setDate(ayer.getDate() - 1);
      fechaDesde = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate(), 0, 0, 0);
      fechaHasta = new Date(ayer.getFullYear(), ayer.getMonth(), ayer.getDate(), 23, 59, 59);
    } else if (filtro === 'semana') {
      fechaDesde = new Date(now);
      fechaDesde.setDate(fechaDesde.getDate() - 6);
      fechaDesde.setHours(0, 0, 0, 0);
      fechaHasta = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (filtro === 'rango' && desde) {
      fechaDesde = new Date(`${desde}T00:00:00`);
      fechaHasta = hasta
        ? new Date(`${hasta}T23:59:59`)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    }

    const where: Record<string, unknown> = {};

    if (fechaDesde || fechaHasta) {
      where.fechaDeteccion = {
        ...(fechaDesde ? { gte: fechaDesde } : {}),
        ...(fechaHasta ? { lte: fechaHasta } : {}),
      };
    }

    if (perfil) {
      where.perfil = { contains: perfil, mode: 'insensitive' };
    }

    if (fuente) {
      where.aliasFuente = fuente.toUpperCase();
    }

    const [total, registros] = await Promise.all([
      prisma.procesoNuevo.count({ where }),
      prisma.procesoNuevo.findMany({
        where,
        orderBy: { fechaDeteccion: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const procesos = registros.map((r: any) => ({
      ...r,
      valor: r.valor != null ? Number(r.valor) : null,
      fechaPublicacion: r.fechaPublicacion?.toISOString() ?? null,
      fechaVencimiento: r.fechaVencimiento?.toISOString() ?? null,
      fechaDeteccion: r.fechaDeteccion?.toISOString() ?? null,
    }));

    return NextResponse.json({
      ok: true,
      count: procesos.length,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      procesos,
    });
  } catch (err) {
    console.error('[GET /api/procesos/nuevos]', err);
    return NextResponse.json(
      {
        ok: false,
        count: 0,
        total: 0,
        page: 1,
        limit: 30,
        totalPages: 1,
        procesos: [],
        error: err instanceof Error ? err.message : 'Error interno',
      },
      { status: 500 }
    );
  }
}