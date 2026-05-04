import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const dbId = Number(id);
    if (isNaN(dbId) || dbId <= 0) {
      return NextResponse.json({ ok: false, error: 'ID inválido.' }, { status: 400 });
    }

    const solicitud = await prisma.solicitud.findUnique({
      where: { id: dbId },
    });

    if (!solicitud) {
      return NextResponse.json({ ok: false, error: 'No encontrada.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, solicitud });
  } catch (error) {
    console.error('[GET /api/solicitudes/[id]]', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Error.' },
      { status: 500 }
    );
  }
}