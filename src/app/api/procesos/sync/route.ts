import { NextRequest, NextResponse } from 'next/server';
import { sincronizarProcesos } from '@/lib/procesos-sync';

type SyncBody = {
  maxResultados?: number;
  limitPorPagina?: number;
  silencioso?: boolean;
  auto?: boolean;
};

function toPositiveInt(value: unknown, fallback: number, max?: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const int = Math.floor(n);
  return typeof max === 'number' ? Math.min(int, max) : int;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as SyncBody;

    const esAuto = body?.silencioso === true || body?.auto === true;

    const maxResultadosDefault = esAuto ? 300 : 3000;
    const limitPorPaginaDefault = 30;

    const maxResultados = toPositiveInt(
      body?.maxResultados,
      maxResultadosDefault,
      5000
    );

    const limitPorPagina = toPositiveInt(
      body?.limitPorPagina,
      limitPorPaginaDefault,
      100
    );

    const metrics = await sincronizarProcesos({
      maxResultados,
      limitPorPagina,
    });

    return NextResponse.json(
      {
        ...metrics,
        modo: esAuto ? 'automatico' : 'manual',
        parametros: {
          maxResultados,
          limitPorPagina,
        },
      },
      {
        status: metrics.ok ? 200 : 500,
      }
    );
  } catch (error) {
    console.error('[POST /api/procesos/sync]', error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Error al sincronizar procesos.',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Usa POST para ejecutar la sincronización.',
    },
    { status: 405 }
  );
}