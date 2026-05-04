import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function parseIntSafe(v: string | null, fb: number) {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isNaN(n) ? fb : n;
}

function str(v: unknown, fb = '') {
  return v != null ? String(v) : fb;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDecimal(v: unknown): number | null {
  if (v == null || v === '') return null;

  if (typeof v === 'number') {
    return Number.isNaN(v) ? null : v;
  }

  const limpio = String(v).replace(/[^0-9.-]/g, '');
  const n = Number(limpio);

  return Number.isNaN(n) ? null : n;
}

function normalizarOrigenSolicitud(v: unknown): 'Comercial' | 'Especializada' {
  const valor = str(v).trim().toLowerCase();

  if (valor.includes('especial')) {
    return 'Especializada';
  }

  return 'Comercial';
}

function serializeSolicitud(s: Record<string, unknown>) {
  return {
    ...s,
    valor: s.valor != null ? Number(s.valor) : null,

    fechaPublicacion:
      s.fechaPublicacion instanceof Date
        ? s.fechaPublicacion.toISOString()
        : (s.fechaPublicacion ?? null),

    fechaVencimiento:
      s.fechaVencimiento instanceof Date
        ? s.fechaVencimiento.toISOString()
        : (s.fechaVencimiento ?? null),

    fechaCierre:
      s.fechaCierre instanceof Date
        ? s.fechaCierre.toISOString()
        : (s.fechaCierre ?? null),

    fechaAperturaSqr:
      s.fechaAperturaSqr instanceof Date
        ? s.fechaAperturaSqr.toISOString()
        : (s.fechaAperturaSqr ?? null),

    fechaCierreSqr:
      s.fechaCierreSqr instanceof Date
        ? s.fechaCierreSqr.toISOString()
        : (s.fechaCierreSqr ?? null),

    createdAt:
      s.createdAt instanceof Date
        ? s.createdAt.toISOString()
        : s.createdAt,

    updatedAt:
      s.updatedAt instanceof Date
        ? s.updatedAt.toISOString()
        : s.updatedAt,
  };
}

function normalizarModalidad(modalidad: string | null): string {
  const valor = str(modalidad).trim();

  const mapa: Record<string, string> = {
    '1': 'Contratación directa',
    '2': 'Licitación pública',
    '3': 'Selección abreviada',
    '4': 'Concurso de méritos',
    '5': 'Mínima cuantía',
    '6': 'Régimen especial',
  };

  return mapa[valor] ?? (valor || 'No informada');
}

function buildSqrDescripcion(solicitud: {
  entidad: string | null;
  codigoProceso: string | null;
  objeto: string | null;
  fuente: string | null;
  modalidad: string | null;
  perfil: string | null;
  departamento: string | null;
  linkDetalle: string | null;
  usuarioRegistro: string | null;
}) {
  const modalidadLegible = normalizarModalidad(solicitud.modalidad);

  return (
    `Se registra solicitud asociada al proceso ${str(solicitud.codigoProceso, 'No informado')}, ` +
    `correspondiente a la entidad ${str(solicitud.entidad, 'No informada')}, ` +
    `bajo la modalidad ${modalidadLegible} ` +
    `y gestionado a través de ${str(solicitud.fuente, 'No informada')}.` +
    `\n\n` +
    `El requerimiento identificado corresponde a lo siguiente: ${str(solicitud.objeto, 'No informado')}.` +
    `\n\n` +
    `Este proceso se encuentra asociado a la entidad ${str(solicitud.perfil, 'No informada')} ` +
    `y a la ubicación ${str(solicitud.departamento, 'No informada')}. ` +
    `Para ampliar la información y consultar el detalle completo, se dispone del siguiente enlace: ${str(solicitud.linkDetalle, 'No informado')}.` +
    `\n\n` +
    `Registro generado automáticamente desde Licycolba por ${str(solicitud.usuarioRegistro, 'No informado')}, ` +
    `para su respectiva gestión y trazabilidad en SQR.`
  );
}

function buildObservacionCierreSqr(params: {
  codigoProceso: string | null;
  entidad: string | null;
  resultadoFinal: string | null;
  causalCierre: string | null;
  usuarioRegistro: string | null;
}) {
  return (
    `Se realiza cierre de la SQR asociada al proceso ${str(params.codigoProceso, 'No informado')}, ` +
    `correspondiente a la entidad ${str(params.entidad, 'No informada')}. ` +
    `El resultado final del proceso es ${str(params.resultadoFinal, 'No informado')} ` +
    `y la causal de cierre registrada corresponde a ${str(params.causalCierre, 'No informada')}. ` +
    `Cierre gestionado desde Licycolba por ${str(params.usuarioRegistro, 'No informado')}.`
  );
}

function extraerNumeroSqrDesdeUnknown(parsed: unknown): string | null {
  if (typeof parsed === 'number') {
    return String(parsed).trim();
  }

  if (typeof parsed === 'string') {
    const limpio = parsed.trim();

    if (/^\d+$/.test(limpio)) {
      return limpio;
    }

    const match = limpio.match(/\d+/);
    if (match) {
      return match[0];
    }

    return null;
  }

  if (parsed && typeof parsed === 'object') {
    const p = parsed as Record<string, unknown>;

    const candidatoDirecto =
      p.novedad_id ??
      p.sqr ??
      p.numero ??
      p.id ??
      p.consecutivo ??
      p.novedad ??
      p.result ??
      p.codigo ??
      p.message ??
      p.mensaje;

    const directo = extraerNumeroSqrDesdeUnknown(candidatoDirecto);
    if (directo) return directo;

    if (p.data != null) {
      const desdeData = extraerNumeroSqrDesdeUnknown(p.data);
      if (desdeData) return desdeData;
    }

    if (p.payload != null) {
      const desdePayload = extraerNumeroSqrDesdeUnknown(p.payload);
      if (desdePayload) return desdePayload;
    }
  }

  return null;
}

async function abrirSqr(objeto: string): Promise<string> {
  const resp = await fetch('http://grupocolba.com/service/public/api/sqr', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ objeto }),
    cache: 'no-store',
  });

  const rawText = await resp.text();

  if (!resp.ok) {
    throw new Error(rawText || `Error HTTP ${resp.status} al crear SQR`);
  }

  let parsed: unknown = rawText;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = rawText;
  }

  console.log('RESPUESTA RAW SQR:', rawText);
  console.log('RESPUESTA PARSEADA SQR:', parsed);

  const sqrNumero = extraerNumeroSqrDesdeUnknown(parsed);

  if (sqrNumero) {
    return sqrNumero;
  }

  throw new Error(
    `La API SQR respondió sin un número de SQR reconocible. Respuesta: ${rawText}`
  );
}

async function cerrarSqr(
  novedadId: string | number,
  observacion: string
): Promise<void> {
  const resp = await fetch('http://grupocolba.com/service/public/api/sqr/cerrar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      novedad_id: Number(novedadId),
      observacion,
    }),
    cache: 'no-store',
  });

  const rawText = await resp.text();

  if (!resp.ok) {
    throw new Error(rawText || `Error HTTP ${resp.status} al cerrar SQR`);
  }

  let parsed: unknown = rawText;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = rawText;
  }

  console.log('RESPUESTA RAW CIERRE SQR:', rawText);
  console.log('RESPUESTA PARSEADA CIERRE SQR:', parsed);
}

/* ── GET /api/solicitudes ─────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const estado = searchParams.get('estado')?.trim() ?? '';
    const origen = searchParams.get('origen')?.trim() ?? '';
    const page = Math.max(1, parseIntSafe(searchParams.get('page'), 1));
    const limit = Math.min(200, Math.max(1, parseIntSafe(searchParams.get('limit'), 50)));
    const q = searchParams.get('q')?.trim() ?? '';

    const where: Record<string, unknown> = {};

    if (estado) {
      where.estadoSolicitud = estado;
    }

    if (origen) {
      where.origenSolicitud = normalizarOrigenSolicitud(origen);
    }

    if (q) {
      where.OR = [
        { codigoProceso: { contains: q, mode: 'insensitive' } },
        { entidad: { contains: q, mode: 'insensitive' } },
        { objeto: { contains: q, mode: 'insensitive' } },
        { perfil: { contains: q, mode: 'insensitive' } },
        { departamento: { contains: q, mode: 'insensitive' } },
        { usuarioRegistro: { contains: q, mode: 'insensitive' } },
        { sqrNumero: { contains: q, mode: 'insensitive' } },
        { origenSolicitud: { contains: q, mode: 'insensitive' } },
        { nitContacto: { contains: q, mode: 'insensitive' } },
        { personaContacto: { contains: q, mode: 'insensitive' } },
        { telefonoContacto: { contains: q, mode: 'insensitive' } },
        { correoContacto: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, registros] = await Promise.all([
      prisma.solicitud.count({ where }),
      prisma.solicitud.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      total,
      page,
      limit,
      solicitudes: registros.map((s: unknown) =>
        serializeSolicitud(s as Record<string, unknown>)
      ),
    });
  } catch (err) {
    console.error('[GET /api/solicitudes]', err);

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}

/* ── POST /api/solicitudes ────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      procesoId,
      externalId,
      codigoProceso,
      nombreProceso,
      entidad,
      objeto,
      fuente,
      aliasFuente,
      modalidad,
      perfil,
      departamento,
      estadoFuente,
      fechaPublicacion,
      fechaVencimiento,
      valor,
      linkDetalle,
      linkSecop,
      linkSecopReg,
      ciudad,
      sede,
      plataforma,
      origenSolicitud,

      nitContacto,
      personaContacto,
      telefonoContacto,
      direccionContacto,
      correoContacto,

      fechaCierre,
      procStep,
      procData,
      obsData,
      docData,
      asignaciones,
      revisor,
      aprobador,
      estadoSolicitud,
      observacion,
      usuarioRegistro,
      emailRegistro,
      cargoRegistro,
      entidadRegistro,
    } = body;

    if (!codigoProceso) {
      return NextResponse.json(
        { ok: false, error: 'codigoProceso es requerido' },
        { status: 400 }
      );
    }

    const procesoSourceKey = `${str(codigoProceso).trim()}||${str(aliasFuente).toUpperCase()}`;

    const plataformaFinal =
      plataforma ||
      (str(aliasFuente).toUpperCase() === 'S2'
        ? 'SECOP II'
        : str(aliasFuente).toUpperCase() === 'S1'
          ? 'SECOP I'
          : '');

    const origenSolicitudFinal = normalizarOrigenSolicitud(origenSolicitud);

    const solicitud = await prisma.solicitud.create({
      data: {
        procesoId: procesoId ? Number(procesoId) : null,
        procesoSourceKey,
        externalId: externalId != null ? str(externalId) : null,
        codigoProceso: str(codigoProceso),
        nombreProceso: str(nombreProceso),
        entidad: str(entidad),
        objeto: str(objeto),
        fuente: str(fuente),
        aliasFuente: str(aliasFuente),
        modalidad: str(modalidad),
        perfil: str(perfil),
        departamento: str(departamento),
        estadoFuente: str(estadoFuente),
        fechaPublicacion: toDate(fechaPublicacion),
        fechaVencimiento: toDate(fechaVencimiento),
        valor: toDecimal(valor),
        linkDetalle: str(linkDetalle),
        linkSecop: str(linkSecop),
        linkSecopReg: str(linkSecopReg),
        ciudad: str(ciudad) || str(departamento).split(':').pop()?.trim() || '',
        sede: str(sede),
        plataforma: plataformaFinal,

        origenSolicitud: origenSolicitudFinal,

        nitContacto: str(nitContacto) || null,
        personaContacto: str(personaContacto) || null,
        telefonoContacto: str(telefonoContacto) || null,
        direccionContacto: str(direccionContacto) || null,
        correoContacto: str(correoContacto) || null,

        fechaCierre: toDate(fechaCierre),
        procStep: procStep != null ? Number(procStep) : 0,
        procData: procData ?? {},
        obsData: obsData ?? [],
        docData: docData ?? [],
        asignaciones: asignaciones ?? [],
        revisor: str(revisor),
        aprobador: str(aprobador),
        estadoSolicitud: str(estadoSolicitud) || 'En revisión',
        observacion: observacion ? str(observacion) : null,
        usuarioRegistro: str(usuarioRegistro),
        emailRegistro: str(emailRegistro),
        cargoRegistro: str(cargoRegistro),
        entidadRegistro: str(entidadRegistro),

        sqrNumero: null,
        sqrCreada: false,
        sqrCerrada: false,
        sqrError: null,
        fechaAperturaSqr: null,
        fechaCierreSqr: null,
        resultadoFinal: null,
        causalCierre: null,
      },
    });

    let sqrNumero: string | null = null;
    let sqrCreada = false;
    let sqrError: string | null = null;

    try {
      const descripcionSqr = buildSqrDescripcion({
        entidad: solicitud.entidad,
        codigoProceso: solicitud.codigoProceso,
        objeto: solicitud.objeto,
        fuente: solicitud.fuente,
        modalidad: solicitud.modalidad,
        perfil: solicitud.perfil,
        departamento: solicitud.departamento,
        linkDetalle: solicitud.linkDetalle,
        usuarioRegistro: solicitud.usuarioRegistro,
      });

      sqrNumero = await abrirSqr(descripcionSqr);
      sqrCreada = true;

      await prisma.solicitud.update({
        where: { id: solicitud.id },
        data: {
          sqrNumero,
          sqrCreada: true,
          sqrCerrada: false,
          sqrError: null,
          fechaAperturaSqr: new Date(),
        },
      });
    } catch (e) {
      sqrError =
        e instanceof Error ? e.message : 'Error desconocido al crear la SQR';

      console.error('[POST /api/solicitudes][SQR]', sqrError);

      await prisma.solicitud.update({
        where: { id: solicitud.id },
        data: {
          sqrNumero: null,
          sqrCreada: false,
          sqrCerrada: false,
          sqrError,
          fechaAperturaSqr: null,
        },
      });
    }

    const solicitudFinal = await prisma.solicitud.findUnique({
      where: { id: solicitud.id },
    });

    return NextResponse.json(
      {
        ok: true,
        solicitud: serializeSolicitud(
          (solicitudFinal ?? solicitud) as unknown as Record<string, unknown>
        ),
        sqrNumero,
        sqrCreada,
        sqrError,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/solicitudes]', err);

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}

/* ── PATCH /api/solicitudes ───────────────────────────────────────────────── */

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      id,
      entidad,
      objeto,
      modalidad,
      perfil,
      ciudad,
      plataforma,
      fechaCierre,
      estadoSolicitud,
      origenSolicitud,

      nitContacto,
      personaContacto,
      telefonoContacto,
      direccionContacto,
      correoContacto,

      procStep,
      procData,
      revisor,
      aprobador,
      asignaciones,
      obsData,
      docData,
      observacion,
      resultadoFinal,
      causalCierre,
      sqrCerrada,
      sqrError,
      fechaCierreSqr,
    } = body;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'id es requerido' },
        { status: 400 }
      );
    }

    const solicitudActual = await prisma.solicitud.findUnique({
      where: { id: Number(id) },
    });

    if (!solicitudActual) {
      return NextResponse.json(
        { ok: false, error: 'Solicitud no encontrada' },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (entidad != null) data.entidad = str(entidad);
    if (objeto != null) data.objeto = str(objeto);
    if (modalidad != null) data.modalidad = str(modalidad);
    if (perfil != null) data.perfil = str(perfil);
    if (ciudad != null) data.ciudad = str(ciudad);
    if (plataforma != null) data.plataforma = str(plataforma);
    if (fechaCierre != null) data.fechaCierre = toDate(fechaCierre);
    if (estadoSolicitud) data.estadoSolicitud = str(estadoSolicitud);
    if (origenSolicitud != null) data.origenSolicitud = normalizarOrigenSolicitud(origenSolicitud);

    if (nitContacto !== undefined) data.nitContacto = str(nitContacto) || null;
    if (personaContacto !== undefined) data.personaContacto = str(personaContacto) || null;
    if (telefonoContacto !== undefined) data.telefonoContacto = str(telefonoContacto) || null;
    if (direccionContacto !== undefined) data.direccionContacto = str(direccionContacto) || null;
    if (correoContacto !== undefined) data.correoContacto = str(correoContacto) || null;

    if (procStep != null) data.procStep = Number(procStep);
    if (procData != null) data.procData = procData;
    if (revisor != null) data.revisor = str(revisor);
    if (aprobador != null) data.aprobador = str(aprobador);
    if (asignaciones != null) data.asignaciones = asignaciones;
    if (obsData != null) data.obsData = obsData;
    if (docData != null) data.docData = docData;
    if (observacion != null) data.observacion = str(observacion);
    if (resultadoFinal != null) data.resultadoFinal = str(resultadoFinal);
    if (causalCierre != null) data.causalCierre = str(causalCierre);
    if (sqrCerrada != null) data.sqrCerrada = Boolean(sqrCerrada);
    if (sqrError != null) data.sqrError = str(sqrError);
    if (fechaCierreSqr != null) data.fechaCierreSqr = toDate(fechaCierreSqr);

    let updated = await prisma.solicitud.update({
      where: { id: Number(id) },
      data,
    });

    const estadoFinalEvaluado = str(estadoSolicitud ?? updated.estadoSolicitud);
    const resultadoFinalEvaluado = str(resultadoFinal ?? updated.resultadoFinal);
    const causalCierreEvaluada = str(causalCierre ?? updated.causalCierre);

    const debeCerrarSqr =
      (
        estadoFinalEvaluado === 'En observación' &&
        resultadoFinalEvaluado === 'No favorable'
      ) ||
      (
        estadoFinalEvaluado === 'Cerrada' &&
        ['Adjudicada', 'No adjudicada'].includes(resultadoFinalEvaluado)
      );

    const puedeCerrarSqr =
      debeCerrarSqr &&
      !!updated.sqrNumero &&
      !updated.sqrCerrada;

    if (puedeCerrarSqr) {
      try {
        const observacionCierre = buildObservacionCierreSqr({
          codigoProceso: updated.codigoProceso,
          entidad: updated.entidad,
          resultadoFinal: resultadoFinalEvaluado,
          causalCierre: causalCierreEvaluada,
          usuarioRegistro: updated.usuarioRegistro,
        });

        const sqrNumero = updated.sqrNumero;

        if (!sqrNumero) {
          throw new Error('La solicitud no tiene SQR para cerrar.');
        }

        await cerrarSqr(sqrNumero, observacionCierre);

        updated = await prisma.solicitud.update({
          where: { id: updated.id },
          data: {
            sqrCerrada: true,
            fechaCierreSqr: new Date(),
            sqrError: null,
          },
        });
      } catch (e) {
        const errorCierre =
          e instanceof Error ? e.message : 'Error desconocido al cerrar la SQR';

        updated = await prisma.solicitud.update({
          where: { id: updated.id },
          data: {
            sqrCerrada: false,
            sqrError: errorCierre,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      solicitud: serializeSolicitud(updated as unknown as Record<string, unknown>),
    });
  } catch (err) {
    console.error('[PATCH /api/solicitudes]', err);

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}

/* ── DELETE /api/solicitudes ──────────────────────────────────────────────── */

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      ids,
      deletedByUsuario,
      deletedByEmail,
    } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'ids es requerido' },
        { status: 400 }
      );
    }

    const idsNumericos = ids.map(Number).filter((n) => !Number.isNaN(n));

    const registros = await prisma.solicitud.findMany({
      where: {
        id: {
          in: idsNumericos,
        },
      },
    });

    if (registros.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No se encontraron registros' },
        { status: 404 }
      );
    }

    await prisma.deletedSolicitud.createMany({
      data: (registros as any[]).map((s) => ({
        originalId: s.id,

        procesoId: s.procesoId,
        procesoSourceKey: s.procesoSourceKey,
        externalId: s.externalId,
        codigoProceso: s.codigoProceso,
        nombreProceso: s.nombreProceso,
        entidad: s.entidad,
        objeto: s.objeto,
        fuente: s.fuente,
        aliasFuente: s.aliasFuente,
        modalidad: s.modalidad,
        perfil: s.perfil,
        departamento: s.departamento,
        estadoFuente: s.estadoFuente,
        fechaPublicacion: s.fechaPublicacion,
        fechaVencimiento: s.fechaVencimiento,
        valor: s.valor,
        linkDetalle: s.linkDetalle,
        linkSecop: s.linkSecop,
        linkSecopReg: s.linkSecopReg,
        estadoSolicitud: s.estadoSolicitud,
        observacion: s.observacion,
        ciudad: s.ciudad,
        sede: s.sede,
        plataforma: s.plataforma,
        fechaCierre: s.fechaCierre,

        origenSolicitud: s.origenSolicitud ?? 'Comercial',

        nitContacto: s.nitContacto,
        personaContacto: s.personaContacto,
        telefonoContacto: s.telefonoContacto,
        direccionContacto: s.direccionContacto,
        correoContacto: s.correoContacto,

        procStep: s.procStep,
        procData: s.procData,
        obsData: s.obsData,
        docData: s.docData,
        asignaciones: s.asignaciones,
        revisor: s.revisor,
        aprobador: s.aprobador,
        usuarioRegistro: s.usuarioRegistro,
        emailRegistro: s.emailRegistro,
        cargoRegistro: s.cargoRegistro,
        entidadRegistro: s.entidadRegistro,

        sqrNumero: s.sqrNumero,
        sqrCreada: s.sqrCreada,
        sqrCerrada: s.sqrCerrada,
        sqrError: s.sqrError,
        fechaAperturaSqr: s.fechaAperturaSqr,
        fechaCierreSqr: s.fechaCierreSqr,
        resultadoFinal: s.resultadoFinal,
        causalCierre: s.causalCierre,

        createdAt: s.createdAt,
        updatedAt: s.updatedAt,

        deletedByUsuario: str(deletedByUsuario),
        deletedByEmail: str(deletedByEmail),
      })),
    });

    await prisma.solicitud.deleteMany({
      where: {
        id: {
          in: idsNumericos,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      deleted: registros.length,
    });
  } catch (err) {
    console.error('[DELETE /api/solicitudes]', err);

    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}