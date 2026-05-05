'use client';

import React, { useState, useMemo, useEffect } from 'react';

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Proceso = Record<string, any>;

export interface ProcesosCardsViewProps {
  procesos: Proceso[];
  loading?: boolean;
  error?: string | null;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtros?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setFiltros?: (value: any) => void;
  onBuscar?: () => void;
  onCambiarPagina?: (page: number) => void;
  onCambiarLimit?: (limit: number) => void;
  onGestionarProceso?: (proceso: Proceso) => void;
}

// ─────────────────────────────────────────────
// Helpers generales
// ─────────────────────────────────────────────
const getEntidad = (p: Proceso) =>
  p.entidad || p.cliente || p.nombreEntidad || p.entidadContratante || 'Entidad no disponible';

const getTitulo = (p: Proceso) =>
  p.titulo || p.nombre || p.nombreProceso || p.objeto || 'Proceso sin título';

const getObjeto = (p: Proceso) =>
  p.objeto || p.descripcion || p.resumen || p.detalle || 'Sin descripción disponible';

const getCiudad = (p: Proceso) => {
  const departamento = String(p.departamento || '').trim();

  if (p.ciudad || p.municipio) return p.ciudad || p.municipio;

  if (departamento.includes(';')) {
    return departamento.split(';')[0]?.split(':')[0]?.trim() || 'Ubicación no disponible';
  }

  if (departamento.includes(':')) {
    return departamento.split(':')[0]?.trim() || 'Ubicación no disponible';
  }

  return departamento || 'Ubicación no disponible';
};

const getFuente = (p: Proceso) =>
  p.fuente || p.portal || p.origen || p.aliasFuente || 'Fuente no disponible';

const getModalidad = (p: Proceso) => {
  const raw = p.modalidad || p.tipo || p.tipoProceso || p.modalidadContratacion || '';

  if (raw) return raw;

  const titulo = String(p.titulo || p.nombre || p.nombreProceso || p.objeto || '').toLowerCase();

  if (titulo.includes('licitación') || titulo.includes('licitacion')) return 'Licitación';
  if (titulo.includes('mínima cuantía') || titulo.includes('minima cuantia')) return 'Mínima cuantía';
  if (titulo.includes('selección abreviada') || titulo.includes('seleccion abreviada')) return 'Sel. abreviada';
  if (titulo.includes('concurso de méritos') || titulo.includes('concurso de meritos')) return 'Concurso méritos';
  if (titulo.includes('contratación directa') || titulo.includes('contratacion directa')) return 'Contrat. directa';
  if (titulo.includes('régimen especial') || titulo.includes('regimen especial')) return 'Régimen especial';
  if (titulo.includes('subasta')) return 'Subasta inversa';

  return '';
};

const getEstado = (p: Proceso) =>
  p.estado || p.estadoFuente || p.vigencia || 'Estado no disponible';

const getFechaCierre = (p: Proceso) =>
  p.fechaCierre ||
  p.fecha_cierre ||
  p.cierre ||
  p.fechaLimite ||
  p.fechaPresentacion ||
  p.fechaVencimiento ||
  null;

const getSiglas = (entidad: string) => {
  const words = entidad.split(/\s+/).filter(Boolean);

  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();

  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
};

const getDeadlineClass = (fechaStr: string | null): string => {
  if (!fechaStr) return '';

  try {
    const diff = new Date(fechaStr).getTime() - Date.now();
    const days = diff / (1000 * 60 * 60 * 24);

    if (days <= 3) return 'licy-proceso-deadline-red';
    if (days <= 14) return 'licy-proceso-deadline-amber';

    return 'licy-proceso-deadline-blue';
  } catch {
    return 'licy-proceso-deadline-blue';
  }
};

const formatFecha = (fechaStr: string | null): string => {
  if (!fechaStr) return '';

  try {
    const d = new Date(fechaStr);

    if (isNaN(d.getTime())) return fechaStr;

    const diff = d.getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return 'Vencido';
    if (days === 0) return 'Cierra hoy';
    if (days === 1) return 'Cierra mañana';

    return `Cierra en ${days} días`;
  } catch {
    return fechaStr;
  }
};

const getPortalTag = (fuente: string) => {
  const f = String(fuente || '').toUpperCase();

  if (f.includes('SECOP II') || f === 'S2') {
    return { label: 'S2', cls: 'licy-proceso-tag-s2' };
  }

  if (f.includes('SECOP I') || f === 'S1') {
    return { label: 'S1', cls: 'licy-proceso-tag-s1' };
  }

  if (f.includes('PRIVADO') || f.includes('PRIV')) {
    return { label: 'Priv.', cls: 'licy-proceso-tag-priv' };
  }

  return { label: f.slice(0, 6) || 'NC', cls: 'licy-proceso-tag-otro' };
};

const normalizarTextoFiltro = (valor: string) =>
  String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

// ─────────────────────────────────────────────
// Estilos reutilizables
// ─────────────────────────────────────────────
const labelStyleBase: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#374151',
  display: 'block',
  marginBottom: 8,
  letterSpacing: 0.2,
};

const inputStyleBase: React.CSSProperties = {
  width: '100%',
  height: 36,
  border: '1.5px solid #e2e8f0',
  borderRadius: 8,
  padding: '0 10px',
  fontSize: 13,
  color: '#1e293b',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'var(--font, system-ui)',
};

// ─────────────────────────────────────────────
// Opciones del panel
// ─────────────────────────────────────────────
const PERFILES_OPTS = ['aseocolba', 'vigicolba', 'tempocolba'];

const FUENTES_OPTS = ['secop ii', 'secop i', 'no centralizado', 'contrato privado'];

const MODALIDADES_OPTS = [
  'Licitación pública',
  'Mínima cuantía',
  'Selección abreviada',
  'Contratación directa',
  'Concurso de méritos',
  'Subasta inversa',
  'Régimen especial',
];

const ESTADOS_OPTS = [
  'Convocatoria',
  'En Evaluacion',
  'Adjudicado',
  'Liquidado',
  'Terminado Anormalmente O Descartado',
  'No Aplica',
];

const FUENTES_LABEL: Record<string, string> = {
  'secop ii': 'SECOP II',
  'secop i': 'SECOP I',
  'no centralizado': 'No Centralizado',
  'contrato privado': 'Contrato Privado',
};

// ─────────────────────────────────────────────
// Panel de Filtros Avanzados
// ─────────────────────────────────────────────
interface FiltrosPanelProps {
  abierto: boolean;
  onCerrar: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtros: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setFiltros: (v: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAplicar: (filtros?: any) => void;
  onLimpiar: () => void;
}

function ChipGroup({
  opciones,
  seleccionados,
  onChange,
  labelMap,
}: {
  opciones: string[];
  seleccionados: string[];
  onChange: (vals: string[]) => void;
  labelMap?: Record<string, string>;
}) {
  const toggle = (v: string) => {
    if (seleccionados.includes(v)) {
      onChange(seleccionados.filter((x) => x !== v));
    } else {
      onChange([...seleccionados, v]);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {opciones.map((op) => {
        const activo = seleccionados.includes(op);

        return (
          <button
            key={op}
            type="button"
            onClick={() => toggle(op)}
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 999,
              border: activo ? 'none' : '1.5px solid #e2e8f0',
              background: activo ? '#0d2d5e' : 'white',
              color: activo ? 'white' : '#374151',
              fontSize: 12,
              fontWeight: activo ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'var(--font, system-ui)',
              transition: 'all .15s',
            }}
          >
            {labelMap?.[op] ?? op.charAt(0).toUpperCase() + op.slice(1)}
          </button>
        );
      })}
    </div>
  );
}

function FiltrosPanel({
  abierto,
  onCerrar,
  filtros,
  setFiltros,
  onAplicar,
  onLimpiar,
}: FiltrosPanelProps) {
  const toArr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v;

    if (typeof v === 'string' && v) {
      return v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }

    return [];
  };

  const [local, setLocal] = useState({
    codigo: filtros?.codigo || filtros?.codigoProceso || '',

    perfiles: toArr(filtros?.perfiles).length
      ? toArr(filtros?.perfiles)
      : filtros?.perfil
        ? toArr(filtros.perfil)
        : [],

    fuentes: toArr(filtros?.fuentes).length
      ? toArr(filtros?.fuentes)
      : filtros?.fuente
        ? toArr(filtros.fuente)
        : [],

    modalidades: toArr(filtros?.modalidades).length
      ? toArr(filtros?.modalidades)
      : filtros?.modalidad
        ? toArr(filtros.modalidad)
        : [],

    estados: toArr(filtros?.estados).length
      ? toArr(filtros?.estados)
      : filtros?.estado
        ? toArr(filtros.estado)
        : [],

    departamentos: toArr(filtros?.departamentos).length
      ? toArr(filtros?.departamentos)
      : filtros?.departamento
        ? toArr(filtros.departamento)
        : [],

    fechaDesde: filtros?.fechaDesde || '',
    fechaHasta: filtros?.fechaHasta || '',
    dptoSearch: '',
  });

  const [departamentosDisponibles, setDepartamentosDisponibles] = useState<string[]>([]);
  const [cargandoDepartamentos, setCargandoDepartamentos] = useState(false);

  useEffect(() => {
    if (abierto) {
      setLocal({
        codigo: filtros?.codigo || filtros?.codigoProceso || '',

        perfiles: toArr(filtros?.perfiles).length
          ? toArr(filtros?.perfiles)
          : filtros?.perfil
            ? toArr(filtros.perfil)
            : [],

        fuentes: toArr(filtros?.fuentes).length
          ? toArr(filtros?.fuentes)
          : filtros?.fuente
            ? toArr(filtros.fuente)
            : [],

        modalidades: toArr(filtros?.modalidades).length
          ? toArr(filtros?.modalidades)
          : filtros?.modalidad
            ? toArr(filtros.modalidad)
            : [],

        estados: toArr(filtros?.estados).length
          ? toArr(filtros?.estados)
          : filtros?.estado
            ? toArr(filtros.estado)
            : [],

        departamentos: toArr(filtros?.departamentos).length
          ? toArr(filtros?.departamentos)
          : filtros?.departamento
            ? toArr(filtros.departamento)
            : [],

        fechaDesde: filtros?.fechaDesde || '',
        fechaHasta: filtros?.fechaHasta || '',
        dptoSearch: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;

    const perfilesSeleccionados = Array.isArray(local.perfiles)
      ? local.perfiles
      : [];

    if (perfilesSeleccionados.length === 0) {
      setDepartamentosDisponibles([]);
      return;
    }

    let activo = true;

    async function cargarDepartamentosDependientes() {
      try {
        setCargandoDepartamentos(true);

        const params = new URLSearchParams();
        params.set('perfiles', perfilesSeleccionados.join(','));

        const res = await fetch(`/api/procesos/filtros/departamentos?${params.toString()}`, {
          cache: 'no-store',
        });

        const data = await res.json();

        if (!activo) return;

        if (data?.ok && Array.isArray(data.departamentos)) {
          setDepartamentosDisponibles(data.departamentos);

          setLocal((prev) => ({
            ...prev,
            departamentos: Array.isArray(prev.departamentos)
              ? prev.departamentos.filter((dep: string) => data.departamentos.includes(dep))
              : [],
          }));
        } else {
          setDepartamentosDisponibles([]);
        }
      } catch (error) {
        console.error('Error cargando departamentos dependientes:', error);

        if (activo) {
          setDepartamentosDisponibles([]);
        }
      } finally {
        if (activo) {
          setCargandoDepartamentos(false);
        }
      }
    }

    cargarDepartamentosDependientes();

    return () => {
      activo = false;
    };
  }, [abierto, local.perfiles]);

  const dptosFiltrados = useMemo(() => {
    const search = normalizarTextoFiltro(local.dptoSearch || '');

    return departamentosDisponibles.filter((d) =>
      normalizarTextoFiltro(d).includes(search)
    );
  }, [departamentosDisponibles, local.dptoSearch]);

  const upd = (campo: string, valor: unknown) =>
    setLocal((prev) => ({ ...prev, [campo]: valor }));

  const handleAplicar = () => {
    const departamentosSeleccionados = Array.isArray(local.departamentos)
      ? local.departamentos
      : [];

    const departamentosParam = departamentosSeleccionados.join(',');
    const perfilesParam = Array.isArray(local.perfiles) ? local.perfiles.join(',') : '';

    const nuevosFiltros = {
      ...filtros,

      codigo: local.codigo,
      codigoProceso: local.codigo,

      perfiles: local.perfiles,
      perfil: perfilesParam,
      entidadGrupo: perfilesParam,

      fuentes: local.fuentes,
      fuente: local.fuentes[0] || '',
      portal: local.fuentes[0] || '',

      modalidades: local.modalidades,
      modalidad: local.modalidades[0] || '',

      estados: local.estados,
      estado: local.estados[0] || '',

      departamentos: departamentosSeleccionados,
      departamento: departamentosParam,
      dpto: departamentosParam,

      fechaDesde: local.fechaDesde,
      fechaHasta: local.fechaHasta,
    };

    setFiltros(nuevosFiltros);
    onAplicar(nuevosFiltros);
    onCerrar();
  };

  const handleLimpiar = () => {
    setLocal({
      codigo: '',
      perfiles: [],
      fuentes: [],
      modalidades: [],
      estados: [],
      departamentos: [],
      fechaDesde: '',
      fechaHasta: '',
      dptoSearch: '',
    });

    setDepartamentosDisponibles([]);

    onLimpiar();
    onCerrar();
  };

  if (!abierto) return null;

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(13,45,94,0.35)',
          zIndex: 1000,
          backdropFilter: 'blur(2px)',
        }}
        onClick={onCerrar}
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 420,
          height: '100vh',
          background: '#fff',
          zIndex: 1001,
          boxShadow: '-8px 0 40px rgba(13,45,94,0.18)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font, system-ui)',
          animation: 'slideInPanel 0.22s cubic-bezier(.4,0,.2,1)',
        }}
      >
        <div
          style={{
            background: '#0d2d5e',
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width={18} height={18} fill="none" stroke="#fff" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M3 6h18M6 12h12M10 18h4" />
            </svg>

            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>
              Filtrar procesos
            </span>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 6,
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
            }}
          >
            <svg width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div>
            <label style={labelStyleBase}>Código proceso</label>
            <input
              type="text"
              placeholder="Ej. SECOP-2026-001..."
              value={local.codigo}
              onChange={(e) => upd('codigo', e.target.value)}
              style={inputStyleBase}
            />
          </div>

          <div>
            <label style={labelStyleBase}>
              Perfil{' '}
              {local.perfiles.length > 0 && (
                <span style={{ color: '#0d2d5e', fontWeight: 700 }}>
                  ({local.perfiles.length})
                </span>
              )}
            </label>

            <ChipGroup
              opciones={PERFILES_OPTS}
              seleccionados={local.perfiles}
              onChange={(v) => {
                upd('perfiles', v);
                upd('departamentos', []);
                upd('dptoSearch', '');
              }}
              labelMap={{
                aseocolba: 'Aseocolba',
                vigicolba: 'Vigicolba',
                tempocolba: 'Tempocolba',
              }}
            />
          </div>

          <div>
            <label style={labelStyleBase}>
              Fuente / Portal{' '}
              {local.fuentes.length > 0 && (
                <span style={{ color: '#0d2d5e', fontWeight: 700 }}>
                  ({local.fuentes.length})
                </span>
              )}
            </label>

            <ChipGroup
              opciones={FUENTES_OPTS}
              seleccionados={local.fuentes}
              onChange={(v) => upd('fuentes', v)}
              labelMap={FUENTES_LABEL}
            />
          </div>

          <div>
            <label style={labelStyleBase}>
              Modalidad{' '}
              {local.modalidades.length > 0 && (
                <span style={{ color: '#0d2d5e', fontWeight: 700 }}>
                  ({local.modalidades.length})
                </span>
              )}
            </label>

            <ChipGroup
              opciones={MODALIDADES_OPTS}
              seleccionados={local.modalidades}
              onChange={(v) => upd('modalidades', v)}
            />
          </div>

          <div>
            <label style={labelStyleBase}>
              Estado{' '}
              {local.estados.length > 0 && (
                <span style={{ color: '#0d2d5e', fontWeight: 700 }}>
                  ({local.estados.length})
                </span>
              )}
            </label>

            <ChipGroup
              opciones={ESTADOS_OPTS}
              seleccionados={local.estados}
              onChange={(v) => upd('estados', v)}
            />
          </div>

          <div>
            <label style={labelStyleBase}>
              Departamento{' '}
              {local.departamentos.length > 0 && (
                <span style={{ color: '#0d2d5e', fontWeight: 700 }}>
                  ({local.departamentos.length})
                </span>
              )}
            </label>

            <input
              type="text"
              placeholder="Buscar departamento..."
              value={local.dptoSearch}
              onChange={(e) => upd('dptoSearch', e.target.value)}
              style={{ ...inputStyleBase, marginBottom: 8 }}
              disabled={!local.perfiles.length}
            />

            <div
              style={{
                maxHeight: 160,
                overflowY: 'auto',
                border: '1.5px solid #e2e8f0',
                borderRadius: 8,
                padding: 6,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 5,
                minHeight: 44,
                background: !local.perfiles.length ? '#f8fafc' : '#fff',
              }}
            >
              {!local.perfiles.length ? (
                <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>
                  Selecciona primero uno o varios perfiles para ver los departamentos con procesos disponibles.
                </div>
              ) : cargandoDepartamentos ? (
                <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>
                  Cargando departamentos aplicables...
                </div>
              ) : dptosFiltrados.length > 0 ? (
                dptosFiltrados.map((d) => {
                  const activo = local.departamentos.includes(d);

                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        upd(
                          'departamentos',
                          activo
                            ? local.departamentos.filter((x: string) => x !== d)
                            : [...local.departamentos, d]
                        )
                      }
                      style={{
                        height: 26,
                        padding: '0 10px',
                        borderRadius: 999,
                        border: activo ? 'none' : '1px solid #e2e8f0',
                        background: activo ? '#0d2d5e' : '#f8fafc',
                        color: activo ? 'white' : '#374151',
                        fontSize: 11.5,
                        fontWeight: activo ? 600 : 400,
                        cursor: 'pointer',
                        fontFamily: 'var(--font, system-ui)',
                        transition: 'all .15s',
                      }}
                    >
                      {d}
                    </button>
                  );
                })
              ) : (
                <div style={{ fontSize: 12, color: '#64748b', padding: 8 }}>
                  No hay departamentos con procesos disponibles para los perfiles seleccionados.
                </div>
              )}
            </div>

            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              Los departamentos dependen del perfil seleccionado y de los procesos existentes en la base.
            </div>
          </div>

          <div>
            <label style={labelStyleBase}>Fecha de publicación</label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Desde
                </span>

                <input
                  type="date"
                  value={local.fechaDesde}
                  onChange={(e) => upd('fechaDesde', e.target.value)}
                  style={inputStyleBase}
                />
              </div>

              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                  Hasta
                </span>

                <input
                  type="date"
                  value={local.fechaHasta}
                  onChange={(e) => upd('fechaHasta', e.target.value)}
                  style={inputStyleBase}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '16px 22px',
            borderTop: '1px solid #e8edf4',
            display: 'flex',
            gap: 10,
            flexShrink: 0,
            background: '#f8fafc',
          }}
        >
          <button
            type="button"
            onClick={handleLimpiar}
            style={{
              flex: 1,
              height: 40,
              border: '1.5px solid #e2e8f0',
              borderRadius: 8,
              background: '#fff',
              fontSize: 13,
              fontWeight: 600,
              color: '#64748b',
              cursor: 'pointer',
              fontFamily: 'var(--font, system-ui)',
            }}
          >
            Restablecer
          </button>

          <button
            type="button"
            onClick={handleAplicar}
            style={{
              flex: 2,
              height: 40,
              border: 'none',
              borderRadius: 8,
              background: '#0d2d5e',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'var(--font, system-ui)',
            }}
          >
            Filtrar
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes slideInPanel {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </>
  );
}

// ─────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────
function ProcesoCard({
  proceso,
  onGestionar,
}: {
  proceso: Proceso;
  onGestionar: (p: Proceso) => void;
}) {
  const entidad = getEntidad(proceso);
  const titulo = getTitulo(proceso);
  const objeto = getObjeto(proceso);
  const ciudad = getCiudad(proceso);
  const fuente = getFuente(proceso);
  const modalidad = getModalidad(proceso);
  const fechaCierre = getFechaCierre(proceso);
  const deadlineClass = getDeadlineClass(fechaCierre);
  const fechaLabel = formatFecha(fechaCierre);
  const portalTag = getPortalTag(fuente);

  return (
    <div
      className="licy-proceso-card"
      onClick={() => onGestionar(proceso)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onGestionar(proceso);
      }}
    >
      {getEstado(proceso) && getEstado(proceso) !== 'Estado no disponible' && (
        <span className="licy-proceso-empresa-badge licy-proceso-empresa-aseocolba">
          {getEstado(proceso)}
        </span>
      )}

      <div className="licy-proceso-card-header">
        <div className="licy-proceso-card-logo">{getSiglas(entidad)}</div>

        <div className="licy-proceso-card-entity">
          <div className="licy-proceso-card-entity-name">{entidad}</div>
          <div className="licy-proceso-card-location">{ciudad}</div>
        </div>
      </div>

      <div className="licy-proceso-card-title">{titulo}</div>
      <div className="licy-proceso-card-desc">{objeto}</div>

      <div className="licy-proceso-card-footer">
        {fechaLabel ? (
          <div className={`licy-proceso-deadline ${deadlineClass}`}>
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4l3 3" />
            </svg>
            {fechaLabel}
          </div>
        ) : (
          <div className="licy-proceso-deadline licy-proceso-deadline-blue" style={{ opacity: 0.4 }}>
            Sin fecha límite
          </div>
        )}

        <div className="licy-proceso-card-actions">
          <div className="licy-proceso-card-tags">
            <span className={`licy-proceso-tag ${portalTag.cls}`}>
              {portalTag.label}
            </span>

            {modalidad && modalidad !== 'Modalidad no disponible' && (
              <span className="licy-proceso-tag-modalidad">{modalidad}</span>
            )}
          </div>

          <button
            className="licy-proceso-gestionar-btn"
            title="Gestionar proceso"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGestionar(proceso);
            }}
          >
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Paginación
// ─────────────────────────────────────────────
function ProcesoPaginacion({
  page,
  totalPages,
  limit,
  total,
  onCambiarPagina,
  onCambiarLimit,
}: {
  page: number;
  totalPages: number;
  limit: number;
  total: number;
  onCambiarPagina: (p: number) => void;
  onCambiarLimit: (l: number) => void;
}) {
  const pages: (number | -1)[] = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const arr: (number | -1)[] = [1];

    if (page > 3) arr.push(-1);

    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      arr.push(i);
    }

    if (page < totalPages - 2) arr.push(-1);

    arr.push(totalPages);

    return arr;
  }, [page, totalPages]);

  return (
    <div className="licy-procesos-paginacion">
      <div className="licy-pag-left">
        <span>Resultados por página:</span>

        <select
          className="licy-pag-select"
          value={limit}
          onChange={(e) => onCambiarLimit(Number(e.target.value))}
        >
          {[6, 12, 24, 30, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        {total > 0 && (
          <span style={{ marginLeft: 10, opacity: 0.7 }}>
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de{' '}
            {total.toLocaleString('es-CO')}
          </span>
        )}
      </div>

      <div className="licy-pag-right">
        <button
          className="licy-pag-btn licy-pag-btn-nav"
          disabled={page <= 1}
          onClick={() => onCambiarPagina(page - 1)}
          type="button"
        >
          <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Anterior
        </button>

        {pages.map((n, i) =>
          n === -1 ? (
            <span key={`el-${i}`} className="licy-pag-btn licy-pag-btn-dots">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={`licy-pag-btn${n === page ? ' licy-pag-btn-active' : ''}`}
              onClick={() => n !== page && onCambiarPagina(n)}
            >
              {n}
            </button>
          )
        )}

        <button
          className="licy-pag-btn licy-pag-btn-nav"
          disabled={page >= totalPages}
          onClick={() => onCambiarPagina(page + 1)}
          type="button"
        >
          Siguiente
          <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Vista principal
// ─────────────────────────────────────────────
export default function ProcesosCardsView({
  procesos = [],
  loading = false,
  error = null,
  page = 1,
  limit = 12,
  total = 0,
  totalPages = 1,
  filtros,
  setFiltros,
  onBuscar,
  onCambiarPagina,
  onCambiarLimit,
  onGestionarProceso,
}: ProcesosCardsViewProps) {
  const [busquedaLocal, setBusquedaLocal] = useState(filtros?.q || filtros?.busqueda || '');
  const [ciudadLocal, setCiudadLocal] = useState(filtros?.ciudad || filtros?.departamento || '');
  const [panelAbierto, setPanelAbierto] = useState(false);

  const handleBuscar = () => {
    setFiltros?.({
      ...filtros,
      q: busquedaLocal,
      busqueda: busquedaLocal,
      ciudad: ciudadLocal,
      departamento: ciudadLocal,
      dpto: ciudadLocal,
    });

    setTimeout(() => {
      onBuscar?.();
    }, 50);
  };

  const handleFiltroChange = (campo: string, valor: string) => {
    setFiltros?.({ ...filtros, [campo]: valor });
  };

  const filtrosActivos = useMemo(() => {
    if (!filtros) return 0;

    const campos = [
      'codigo',
      'codigoProceso',
      'perfil',
      'entidadGrupo',
      'fuente',
      'portal',
      'modalidad',
      'estado',
      'departamento',
      'dpto',
      'fechaDesde',
      'fechaHasta',
    ];

    return campos.filter((c) => filtros[c] && filtros[c] !== '' && filtros[c] !== 'all').length;
  }, [filtros]);

  const handleLimpiarFiltrosAvanzados = () => {
    const filtrosLimpios = {
      ...filtros,

      codigo: '',
      codigoProceso: '',

      perfiles: [],
      perfil: '',
      entidadGrupo: '',

      fuentes: [],
      fuente: '',
      portal: '',

      modalidades: [],
      modalidad: '',

      estados: [],
      estado: '',

      departamentos: [],
      departamento: '',
      dpto: '',

      fechaDesde: '',
      fechaHasta: '',

      entidad: 'all',
    };

    setFiltros?.(filtrosLimpios);
    setBusquedaLocal('');
    setCiudadLocal('');

    setTimeout(() => {
      onBuscar?.();
    }, 50);
  };

  return (
    <div className="licy-procesos-view">
      {setFiltros && (
        <FiltrosPanel
          abierto={panelAbierto}
          onCerrar={() => setPanelAbierto(false)}
          filtros={filtros}
          setFiltros={setFiltros}
          onAplicar={() => {
            setTimeout(() => {
              onBuscar?.();
            }, 50);
          }}
          onLimpiar={handleLimpiarFiltrosAvanzados}
        />
      )}

      {setFiltros && (
        <button
          type="button"
          onClick={() => setPanelAbierto(true)}
          title="Filtros avanzados"
          style={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 36,
            height: 44,
            background: '#c8102e',
            border: 'none',
            borderRadius: '8px 0 0 8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            zIndex: 500,
            boxShadow: '-3px 0 12px rgba(107,33,168,0.35)',
            transition: 'background .15s, width .15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#a50d24';
            e.currentTarget.style.width = '42px';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#a50d24';
            e.currentTarget.style.width = '36px';
          }}
        >
          <svg width={16} height={16} fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 4.5A1.5 1.5 0 014.5 3h15A1.5 1.5 0 0121 4.5v1.88a3 3 0 01-.879 2.121L15 13.622V19.5a1.5 1.5 0 01-2.276 1.285l-3-1.8A1.5 1.5 0 019 17.7v-4.078L3.879 8.501A3 3 0 013 6.38V4.5z" />
          </svg>

          {filtrosActivos > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                minWidth: 18,
                height: 18,
                background: '#c8102e',
                color: '#fff',
                borderRadius: 9,
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                border: '2px solid #fff',
                lineHeight: 1,
              }}
            >
              {filtrosActivos}
            </span>
          )}
        </button>
      )}

      <div className="licy-procesos-header">
        <h1 className="licy-procesos-title">Procesos públicos</h1>
        <p className="licy-procesos-subtitle">
          Gestiona propuestas y trabaja con las mejores entidades del país.
        </p>
      </div>

      <div className="licy-procesos-search-bar">
        <div className="licy-procesos-search-inputs">
          <div className="licy-procesos-search-wrap">
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>

            <input
              type="text"
              placeholder="Nombre del proceso, entidad u objeto…"
              value={busquedaLocal}
              onChange={(e) => setBusquedaLocal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBuscar();
              }}
            />
          </div>

          <div className="licy-procesos-search-wrap">
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>

            <input
              type="text"
              placeholder="Departamento o ciudad…"
              value={ciudadLocal}
              onChange={(e) => setCiudadLocal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleBuscar();
              }}
            />
          </div>

          <button className="licy-procesos-search-btn" type="button" onClick={handleBuscar}>
            Buscar proceso
          </button>
        </div>

        <div className="licy-procesos-filters">
          <select
            className="licy-procesos-filter-select"
            value={filtros?.orderBy || ''}
            onChange={(e) => handleFiltroChange('orderBy', e.target.value)}
          >
            <option value="">Fecha ↕</option>
            <option value="asc">Más antiguos</option>
            <option value="desc">Más recientes</option>
          </select>

          <select
            className="licy-procesos-filter-select"
            value={filtros?.portal || filtros?.fuente || ''}
            onChange={(e) => handleFiltroChange('portal', e.target.value)}
          >
            <option value="">Portal</option>
            <option value="SECOP II">SECOP II</option>
            <option value="SECOP I">SECOP I</option>
            <option value="Privado">Privado</option>
          </select>

          <select
            className="licy-procesos-filter-select"
            value={filtros?.modalidad || ''}
            onChange={(e) => handleFiltroChange('modalidad', e.target.value)}
          >
            <option value="">Modalidad</option>
            <option value="Licitación pública">Licitación pública</option>
            <option value="Mínima cuantía">Mínima cuantía</option>
            <option value="Selección abreviada">Selección abreviada</option>
            <option value="Contratación directa">Contratación directa</option>
            <option value="Concurso de méritos">Concurso de méritos</option>
          </select>

          <select
            className="licy-procesos-filter-select"
            value={filtros?.perfil || filtros?.entidadGrupo || ''}
            onChange={(e) => handleFiltroChange('perfil', e.target.value)}
          >
            <option value="">Perfil</option>
            <option value="aseocolba">Aseocolba</option>
            <option value="vigicolba">Vigicolba</option>
            <option value="tempocolba">Tempocolba</option>
          </select>

          <select
            className="licy-procesos-filter-select"
            value={filtros?.estado || ''}
            onChange={(e) => handleFiltroChange('estado', e.target.value)}
          >
            <option value="">Estado</option>
            <option value="Abierto">Abierto</option>
            <option value="En evaluación">En evaluación</option>
            <option value="Cerrado">Cerrado</option>
            <option value="Adjudicado">Adjudicado</option>
          </select>

          {filtros &&
            (Object.values(filtros).some((v) => v !== '' && v != null) ||
              busquedaLocal ||
              ciudadLocal) && (
              <button
                type="button"
                className="licy-procesos-filter-clear"
                onClick={() => {
                  handleLimpiarFiltrosAvanzados();
                  setBusquedaLocal('');
                  setCiudadLocal('');
                }}
              >
                Limpiar
              </button>
            )}
        </div>

        {filtrosActivos > 0 && (
          <div className="licy-filtros-badges-row">
            {filtros?.codigo && (
              <span className="licy-filtro-badge-chip">
                Código: {filtros.codigo}
                <button
                  type="button"
                  onClick={() => setFiltros?.({ ...filtros, codigo: '', codigoProceso: '' })}
                >
                  ×
                </button>
              </span>
            )}

            {filtros?.perfil && filtros.perfil !== 'all' && (
              <span className="licy-filtro-badge-chip">
                Perfil: {filtros.perfil}
                <button
                  type="button"
                  onClick={() =>
                    setFiltros?.({
                      ...filtros,
                      perfiles: [],
                      perfil: '',
                      entidadGrupo: '',
                      departamentos: [],
                      departamento: '',
                      dpto: '',
                    })
                  }
                >
                  ×
                </button>
              </span>
            )}

            {filtros?.fuente && filtros.fuente !== 'all' && (
              <span className="licy-filtro-badge-chip">
                Fuente: {filtros.fuente}
                <button
                  type="button"
                  onClick={() => setFiltros?.({ ...filtros, fuente: '', portal: '', fuentes: [] })}
                >
                  ×
                </button>
              </span>
            )}

            {filtros?.modalidad && (
              <span className="licy-filtro-badge-chip">
                Modalidad: {filtros.modalidad}
                <button
                  type="button"
                  onClick={() => setFiltros?.({ ...filtros, modalidad: '', modalidades: [] })}
                >
                  ×
                </button>
              </span>
            )}

            {filtros?.estado && (
              <span className="licy-filtro-badge-chip">
                Estado: {filtros.estado}
                <button
                  type="button"
                  onClick={() => setFiltros?.({ ...filtros, estado: '', estados: [] })}
                >
                  ×
                </button>
              </span>
            )}

            {Array.isArray(filtros?.departamentos) && filtros.departamentos.length > 0 ? (
              filtros.departamentos.map((dep: string) => (
                <span key={dep} className="licy-filtro-badge-chip">
                  Dpto: {dep}
                  <button
                    type="button"
                    onClick={() => {
                      const nuevos = filtros.departamentos.filter((x: string) => x !== dep);

                      setFiltros?.({
                        ...filtros,
                        departamentos: nuevos,
                        departamento: nuevos.join(','),
                        dpto: nuevos.join(','),
                      });
                    }}
                  >
                    ×
                  </button>
                </span>
              ))
            ) : (
              (filtros?.departamento || filtros?.dpto) && (
                <span className="licy-filtro-badge-chip">
                  Dpto: {filtros.departamento || filtros.dpto}
                  <button
                    type="button"
                    onClick={() =>
                      setFiltros?.({
                        ...filtros,
                        departamentos: [],
                        departamento: '',
                        dpto: '',
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              )
            )}

            {filtros?.fechaDesde && (
              <span className="licy-filtro-badge-chip">
                Desde: {filtros.fechaDesde}
                <button
                  type="button"
                  onClick={() => setFiltros?.({ ...filtros, fechaDesde: '' })}
                >
                  ×
                </button>
              </span>
            )}

            {filtros?.fechaHasta && (
              <span className="licy-filtro-badge-chip">
                Hasta: {filtros.fechaHasta}
                <button
                  type="button"
                  onClick={() => setFiltros?.({ ...filtros, fechaHasta: '' })}
                >
                  ×
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {error && <div className="licy-procesos-error">⚠️ {error}</div>}

      {loading && !error && (
        <div className="licy-procesos-loading">
          <svg className="licy-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M4 4v5h5M20 20v-5h-5" />
            <path d="M4.055 9A8 8 0 0120 15.944M19.945 15A8 8 0 014 8.056" />
          </svg>
          Cargando procesos…
        </div>
      )}

      {!loading && !error && procesos.length > 0 && (
        <div className="licy-procesos-grid">
          {procesos.map((proceso, idx) => (
            <ProcesoCard
              key={proceso.id ?? proceso.codigoProceso ?? idx}
              proceso={proceso}
              onGestionar={(p) => onGestionarProceso?.(p)}
            />
          ))}
        </div>
      )}

      {!loading && !error && procesos.length === 0 && (
        <div className="licy-procesos-empty">
          <p>No hay procesos para mostrar.</p>
          <span>Ajusta los filtros o intenta una búsqueda diferente.</span>
        </div>
      )}

      {!loading && (totalPages ?? 1) > 0 && (
        <ProcesoPaginacion
          page={page}
          totalPages={totalPages ?? 1}
          limit={limit}
          total={total}
          onCambiarPagina={onCambiarPagina ?? (() => {})}
          onCambiarLimit={onCambiarLimit ?? (() => {})}
        />
      )}
    </div>
  );
}