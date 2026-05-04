import type {
  RolSistema,
  ModuloLicy,
  AccionPermiso,
  MatrizPermisos,
} from '@/types/licycolba/roles';

const ROLES_VALIDOS: RolSistema[] = [
  'Administrador',
  'Gerencia',
  'Analista Mercadeo',
  'Director Comercial',
  'Coordinador Comercial',
  'Analista Comercial',
  'Usuario Final',
];

export const MATRIZ_PERMISOS: MatrizPermisos = {
  Administrador: {},

  Gerencia: {
    dashboard: { ver: true },
    busqueda: { ver: true },
    procesosNuevos: { ver: true },
    solicitudesComercial: { ver: true },
    solicitudesEspecializadas: { ver: true },
    asignaciones: { ver: true },
    cronogramas: { ver: true },
    documentos: { ver: true },
    parametrizacion: { ver: true },
    informes: { ver: true },
  },

  'Analista Mercadeo': {
    dashboard: { ver: true },
    busqueda: { ver: true, crear: true, gestionar: true },
    procesosNuevos: { ver: true, crear: true, gestionar: true },
    solicitudesComercial: { ver: true },
    solicitudesEspecializadas: { ver: true },
    asignaciones: { ver: true },
    cronogramas: { ver: true },
    documentos: { ver: true },
    informes: { ver: true },
  },

  'Director Comercial': {
    dashboard: { ver: true },
    busqueda: { ver: true },
    procesosNuevos: { ver: true },
    solicitudesComercial: { ver: true, editar: true },
    solicitudesEspecializadas: { ver: true, editar: true },
    asignaciones: {
      ver: true,
      asignar: true,
      reasignar: true,
      gestionar: true,
      editar: true,
    },
    cronogramas: { ver: true },
    documentos: { ver: true },
    informes: { ver: true },
  },

  'Coordinador Comercial': {
    dashboard: { ver: true },
    busqueda: { ver: true },
    procesosNuevos: { ver: true },
    solicitudesComercial: { ver: true, editar: true },
    solicitudesEspecializadas: { ver: true, editar: true },
    asignaciones: {
      ver: true,
      asignar: true,
      reasignar: true,
      gestionar: true,
      editar: true,
    },
    cronogramas: { ver: true },
    documentos: { ver: true },
    informes: { ver: true },
  },

  'Analista Comercial': {
    dashboard: { ver: true },
    asignaciones: { ver: true, gestionar: true, editar: true },
    cronogramas: { ver: true },
    documentos: { ver: true },
  },

  'Usuario Final': {
    dashboard: { ver: true },
    documentos: { ver: true },
    cronogramas: { ver: true },
  },
};

export function normalizarRol(rol: string | null | undefined): RolSistema {
  if (!rol) return 'Usuario Final';

  const limpio = rol.trim();

  if ((ROLES_VALIDOS as string[]).includes(limpio)) {
    return limpio as RolSistema;
  }

  return 'Usuario Final';
}

export function puede(
  rol: string | null | undefined,
  modulo: ModuloLicy,
  accion: AccionPermiso
): boolean {
  const rolNorm = normalizarRol(rol);

  if (rolNorm === 'Administrador') return true;

  const permisosRol = MATRIZ_PERMISOS[rolNorm];
  const permisosModulo = permisosRol?.[modulo];

  return permisosModulo?.[accion] === true;
}

export function puedeVerModulo(
  rol: string | null | undefined,
  modulo: ModuloLicy
): boolean {
  return puede(rol, modulo, 'ver');
}

export function obtenerPermisosModulo(
  rol: string | null | undefined,
  modulo: ModuloLicy
): Partial<Record<AccionPermiso, boolean>> {
  const rolNorm = normalizarRol(rol);

  if (rolNorm === 'Administrador') {
    return {
      ver: true,
      crear: true,
      editar: true,
      eliminar: true,
      asignar: true,
      reasignar: true,
      gestionar: true,
      administrar: true,
    };
  }

  return MATRIZ_PERMISOS[rolNorm]?.[modulo] ?? {};
}

export function obtenerPermisosRol(
  rol: string | null | undefined
): MatrizPermisos[RolSistema] {
  const rolNorm = normalizarRol(rol);
  return MATRIZ_PERMISOS[rolNorm] ?? {};
}

export function esSoloLectura(rol: string | null | undefined): boolean {
  const rolNorm = normalizarRol(rol);
  return rolNorm === 'Gerencia' || rolNorm === 'Usuario Final';
}