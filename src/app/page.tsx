'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LicyTopbar from '@/components/licycolba/LicyTopbar';
import ProcesosCardsView from '@/components/licycolba/ProcesosCardsView';
import '@/components/licycolba/procesos-cards.css';
import { puede, puedeVerModulo, esSoloLectura, normalizarRol } from '@/lib/licycolba/permisos';


/* =========================================================
   Configuración base del módulo
========================================================= */

const DRAFT_KEY = 'licycolba_draft_solicitud';

/* =========================================================
   Helpers globales de normalización segura
========================================================= */

function safeString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function safeBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'sí', 'si', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getRecordValue(record: Record<string, unknown> | null | undefined, key: string, fallback: unknown = ''): unknown {
  if (!record) return fallback;
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : fallback;
}

function safeDate(value: unknown, fallback = ''): string {
  const raw = safeString(value);
  if (!raw) return fallback;
  const date = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return raw || fallback;
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getWindowXlsx(): XlsxLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { XLSX?: XlsxLike }).XLSX;
}

/* =========================================================
   Tipos y contratos internos del módulo
========================================================= */
type IndicadorAsignacion = {
  subcausa: string;
  valorRequerido: string;
  valorEvidenciado: string;
  cumple: string;
  obs: string;
};

type DocumentoDinamico = Record<string, unknown>;

type UsuarioActivo = {
  id: number;
  usuario: string;
  cargo: string;
  entidadGrupo: string;
  rol?: string;
  estado?: string;
  proceso?: string | null;
};

type UsuarioAsignable = {
  id: number;
  usuario: string;
  cargo: string;
  entidadGrupo: string;
  rol: string;
  estado: string;
  proceso?: string;
};

type XlsxWorksheet = Record<string, unknown> & {
  '!ref'?: string;
  '!cols'?: Array<{ wch: number }>;
};

type XlsxLike = {
  utils: {
    book_new: () => unknown;
    aoa_to_sheet: (data: unknown[][]) => XlsxWorksheet;
    book_append_sheet: (wb: unknown, ws: XlsxWorksheet, name: string) => void;
    decode_range: (ref: string) => { e: { r: number } };
    encode_cell: (cell: { r: number; c: number }) => string;
  };
  writeFile: (wb: unknown, fileName: string, options?: Record<string, unknown>) => void;
};

interface Sesion {
  usuario: string;
  cargo: string;
  email: string;
  entidadGrupo: string;
  rol: string;
  [key: string]: string;
}

interface UserPayload { cedula:string; celular:string; entidadGrupo:string; cargo:string; email:string; usuario:string; rol:string; estado:string; firmaDigital:string; password:string; proceso:string; subproceso:string; uen:string; }
const PROCESOS_SUBPROCESOS: Record<string, string[]> = {
  'HSEQ': ['Calidad', 'Ambiental', 'SST'],
  'Gestión humana': ['Seguridad social', 'Nómina', 'Archivos', 'Prestaciones sociales', 'Bienestar'],
  'Gestión contable y financiera': [],
  'Logística': ['Almacén', 'Compras', 'Mantenimiento'],
  'Atención al cliente': [],
  'Comercial': [],
  'Mercadeo y comunicaciones': [],
  'Legal': ['Legal laboral', 'Legal contratos'],
  'TIC': [],
  'Control interno': [],
  'Contratos': [],
  'Ejecución y entrega del servicio': [],
};
const PROCESOS = Object.keys(PROCESOS_SUBPROCESOS);
const UEN_OPCIONES = ['Barranquilla', 'Bogotá', 'Mina'];
const PAYLOAD_VACIO:UserPayload={cedula:'',celular:'',entidadGrupo:'',cargo:'',email:'',usuario:'',rol:'',estado:'Activo',firmaDigital:'',password:'',proceso:'',subproceso:'',uen:''};
interface User { id:number; cedula:string; celular:string; entidadGrupo:string; cargo:string; email:string; usuario:string; rol:string; estado:string; firmaDigital:string|null; proceso:string|null; subproceso:string|null; uen:string|null; createdAt:string; updatedAt:string; }
interface DeletedUser { id:number; cedula:string; celular:string; entidadGrupo:string; cargo:string; email:string; usuario:string; rol:string; estado:string; deletedAt:string; deletedByUsuario:string|null; deletedByEmail:string|null; }
interface LiciCronograma { nombre?:string; fecha?:string; [k:string]:unknown; }
interface LiciDocumento  { nombre?:string; ruta?:string; url?:string; [k:string]:unknown; }
interface LiciProceso {
  id:number; nombre:string; codigoProceso:string; fuente:string; aliasFuente:string; modalidad:string;
  fechaPublicacion:string|null; fechaVencimiento:string|null; entidad:string; objeto:string;
  valor:number|null; departamento:string; estado:string; perfil:string;
  linkDetalle:string; linkSecop:string; linkSecopReg:string;
  fuentes:Array<{nombre?:string;url?:string;link?:string;[k:string]:unknown}>;
  totalCronogramas:number; totalDocumentos:number; cronogramas:LiciCronograma[]; documentos:LiciDocumento[];
  duracionContrato?:string|null;
}

interface ProcesosApiResponse { ok:boolean; total_resultados_api:number; total_resultados_filtrados:number; total_resultados_entregados:number; procesos:LiciProceso[]; error?:string; }

/* Solicitudes */
interface Solicitud {
  id: number;
  procesoId: number | null;
  procesoSourceKey: string;
  codigoProceso: string;
  nombreProceso: string;
  entidad: string;
  objeto: string;
  fuente: string;
  aliasFuente: string;
  modalidad: string;
  perfil: string;
  departamento: string;
  estadoFuente: string;
  fechaPublicacion: string | null;
  fechaVencimiento: string | null;
  valor: number | null;
  linkDetalle: string;
  linkSecop: string;
  linkSecopReg: string;

  origenSolicitud?: string | null;

  nitContacto?: string | null;
  personaContacto?: string | null;
  telefonoContacto?: string | null;
  direccionContacto?: string | null;
  correoContacto?: string | null;

  estadoSolicitud: string;
  observacion: string | null;
  ciudad: string;
  sede: string;
  plataforma: string;
  fechaCierre: string | null;
  procStep: number;
  procData: Record<string, { fechaI: string; fechaF: string; obs: string }>;
  obsData: unknown[];
  docData: unknown[];
  asignaciones: unknown[];
  revisor: string;
  aprobador: string;
  usuarioRegistro: string;
  emailRegistro: string;
  cargoRegistro: string;
  entidadRegistro: string;
  sqrNumero: string | null;
  sqrCreada: boolean;
  sqrCerrada: boolean;
  sqrError: string | null;
  fechaAperturaSqr: string | null;
  fechaCierreSqr: string | null;
  resultadoFinal: string | null;
  causalCierre: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DeletedSolicitud {
  id: number;
  originalId: number | null;

  codigoProceso: string;
  nombreProceso: string;
  entidad: string;
  objeto: string;
  fuente: string;
  aliasFuente: string;
  modalidad: string;
  perfil: string;
  departamento: string;
  estadoFuente: string;
  fechaPublicacion: string | null;
  fechaVencimiento: string | null;
  valor: number | null;
  linkDetalle: string;

  origenSolicitud?: string | null;

  nitContacto?: string | null;
  personaContacto?: string | null;
  telefonoContacto?: string | null;
  direccionContacto?: string | null;
  correoContacto?: string | null;

  estadoSolicitud: string;
  observacion: string | null;
  ciudad: string;
  sede: string;
  plataforma: string;
  fechaCierre: string | null;
  procStep: number;
  revisor: string;
  aprobador: string;
  usuarioRegistro: string;
  emailRegistro: string;
  cargoRegistro: string;
  entidadRegistro: string;

  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string;
  deletedByUsuario: string | null;
  deletedByEmail: string | null;
}

interface ExamenMedico { [k:string]:unknown; }

/* Flujos del stepper */
interface PasoFlujo { id:string; label:string; terminal:boolean; resultado?:boolean; cierre?:boolean; }
const FLUJO_LICITACION:PasoFlujo[]=[
  {id:'rev',    label:'En revisión\ncomercial', terminal:false},
  {id:'asig',   label:'Asignada',              terminal:false},
  {id:'elab',   label:'En elaboración',        terminal:false},
  {id:'pres',   label:'Presentada',            terminal:false},
  {id:'eval',   label:'En evaluación',         terminal:false},
  {id:'obs',    label:'Observaciones',         terminal:false},
  {id:'adjud',  label:'Adjudicada',            terminal:true, resultado:true},
  {id:'no_adj', label:'No adjudicada',         terminal:true, resultado:true},
  {id:'no_pre', label:'No presentada',         terminal:true, resultado:true},
  {id:'cerr',   label:'Cerrada',               terminal:true, cierre:true},
];
const FLUJO_COTIZACION:PasoFlujo[]=[
  {id:'rev',   label:'En revisión\ncomercial', terminal:false},
  {id:'asig',  label:'Asignada',              terminal:false},
  {id:'elab',  label:'En elaboración',        terminal:false},
  {id:'env',   label:'Enviada',               terminal:false},
  {id:'seg',   label:'Seguimiento',           terminal:false},
  {id:'acep',  label:'Aceptada',              terminal:true, resultado:true},
  {id:'no_ac', label:'No aceptada',           terminal:true, resultado:true},
  {id:'cerr',  label:'Cerrada',               terminal:true, cierre:true},
];
function getFlujo(modalidad:string, fuente:string):PasoFlujo[] {
  const m=(modalidad||'').toLowerCase();
  const esLici=['licit','selección abreviada','seleccion abreviada','concurso','mínima','minima','minima cuantia'].some(k=>m.includes(k))||(fuente||'').toLowerCase().includes('secop');
  return esLici?FLUJO_LICITACION:FLUJO_COTIZACION;
}
const ESTADO_LABEL:Record<string,string>={rev:'En revisión',asig:'Asignada',elab:'En elaboración',pres:'Presentada',eval:'En evaluación',obs:'Observaciones',env:'Enviada',seg:'Seguimiento',adjud:'Adjudicada',no_adj:'No adjudicada',no_pre:'No presentada',acep:'Aceptada',no_ac:'No aceptada',cerr:'Cerrada'};
const MMAP_MODALIDAD:Record<string,string>={'1':'Contratación directa','2':'Licitación pública','3':'Selección abreviada','4':'Concurso de méritos','5':'Mínima cuantía','6':'Régimen especial'};

const SESSION_KEY='licycolba_sesion';
const guardarSesion=(s:Sesion)=>{try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(s));}catch{/**/}};

/* Colores y estados visuales */
const portalColor=(a:string,f:string)=>{const au=a.toUpperCase();const fu=f.toUpperCase();if(au==='S2'||fu.includes('SECOP II'))return{label:'S2',bg:'#1E5799',color:'white'};if(au==='S1'||fu.includes('SECOP I'))return{label:'S1',bg:'#16a34a',color:'white'};return{label:au||'NC',bg:'#0F2040',color:'white'};};
const portalColorModal=(a:string,f:string,r:string)=>{const au=a.toUpperCase();const fu=f.toUpperCase();if(au==='S2'||fu.includes('SECOP II'))return{short:'S2',label:'SECOP II',bg:'#1E5799',color:'white'};if(au==='S1'||fu.includes('SECOP I'))return{short:'S1',label:'SECOP I',bg:'#16a34a',color:'white'};return{short:au||'NC',label:r||'Otro portal',bg:'#0F2040',color:'white'};};
const estadoBadgeColor=(e:string)=>{const s=e.toLowerCase();if(s.includes('convocatoria')||s.includes('publicado')||s.includes('abierto')||s.includes('vigente'))return{bg:'#E8F5E9',color:'#1B5E20'};if(s.includes('adjudicado'))return{bg:'#E3F2FD',color:'#0D47A1'};if(s.includes('cerrado')||s.includes('vencido'))return{bg:'#EAF2FB',color:'#1E5799'};if(s.includes('cancelado')||s.includes('desierto'))return{bg:'#FFEBEE',color:'#B71C1C'};if(s.includes('evaluac')||s.includes('selecc'))return{bg:'#FFF8E1',color:'#E65100'};return{bg:'#F1F5F9',color:'#475569'};};
const estadoModalColor=(e:string)=>{const s=e.toLowerCase();if(s.includes('convocatoria')||s.includes('publicado')||s.includes('abierto')||s.includes('vigente'))return{bg:'#E8F5E9',color:'#1B5E20',dot:'#2E7D32'};if(s.includes('adjudicado'))return{bg:'#E3F2FD',color:'#0D47A1',dot:'#1565C0'};if(s.includes('cerrado')||s.includes('vencido'))return{bg:'#EAF2FB',color:'#1E5799',dot:'#2E7BC4'};if(s.includes('cancelado')||s.includes('desierto'))return{bg:'#FFEBEE',color:'#B71C1C',dot:'#C62828'};if(s.includes('evaluac')||s.includes('selecc'))return{bg:'#FFF8E1',color:'#E65100',dot:'#EF6C00'};return{bg:'#F1F5F9',color:'#475569',dot:'#94A3B8'};};
const perfilColor=(p:string)=>{const s=p.toLowerCase();if(s.includes('aseo'))return{bg:'#e8edf5',color:'#0d2d5e',label:'Aseocolba'};if(s.includes('vigi'))return{bg:'#fde8eb',color:'#c8102e',label:'Vigicolba'};if(s.includes('tempo'))return{bg:'#e3eef8',color:'#1a5ea8',label:'Tempocolba'};return{bg:'#F1F5F9',color:'#475569',label:p.charAt(0).toUpperCase()+p.slice(1)};};
const estadoSolicitudColor=(e:string)=>{const s=(e||'').toLowerCase();if(s==='abierta'||s.includes('revisión')||s.includes('revision'))return{bg:'#e0f2fe',color:'#0369a1'};if(s==='asignada')return{bg:'#E8F5E9',color:'#1B5E20'};if(s==='adjudicada'||s==='aceptada')return{bg:'#E3F2FD',color:'#0D47A1'};if(s.includes('no ')|| s==='rechazada')return{bg:'#FFEBEE',color:'#B71C1C'};if(s==='cerrada')return{bg:'#F1F5F9',color:'#475569'};return{bg:'#FFF8E1',color:'#E65100'};};

/* =========================================================
   Iconografía interna
========================================================= */
const IcoUser=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>);
const IcoLogout=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>);
const IcoDashboard=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>);
const IcoTRM=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>);
const IcoBusqueda=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>);
const IcoSolicitudes=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>);
const IcoAsignaciones=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>);
const IcoCronogramas=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>);
const IcoMaestro=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/><path d="M9 13h6M9 17h4"/></svg>);
const IcoEstructura=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>);
const IcoUsuarios=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>);
const IcoIndicadores=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>);
const IcoConfig=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>);
const IcoChevL=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>);
const IcoChevR=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>);
const IcoInfo=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>);
const IcoRefresh=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4 4v5h5M20 20v-5h-5"/><path d="M4.055 9A8 8 0 0120 15.944M19.945 15A8 8 0 014 8.056"/></svg>);
const IcoSync=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/></svg>);
const IcoPlus=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>);
const IcoPencil=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>);
const IcoTrash=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>);
const IcoExcel=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8l8 8M16 8l-8 8"/></svg>);
const IcoUpload=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 10l-4-4-4 4M12 6v10"/></svg>);
const IcoClose=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>);
const IcoEyeOn=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>);
const IcoEyeOff=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>);
const IcoFolder=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>);
const IcoColumns=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>);
const IcoFilter=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>);
const IcoExamenes=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12h3m-3 4h3M9 12h.01M9 16h.01"/></svg>);
const IcoRestore=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 12a9 9 0 009 9 9 9 0 006.36-2.64M3 12V6m0 6H9"/><path d="M21 12a9 9 0 00-9-9 9 9 0 00-6.36 2.64"/></svg>);
const IcoExternalLink=()=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>);

/* =========================================================
   LOGIN
========================================================= */
function PantallaLogin({onLogin}:{onLogin:(s:Sesion)=>void}) {
  const [email,setEmail]=useState('');const[password,setPassword]=useState('');const[showPass,setShowPass]=useState(false);const[error,setError]=useState('');const[loading,setLoading]=useState(false);
  const handleSubmit=async(e:React.FormEvent)=>{e.preventDefault();setError('');const em=email.trim().toLowerCase();if(!em||!em.includes('@')){setError('Ingresa un correo válido.');return;}if(!password){setError('La contraseña es obligatoria.');return;}setLoading(true);try{const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password})});const data=await res.json();if(!res.ok){setError(data.error??'No se pudo iniciar sesión.');return;}guardarSesion(data as Sesion);onLogin(data as Sesion);}catch{setError('No se pudo conectar.');}finally{setLoading(false);}};
  return(<div className="login-page"><div className="login-deco login-deco-tl"/><div className="login-deco login-deco-br"/><div className="login-card"><div className="login-brand">{ }<img src="https://www.grupocolba.com.co/wp-content/uploads/2021/05/grupocolba-logo.png" alt="Grupo Colba" className="login-logo"/></div>{error&&<div className="login-error">{error}</div>}<form className="login-form" onSubmit={handleSubmit} noValidate><div className="login-field"><label className="login-label">Correo electrónico</label><input className="login-input" type="email" placeholder="comercial@grupocolba.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" disabled={loading}/></div><div className="login-field"><label className="login-label">Contraseña</label><div className="login-pass-wrap"><input className="login-input login-input-pass" type={showPass?'text':'password'} placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" disabled={loading}/><button type="button" className="login-eye" onClick={()=>setShowPass(v=>!v)} tabIndex={-1}>{showPass?<IcoEyeOff/>:<IcoEyeOn/>}</button></div></div><button type="submit" className="login-btn" disabled={loading}>{loading?'Verificando…':'Ingresar'}</button></form><div className="login-footer">
  <div style={{display:'flex',justifyContent:'center',marginBottom:10}}>
    <img src="/logosempresas.svg" alt="Empresas Grupo Colba" style={{height:70,objectFit:'contain',opacity:.9}}/>
  </div>
      <p style={{margin:0,fontSize:11,color:'#94a3b8',textAlign:'center'}}>COPYRIGHT © 2026 <strong>Grupo Colba</strong></p>
    </div></div></div>);
    }

/* Indicador de procesos nuevos del día */
function BadgeNuevosHoy(){
  const[count,setCount]=React.useState<number|null>(null);
  const [docVista,setDocVista]=React.useState<'grid'|'list'>('list');
  React.useEffect(()=>{
    fetch('/api/procesos/nuevos?filtro=hoy&limit=1')
      .then(r=>r.json())
      .then(d=>{if(d.ok&&typeof d.total==='number')setCount(d.total);})
      .catch(()=>{/* silencioso si la tabla no existe aún */});
  },[]);
  if(!count)return null;
  return(
    <span style={{
      display:'inline-flex',alignItems:'center',justifyContent:'center',
      minWidth:17,height:17,borderRadius:9,
      background:'#ef4444',color:'white',
      fontSize:10,fontWeight:700,lineHeight:1,
      padding:'0 4px',marginLeft:6,flexShrink:0,
      verticalAlign:'middle',
    }}>
      {count>99?'99+':count}
    </span>
  );
}

/* =========================================================
   SIDEBAR
========================================================= */
interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeModule: string;
  onModuleChange: (module: string) => void;
  openAccordion: string | null;
  onAccordionToggle: (key: string) => void;
  sesion: Sesion;
  onLogout: () => void;
}

function Sidebar({collapsed,onToggle,activeModule,onModuleChange,openAccordion,onAccordionToggle,sesion,onLogout}:SidebarProps){
  const ni=(mod:string)=>['nav-item',activeModule===mod?'active':'',openAccordion===mod?'open':''].filter(Boolean).join(' ');
  const solAbiertasModules=['solicitudesComercial','solicitudesEspecializada'];
  const [subOpen,setSubOpen]=React.useState<string|null>(solAbiertasModules.includes(activeModule)?'solicitudesAbiertas':null);
  const toggleSub=(k:string)=>setSubOpen(prev=>prev===k?null:k);

  // ─── Permisos derivados del rol para visibilidad en sidebar ─────────────────
  const rol=sesion.rol;
  const verBusqueda          =puedeVerModulo(rol,'busqueda');
  const verSolicitudes       =puedeVerModulo(rol,'solicitudesComercial');
  const verAsignaciones      =puedeVerModulo(rol,'asignaciones');
  const verCronogramas       =puedeVerModulo(rol,'cronogramas');
  const verDocumentos        =puedeVerModulo(rol,'documentos');
  const verUsuarios          =puedeVerModulo(rol,'usuarios');

  return(
    <aside className={`sidebar${collapsed?' collapsed':''}`}>
      <div className="sidebar-logo" style={{flexShrink:0}}>
        <div className="logo-box">
          <div className="logo-qs"><img src="https://www.grupocolba.com.co/wp-content/uploads/2021/05/grupocolba-logo.png" alt="Grupo Colba"/></div>
          <div className="logo-version"><strong>LICYCOLBA</strong></div>
        </div>
        <button className="toggle-btn" onClick={onToggle}><IcoChevL/></button>
      </div>

      <div className="sidebar-scroll">
        <div className="sidebar-user">
          <IcoUser/>
          <div className="sidebar-user-info">
            <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{sesion.usuario.replace(/(?:^|[.\s_-])(\w)/g,(m,c)=>m.replace(c,c.toUpperCase()))}</div>
            <div style={{fontSize:10.5,color:'var(--sidebar-text-dim)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>{sesion.cargo}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-item" onClick={onLogout}><IcoLogout/><span className="nav-item-text">Cerrar sesión</span></div>
          <div className={ni('dashboard')} onClick={()=>onModuleChange('dashboard')}><IcoDashboard/><span className="nav-item-text">Dashboard</span></div>
          <div className={ni('trm')} onClick={()=>onModuleChange('trm')}><IcoTRM/><span className="nav-item-text">TRM</span></div>

          <div className="section-title">MÓDULOS</div>

          {/* ── Búsqueda de procesos ── */}
          {verBusqueda&&<>
            <div className={ni('busqueda')} onClick={()=>onAccordionToggle('busqueda')}>
              <IcoBusqueda/><span className="nav-item-text">Búsqueda de procesos</span><span className="nav-arrow"><IcoChevR/></span>
            </div>
            <div className="sub-nav">
              <div className={`sub-item${activeModule==='procesosNuevos'?' active':''}`} onClick={()=>onModuleChange('procesosNuevos')}>Procesos nuevos<BadgeNuevosHoy/></div>
              <div className={`sub-item${activeModule==='busquedaFinal'?' active':''}`} onClick={()=>onModuleChange('busquedaFinal')}>Todos los procesos</div>
            </div>
          </>}

          {/* ── Solicitudes ── */}
          {verSolicitudes&&<>
            <div className={ni('solicitudes')} onClick={()=>onAccordionToggle('solicitudes')}>
              <IcoSolicitudes/><span className="nav-item-text">Solicitudes</span><span className="nav-arrow"><IcoChevR/></span>
            </div>
            <div className="sub-nav">
              <div className={`sub-item${['solicitudesComercial','solicitudesEspecializada'].includes(activeModule)?' active':''}`} onClick={()=>toggleSub('solicitudesAbiertas')} style={{display:'flex',alignItems:'center',cursor:'pointer',width:'100%'}}>
                Solicitudes abiertas
                <span style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',transform:subOpen==='solicitudesAbiertas'?'rotate(90deg)':'none',transition:'transform .2s',width:16,height:16,opacity:.7}}><IcoChevR/></span>
              </div>
              {subOpen==='solicitudesAbiertas'&&<div style={{paddingLeft:12}}>
                <div className={`sub-item${activeModule==='solicitudesComercial'?' active':''}`} onClick={()=>onModuleChange('solicitudesComercial')}>Comercial</div>
                <div className={`sub-item${activeModule==='solicitudesEspecializada'?' active':''}`} onClick={()=>onModuleChange('solicitudesEspecializada')}>Especializados</div>
              </div>}
              <div className={`sub-item${activeModule==='solicitudesRechazadas'?' active':''}`} onClick={()=>onModuleChange('solicitudesRechazadas')}>Solicitudes rechazadas</div>
              <div className={`sub-item${activeModule==='solicitudesEliminadas'?' active':''}`} onClick={()=>onModuleChange('solicitudesEliminadas')}>Solicitudes eliminadas</div>
              <div className={`sub-item${activeModule==='solicitudesTodas'?' active':''}`} onClick={()=>onModuleChange('solicitudesTodas')}>Todas las solicitudes</div>
            </div>
          </>}

          {/* ── Asignaciones ── */}
          {verAsignaciones&&<>
            <div className={ni('asignaciones')} onClick={()=>onAccordionToggle('asignaciones')}>
              <IcoAsignaciones/><span className="nav-item-text">Asignaciones</span><span className="nav-arrow"><IcoChevR/></span>
            </div>
            <div className="sub-nav">
              <div className={`sub-item${activeModule==='asignacionesPendientes'?' active':''}`} onClick={()=>onModuleChange('asignacionesPendientes')}>Asignaciones pendientes</div>
              <div className={`sub-item${activeModule==='asignacionesCerradas'?' active':''}`} onClick={()=>onModuleChange('asignacionesCerradas')}>Asignaciones cerradas</div>
            </div>
          </>}

          {/* ── Cronogramas ── */}
          {verCronogramas&&<>
            <div className={ni('cronogramas')} onClick={()=>onAccordionToggle('cronogramas')}>
              <IcoCronogramas/><span className="nav-item-text" style={{opacity:0.5}}>Cronogramas</span><span className="nav-arrow"><IcoChevR/></span>
            </div>
            <div className="sub-nav">
              <div className="sub-item">Todos los cronogramas</div>
            </div>
          </>}

          {/* ── Maestro de documentos — visible para todos ── */}
          <div className={ni('maestroDeDocumentos')} onClick={()=>onModuleChange('maestroDeDocumentos')}><IcoMaestro/><span className="nav-item-text">Maestro de documentos</span></div>

          {/* ── Estructura de costos — visible para todos ── */}
          <div className={ni('estructuraDeCostos')} onClick={()=>onModuleChange('estructuraDeCostos')}><IcoEstructura/><span className="nav-item-text">Estructura de costos</span></div>

          {/* ── Exámenes médicos — visible para todos ── */}
          <div className={ni('examenesMedicos')} onClick={()=>onModuleChange('examenesMedicos')}><IcoExamenes/><span className="nav-item-text">Exámenes médicos</span></div>

          {/* ── Usuarios y perfiles — solo roles con permiso ── */}
          {verUsuarios&&<>
            <div className={ni('usuarios')} onClick={()=>onAccordionToggle('usuarios')}>
              <IcoUsuarios/><span className="nav-item-text">Usuarios y perfiles</span><span className="nav-arrow"><IcoChevR/></span>
            </div>
            <div className="sub-nav">
              <div className={`sub-item${activeModule==='usuarios'?' active':''}`} onClick={()=>onModuleChange('usuarios')}>Usuarios</div>
              <div className={`sub-item${activeModule==='perfiles'?' active':''}`} onClick={()=>onModuleChange('perfiles')}>Perfiles</div>
              <div className={`sub-item${activeModule==='usuariosEliminados'?' active':''}`} onClick={()=>onModuleChange('usuariosEliminados')}>Usuarios eliminados</div>
            </div>
          </>}

          {/* ── Indicadores ── */}
          <div className={ni('indicadores')} onClick={()=>onAccordionToggle('indicadores')}>
            <IcoIndicadores/><span className="nav-item-text" style={{opacity:0.5}}>Indicadores</span><span className="nav-arrow"><IcoChevR/></span>
          </div>
          <div className="sub-nav">
            <div className="sub-item">Panel de indicadores</div>
          </div>

          <div className="section-title">CUENTA</div>
          <div className="nav-item"><IcoConfig/><span className="nav-item-text">Configuración de cuenta</span></div>
        </nav>
      </div>

      <div style={{padding:'12px 14px 16px',borderTop:'1px solid rgba(255,255,255,0.08)',flexShrink:0}}>
        <img src="/logosempresas.svg" alt="Empresas Grupo Colba" style={{width:'92%',opacity:1,filter:'brightness(0) invert(1) brightness(2)'}}/>
      </div>
    </aside>
  );
}

/* =========================================================
   MODALES USUARIOS
========================================================= */
function ModalNuevoUsuario({onClose,onCreado}:{onClose:()=>void;onCreado:()=>void}){
  const [form,setForm]=useState<UserPayload>({...PAYLOAD_VACIO});
  const [showPass,setShowPass]=useState(false);
  const [guardando,setGuardando]=useState(false);
  const [error,setError]=useState('');

  const set=(f:keyof UserPayload,v:string)=>setForm(p=>({...p,[f]:v}));
  const setProceso=(v:string)=>setForm(p=>({...p,proceso:v,subproceso:''}));
  const subprocesos=PROCESOS_SUBPROCESOS[form.proceso]||[];

  const PT=({v}:{v:boolean})=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:15,height:15}}>{v?<><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg>);

  const handleGuardar=async()=>{
    setError('');
    if(!form.cedula||!form.email||!form.usuario||!form.rol||!form.cargo||!form.entidadGrupo||!form.celular){
      setError('Todos los campos * son obligatorios.');return;
    }
    if(!form.password||form.password.length<6){
      setError('La contraseña debe tener al menos 6 caracteres.');return;
    }
    setGuardando(true);
    try{
      const res=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});
      const data=await res.json();
      if(!res.ok){setError(data.error??'Error al guardar.');return;}
      onCreado();onClose();
    }catch{setError('No se pudo conectar.');}
    finally{setGuardando(false);}
  };

  const iS:React.CSSProperties={width:'100%',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',fontSize:13,fontFamily:'var(--font)',color:'#1e293b',outline:'none',background:'white',boxSizing:'border-box'};
  const iSdis:React.CSSProperties={...iS,background:'#f8fafc',color:'#94a3b8',cursor:'not-allowed'};

  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal-card" style={{maxWidth:680,maxHeight:'88vh',overflowY:'auto' as const}}>
        <div className="modal-header">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <IcoUsuarios/>
            <h3 style={{margin:0,fontSize:15,fontWeight:600,color:'#111827'}}>Nuevo usuario</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}><IcoClose/></button>
        </div>
        {error&&<div className="modal-error">{error}</div>}
        <div className="modal-body">

          {/* Fila 1: Nombre de usuario | Cédula */}
          <div className="form-row">
            <div className="form-field">
              <label>Nombre de usuario *</label>
              <input style={iS} type="text" autoComplete="off" value={form.usuario} onChange={e=>set('usuario',e.target.value)}/>
            </div>
            <div className="form-field">
              <label>Cédula *</label>
              <input style={iS} type="text" autoComplete="off" value={form.cedula} onChange={e=>set('cedula',e.target.value)}/>
            </div>
          </div>

          {/* Fila 2: Email | Celular */}
          <div className="form-row">
            <div className="form-field">
              <label>Email *</label>
              <input style={iS} type="text" autoComplete="off" value={form.email} onChange={e=>set('email',e.target.value)}/>
            </div>
            <div className="form-field">
              <label>Celular *</label>
              <input style={iS} type="tel" autoComplete="off" value={form.celular} onChange={e=>set('celular',e.target.value)}/>
            </div>
          </div>

          {/* Fila 3: Entidad del grupo | UEN */}
          <div className="form-row">
            <div className="form-field">
              <label>Entidad del grupo *</label>
              <select style={iS} value={form.entidadGrupo} onChange={e=>set('entidadGrupo',e.target.value)}>
                <option value="">— Seleccionar —</option>
                <option>Aseocolba</option>
                <option>Vigicolba</option>
                <option>Tempocolba</option>
              </select>
            </div>
            <div className="form-field">
              <label>UEN</label>
              <select style={iS} value={form.uen} onChange={e=>set('uen',e.target.value)}>
                <option value="">— Seleccionar —</option>
                {UEN_OPCIONES.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Fila 4: Proceso | Subproceso */}
          <div className="form-row">
            <div className="form-field">
              <label>Proceso</label>
              <select style={iS} value={form.proceso} onChange={e=>setProceso(e.target.value)}>
                <option value="">— Seleccione proceso —</option>
                {PROCESOS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Subproceso</label>
              <select
                style={subprocesos.length===0?iSdis:iS}
                value={form.subproceso}
                onChange={e=>set('subproceso',e.target.value)}
                disabled={subprocesos.length===0}>
                <option value="">{subprocesos.length===0?'Sin subprocesos':'— Seleccione —'}</option>
                {subprocesos.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Fila 5: Cargo | Rol */}
          <div className="form-row">
            <div className="form-field">
              <label>Cargo *</label>
              <input style={iS} type="text" autoComplete="off" value={form.cargo} onChange={e=>set('cargo',e.target.value)}/>
            </div>
            <div className="form-field">
              <label>Rol *</label>
              <select style={iS} value={form.rol} onChange={e=>set('rol',e.target.value)}>
                <option value="">— Seleccione rol —</option>
                <option>Administrador</option>
                <option>Gerencia</option>
                <option>Analista Mercadeo</option>
                <option>Director Comercial</option>
                <option>Coordinador Comercial</option>
                <option>Analista Comercial</option>
                <option>Usuario Final</option>
              </select>
            </div>
          </div>

          {/* Fila 6: Estado | Contraseña */}
          <div className="form-row">
            <div className="form-field">
              <label>Estado</label>
              <select style={iS} value={form.estado} onChange={e=>set('estado',e.target.value)}>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
            <div className="form-field">
              <label>Contraseña * <span style={{fontSize:10.5,color:'#9ca3af',fontWeight:400}}>(mín. 6)</span></label>
              <div style={{position:'relative'}}>
                <input style={{...iS,paddingRight:40}} type={showPass?'text':'password'} placeholder="••••••••" autoComplete="new-password" value={form.password} onChange={e=>set('password',e.target.value)}/>
                <button type="button" onClick={()=>setShowPass(v=>!v)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',border:'none',background:'transparent',cursor:'pointer',color:'#6b7280',width:24,height:24,padding:0,display:'flex',alignItems:'center',justifyContent:'center'}} tabIndex={-1}><PT v={showPass}/></button>
              </div>
            </div>
          </div>

        </div>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="modal-btn-save" onClick={handleGuardar} disabled={guardando}>{guardando?'Guardando…':'Guardar usuario'}</button>
        </div>
      </div>
    </div>
  );
}

function ModalEditarUsuario({usuario:u,onClose,onGuardado}:{usuario:User;onClose:()=>void;onGuardado:(updatedUser:User)=>void}){
  const [form,setForm]=useState({
    usuario:u.usuario, cedula:u.cedula, email:u.email, celular:u.celular,
    entidadGrupo:u.entidadGrupo, uen:u.uen??'',
    proceso:u.proceso??'', subproceso:u.subproceso??'',
    cargo:u.cargo, rol:u.rol, estado:u.estado,
    firmaDigital:u.firmaDigital??'', password:'',
  });
  const [showPass,setShowPass]=useState(false);
  const [guardando,setGuardando]=useState(false);
  const [error,setError]=useState('');

  const set=(f:keyof typeof form,v:string)=>setForm(p=>({...p,[f]:v}));
  const setProceso=(v:string)=>setForm(p=>({...p,proceso:v,subproceso:''}));
  const subprocesos=PROCESOS_SUBPROCESOS[form.proceso]||[];

  const PT=({v}:{v:boolean})=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:15,height:15}}>{v?<><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg>);

  const handleGuardar=async()=>{
    setError('');
    if(!form.cedula||!form.email||!form.usuario||!form.rol||!form.cargo||!form.entidadGrupo||!form.celular){
      setError('Todos los campos * son obligatorios.');return;
    }
    if(form.password&&form.password.length<6){setError('La contraseña debe tener al menos 6 caracteres.');return;}
    setGuardando(true);
    try{
      const payload:Record<string,unknown>={...form};
      if(!payload.password)delete payload.password;
      const res=await fetch(`/api/users/${u.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await res.json();
      if(!res.ok){setError(data.error??'Error al guardar.');return;}
      onGuardado(data as User);onClose();
    }catch{setError('No se pudo conectar.');}
    finally{setGuardando(false);}
  };

  const iS:React.CSSProperties={width:'100%',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',fontSize:13,fontFamily:'var(--font)',color:'#1e293b',outline:'none',background:'white',boxSizing:'border-box'};
  const iSdis:React.CSSProperties={...iS,background:'#f8fafc',color:'#94a3b8',cursor:'not-allowed'};

  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        <div className="modal-card" style={{maxWidth:680,maxHeight:'88vh',overflowY:'auto' as const}}>        <div className="modal-header">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <IcoPencil/>
            <h3 style={{margin:0,fontSize:15,fontWeight:600,color:'#111827'}}>Editar usuario</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}><IcoClose/></button>
        </div>
        {error&&<div className="modal-error">{error}</div>}
        <div className="modal-body">

          {/* Fila 1: Nombre de usuario | Cédula */}
          <div className="form-row">
            <div className="form-field">
              <label>Nombre de usuario *</label>
              <input style={iS} type="text" value={form.usuario} onChange={e=>set('usuario',e.target.value)}/>
            </div>
            <div className="form-field">
              <label>Cédula *</label>
              <input style={iS} type="text" value={form.cedula} onChange={e=>set('cedula',e.target.value)}/>
            </div>
          </div>

          {/* Fila 2: Email | Celular */}
          <div className="form-row">
            <div className="form-field">
              <label>Email *</label>
              <input style={iS} type="email" value={form.email} onChange={e=>set('email',e.target.value)}/>
            </div>
            <div className="form-field">
              <label>Celular *</label>
              <input style={iS} type="tel" value={form.celular} onChange={e=>set('celular',e.target.value)}/>
            </div>
          </div>

          {/* Fila 3: Entidad del grupo | UEN */}
          <div className="form-row">
            <div className="form-field">
              <label>Entidad del grupo *</label>
              <select style={iS} value={form.entidadGrupo} onChange={e=>set('entidadGrupo',e.target.value)}>
                <option value="">— Seleccionar —</option>
                <option>Aseocolba</option>
                <option>Vigicolba</option>
                <option>Tempocolba</option>
              </select>
            </div>
            <div className="form-field">
              <label>UEN</label>
              <select style={iS} value={form.uen} onChange={e=>set('uen',e.target.value)}>
                <option value="">— Seleccionar —</option>
                {UEN_OPCIONES.map(u=><option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Fila 4: Proceso | Subproceso */}
          <div className="form-row">
            <div className="form-field">
              <label>Proceso</label>
              <select style={iS} value={form.proceso} onChange={e=>setProceso(e.target.value)}>
                <option value="">— Seleccione proceso —</option>
                {PROCESOS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Subproceso</label>
              <select
                style={subprocesos.length===0?iSdis:iS}
                value={form.subproceso}
                onChange={e=>set('subproceso',e.target.value)}
                disabled={subprocesos.length===0}>
                <option value="">{subprocesos.length===0?'Sin subprocesos':'— Seleccione —'}</option>
                {subprocesos.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Fila 5: Cargo | Rol */}
          <div className="form-row">
            <div className="form-field">
              <label>Cargo *</label>
              <input style={iS} type="text" value={form.cargo} onChange={e=>set('cargo',e.target.value)}/>
            </div>
            <div className="form-field">
              <label>Rol *</label>
              <select style={iS} value={form.rol} onChange={e=>set('rol',e.target.value)}>
                <option value="">— Seleccione rol —</option>
                <option>Administrador</option>
                <option>Gerencia</option>
                <option>Analista Mercadeo</option>
                <option>Director Comercial</option>
                <option>Coordinador Comercial</option>
                <option>Analista Comercial</option>
                <option>Usuario Final</option>
              </select>
            </div>
          </div>

          {/* Fila 6: Estado | Nueva contraseña */}
          <div className="form-row">
            <div className="form-field">
              <label>Estado</label>
              <select style={iS} value={form.estado} onChange={e=>set('estado',e.target.value)}>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
            <div className="form-field">
              <label>Nueva contraseña <span style={{fontSize:10.5,color:'#9ca3af',fontWeight:400,marginLeft:6}}>(vacío = no cambiar)</span></label>
              <div style={{position:'relative'}}>
                <input style={{...iS,paddingRight:40}} type={showPass?'text':'password'} placeholder="••••••••" autoComplete="new-password" value={form.password} onChange={e=>set('password',e.target.value)}/>
                <button type="button" onClick={()=>setShowPass(v=>!v)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',border:'none',background:'transparent',cursor:'pointer',color:'#6b7280',width:24,height:24,padding:0,display:'flex',alignItems:'center',justifyContent:'center'}} tabIndex={-1}><PT v={showPass}/></button>
              </div>
            </div>
          </div>

        </div>
        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="modal-btn-save" onClick={handleGuardar} disabled={guardando}>{guardando?'Guardando…':'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  );
}
function ModalConfirmarEliminarUsuario({usuarios:sel,onClose,onEliminado,sesion}:{usuarios:User[];onClose:()=>void;onEliminado:()=>void;sesion:Sesion}){
  const [eliminando,setEliminando]=useState(false);const[error,setError]=useState('');
  const handleEliminar=async()=>{setError('');setEliminando(true);try{const r=await Promise.all(sel.map(u=>fetch(`/api/users/${u.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({deletedByUsuario:sesion.usuario,deletedByEmail:sesion.email})}).then(r=>r.json())));if(r.some((x:Record<string,unknown>)=>x.error)){setError('Algunos usuarios no pudieron eliminarse.');return;}onEliminado();onClose();}catch{setError('Error de conexión.');}finally{setEliminando(false);}};
  return(<div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-card" style={{maxWidth:420}}><div className="modal-header"><div style={{display:'flex',alignItems:'center',gap:8,color:'#ef4444'}}><IcoTrash/><h3 style={{margin:0,fontSize:15,fontWeight:600,color:'#111827'}}>Confirmar eliminación</h3></div><button className="modal-close-btn" onClick={onClose}><IcoClose/></button></div>{error&&<div className="modal-error">{error}</div>}<div className="modal-body"><p style={{fontSize:13,color:'#374151',margin:0}}>Vas a eliminar <strong>{sel.length} usuario{sel.length>1?'s':''}</strong>:</p><ul style={{margin:'10px 0 0',paddingLeft:18,fontSize:12,color:'#6b7280'}}>{sel.map(u=><li key={u.id}>{u.usuario} — {u.email}</li>)}</ul><p style={{fontSize:12,color:'#ef4444',marginTop:12,fontWeight:500}}>Esta acción no se puede deshacer.</p></div><div className="modal-actions"><button className="modal-btn-cancel" onClick={onClose} disabled={eliminando}>Cancelar</button><button onClick={handleEliminar} disabled={eliminando} style={{height:34,padding:'0 18px',border:'none',borderRadius:6,background:'#ef4444',color:'white',fontFamily:'var(--font)',fontSize:12,fontWeight:600,cursor:'pointer'}}>{eliminando?'Eliminando…':`Eliminar ${sel.length>1?sel.length+' usuarios':'usuario'}`}</button></div></div></div>);
}

/* =========================================================
   MODAL CONFIRMAR ELIMINAR SOLICITUD
========================================================= */
function ModalConfirmarEliminarSolicitud({solicitudes:sel,onClose,onEliminado,sesion}:{solicitudes:Solicitud[];onClose:()=>void;onEliminado:()=>void;sesion:Sesion}){
  const [eliminando,setEliminando]=useState(false);const[error,setError]=useState('');
  const handleEliminar=async()=>{
    setError('');setEliminando(true);
    try{
      const res=await fetch('/api/solicitudes',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:sel.map(s=>s.id),deletedByUsuario:sesion.usuario,deletedByEmail:sesion.email})});
      const data=await res.json();
      if(!res.ok||!data.ok){setError(data.error??'Error al eliminar.');return;}
      onEliminado();onClose();
    }catch{setError('Error de conexión.');}finally{setEliminando(false);}
  };
  return(<div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-card" style={{maxWidth:420}}><div className="modal-header"><div style={{display:'flex',alignItems:'center',gap:8,color:'#ef4444'}}><IcoTrash/><h3 style={{margin:0,fontSize:15,fontWeight:600,color:'#111827'}}>Confirmar eliminación</h3></div><button className="modal-close-btn" onClick={onClose}><IcoClose/></button></div>{error&&<div className="modal-error">{error}</div>}<div className="modal-body"><p style={{fontSize:13,color:'#374151',margin:0}}>Vas a eliminar <strong>{sel.length} solicitud{sel.length>1?'es':''}</strong>:</p><ul style={{margin:'10px 0 0',paddingLeft:18,fontSize:12,color:'#6b7280'}}>{sel.map(s=><li key={s.id}>Solicitud #{s.id} — {s.entidad||s.codigoProceso||'Sin nombre'}</li>)}</ul><p style={{fontSize:12,color:'#64748b',marginTop:12}}>Los registros se moverán a <strong>Solicitudes eliminadas</strong> y podrán recuperarse.</p></div><div className="modal-actions"><button className="modal-btn-cancel" onClick={onClose} disabled={eliminando}>Cancelar</button><button onClick={handleEliminar} disabled={eliminando} style={{height:34,padding:'0 18px',border:'none',borderRadius:6,background:'#ef4444',color:'white',fontFamily:'var(--font)',fontSize:12,fontWeight:600,cursor:'pointer'}}>{eliminando?'Eliminando…':`Eliminar ${sel.length>1?sel.length+' solicitudes':'solicitud'}`}</button></div></div></div>);
}

/* =========================================================
   Exportación a Excel
========================================================= */
function exportarExcel(usuarios:User[]){
  const hacer=(XLSX:XlsxLike)=>{const cab=['ID','Cédula','Celular','Entidad del grupo','Cargo','Email','Usuario','Rol','Estado'];const filas=usuarios.map(u=>[u.id,u.cedula,u.celular,u.entidadGrupo,u.cargo,u.email,u.usuario,u.rol,u.estado]);const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([cab,...filas]);XLSX.utils.book_append_sheet(wb,ws,'Usuarios');XLSX.writeFile(wb,`usuarios_${new Date().toISOString().slice(0,10)}.xlsx`);};
  const xlsx = getWindowXlsx();
  if(xlsx){hacer(xlsx);return;}
  const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload=()=>{const loadedXlsx=getWindowXlsx();if(loadedXlsx)hacer(loadedXlsx);};document.head.appendChild(s);
}

/* =========================================================
   Módulo de usuarios
========================================================= */
function ModuloUsuarios({sesion,onSesionActualizada}:{sesion:Sesion;onSesionActualizada:(s:Sesion)=>void}){
  const [usuarios,setUsuarios]=useState<User[]>([]);
  const [cargando,setCargando]=useState(true);
  const [errorCarga,setErrorCarga]=useState('');
  const [busqueda,setBusqueda]=useState('');
  const [seleccionados,setSeleccionados]=useState<number[]>([]);
  const [modalAbierto,setModalAbierto]=useState(false);
  const [modalEditar,setModalEditar]=useState<User|null>(null);
  const [modalEliminar,setModalEliminar]=useState(false);
  // Paginación local
  const [pagina,setPagina]=useState(1);
  const POR_PAGINA=8;

 
  const cargarUsuarios=useCallback(async()=>{
    setCargando(true);setErrorCarga('');
    try{
      const res=await fetch('/api/users');
      if(!res.ok)throw new Error();
      setUsuarios(await res.json());
    }catch{setErrorCarga('No se pudo cargar usuarios.');}
    finally{setCargando(false);}
  },[]);
 
  useEffect(()=>{cargarUsuarios();},[cargarUsuarios]);
 
  // Resetear página al cambiar búsqueda
  useEffect(()=>{setPagina(1);},[busqueda]);
 
  const filtrados=usuarios.filter(u=>{
    const q=busqueda.toLowerCase();
    return[u.cedula,u.entidadGrupo,u.cargo,u.email,u.usuario,u.rol].some(v=>v.toLowerCase().includes(q));
  });
 
  // Paginación
  const totalPages=Math.max(1,Math.ceil(filtrados.length/POR_PAGINA));
  const inicio=(pagina-1)*POR_PAGINA;
  const fin=inicio+POR_PAGINA;
  const paginados=filtrados.slice(inicio,fin);
 
  const pagesArr=(()=>{
    const t=totalPages;
    if(t<=7)return Array.from({length:t},(_,i)=>i+1);
    const arr:(number|-1)[]=[];
    arr.push(1);
    if(pagina>3)arr.push(-1);
    for(let i=Math.max(2,pagina-1);i<=Math.min(t-1,pagina+1);i++)arr.push(i);
    if(pagina<t-2)arr.push(-1);
    arr.push(t);
    return arr;
  })();

 
  const todosMarcados=paginados.length>0&&paginados.every(u=>seleccionados.includes(u.id));
  const toggleAll=(c:boolean)=>{
    if(c)setSeleccionados(p=>[...new Set([...p,...paginados.map(u=>u.id)])]);
    else setSeleccionados(p=>p.filter(id=>!paginados.map(u=>u.id).includes(id)));
  };
  const toggleOne=(id:number,c:boolean)=>setSeleccionados(p=>c?[...p,id]:p.filter(x=>x!==id));
 
  if(cargando)return<div className="content"><div className="module-status">Cargando usuarios…</div></div>;
  if(errorCarga)return<div className="content"><div className="module-status error">{errorCarga}</div></div>;
 
  return(
    <>
      {modalAbierto&&<ModalNuevoUsuario onClose={()=>setModalAbierto(false)} onCreado={cargarUsuarios}/>}
      {modalEditar&&<ModalEditarUsuario usuario={modalEditar} onClose={()=>setModalEditar(null)} onGuardado={(updatedUser)=>{setSeleccionados([]);cargarUsuarios();if(updatedUser.email===sesion.email){const s:Sesion={usuario:updatedUser.usuario,cargo:updatedUser.cargo,email:updatedUser.email,entidadGrupo:updatedUser.entidadGrupo,rol:updatedUser.rol};guardarSesion(s);onSesionActualizada(s);}}}/>}
      {modalEliminar&&<ModalConfirmarEliminarUsuario usuarios={usuarios.filter(u=>seleccionados.includes(u.id))} onClose={()=>setModalEliminar(false)} onEliminado={()=>{setSeleccionados([]);cargarUsuarios();}} sesion={sesion}/>}
 
      <div className="content">
        <div className="page-header">
          <div className="page-title"><IcoUsuarios/><span>Usuarios : {filtrados.length} / {usuarios.length}</span></div>
          <div className="page-actions">
            <input type="text" className="search-box" placeholder="Buscar…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
            <button className="icon-btn" title="Información"><IcoInfo/></button>
            <button className="icon-btn" title="Actualizar" onClick={()=>{setBusqueda('');cargarUsuarios();}}><IcoRefresh/></button>
            <button className="icon-btn blue-fill" title="Nuevo usuario" onClick={()=>setModalAbierto(true)}><IcoPlus/></button>
            <button className="icon-btn" title="Editar" disabled={seleccionados.length!==1} onClick={()=>{const u=usuarios.find(u=>u.id===seleccionados[0]);if(u)setModalEditar(u);}}><IcoPencil/></button>
            <button className="icon-btn red" title="Eliminar" disabled={seleccionados.length===0} onClick={()=>setModalEliminar(true)}><IcoTrash/></button>
            <button className="icon-btn green" title="Exportar Excel" onClick={()=>exportarExcel(filtrados)}><IcoExcel/></button>
          </div>
        </div>
 
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{width:36}}>
                    <div className="th-top">
                      <input type="checkbox" className="cbx" checked={todosMarcados} onChange={e=>toggleAll(e.target.checked)}/>
                    </div>
                  </th>
                  {([[160,'Usuario'],[140,'Cédula'],[220,'Email'],[130,'Celular'],[180,'Entidad del grupo'],[120,'UEN'],[160,'Proceso'],[160,'Subproceso'],[180,'Cargo'],[160,'Rol'],[110,'Estado']] as [number,string][]).map(([w,label])=>(                    <th key={label} style={{minWidth:w}}><div className="th-top">{label}</div></th>
                  ))}
                  <th style={{minWidth:110,textAlign:'center'}}><div className="th-top">Firma digital</div></th>
                </tr>
              </thead>
              <tbody>
                {paginados.length===0
                  ?<tr><td colSpan={13} style={{textAlign:'center',color:'#94a3b8',padding:'28px 10px',fontSize:12}}>{busqueda?`Sin resultados para "${busqueda}".`:'No hay usuarios registrados.'}</td></tr>
                  :paginados.map(u=>(
                    <tr key={u.id}>
                      <td className="center"><input type="checkbox" className="cbx" checked={seleccionados.includes(u.id)} onChange={e=>toggleOne(u.id,e.target.checked)}/></td>
                      <td>{u.usuario}</td>
                      <td>{u.cedula}</td>
                      <td>{u.email}</td>
                      <td>{u.celular}</td>
                      <td>{u.entidadGrupo}</td>
                      <td>{u.uen||'—'}</td>
                      <td>{u.proceso||'—'}</td>
                      <td>{u.subproceso||'—'}</td>
                      <td>{u.cargo}</td>
                      <td>{u.rol}</td>
                      <td><span className="badge" style={{background:u.estado==='Activo'?'#d1fae5':'#fee2e2',color:u.estado==='Activo'?'#065f46':'#dc2626'}}>{u.estado}</span></td>
                      <td style={{textAlign:'center'}}>
                        <button className="firma-btn" title="Cargar firma digital"
                          onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#EAF2FB';}}
                          onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
                          <IcoUpload/>
                        </button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
 
          {/* PAGINACIÓN */}
          <div className="pagination-bar">
            <span>
              {filtrados.length>0
                ?`${inicio+1}–${Math.min(fin,filtrados.length)} de ${filtrados.length} usuarios`
                :'0 usuarios'}
            </span>
            <div className="pages">
              <button className="page-btn page-btn-nav" onClick={()=>setPagina(p=>p-1)} disabled={pagina<=1}>
                <svg viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 1L1 7l6 6"/></svg>
                Anterior
              </button>
              {pagesArr.map((n,i)=>
                n===-1
                  ?<span key={`el${i}`} style={{padding:'0 3px',color:'#9ca3af',fontSize:12}}>…</span>
                  :<button key={n} className={`page-btn${n===pagina?' active':''}`} onClick={()=>setPagina(n)}>{n}</button>
              )}
              <button className="page-btn page-btn-nav" onClick={()=>setPagina(p=>p+1)} disabled={pagina>=totalPages}>
                Siguiente
                <svg viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l6 6-6 6"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ModuloPerfiles({sesion}:{sesion:Sesion}){
  const [usuarios,setUsuarios]=React.useState<User[]>([]);
  const [cargando,setCargando]=React.useState(true);
  const [error,setError]=React.useState('');
  const [busqueda,setBusqueda]=React.useState('');
  const [editando,setEditando]=React.useState<User|null>(null);
  const [guardando,setGuardando]=React.useState(false);
  const [errorEdit,setErrorEdit]=React.useState('');
  const [rolEdit,setRolEdit]=React.useState('');

  const ROLES_SISTEMA=[
    'Administrador','Gerencia','Analista Mercadeo',
    'Director Comercial','Coordinador Comercial',
    'Analista Comercial','Usuario Final',
  ];

  const cargar=React.useCallback(async()=>{
    setCargando(true);setError('');
    try{
      const res=await fetch('/api/users');
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Error');
      setUsuarios(Array.isArray(data)?data:[]);
    }catch(e){setError(e instanceof Error?e.message:'Error al cargar');}
    finally{setCargando(false);}
  },[]);

  React.useEffect(()=>{cargar();},[cargar]);

  const filtrados=usuarios.filter(u=>{
    if(!busqueda)return true;
    const q=busqueda.toLowerCase();
    return(
      u.usuario.toLowerCase().includes(q)||
      u.cargo.toLowerCase().includes(q)||
      u.rol.toLowerCase().includes(q)||
      u.entidadGrupo.toLowerCase().includes(q)
    );
  });

  const abrirEdicion=(u:User)=>{
    setEditando(u);
    setRolEdit(u.rol);
    setErrorEdit('');
  };

  const guardarRol=async()=>{
    if(!editando||!rolEdit){setErrorEdit('Selecciona un rol.');return;}
    setGuardando(true);setErrorEdit('');
    try{
      const res=await fetch(`/api/users/${editando.id}`,{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          usuario:editando.usuario,
          cedula:editando.cedula,
          email:editando.email,
          celular:editando.celular,
          entidadGrupo:editando.entidadGrupo,
          cargo:editando.cargo,
          estado:editando.estado,
          rol:rolEdit,
        }),
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Error al guardar');
      setUsuarios(prev=>prev.map(u=>u.id===editando.id?{...u,rol:rolEdit}:u));
      setEditando(null);
    }catch(e){setErrorEdit(e instanceof Error?e.message:'Error al guardar');}
    finally{setGuardando(false);}
  };

  const rolColor=(rol:string)=>{
    const r=rol.toLowerCase();
    if(r.includes('admin'))return{bg:'#fef3c7',color:'#92400e'};
    if(r.includes('gerencia'))return{bg:'#e0e7ff',color:'#3730a3'};
    if(r.includes('mercadeo'))return{bg:'#d1fae5',color:'#065f46'};
    if(r.includes('director'))return{bg:'#fee2e2',color:'#991b1b'};
    if(r.includes('coordinador'))return{bg:'#fce7f3',color:'#9d174d'};
    if(r.includes('analista comercial'))return{bg:'#e0f2fe',color:'#0369a1'};
    return{bg:'#f1f5f9',color:'#475569'};
  };

  const F='var(--font)';

  if(cargando)return<div className="content"><div className="module-status">Cargando perfiles…</div></div>;
  if(error)return<div className="content"><div className="module-status error">{error}</div></div>;

  return(
    <>
      {/* Modal edición de rol */}
      {editando&&(
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setEditando(null);}}>
          <div style={{background:'white',borderRadius:12,width:'94vw',maxWidth:460,boxShadow:'0 20px 60px rgba(15,32,64,.2)',overflow:'hidden',border:'1px solid #e2e8f0'}}>
            <div style={{padding:'18px 24px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:'#0f172a',fontFamily:F}}>Cambiar rol</div>
                <div style={{fontSize:12,color:'#94a3b8',fontFamily:F,marginTop:2}}>{editando.usuario} · {editando.cargo}</div>
              </div>
              <button onClick={()=>setEditando(null)} style={{width:30,height:30,borderRadius:8,border:'1.5px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8'}}
                onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}}
                onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{padding:'20px 24px',display:'flex',flexDirection:'column' as const,gap:14}}>
              {errorEdit&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:12,fontFamily:F}}>⚠️ {errorEdit}</div>}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:6}}>Rol actual</div>
                <span style={{display:'inline-flex',alignItems:'center',fontSize:12,fontWeight:600,padding:'4px 12px',borderRadius:999,...rolColor(editando.rol),fontFamily:F}}>{editando.rol||'Sin rol'}</span>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:6}}>Nuevo rol *</div>
                <select value={rolEdit} onChange={e=>setRolEdit(e.target.value)}
                  style={{width:'100%',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',fontSize:13,fontFamily:F,color:'#1e293b',outline:'none',background:'white',boxSizing:'border-box' as const}}>
                  <option value="">— Seleccione —</option>
                  {ROLES_SISTEMA.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#64748b',fontFamily:F,lineHeight:1.6}}>
                <strong style={{color:'#374151'}}>Descripción del rol:</strong>
                {rolEdit==='Administrador'&&' Acceso total a todos los módulos y acciones del sistema.'}
                {rolEdit==='Gerencia'&&' Solo lectura en todos los módulos. No puede modificar registros.'}
                {rolEdit==='Analista Mercadeo'&&' Gestiona búsqueda de procesos y crea solicitudes desde búsqueda.'}
                {rolEdit==='Director Comercial'&&' Gestión completa de solicitudes y asignaciones comerciales.'}
                {rolEdit==='Coordinador Comercial'&&' Gestión de solicitudes y asignaciones. Sin acceso a administración.'}
                {rolEdit==='Analista Comercial'&&' Gestiona asignaciones pendientes. No puede crear solicitudes.'}
                {rolEdit==='Usuario Final'&&' Visualización limitada. Solo puede ver dashboard, documentos y cronogramas.'}
                {!rolEdit&&' Selecciona un rol para ver su descripción.'}
              </div>
            </div>
            <div style={{padding:'14px 24px',borderTop:'1px solid #f1f5f9',display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setEditando(null)} disabled={guardando}
                style={{height:36,padding:'0 16px',borderRadius:8,border:'1.5px solid #e2e8f0',background:'white',color:'#475569',fontSize:12.5,fontFamily:F,cursor:'pointer'}}>
                Cancelar
              </button>
              <button onClick={guardarRol} disabled={guardando||!rolEdit}
                style={{height:36,padding:'0 20px',borderRadius:8,background:guardando||!rolEdit?'#e2e8f0':'#1e5799',color:guardando||!rolEdit?'#94a3b8':'white',border:'none',fontSize:12.5,fontWeight:600,fontFamily:F,cursor:guardando||!rolEdit?'not-allowed':'pointer'}}
                onMouseOver={e=>{if(!guardando&&rolEdit)(e.currentTarget as HTMLButtonElement).style.background='#174a85';}}
                onMouseOut={e=>{if(!guardando&&rolEdit)(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
                {guardando?'Guardando…':'Guardar rol'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="content">
        <div className="page-header">
          <div className="page-title">
            <IcoUsuarios/>
            <span>Perfiles y roles : {filtrados.length} / {usuarios.length}</span>
          </div>
          <div className="page-actions">
            <input type="text" className="search-box" placeholder="Buscar usuario…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
            <button className="icon-btn" title="Actualizar" onClick={cargar}><IcoRefresh/></button>
          </div>
        </div>

        {/* Resumen por rol */}
        <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap' as const}}>
          {ROLES_SISTEMA.map(rol=>{
            const count=usuarios.filter(u=>u.rol===rol).length;
            if(count===0)return null;
            const rc=rolColor(rol);
            return(
              <div key={rol} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',background:'white',border:'1px solid #e2e8f0',borderRadius:10,cursor:'pointer',transition:'all .15s'}}
                onClick={()=>setBusqueda(rol)}
                onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#1e5799';}}
                onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#e2e8f0';}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:rc.color,flexShrink:0}}/>
                <span style={{fontSize:12,fontWeight:600,color:'#374151',fontFamily:F}}>{rol}</span>
                <span style={{fontSize:11,fontWeight:700,color:rc.color,background:rc.bg,padding:'1px 7px',borderRadius:999,fontFamily:F}}>{count}</span>
              </div>
            );
          })}
        </div>

        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{minWidth:160}}><div className="th-top">Usuario</div></th>
                  <th style={{minWidth:160}}><div className="th-top">Cargo</div></th>
                  <th style={{minWidth:130}}><div className="th-top">Entidad grupo</div></th>
                  <th style={{minWidth:160}}><div className="th-top">Rol actual</div></th>
                  <th style={{minWidth:80}}><div className="th-top">Estado</div></th>
                  <th style={{minWidth:80}}><div className="th-top">Acción</div></th>
                </tr>
                <tr>{[0,1,2,3,4,5].map(i=><th key={i}><div style={{padding:'0 10px 5px',color:'#d1d5db',fontSize:11}}>≡</div></th>)}</tr>
              </thead>
              <tbody>
                {filtrados.length===0
                  ?<tr><td colSpan={6} style={{textAlign:'center',color:'#6b7280',padding:'36px 10px',fontSize:13}}>No se encontraron usuarios.</td></tr>
                  :filtrados.map(u=>{
                    const rc=rolColor(u.rol);
                    const pc=perfilColor(u.entidadGrupo);
                    return(
                      <tr key={u.id}>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{width:28,height:28,borderRadius:'50%',background:'#1e5799',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0,fontFamily:F}}>{u.usuario.slice(0,2).toUpperCase()}</div>
                            <div>
                              <div style={{fontSize:12.5,fontWeight:600,color:'#0f172a',fontFamily:F}}>{u.usuario}</div>
                              <div style={{fontSize:11,color:'#94a3b8',fontFamily:F}}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{fontSize:12,color:'#374151',fontFamily:F}}>{u.cargo}</td>
                        <td>
                          <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:pc.bg,color:pc.color,whiteSpace:'nowrap' as const}}>{pc.label}</span>
                        </td>
                        <td>
                          <span style={{display:'inline-flex',alignItems:'center',fontSize:11.5,fontWeight:600,padding:'4px 12px',borderRadius:999,background:rc.bg,color:rc.color,fontFamily:F,whiteSpace:'nowrap' as const}}>{u.rol||'Sin rol'}</span>
                        </td>
                        <td>
                          <span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:u.estado==='Activo'?'#E8F5E9':'#f1f5f9',color:u.estado==='Activo'?'#1B5E20':'#475569',whiteSpace:'nowrap' as const}}>{u.estado}</span>
                        </td>
                        <td>
                          <button onClick={()=>abrirEdicion(u)}
                            style={{height:30,padding:'0 12px',borderRadius:7,border:'1.5px solid #e2e8f0',background:'white',color:'#1e5799',fontSize:11.5,fontWeight:600,fontFamily:F,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,transition:'all .15s'}}
                            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#1e5799';(e.currentTarget as HTMLButtonElement).style.background='#eff6ff';}}
                            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLButtonElement).style.background='white';}}>
                            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Cambiar rol
                          </button>
                        </td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
          <div className="pagination-bar">
            <span>{filtrados.length} de {usuarios.length} usuarios</span>
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================================================
   MODAL DOCUMENTOS (Búsqueda)
========================================================= */
function ModalDocumentos({p,onClose}:{p:LiciProceso;onClose:()=>void}){
  const docs=p.documentos??[];
  const extInfo=(d:LiciDocumento)=>{const src=(d.ruta||d.url||'').toLowerCase();if(src.includes('.xlsx')||src.includes('.xls'))return{bg:'#E8F5E9',color:'#1B5E20',border:'#A5D6A7',label:'XLS'};if(src.includes('.docx')||src.includes('.doc'))return{bg:'#E3F2FD',color:'#0D47A1',border:'#90CAF9',label:'DOC'};if(src.includes('.zip')||src.includes('.rar'))return{bg:'#F3E5F5',color:'#4A148C',border:'#CE93D8',label:'ZIP'};return{bg:'#FFEBEE',color:'#B71C1C',border:'#EF9A9A',label:'PDF'};};
  return(<div className="modal-overlay" style={{zIndex:1100}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div style={{background:'white',borderRadius:12,width:'92vw',maxWidth:760,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(15,32,64,.18)',overflow:'hidden',border:'1px solid #e2e8f0'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 24px',borderBottom:'1px solid #f1f5f9',flexShrink:0}}><div><h3 style={{margin:0,fontSize:15,fontWeight:700,color:'#0f172a'}}>Documentos del proceso</h3><div style={{fontSize:11.5,color:'#64748b',marginTop:3}}>{p.entidad||''}{p.codigoProceso?` · ${p.codigoProceso}`:''}</div></div><button onClick={onClose} style={{width:30,height:30,borderRadius:'50%',background:'white',border:'1px solid #e2e8f0',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8'}} onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><div style={{padding:'10px 24px',background:'#EAF2FB',borderBottom:'1px solid #D0E4F3',flexShrink:0,display:'flex',alignItems:'center',gap:10}}><div style={{width:28,height:28,borderRadius:6,background:'#1E5799',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg fill="none" stroke="white" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg></div><span style={{fontSize:12.5,color:'#1E5799',fontWeight:500}}><strong style={{fontWeight:700}}>{docs.length}</strong> documento{docs.length!==1?'s':''} disponible{docs.length!==1?'s':''} para descarga</span></div><div style={{overflowY:'auto',flex:1,padding:'14px 20px',display:'flex',flexDirection:'column',gap:6}}>{docs.length===0?<div style={{textAlign:'center',color:'#94a3b8',padding:'40px 0',fontSize:13}}>No hay documentos disponibles.</div>:docs.map((d,i)=>{const ext=extInfo(d);const url=d.ruta||d.url||'';return(<div key={i} style={{display:'flex',alignItems:'center',gap:12,background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 14px'}} onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#A8CCEC';(e.currentTarget as HTMLDivElement).style.background='#FAFCFF';}} onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLDivElement).style.background='white';}}><div style={{width:40,height:40,borderRadius:8,flexShrink:0,background:ext.bg,border:`1px solid ${ext.border}`,color:ext.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800}}>{ext.label}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.nombre||`Documento ${i+1}`}</div>{url&&<div style={{fontSize:10.5,color:'#94a3b8',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{url}</div>}</div>{url?<a href={url} target="_blank" rel="noopener noreferrer" style={{flexShrink:0,display:'inline-flex',alignItems:'center',gap:5,height:30,padding:'0 14px',borderRadius:6,background:'#1E5799',color:'white',fontSize:11.5,fontWeight:600,textDecoration:'none',whiteSpace:'nowrap'}}><svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar</a>:<span style={{fontSize:11,color:'#94a3b8',flexShrink:0}}>Sin enlace</span>}</div>);})}</div><div style={{padding:'10px 20px',borderTop:'1px solid #f1f5f9',flexShrink:0,display:'flex',justifyContent:'flex-end'}}><button onClick={onClose} style={{height:32,padding:'0 18px',borderRadius:6,border:'1px solid #e2e8f0',background:'white',color:'#374151',fontSize:12,fontWeight:500,fontFamily:'var(--font)',cursor:'pointer'}}>Cerrar</button></div></div></div>);
}

function CopiarLinkBtn({url}:{url:string}){
  const[copiado,setCopiado]=React.useState(false);
  const copiar=(e:React.MouseEvent)=>{
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(()=>{
      setCopiado(true);
      setTimeout(()=>setCopiado(false),1800);
    });
  };
  return(
    <button onClick={copiar} style={{
      flexShrink:0,
      display:'inline-flex',
      alignItems:'center',
      gap:5,
      height:28,
      padding:'0 12px',
      borderRadius:6,
      border:'1.5px solid #e2e8f0',
      color:'#475569',
      background:copiado?'#f8fafc':'white',
      fontSize:11,
      fontWeight:600,
      cursor:'pointer',
      fontFamily:'var(--font)',
      whiteSpace:'nowrap' as const,
      transition:'all .2s',
    }}>
      {copiado
        ?<><svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M20 6L9 17l-5-5"/></svg>Copiado</>
        :<><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copiar</>
      }
    </button>
  );
}function useSecopLink(codigoProceso:string,aliasFuente:string){const[link,setLink]=React.useState<string|null>(null);const[loading,setLoading]=React.useState(false);React.useEffect(()=>{if(!codigoProceso)return;const alias=aliasFuente.toUpperCase();if(alias!=='S1'&&alias!=='S2')return;setLoading(true);fetch(`/api/licitaciones/secop-link?codigo=${encodeURIComponent(codigoProceso)}&alias=${alias}`).then(r=>r.json()).then(data=>{if(data.ok&&data.link)setLink(data.link);}).catch(()=>{}).finally(()=>setLoading(false));},[codigoProceso,aliasFuente]);return{link,loading};}

function VerDocumentosBtn({p}:{p:LiciProceso}){const[open,setOpen]=React.useState(false);return(<>{open&&<ModalDocumentos p={p} onClose={()=>setOpen(false)}/>}<button onClick={e=>{e.stopPropagation();setOpen(true);}} style={{display:'inline-flex',alignItems:'center',gap:6,height:28,padding:'0 14px',borderRadius:20,border:'1.5px solid #1E5799',color:'#1E5799',background:'white',fontSize:11,fontWeight:600,fontFamily:'var(--font)',cursor:'pointer'}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>Ver documentos{(p.documentos?.length??0)>0?` (${p.documentos!.length})`:''}</button></>);}

function ModalDetalleProceso({p,onClose,onGestionar}:{p:LiciProceso;onClose:()=>void;onGestionar?:()=>Promise<void>}){
  const [docVista,setDocVista]=React.useState<'grid'|'list'>('list');
  const [guardando,setGuardando]=useState(false);
  const [errorGuardar,setErrorGuardar]=useState('');

  const fmt=(raw:string|null)=>{if(!raw)return null;const d=new Date(raw.replace(' ','T'));if(Number.isNaN(d.getTime()))return raw;return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});};
  const fmtV=(v:number|null)=>{if(v==null||Number.isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};

  const portal=portalColorModal(p.aliasFuente||'',p.fuente||'',p.fuente||'');
  const eb=estadoModalColor(p.estado||'');
  const pc=p.perfil?perfilColor(p.perfil):null;
  const {link:secopLink,loading:secopLoading}=useSecopLink(p.codigoProceso||'',p.aliasFuente||'');
  const modalidadLabel=p.modalidad?(MMAP_MODALIDAD[p.modalidad]??p.modalidad):null;
  const valor=fmtV(p.valor);
  const hasDoc=p.documentos&&p.documentos.length>0;
  const hasCron=p.cronogramas&&p.cronogramas.length>0;

  const fuentes:Array<{label:string;url:string}>=[];
  if(p.fuentes?.length){p.fuentes.forEach(f=>{const u=String(f.url||f.link||'');if(u)fuentes.push({label:String(f.nombre||portal.label),url:u});});}
  if(!fuentes.length&&p.linkSecop)fuentes.push({label:portal.label,url:p.linkSecop});
  if(!fuentes.length&&p.linkDetalle)fuentes.push({label:portal.label,url:p.linkDetalle});

  const hG=async()=>{if(!onGestionar)return;setGuardando(true);setErrorGuardar('');try{await onGestionar();}catch(e){setErrorGuardar(e instanceof Error?e.message:'Error al guardar.');}finally{setGuardando(false);}};

  // Estilos base del módulo
  const F='var(--font)';
  const FS=13;
  const FC='#334155';
  const FC_LABEL='#94a3b8';
  const FC_DARK='#0f172a';
  const baseText:React.CSSProperties={fontSize:FS,color:FC,fontFamily:F,lineHeight:1.5};
  const labelStyle:React.CSSProperties={fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:4};
  const secTitle:React.CSSProperties={fontSize:13,fontWeight:700,color:'#0f172a',fontFamily:F,letterSpacing:'-0.01em',marginBottom:12,paddingBottom:8,borderBottom:'1px solid #f1f5f9'};

  const SideItem=({label,children}:{label:string;children:React.ReactNode})=>(
  <div>
    <div style={{fontSize:10,fontWeight:700,color:'#374151',letterSpacing:'0.04em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:4}}>{label}</div>
    <div style={{...baseText,fontSize:12.5}}>{children}</div>
  </div>
);

  React.useEffect(()=>{
    const cols=document.querySelectorAll('.modal-scroll-col');
    cols.forEach(col=>{
      col.addEventListener('mouseenter',()=>{(col as HTMLElement).style.scrollbarColor='#94a3b8 transparent';});
      col.addEventListener('mouseleave',()=>{(col as HTMLElement).style.scrollbarColor='transparent transparent';});
    });
  },[]);

  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'white',borderRadius:16,width:'96vw',maxWidth:980,maxHeight:'92vh',display:'flex',flexDirection:'column' as const,boxShadow:'0 24px 64px rgba(15,23,42,0.18)',overflow:'hidden',border:'1px solid #e2e8f0'}}>

        {/* HEADER */}
        <div style={{background:'white',borderBottom:'1px solid #f1f5f9',padding:'16px 24px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:42,height:42,borderRadius:10,background:'#1e5799',color:'white',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,letterSpacing:'0.04em',fontFamily:F}}>{portal.short}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:FC_DARK,letterSpacing:'-0.02em',lineHeight:1.25,marginBottom:5,fontFamily:F}}>{p.entidad||'Detalle del proceso'}</div>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                {p.codigoProceso&&<span style={{fontSize:11,color:'#64748b',background:'#f8fafc',border:'1px solid #e8edf2',padding:'2px 9px',borderRadius:5,fontFamily:'monospace'}}>{p.codigoProceso}</span>}
                {pc&&<span style={{fontSize:11,color:pc.color,background:pc.bg,padding:'2px 9px',borderRadius:999,fontWeight:600,fontFamily:F}}>{pc.label}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:'1.5px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',flexShrink:0,transition:'all .15s'}}
              onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';(e.currentTarget as HTMLButtonElement).style.borderColor='#fca5a5';}}
              onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';(e.currentTarget as HTMLButtonElement).style.borderColor='#e2e8f0';}}>
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* BODY: 2 columnas */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 280px',flex:1,minHeight:0,overflow:'hidden'}}>

          {/* COL IZQUIERDA */}
          <div className="modal-scroll-col" style={{overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column' as const,gap:22,scrollbarWidth:'thin' as const,scrollbarColor:'transparent transparent'}}>

            {/* 1. Objeto */}
            {(p.objeto||p.nombre)&&(
              <div>
                <div style={secTitle}>Objeto del proceso</div>
                <p style={{margin:0,...baseText,lineHeight:1.7}}>
                  {(p.objeto||p.nombre||'').charAt(0).toUpperCase()+(p.objeto||p.nombre||'').slice(1).toLowerCase()}
                </p>
              </div>
            )}

            {/* 2. Cronograma */}
            {(p.fechaPublicacion||p.fechaVencimiento||hasCron)&&(
              <div>
                <div style={secTitle}>Cronograma de fechas</div>
                <div style={{display:'flex',flexDirection:'column' as const}}>
                  {fmt(p.fechaPublicacion)&&(
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #f8fafc'}}>
                      <span style={{...baseText,color:'#64748b'}}>Fecha de publicación</span>
                      <span style={baseText}>{fmt(p.fechaPublicacion)}</span>
                    </div>
                  )}
                  {fmt(p.fechaVencimiento)&&(
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:hasCron?'1px solid #f8fafc':'none'}}>
                      <span style={{...baseText,color:'#64748b'}}>Fecha de vencimiento</span>
                      <span style={baseText}>{fmt(p.fechaVencimiento)}</span>
                    </div>
                  )}
                  {hasCron&&p.cronogramas!.map((cr,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:i<p.cronogramas!.length-1?'1px solid #f8fafc':'none'}}>
                      <span style={{...baseText,color:'#64748b',flex:1,paddingRight:16}}>{cr.nombre||`Etapa ${i+1}`}</span>
                      <span style={{...baseText,whiteSpace:'nowrap' as const}}>{cr.fecha||'—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Documentos */}
            {hasDoc&&(
              <div>
                <div style={{...secTitle,display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <span>Documentos ({p.documentos!.length})</span>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    {[{v:'grid',ico:<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>},{v:'list',ico:<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}].map(({v,ico})=>(
                      <button key={v} onClick={()=>setDocVista(v as 'grid'|'list')}
                        style={{width:30,height:28,borderRadius:6,border:'1.5px solid #e2e8f0',background:docVista===v?'#1e5799':'white',color:docVista===v?'white':'#64748b',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>
                        {ico}
                      </button>
                    ))}
                  </div>
                </div>

                {docVista==='grid'
                  ?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:10}}>
                    {p.documentos!.map((d,i)=>{
                      const url=String(d.url||d.link||d.ruta||'');
                      const s=url.toLowerCase();
                      const ext=s.includes('.xlsx')||s.includes('.xls')?{bg:'#f0fdf4',color:'#475569',label:'XLS'}:s.includes('.docx')||s.includes('.doc')?{bg:'#eff6ff',color:'#1d4ed8',label:'DOC'}:s.includes('.zip')||s.includes('.rar')?{bg:'#faf5ff',color:'#7e22ce',label:'ZIP'}:{bg:'#fff1f2',color:'#be123c',label:'PDF'};
                      return(
                        <a key={i} href={url||'#'} target="_blank" rel="noopener noreferrer"
                          style={{display:'flex',flexDirection:'column' as const,alignItems:'center',gap:8,padding:'12px 8px',border:'1px solid #f1f5f9',borderRadius:10,textDecoration:'none',background:'white',transition:'all .15s',position:'relative' as const}}
                          onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLAnchorElement).style.background='#fafcff';const btn=e.currentTarget.querySelector('.doc-dl-btn') as HTMLElement;if(btn)btn.style.opacity='1';}}
                          onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#f1f5f9';(e.currentTarget as HTMLAnchorElement).style.background='white';const btn=e.currentTarget.querySelector('.doc-dl-btn') as HTMLElement;if(btn)btn.style.opacity='0';}}>
                          <div className="doc-dl-btn" style={{position:'absolute' as const,top:6,right:6,width:22,height:22,borderRadius:5,background:'#1e5799',display:'flex',alignItems:'center',justifyContent:'center',opacity:0,transition:'opacity .15s'}}>
                            <svg fill="none" stroke="white" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </div>
                          <div style={{width:48,height:56,borderRadius:'4px 12px 4px 4px',background:ext.bg,border:`1.5px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:7,position:'relative' as const}}>
                            <div style={{position:'absolute' as const,top:0,right:0,width:12,height:12,background:'white',borderLeft:`1.5px solid ${ext.color}20`,borderBottom:`1.5px solid ${ext.color}20`,borderRadius:'0 0 0 4px'}}/>
                            <span style={{fontSize:8,fontWeight:800,color:ext.color,letterSpacing:'0.05em',fontFamily:F}}>{ext.label}</span>
                          </div>
                          <div style={{fontSize:10.5,fontWeight:500,color:'#334155',fontFamily:F,textAlign:'center' as const,lineHeight:1.35,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const,maxWidth:'100%'}}>{String(d.nombre||d.titulo||`Documento ${i+1}`)}</div>
                        </a>
                      );
                    })}
                  </div>
                  :<div style={{display:'flex',flexDirection:'column' as const,gap:0}}>
                    {p.documentos!.map((d,i)=>{
                      const url=String(d.url||d.link||d.ruta||'');
                      const s=url.toLowerCase();
                      const ext=s.includes('.xlsx')||s.includes('.xls')?{bg:'#f0fdf4',color:'#475569',label:'XLS'}:s.includes('.docx')||s.includes('.doc')?{bg:'#eff6ff',color:'#1d4ed8',label:'DOC'}:s.includes('.zip')||s.includes('.rar')?{bg:'#faf5ff',color:'#7e22ce',label:'ZIP'}:{bg:'#fff1f2',color:'#be123c',label:'PDF'};
                      return(
                        <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<p.documentos!.length-1?'1px solid #f8fafc':'none'}}>
                          <div style={{width:32,height:38,borderRadius:'3px 8px 3px 3px',background:ext.bg,border:`1px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:5,position:'relative' as const,flexShrink:0}}>
                            <div style={{position:'absolute' as const,top:0,right:0,width:9,height:9,background:'white',borderLeft:`1px solid ${ext.color}20`,borderBottom:`1px solid ${ext.color}20`,borderRadius:'0 0 0 3px'}}/>
                            <span style={{fontSize:7,fontWeight:800,color:ext.color,fontFamily:F}}>{ext.label}</span>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12.5,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,fontFamily:F}}>{String(d.nombre||d.titulo||`Documento ${i+1}`)}</div>
                            {String(d.tipo||d.categoria||'')&&<div style={{fontSize:11,color:FC_LABEL,marginTop:1,fontFamily:F}}>{String(d.tipo||d.categoria||'')}</div>}
                          </div>
                          {url&&(
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              style={{flexShrink:0,width:28,height:28,borderRadius:6,border:'1px solid #e2e8f0',background:'white',display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',transition:'all .15s'}}
                              onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#1e5799';(e.currentTarget as HTMLAnchorElement).style.color='#1e5799';}}
                              onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLAnchorElement).style.color='#64748b';}}>
                              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                }
              </div>
            )}

            {/* 4. Observaciones / error */}
            {errorGuardar&&(
              <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:12,fontFamily:F}}>⚠️ {errorGuardar}</div>
            )}
          </div>

          {/* COL DERECHA */}
          <div className="modal-scroll-col" style={{display:'flex',flexDirection:'column' as const,background:'white',borderLeft:'1px solid #f1f5f9',overflowY:'auto',scrollbarWidth:'thin' as const,scrollbarColor:'transparent transparent'}}>

            {/* Presupuesto */}
            {valor&&(
              <div style={{padding:'18px 16px',borderBottom:'1px solid #f1f5f9'}}>
                <div style={labelStyle}>Presupuesto oficial</div>
                <div style={{fontSize:18,fontWeight:700,color:FC_DARK,letterSpacing:'-0.02em',fontFamily:F,marginTop:5}}>{valor}</div>
              </div>
            )}

            {/* Datos clave */}
            <div style={{padding:'18px 16px',borderBottom:'1px solid #f1f5f9',display:'flex',flexDirection:'column' as const,gap:14}}>
              <SideItem label="Número del proceso">
                <span style={{fontFamily:'monospace',fontSize:12}}>{p.codigoProceso||'—'}</span>
              </SideItem>
              {modalidadLabel&&<SideItem label="Modalidad">{modalidadLabel}</SideItem>}
              <SideItem label="Estado">
                {p.estado
                  ?<span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,color:eb.color,background:eb.bg,padding:'2px 9px',borderRadius:999,fontFamily:F}}><span style={{width:5,height:5,borderRadius:'50%',background:eb.dot}}/>{p.estado}</span>
                  :'—'}
              </SideItem>
              {p.departamento&&<SideItem label="Localización">{p.departamento}</SideItem>}
            </div>

            <div style={{flex:1}}/>

            {/* Acciones */}
            <div style={{padding:'14px 16px',borderTop:'1px solid #f1f5f9',background:'white',display:'flex',flexDirection:'column' as const,gap:8}}>
              {(secopLink||p.linkDetalle)&&(
                <a href={secopLink||p.linkDetalle||''} target="_blank" rel="noopener noreferrer"
                  style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,height:36,borderRadius:8,border:'1.5px solid #1e5799',background:'white',color:secopLoading?'#94a3b8':'#1e5799',fontSize:12.5,fontWeight:600,textDecoration:'none',fontFamily:F,transition:'all .15s'}}
                  onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.background='#eff6ff';}}
                  onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.background='white';}}>
                  <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13,flexShrink:0}}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  {secopLoading?'Buscando link…':'Abrir en portal'}
                </a>
              )}
              {onGestionar&&(
                <button onClick={hG} disabled={guardando}
                  style={{height:36,borderRadius:8,background:guardando?'#6b93c4':'#1e5799',color:'white',border:'none',fontSize:12.5,fontWeight:600,fontFamily:F,cursor:guardando?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,transition:'all .15s'}}
                  onMouseOver={e=>{if(!guardando)(e.currentTarget as HTMLButtonElement).style.background='#174a85';}}
                  onMouseOut={e=>{if(!guardando)(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
                  <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  {guardando?'Guardando…':'Gestionar proceso'}
                </button>
              )}
              <button onClick={onClose}
                style={{height:36,borderRadius:8,border:'1.5px solid #e2e8f0',background:'white',color:'#475569',fontSize:12.5,fontWeight:500,fontFamily:F,cursor:'pointer',transition:'all .15s'}}
                onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#f8fafc';}}
                onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
/* =========================================================
   TARJETA PROCESO
========================================================= */
function TarjetaProceso({p,onDetalle,leido}:{p:LiciProceso;onDetalle:()=>void;leido:boolean}){
  const fV=(v:number|null)=>{if(v==null||Number.isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};
  const fD=(r:string|null)=>{if(!r)return null;const d=new Date(r);return Number.isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});};
  const portal=portalColor(p.aliasFuente||'',p.fuente||'');const eb=estadoBadgeColor(p.estado||'');const pc=p.perfil?perfilColor(p.perfil):null;
  const valor=fV(p.valor);const fecha=fD(p.fechaPublicacion);const vence=fD(p.fechaVencimiento);
  return(<div onClick={onDetalle} style={{background:'white',border:`1px solid ${leido?'#e2e8f0':'#bbf7d0'}`,borderRadius:12,padding:'16px 18px',cursor:'pointer',transition:'box-shadow .15s, border-color .15s',position:'relative',overflow:'hidden'}} onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='0 4px 16px rgba(0,0,0,.09)';(e.currentTarget as HTMLDivElement).style.borderColor=leido?'#A8CCEC':'#86efac';}} onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='none';(e.currentTarget as HTMLDivElement).style.borderColor=leido?'#e2e8f0':'#bbf7d0';}}>{!leido&&<div style={{position:'absolute',top:12,left:12,background:'#dcfce7',color:'#166534',fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:20}}>No leído</div>}<div style={{display:'flex',alignItems:'flex-start',gap:12,marginTop:leido?0:24}}><div style={{position:'relative',flexShrink:0}} onMouseOver={e=>{const t=e.currentTarget.querySelector('.portal-tip') as HTMLElement;if(t)t.style.opacity='1';}} onMouseOut={e=>{const t=e.currentTarget.querySelector('.portal-tip') as HTMLElement;if(t)t.style.opacity='0';}}><div style={{width:38,height:38,borderRadius:'50%',background:portal.bg,color:portal.color,fontSize:11,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{portal.label}</div><div className="portal-tip" style={{opacity:0,pointerEvents:'none',transition:'opacity .15s',position:'absolute',top:'110%',left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'white',fontSize:11,fontWeight:600,whiteSpace:'nowrap',padding:'4px 10px',borderRadius:6,zIndex:100}}>{p.fuente||portal.label}<div style={{position:'absolute',bottom:'100%',left:'50%',transform:'translateX(-50%)',width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderBottom:'5px solid #1e293b'}}/></div></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:'#0f172a',lineHeight:1.3,marginBottom:2}}>{p.entidad||'—'}</div>{p.codigoProceso&&<div style={{fontSize:11,color:'#94a3b8',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.codigoProceso}</div>}</div><div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}><span style={{fontSize:11,fontWeight:600,padding:'3px 12px',borderRadius:20,background:eb.bg,color:eb.color}}>{p.estado||'—'}</span>{pc&&<span style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:20,background:pc.bg,color:pc.color}}>{pc.label}</span>}</div></div><div style={{fontSize:12.5,color:'#334155',lineHeight:1.5,marginTop:12,marginLeft:50,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const,overflow:'hidden'}}>{p.objeto||p.nombre||'—'}</div><div style={{display:'flex',alignItems:'center',gap:16,marginTop:10,marginLeft:50,flexWrap:'wrap'}}>{valor&&<span style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{valor}</span>}{p.departamento&&<span style={{fontSize:11,color:'#64748b',display:'flex',alignItems:'center',gap:3}}><svg fill="currentColor" viewBox="0 0 20 20" style={{width:11,height:11}}><path d="M10 2a6 6 0 00-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 00-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z"/></svg>{p.departamento}</span>}{fecha&&<span style={{fontSize:11,color:'#94a3b8'}}>📅 {fecha}</span>}{vence&&<span style={{fontSize:11,color:'#ef4444',fontWeight:500}}>⏰ Vence: {vence}</span>}</div><div style={{height:1,background:'#f1f5f9',margin:'12px 0 10px'}}/><div style={{display:'flex',alignItems:'center',gap:8}} onClick={e=>e.stopPropagation()}><VerDocumentosBtn p={p}/><button onClick={onDetalle} style={{display:'inline-flex',alignItems:'center',gap:5,height:28,padding:'0 14px',borderRadius:20,border:'1.5px solid #1E5799',color:'#1E5799',background:'white',fontSize:11,fontWeight:600,fontFamily:'var(--font)',cursor:'pointer'}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>Gestionar proceso</button></div></div>);
}

/* =========================================================
   MÓDULO BÚSQUEDA
========================================================= */
function ModuloBusquedaProcesos({onModuleChange,sesion,puedeGestionar=true}:{onModuleChange?:(mod:string)=>void;sesion?:Sesion;puedeGestionar?:boolean}){
  const [busqueda,setBusqueda]=useState('');
  const [pagina,setPagina]=useState(1);
  const [resultado,setResultado]=useState<ProcesosApiResponse|null>(null);
  const [cargando,setCargando]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [error,setError]=useState('');
  const [detalle,setDetalle]=useState<LiciProceso|null>(null);
  const [fichaAbierta,setFichaAbierta]=useState<LiciProceso|null>(null);

  const [leidos,setLeidos]=useState<Set<string>>(()=>{
    try{
      const r=localStorage.getItem('lici_leidos');
      return r ? new Set(JSON.parse(r) as string[]) : new Set();
    }catch{
      return new Set();
    }
  });

  const [pF,setPF]=useState(false);
  const [fEnt,setFEnt]=useState<'all'|'aseocolba'|'tempocolba'|'vigicolba'>('all');
  const [fPor,setFPor]=useState<'all'|'publico'|'privado'>('all');
  const [fDpto,setFDpto]=useState('');
  const [fCod,setFCod]=useState('');
  const [fFD,setFFD]=useState('');
  const [fFH,setFFH]=useState('');
  const [fFuente,setFFuente]=useState('all');

  const [fA,setFA]=useState({
    entidad:'all' as 'all'|'aseocolba'|'tempocolba'|'vigicolba',
    portal:'all' as 'all'|'publico'|'privado',
    fuente:'',
    dpto:'',
    codigo:'',
    fechaDesde:'',
    fechaHasta:'',
    perfil:'',
    estado:'',
    modalidad:'',
    departamento:'',
    entidadGrupo:'',
    codigoProceso:'',
  });
  
  const fARef = React.useRef(fA);
  useEffect(()=>{ fARef.current = fA; }, [fA]);

  const hayFA =
    fA.entidad!=='all' ||
    fA.portal!=='all' ||
    fA.fuente!=='all' ||
    !!fA.dpto ||
    !!fA.codigo ||
    !!fA.fechaDesde ||
    !!fA.fechaHasta;

  const aplicar=()=>{
  setFA(prev=>({
    ...prev,
    entidad:fEnt,
    portal:fPor,
    fuente:fFuente,
    dpto:fDpto,
    codigo:fCod,
    fechaDesde:fFD,
    fechaHasta:fFH,
  }));
  setPagina(1);
  setPF(false);
};

const limpiar=()=>{
  setFEnt('all');
  setFPor('all');
  setFFuente('all');
  setFDpto('');
  setFCod('');
  setFFD('');
  setFFH('');
  setFA(prev=>({
    ...prev,
    entidad:'all' as const,
    portal:'all' as const,
    fuente:'all',
    dpto:'',
    codigo:'',
    fechaDesde:'',
    fechaHasta:'',
  }));
  setBusqueda('');
  setPagina(1);
};
  const POR_PAGINA=6;
  const syncEnCursoRef = React.useRef(false);
  const intervaloSyncRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const marcarLeido=(p:LiciProceso)=>{
    const key=p.codigoProceso||p.linkDetalle||String(p.id);
    if(!key||leidos.has(key)) return;
    const next=new Set(leidos).add(key);
    setLeidos(next);
    try{
      localStorage.setItem('lici_leidos',JSON.stringify([...next]));
    }catch{
      /**/
    }
  };

  const abrirDetalle=(p:LiciProceso)=>{
    marcarLeido(p);
    setDetalle(p);
  };

  const esLeido=(p:LiciProceso)=>leidos.has(p.codigoProceso||p.linkDetalle||String(p.id));

  const consultar=useCallback(async(pag:number, filtrosActuales?:typeof fA)=>{
    const f = filtrosActuales ?? fARef.current;
    setCargando(true);
    setError('');
    try{
      const params=new URLSearchParams({page:String(pag),limit:String(POR_PAGINA)});
      const fARecord = safeRecord(f);
      const perfilesSeleccionados = safeArray<string>(fARecord.perfiles);
      const fuentesSeleccionadas = safeArray<string>(fARecord.fuentes);
      const estadosSeleccionados = safeArray<string>(fARecord.estados);
      const modalidadesSeleccionadas = safeArray<string>(fARecord.modalidades);
      const departamentosSeleccionados = safeArray<string>(fARecord.departamentos);
      const _perfiles = perfilesSeleccionados.length ? perfilesSeleccionados : (f.perfil&&f.perfil!==''&&f.perfil!=='all'?[f.perfil]:[]);
      const _fuentes  = fuentesSeleccionadas.length ? fuentesSeleccionadas : (f.fuente&&f.fuente!==''&&f.fuente!=='all'?[f.fuente]:[]);
      const _estados  = estadosSeleccionados.length ? estadosSeleccionados : (f.estado&&f.estado!==''&&f.estado!=='all'?[f.estado]:[]);
      const _modals   = modalidadesSeleccionadas.length ? modalidadesSeleccionadas : (f.modalidad&&f.modalidad!==''&&f.modalidad!=='all'?[f.modalidad]:[]);
      const _deptos   = departamentosSeleccionados.length ? departamentosSeleccionados : (f.departamento&&f.departamento!=='all'?[f.departamento]:(f.dpto&&f.dpto!=='all'?[f.dpto]:[]));
      if(_perfiles.length) params.set('perfiles',    _perfiles.join(','));
      if(_fuentes.length)  params.set('fuentes',     _fuentes.join(','));
      if(_estados.length)  params.set('estados',     _estados.join(','));
      if(_modals.length)   params.set('modalidades', _modals.join(','));
      if(_deptos.length)   params.set('dptos',       _deptos.join(','));
      if(f.codigo)                      params.set('query',f.codigo);
      if(f.fechaDesde)                  params.set('fechaDesde',f.fechaDesde);
      if(f.fechaHasta)                  params.set('fechaHasta',f.fechaHasta);
      if(busqueda.trim())               params.set('query',busqueda.trim());
      const res=await fetch(`/api/procesos?${params.toString()}`);
      const data:ProcesosApiResponse=await res.json();

      if(!res.ok||!data.ok){
        setError(data.error??`Error ${res.status}`);
        setResultado(null);
      }else{
        setResultado(data);
      }
    }catch{
      setError('No se pudo conectar.');
      setResultado(null);
    }finally{
      setCargando(false);
    }
  },[]);

  const handleSync = useCallback(async (silencioso = false) => {
  if (syncEnCursoRef.current) return;

  syncEnCursoRef.current = true;

  if (!silencioso) {
    setSyncing(true);
  }

  setError('');

  try {
    const res = await fetch('/api/procesos/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        silencioso
          ? { silencioso: true, maxResultados: 50, limitPorPagina: 25 }
          : { silencioso: false, maxResultados: 3000, limitPorPagina: 30 }
      ),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || (data && data.ok === false)) {
      setError(`Sync falló: ${data?.errores?.[0] ?? data?.error ?? 'Error'}`);
      return;
    }

    await consultar(1);
    setPagina(1);
  } catch {
    setError('No se pudo ejecutar el sync.');
  } finally {
    syncEnCursoRef.current = false;

    if (!silencioso) {
      setSyncing(false);
    }
  }
}, [consultar]);

useEffect(()=>{
  fARef.current = fA;
  consultar(1, fA);
  setPagina(1);
},[fA.perfil, fA.fuente, fA.departamento, fA.dpto, fA.estado, fA.modalidad, fA.codigo, fA.fechaDesde, fA.fechaHasta]);

  useEffect(() => {
    consultar(1);

    intervaloSyncRef.current = setInterval(() => {
      handleSync(true);
    }, 120000);

    return () => {
      if (intervaloSyncRef.current) {
        clearInterval(intervaloSyncRef.current);
        intervaloSyncRef.current = null;
      }
    };
  }, [consultar, handleSync]);

  const handleGestionar=async(p:LiciProceso)=>{
    const res=await fetch('/api/solicitudes',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        externalId:p.id||null,
        codigoProceso:p.codigoProceso,
        nombreProceso:p.nombre,
        entidad:p.entidad,
        objeto:p.objeto,
        fuente:p.fuente,
        aliasFuente:p.aliasFuente,
        modalidad:p.modalidad,
        perfil:p.perfil,
        departamento:p.departamento,
        estadoFuente:p.estado,
        fechaPublicacion:p.fechaPublicacion,
        fechaVencimiento:p.fechaVencimiento,
        valor:p.valor,
        linkDetalle:p.linkDetalle,
        linkSecop:p.linkSecop,
        linkSecopReg:p.linkSecopReg,
        usuarioRegistro:sesion?.usuario??'',
        emailRegistro:sesion?.email??'',
        cargoRegistro:sesion?.cargo??'',
        entidadRegistro:sesion?.entidadGrupo??'',
        estadoSolicitud:'En revisión',
        docData:p.documentos??[],
        procData:(p.cronogramas??[]).reduce((acc:Record<string,{fechaI:string;fechaF:string;obs:string}>,cr,i)=>({
          ...acc,
          [`step_${i}`]:{
            fechaI:cr.fecha??'',
            fechaF:cr.fecha??'',
            obs:cr.nombre??`Etapa ${i+1}`
          },
        }),{}),
      })
    });

    const data=await res.json();
    if(!res.ok||!data.ok) throw new Error(data.error??'No se pudo crear la solicitud');

    setFichaAbierta(null);
    onModuleChange?.('solicitudesComercial');
  };

  const filtrados=useMemo(()=>{
    if(!resultado?.procesos) return [];
    return resultado.procesos;
  },[resultado]);
  

  const totalApi=resultado?.total_resultados_api??0;
  const totalPages=Math.max(1,Math.ceil(totalApi/POR_PAGINA));

  const handlePagina=(p:number)=>{
    setPagina(p);
    consultar(p, fA);
  };

  const handleRefresh=()=>{
    setPagina(1);
    setBusqueda('');
    limpiar();
    consultar(1);
  };

  const badgesFiltros=[
    fA.entidad!=='all'&&{label:`Entidad: ${fA.entidad}`,clear:()=>setFA(f=>({...f,entidad:'all'}))},
    fA.portal!=='all'&&{label:`Tipo: ${fA.portal==='publico'?'Público':'Privado'}`,clear:()=>setFA(f=>({...f,portal:'all'}))},
    fA.fuente!=='all'&&{label:`Fuente: ${fA.fuente}`,clear:()=>setFA(f=>({...f,fuente:'all'}))},
    fA.dpto&&{label:`Dpto: ${fA.dpto}`,clear:()=>setFA(f=>({...f,dpto:''}))},
    fA.codigo&&{label:`Código: ${fA.codigo}`,clear:()=>setFA(f=>({...f,codigo:''}))},
    fA.fechaDesde&&{label:`Desde: ${fA.fechaDesde}`,clear:()=>setFA(f=>({...f,fechaDesde:''}))},
    fA.fechaHasta&&{label:`Hasta: ${fA.fechaHasta}`,clear:()=>setFA(f=>({...f,fechaHasta:''}))}
  ].filter(Boolean) as {label:string;clear:()=>void}[];

  const dptosSug=useMemo(()=>{
    if(!resultado?.procesos) return [];
    const s=new Set(
      resultado.procesos
        .map(p=>(p.departamento||'').split(':')[0].trim())
        .filter(Boolean)
    );
    return Array.from(s).sort();
  },[resultado]);

  const sEl:React.CSSProperties={
    width:'100%',
    height:34,
    border:'1px solid #e2e8f0',
    borderRadius:8,
    padding:'0 10px',
    fontSize:12.5,
    fontFamily:'var(--font)',
    color:'#374151',
    background:'white',
    outline:'none',
    cursor:'pointer'
  };

  const iEl:React.CSSProperties={
    width:'100%',
    height:34,
    border:'1px solid #e2e8f0',
    borderRadius:8,
    padding:'0 10px',
    fontSize:12.5,
    fontFamily:'var(--font)',
    color:'#374151',
    outline:'none',
    boxSizing:'border-box'
  };

  const lEl:React.CSSProperties={
    fontSize:11.5,
    fontWeight:600,
    color:'#64748b',
    display:'block',
    marginBottom:5
  };

if(fichaAbierta){
    const fichaExtendida = safeRecord(fichaAbierta);
    const procesoIdFicha = safeNumber(getRecordValue(fichaExtendida, '_dbId'), fichaAbierta.id);
    const sol:Solicitud={
      id:0,
      procesoId:procesoIdFicha||null,
      procesoSourceKey:'',
      codigoProceso:fichaAbierta.codigoProceso??'',
      nombreProceso:fichaAbierta.nombre??'',
      entidad:fichaAbierta.entidad??'',
      objeto:fichaAbierta.objeto??'',
      fuente:fichaAbierta.fuente??'',
      aliasFuente:fichaAbierta.aliasFuente??'',
      modalidad:fichaAbierta.modalidad??'',
      perfil:fichaAbierta.perfil??'',
      departamento:fichaAbierta.departamento??'',
      estadoFuente:fichaAbierta.estado??'',
      fechaPublicacion:fichaAbierta.fechaPublicacion??null,
      fechaVencimiento:fichaAbierta.fechaVencimiento??null,
      valor:fichaAbierta.valor??null,
      linkDetalle:fichaAbierta.linkDetalle??'',
      linkSecop:fichaAbierta.linkSecop??'',
      linkSecopReg:fichaAbierta.linkSecopReg??'',
      estadoSolicitud:'Selección de proceso',
      observacion:null,
      ciudad:fichaAbierta.departamento??'',
      sede:'',plataforma:'',fechaCierre:null,procStep:0,
      procData:(fichaAbierta.cronogramas??[]).reduce((acc:{[k:string]:{fechaI:string;fechaF:string;obs:string}},cr,i)=>({...acc,[`step_${i}`]:{fechaI:cr.fecha??'',fechaF:cr.fecha??'',obs:cr.nombre??`Etapa ${i+1}`}}),{}),
      obsData:[],
      docData:fichaAbierta.documentos??[],
      asignaciones:[],
      revisor:'',aprobador:'',
      usuarioRegistro:sesion?.usuario??'',
      emailRegistro:sesion?.email??'',
      cargoRegistro:sesion?.cargo??'',
      entidadRegistro:sesion?.entidadGrupo??'',
      sqrNumero:null,sqrCreada:false,sqrCerrada:false,sqrError:null,
      fechaAperturaSqr:null,fechaCierreSqr:null,
      resultadoFinal:null,causalCierre:null,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
    };
    (sol as any).duracionContrato = (fichaAbierta as any).duracionContrato ?? null;
    return(
      <VistFichaBusqueda
        sol={sol}
        sesion={sesion!}
        onVolver={()=>setFichaAbierta(null)}
        onGestionar={async()=>{handleGestionar(fichaAbierta);setFichaAbierta(null);onModuleChange?.('solicitudesComercial');}}
        puedeGestionar={puedeGestionar}
      />
    );
  }

return (
  <>
    {syncing && (
      <div
        style={{
          background: '#EAF2FB',
          border: '1px solid #D0E4F3',
          borderRadius: 8,
          padding: '10px 14px',
          color: '#1E5799',
          fontSize: 12,
          margin: '12px 26px 0',
        }}
      >
        🔄 Sincronizando procesos…
      </div>
    )}

    <ProcesosCardsView
      procesos={filtrados}
      loading={cargando && !syncing}
      error={error || null}
      page={pagina}
      limit={POR_PAGINA}
      total={totalApi}
      totalPages={totalPages}
      filtros={fA}
      setFiltros={setFA}
      onBuscar={(nuevosFiltros?: typeof fA) => {
        setPagina(1);
        setDetalle(null);
        if(nuevosFiltros){
          fARef.current = nuevosFiltros;
          consultar(1, nuevosFiltros);
        } else {
          consultar(1, fA);
        }
      }}
      onCambiarPagina={(p) => {
        handlePagina(p);
      }}
      onCambiarLimit={() => {
        setPagina(1);
        consultar(1);
      }}
      onGestionarProceso={(proceso) => {
        setFichaAbierta(proceso as LiciProceso);
      }}
    />
  </>
);
}

const ModuloBusquedaFinal = ModuloBusquedaProcesos;

/* =========================================================
   Modal de detalles del proceso
========================================================= */
function ModalDetallesProceso({sol,onClose}:{sol:Solicitud;onClose:()=>void}){
  const [docVista,setDocVista]=React.useState<'grid'|'list'>('list');
  const fmtFecha=(r:string|null)=>{if(!r)return null;const d=new Date(r.replace(' ','T'));if(Number.isNaN(d.getTime()))return r;return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});};
  const fmtV=(v:number|null)=>{if(v==null||Number.isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};

  const portal=portalColorModal(sol.aliasFuente||'',sol.fuente||'',sol.fuente||'');
  const eb=estadoModalColor(sol.estadoFuente||'');
  const pc=sol.perfil?perfilColor(sol.perfil):null;
  const modalidadLabel=MMAP_MODALIDAD[sol.modalidad]??sol.modalidad??'—';
  const valor=fmtV(sol.valor);

  const docArr=Array.isArray(sol.docData)?sol.docData as Array<{nombre?:string;url?:string;ruta?:string;[k:string]:unknown}>:[];
  const procDataEntries=Object.entries(sol.procData||{}).filter(([,v])=>v?.fechaI);
  const obsArr=Array.isArray(sol.obsData)?sol.obsData as Array<{texto?:string;autor?:string;fecha?:string;[k:string]:unknown}>:[];
  const asigArr=Array.isArray(sol.asignaciones)?sol.asignaciones as Array<{nombre?:string;cargo?:string;rol?:string;[k:string]:unknown}>:[];
  const fuentes:Array<{label:string;url:string}>=[];
  if(sol.linkSecop)fuentes.push({label:portal.short,url:sol.linkSecop});
  if(sol.linkSecopReg&&sol.linkSecopReg!==sol.linkSecop)fuentes.push({label:'Reg.',url:sol.linkSecopReg});
  if(sol.linkDetalle&&sol.linkDetalle!==sol.linkSecop)fuentes.push({label:'Detalle',url:sol.linkDetalle});

  const F='var(--font)';
  const FS=13;
  const FC='#334155';
  const FC_LABEL='#94a3b8';
  const FC_DARK='#0f172a';

  const baseText:React.CSSProperties={fontSize:FS,color:FC,fontFamily:F,lineHeight:1.5};
  const labelStyle:React.CSSProperties={fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:4};
  const secTitle:React.CSSProperties={fontSize:12,fontWeight:700,color:FC_DARK,fontFamily:F,letterSpacing:'-0.01em',marginBottom:12,paddingBottom:8,borderBottom:'1px solid #f1f5f9'};

  const Dato=({label,children}:{label:string;children:React.ReactNode})=>(
    <div style={{paddingBottom:12,borderBottom:'1px solid #f1f5f9'}}>
      <div style={labelStyle}>{label}</div>
      <div style={baseText}>{children}</div>
    </div>
  );

  const SideItem=({label,children}:{label:string;children:React.ReactNode})=>(
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{...baseText,fontSize:13,color:'#0f172a',fontWeight:500}}>{children}</div>
    </div>
  );

  React.useEffect(()=>{
  const cols = document.querySelectorAll('.modal-scroll-col');
  cols.forEach(col=>{
    col.addEventListener('mouseenter',()=>{
      (col as HTMLElement).style.scrollbarColor='#94a3b8 transparent';
    });
    col.addEventListener('mouseleave',()=>{
      (col as HTMLElement).style.scrollbarColor='transparent transparent';
    });
  });
},[]);
  
  return(
    <div className="modal-overlay" style={{zIndex:1200}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'white',borderRadius:16,width:'96vw',maxWidth:980,maxHeight:'92vh',display:'flex',flexDirection:'column' as const,boxShadow:'0 24px 64px rgba(15,23,42,0.18)',overflow:'hidden',border:'1px solid #e2e8f0'}}>

        {/* HEADER */}
        <div style={{background:'white',borderBottom:'1px solid #f1f5f9',padding:'16px 24px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:42,height:42,borderRadius:10,background:'#1e5799',color:'white',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,letterSpacing:'0.04em',fontFamily:F}}>{portal.short}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:FC_DARK,letterSpacing:'-0.02em',lineHeight:1.25,marginBottom:5,fontFamily:F}}>{sol.entidad||'Detalle del proceso'}</div>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                {sol.codigoProceso&&<span style={{fontSize:11,color:'#64748b',background:'#f8fafc',border:'1px solid #e8edf2',padding:'2px 9px',borderRadius:5,fontFamily:'monospace'}}>{sol.codigoProceso}</span>}
                {pc&&<span style={{fontSize:11,color:pc.color,background:pc.bg,padding:'2px 9px',borderRadius:999,fontWeight:600,fontFamily:F}}>{pc.label}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:'1.5px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',flexShrink:0,transition:'all .15s'}}
              onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';(e.currentTarget as HTMLButtonElement).style.borderColor='#fca5a5';}}
              onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';(e.currentTarget as HTMLButtonElement).style.borderColor='#e2e8f0';}}>
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* BODY: 2 columnas */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 280px',flex:1,minHeight:0,overflow:'hidden'}}>

          {/* Panel principal */}
          <div className="modal-scroll-col" style={{overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column' as const,gap:22,scrollbarWidth:'thin' as const,scrollbarColor:'transparent transparent'}}>

            {/* 1. Objeto */}
            {sol.objeto&&(
              <div>
                <div style={secTitle}>Objeto del proceso</div>
                <p style={{margin:0,...baseText,lineHeight:1.7}}>
                  {sol.objeto.charAt(0).toUpperCase()+sol.objeto.slice(1).toLowerCase()}
                </p>
              </div>
            )}

            {/* 2. Cronograma */}
            {(sol.fechaPublicacion||sol.fechaVencimiento||procDataEntries.length>0)&&(
              <div>
                <div style={secTitle}>Cronograma de fechas</div>
                <div style={{display:'flex',flexDirection:'column' as const}}>
                  {sol.fechaPublicacion&&(
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #f8fafc'}}>
                      <span style={{...baseText,color:'#64748b'}}>Fecha de publicación</span>
                      <span style={baseText}>{fmtFecha(sol.fechaPublicacion)}</span>
                    </div>
                  )}
                  {sol.fechaVencimiento&&(
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:procDataEntries.length>0?'1px solid #f8fafc':'none'}}>
                      <span style={{...baseText,color:'#64748b'}}>Fecha de vencimiento</span>
                      <span style={baseText}>{fmtFecha(sol.fechaVencimiento)}</span>
                    </div>
                  )}
                  {procDataEntries.map(([k,v],i)=>{
                    const idx=Number(k.replace('step_',''));
                    const flujo=getFlujo(sol.modalidad,sol.fuente);
                    const paso=flujo[idx];
                    return(
                      <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:i<procDataEntries.length-1?'1px solid #f8fafc':'none'}}>
                        <span style={{...baseText,color:'#64748b',flex:1,paddingRight:16}}>{v.obs||paso?.label?.replace('\n',' ')||`Etapa ${idx+1}`}</span>
                        <span style={{...baseText,whiteSpace:'nowrap' as const}}>{v.fechaI}{v.fechaF&&v.fechaF!==v.fechaI?` → ${v.fechaF}`:''}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Documentos */}
            {docArr.length>0&&(
              <div>
                <div style={{...secTitle,display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <span>Documentos ({docArr.length})</span>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    
                    {/* Toggle vista */}
                    {[{v:'grid',ico:<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>},{v:'list',ico:<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}].map(({v,ico})=>(
                      <button key={v} onClick={()=>setDocVista(v as 'grid'|'list')}
                        style={{width:30,height:28,borderRadius:6,border:'1.5px solid #e2e8f0',background:docVista===v?'#1e5799':'white',color:docVista===v?'white':'#64748b',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>
                        {ico}
                      </button>
                    ))}
                  </div>
                </div>

                {docVista==='grid'
                  ?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:10}}>
                    {docArr.map((d,i)=>{
                      const url=d.ruta||d.url||'';
                      const s=url.toLowerCase();
                      const ext=s.includes('.xlsx')||s.includes('.xls')?{bg:'#f0fdf4',color:'#475569',label:'XLS'}:s.includes('.docx')||s.includes('.doc')?{bg:'#eff6ff',color:'#1d4ed8',label:'DOC'}:s.includes('.zip')||s.includes('.rar')?{bg:'#faf5ff',color:'#7e22ce',label:'ZIP'}:{bg:'#fff1f2',color:'#be123c',label:'PDF'};
                      return(
                        <a key={i} href={url||'#'} target="_blank" rel="noopener noreferrer"
                      style={{display:'flex',flexDirection:'column' as const,alignItems:'center',gap:8,padding:'12px 8px',border:'1px solid #f1f5f9',borderRadius:10,textDecoration:'none',background:'white',transition:'all .15s',position:'relative' as const}}
                      onMouseOver={e=>{
                        (e.currentTarget as HTMLAnchorElement).style.borderColor='#e2e8f0';
                        (e.currentTarget as HTMLAnchorElement).style.background='#fafcff';
                        const btn=e.currentTarget.querySelector('.doc-dl-btn') as HTMLElement;
                        if(btn)btn.style.opacity='1';
                      }}
                      onMouseOut={e=>{
                        (e.currentTarget as HTMLAnchorElement).style.borderColor='#f1f5f9';
                        (e.currentTarget as HTMLAnchorElement).style.background='white';
                        const btn=e.currentTarget.querySelector('.doc-dl-btn') as HTMLElement;
                        if(btn)btn.style.opacity='0';
                      }}>
                      {/* Botón descarga hover */}
                      <div className="doc-dl-btn" style={{position:'absolute' as const,top:6,right:6,width:22,height:22,borderRadius:5,background:'#1e5799',display:'flex',alignItems:'center',justifyContent:'center',opacity:0,transition:'opacity .15s'}}>
                        <svg fill="none" stroke="white" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </div>
                      <div style={{width:48,height:56,borderRadius:'4px 12px 4px 4px',background:ext.bg,border:`1.5px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:7,position:'relative' as const}}>
                        <div style={{position:'absolute' as const,top:0,right:0,width:12,height:12,background:'white',borderLeft:`1.5px solid ${ext.color}20`,borderBottom:`1.5px solid ${ext.color}20`,borderRadius:'0 0 0 4px'}}/>
                        <span style={{fontSize:8,fontWeight:800,color:ext.color,letterSpacing:'0.05em',fontFamily:F}}>{ext.label}</span>
                      </div>
                      <div style={{fontSize:10.5,fontWeight:500,color:'#334155',fontFamily:F,textAlign:'center' as const,lineHeight:1.35,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const,maxWidth:'100%'}}>{d.nombre||`Documento ${i+1}`}</div>
                    </a>
                      );
                    })}
                  </div>
                  :<div style={{display:'flex',flexDirection:'column' as const,gap:0}}>
                    {docArr.map((d,i)=>{
                      const url=d.ruta||d.url||'';
                      const s=url.toLowerCase();
                      const ext=s.includes('.xlsx')||s.includes('.xls')?{bg:'#f0fdf4',color:'#475569',label:'XLS'}:s.includes('.docx')||s.includes('.doc')?{bg:'#eff6ff',color:'#1d4ed8',label:'DOC'}:s.includes('.zip')||s.includes('.rar')?{bg:'#faf5ff',color:'#7e22ce',label:'ZIP'}:{bg:'#fff1f2',color:'#be123c',label:'PDF'};
                      return(
                        <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<docArr.length-1?'1px solid #f8fafc':'none'}}>
                          <div style={{width:32,height:38,borderRadius:'3px 8px 3px 3px',background:ext.bg,border:`1px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:5,position:'relative' as const,flexShrink:0}}>
                            <div style={{position:'absolute' as const,top:0,right:0,width:9,height:9,background:'white',borderLeft:`1px solid ${ext.color}20`,borderBottom:`1px solid ${ext.color}20`,borderRadius:'0 0 0 3px'}}/>
                            <span style={{fontSize:7,fontWeight:800,color:ext.color,fontFamily:F}}>{ext.label}</span>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12.5,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,fontFamily:F}}>{d.nombre||`Documento ${i+1}`}</div>
                          </div>
                          {url&&(
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              style={{flexShrink:0,width:28,height:28,borderRadius:6,border:'1px solid #e2e8f0',background:'white',display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',transition:'all .15s'}}
                              onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#1e5799';(e.currentTarget as HTMLAnchorElement).style.color='#1e5799';}}
                              onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLAnchorElement).style.color='#64748b';}}>
                              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                }
              </div>
            )}
          </div>
          {/* Panel lateral */}
          <div className="modal-scroll-col" style={{display:'flex',flexDirection:'column' as const,background:'white',borderLeft:'1px solid #f1f5f9',overflowY:'auto',scrollbarWidth:'thin' as const,scrollbarColor:'transparent transparent'}}>

            {/* Presupuesto */}
            {valor&&(
              <div style={{padding:'18px 16px',borderBottom:'1px solid #f1f5f9'}}>
                <div style={labelStyle}>Presupuesto oficial</div>
                <div style={{fontSize:18,fontWeight:700,color:FC_DARK,letterSpacing:'-0.02em',fontFamily:F,marginTop:5}}>{valor}</div>
              </div>
            )}

            {/* Número del proceso */}
            <div style={{padding:'18px 16px',borderBottom:'1px solid #f1f5f9'}}>
              <SideItem label="Número del proceso">
                <span style={{fontFamily:'monospace',fontSize:12}}>{sol.codigoProceso||'—'}</span>
              </SideItem>
              <SideItem label="Modalidad">{modalidadLabel}</SideItem>
              {sol.estadoFuente&&(
              <SideItem label="Estado">
                <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,color:eb.color,background:eb.bg,padding:'2px 9px',borderRadius:999,fontFamily:F}}>
                  <span style={{width:5,height:5,borderRadius:'50%',background:eb.dot}}/>
                  {sol.estadoFuente}
                </span>
              </SideItem>
            )}
              {sol.departamento&&<SideItem label="Localización">{sol.departamento}</SideItem>}
              
            </div>

            {/* Fuentes */}
            {fuentes.length>0&&(
              <div style={{padding:'18px 16px',borderBottom:'1px solid #f1f5f9'}}>
                <div style={{...labelStyle,marginBottom:12}}>Fuentes</div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:10}}>
                  {fuentes.map((f,i)=>(
                    <div key={i}>
                      <div style={labelStyle}>{f.label}</div>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                        <a href={f.url} target="_blank" rel="noopener noreferrer"
                          style={{fontSize:11,color:'#1e5799',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,fontFamily:F}}>{f.url}</a>
                        <CopiarLinkBtn url={f.url}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{flex:1}}/>

            {/* Acciones */}
            <div style={{padding:'14px 16px',borderTop:'1px solid #f1f5f9',background:'white',display:'flex',flexDirection:'column' as const,gap:8}}>
            
              <button onClick={onClose}
              style={{height:36,borderRadius:8,border:'none',background:'#1e5799',color:'white',fontSize:12.5,fontWeight:600,fontFamily:F,cursor:'pointer',transition:'all .15s'}}
              onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#174a85';}}
              onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
              Cerrar
             </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
/* =========================================================
   Modal de control de solicitud
========================================================= */
/* =========================================================
   Modal de asignación de proceso
========================================================= */
function ModalProceso({sol,onClose,onGuardado,sesion,variante}:{sol:Solicitud;onClose:()=>void;onGuardado:(updated:Solicitud)=>void;sesion:Sesion;variante?:string}){
  const [solActual,setSolActual]=React.useState(sol);
  React.useEffect(()=>{
    fetch(`/api/solicitudes/${sol.id}`).then(r=>r.json()).then(data=>{
      if(data.ok&&data.solicitud)setSolActual(data.solicitud);
    }).catch(()=>{});
  },[sol.id]);
  const [usuarios, setUsuarios] = React.useState<UsuarioAsignable[]>([]);
  const [verDetalle,setVerDetalle]=React.useState(false);
  const [responsable,setResponsable]=React.useState('');
  const [asignando,setAsignando]=React.useState(false);
  const [error,setError]=React.useState('');
  const [ok,setOk]=React.useState('');

  const asignaciones = safeArray<Record<string, unknown>>(sol.asignaciones);

  const fmtFechaHora=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});};
  const fmtV=(v:number|null)=>{if(v==null||isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};

  const portal=portalColorModal(sol.aliasFuente||'',sol.fuente||'',sol.fuente||'');
  const pc=solActual.perfil?perfilColor(solActual.perfil):null;
  const valor=fmtV(sol.valor);
  const modalidadLabel=MMAP_MODALIDAD[sol.modalidad]??sol.modalidad??'—';

  const F='var(--font)';
  const FC='#334155';
  const FC_LABEL='#94a3b8';
  const FC_DARK='#0f172a';
  const baseText:React.CSSProperties={fontSize:13,color:FC,fontFamily:F,lineHeight:1.5};
  const labelStyle:React.CSSProperties={fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:4};
  const secTitle:React.CSSProperties={fontSize:12,fontWeight:700,color:FC_DARK,fontFamily:F,letterSpacing:'-0.01em',marginBottom:12,paddingBottom:8,borderBottom:'1px solid #f1f5f9'};

  // Carga de usuarios activos disponibles para asignación.
  React.useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const todos = safeArray<UsuarioActivo>(data).filter(
            u => safeString(u.estado) === 'Activo'
          );

          const filteredByProceso =
            variante === 'COMERCIAL'
              ? todos.filter(u => safeString(u.proceso) === 'Comercial')
              : variante === 'ESPECIALIZADA'
                ? todos.filter(u => Boolean(safeString(u.proceso)) && safeString(u.proceso) !== 'Comercial')
                : todos;

          const usuariosAsignables: UsuarioAsignable[] = filteredByProceso.map(u => ({
            id: safeNumber(u.id),
            usuario: safeString(u.usuario),
            cargo: safeString(u.cargo),
            entidadGrupo: safeString(u.entidadGrupo),
            rol: safeString(u.rol, 'Usuario Final'),
            estado: safeString(u.estado, 'Activo'),
            proceso: safeString(u.proceso),
          }));

          setUsuarios(usuariosAsignables);
        }
      })
      .catch(() => {});
  }, [variante]);

  const asignar=async()=>{
    if(!responsable){setError('Selecciona un responsable.');return;}
    setAsignando(true);setError('');setOk('');
    try{
      const u=usuarios.find(u=>u.usuario===responsable);
      const ahora=new Date();
      const pad=(n:number)=>String(n).padStart(2,'0');
      const fechaStr=`${ahora.getFullYear()}-${pad(ahora.getMonth()+1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
      const asigActuales=Array.isArray(sol.asignaciones)?sol.asignaciones:[];
      const numAsig=asigActuales.length+1;
      const idAsignacion=`ASG-${String(numAsig).padStart(2,'0')}`;
      const nueva={
        idAsignacion,
        solicitudId: sol.id,
        solicitudNum: sol.id,
        analistaAsignado: u?.usuario||responsable,
        analistaCargo: u?.cargo||'',
        analistaEntidad: u?.entidadGrupo||'',
        asignadoPor: sesion.usuario||'',
        asignadoPorCargo: sesion.cargo||'',
        fechaAsignacion: fechaStr,
        estadoAsignacion: 'Pendiente',
        estadoBandeja: 'pendiente',
        entidad: sol.entidad||'',
        codigoProceso: sol.codigoProceso||'',
        objeto: sol.objeto||'',
        valor: sol.valor||null,
        modalidad: sol.modalidad||'',
        ciudad: sol.ciudad||sol.departamento||'',
        perfil: sol.perfil||'',
        fechaVencimiento: sol.fechaVencimiento||null,
        observacion: '',
      };

      const nuevasAsignaciones=[...asignaciones, nueva];

      const res=await fetch('/api/solicitudes',{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          id:sol.id,
          estadoSolicitud:'Asignada',
          asignaciones: nuevasAsignaciones,
        }),
      });
      const data=await res.json();
      if(!res.ok||!data.ok){setError(data.error??'Error al asignar.');return;}
      setOk(`Solicitud asignada a ${u?.usuario||responsable}`);
      const updated:Solicitud={...sol,...data.solicitud,estadoSolicitud:'Asignada',asignaciones:nuevasAsignaciones};
      onGuardado(updated);
      setTimeout(()=>onClose(),1000);
    }catch{setError('No se pudo conectar.');}
    finally{setAsignando(false);}
  };

  const SideItem=({label,children}:{label:string;children:React.ReactNode})=>(
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{...baseText,fontSize:12.5}}>{children}</div>
    </div>
  );

  return(
  <>
    {verDetalle&&<ModalDetallesProceso sol={sol} onClose={()=>setVerDetalle(false)}/>}
    <div className="modal-overlay" style={{zIndex:900}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:'white',borderRadius:16,width:'96vw',maxWidth:980,maxHeight:'92vh',display:'flex',flexDirection:'column' as const,boxShadow:'0 24px 64px rgba(15,23,42,0.18)',overflow:'hidden',border:'1px solid #e2e8f0'}}>
        
        {/* HEADER */}
        <div style={{background:'white',borderBottom:'1px solid #f1f5f9',padding:'16px 24px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:42,height:42,borderRadius:10,background:'#1e5799',color:'white',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,letterSpacing:'0.04em',fontFamily:F}}>{portal.short}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:FC_DARK,letterSpacing:'-0.02em',lineHeight:1.25,marginBottom:5,fontFamily:F}}>{sol.entidad||'Asignar proceso'}</div>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap' as const}}>
                {sol.codigoProceso&&<span style={{fontSize:11,color:'#64748b',background:'#f8fafc',border:'1px solid #e8edf2',padding:'2px 9px',borderRadius:5,fontFamily:'monospace'}}>{sol.codigoProceso}</span>}
                {pc&&<span style={{fontSize:11,color:pc.color,background:pc.bg,padding:'2px 9px',borderRadius:999,fontWeight:600,fontFamily:F}}>{pc.label}</span>}
                <span style={{fontSize:10,color:FC_LABEL,fontFamily:F}}>Ficha #{sol.id}</span>
              </div>
            </div>
            <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:'1.5px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',flexShrink:0,transition:'all .15s'}}
              onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';(e.currentTarget as HTMLButtonElement).style.borderColor='#fca5a5';}}
              onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';(e.currentTarget as HTMLButtonElement).style.borderColor='#e2e8f0';}}>
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* BODY: 2 columnas */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 300px',flex:1,minHeight:0,overflow:'hidden'}}>

          {/* COL IZQUIERDA */}
          <div style={{overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column' as const,gap:22,scrollbarWidth:'thin' as const}}>

           {/* Resumen proceso */}
          <div>
            <div style={secTitle}>Información del proceso</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 28px'}}>
              {[
                {label:'Entidad', value:sol.entidad||'—'},
                {label:'Número de proceso', value:<span style={{fontFamily:'monospace',fontSize:12}}>{sol.codigoProceso||'—'}</span>},
                {label:'Modalidad', value:modalidadLabel},
                {label:'Fuente', value:sol.fuente||'—'},
                {label:'Registrado por', value:`${sol.usuarioRegistro||'—'}${sol.cargoRegistro?` · ${sol.cargoRegistro}`:''}`},
                {label:'Fecha registro', value:fmtFechaHora(sol.createdAt)},
              ].map(({label,value},i)=>(
                <div key={i} style={{paddingBottom:12,borderBottom:'1px solid #f1f5f9'}}>
                  <div style={labelStyle}>{label}</div>
                  <div style={baseText}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid #f1f5f9'}}>
              <button
                onClick={()=>setVerDetalle(true)}
                style={{display:'inline-flex',alignItems:'center',gap:8,height:34,padding:'0 16px',borderRadius:8,border:'1.5px solid #1e5799',background:'white',color:'#1e5799',fontSize:12.5,fontWeight:600,fontFamily:'var(--font)',cursor:'pointer',transition:'all .15s'}}
                onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#eff6ff';}}
                onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V8.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0014.586 2H5a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                Ver datos del proceso
              </button>
            </div>
          </div>

            {/* Asignación de responsable */}
            <div>
              <div style={secTitle}>Asignar responsable</div>
              <div style={{display:'flex',flexDirection:'column' as const,gap:10}}>
                <div>
                  <div style={labelStyle}>Responsable <span style={{color:'#ef4444'}}>*</span></div>
                  <select
                    value={responsable}
                    onChange={e=>setResponsable(e.target.value)}
                    style={{width:'100%',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',fontSize:13,fontFamily:F,color:responsable?FC_DARK:'#94a3b8',background:'white',outline:'none',cursor:'pointer'}}>
                    <option value="">— Seleccione un responsable —</option>
                    {usuarios.map(u=>(
                      <option key={u.id} value={u.usuario}>{u.usuario} · {u.cargo} · {u.entidadGrupo}</option>
                    ))}
                  </select>
                </div>
                {responsable&&(()=>{
                  const u=usuarios.find(u=>u.usuario===responsable);
                  if(!u)return null;
                  return(
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#f8fafc',border:'1px solid #f1f5f9',borderRadius:8}}>
                      <div style={{width:32,height:32,borderRadius:8,background:'#1e5799',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,fontFamily:F}}>
                        {u.usuario.slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:FC_DARK,fontFamily:F}}>{u.usuario}</div>
                        <div style={{fontSize:11,color:FC_LABEL,fontFamily:F}}>{u.cargo} · {u.entidadGrupo}</div>
                      </div>
                    </div>
                  );
                })()}
                {error&&<div style={{fontSize:12,color:'#dc2626',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'8px 12px',fontFamily:F}}>⚠️ {error}</div>}
                {ok&&<div style={{fontSize:12,color:'#475569',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:6,padding:'8px 12px',fontFamily:F}}>✓ {ok}</div>}
              </div>
            </div>

            {/* Historial de asignaciones */}
            <div>
              <div style={secTitle}>Historial de asignaciones ({asignaciones.length})</div>
              {asignaciones.length===0
                ?<div style={{textAlign:'center' as const,padding:'24px 0',color:FC_LABEL,fontSize:12,fontFamily:F}}>Sin asignaciones previas</div>
                :<div style={{display:'flex',flexDirection:'column' as const,gap:0}}>
                  {asignaciones.map((a,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:i<asignaciones.length-1?'1px solid #f8fafc':'none'}}>
                      <div style={{width:32,height:32,borderRadius:8,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12.5,fontWeight:600,color:FC_DARK,fontFamily:F}}>{String(a.analistaAsignado||'—')}</div>
                        <div style={{fontSize:11,color:FC_LABEL,fontFamily:F}}>{String(a.analistaCargo||'')} · {String(a.fechaAsignacion||'').slice(0,10)}</div>
                      </div>
                      <span style={{fontSize:11,fontWeight:600,padding:'2px 9px',borderRadius:999,background:a.estadoAsignacion==='Pendiente'?'#fef3c7':a.estadoAsignacion==='Terminada'?'#f0fdf4':'#f1f5f9',color:a.estadoAsignacion==='Pendiente'?'#92400e':a.estadoAsignacion==='Terminada'?'#15803d':'#475569',fontFamily:F}}>
                        {String(a.estadoAsignacion||'—')}
                      </span>
                      <div style={{fontSize:10,color:FC_LABEL,fontFamily:'monospace'}}>{String(a.idAsignacion||'')}</div>
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>

          {/* COL DERECHA */}
          <div style={{display:'flex',flexDirection:'column' as const,background:'#fafcff',borderLeft:'1px solid #f1f5f9',overflowY:'auto'}}>

            {/* Presupuesto */}
            {valor&&(
              <div style={{padding:'18px 16px',borderBottom:'1px solid #f1f5f9'}}>
                <div style={labelStyle}>Presupuesto oficial</div>
                <div style={{fontSize:18,fontWeight:700,color:FC_DARK,letterSpacing:'-0.02em',fontFamily:F,marginTop:5}}>{valor}</div>
              </div>
            )}

            {/* Datos clave */}
            <div style={{padding:'18px 16px',borderBottom:'1px solid #f1f5f9',display:'flex',flexDirection:'column' as const,gap:14}}>
              <SideItem label="Número del proceso">
                <span style={{fontFamily:'monospace',fontSize:12}}>{sol.codigoProceso||'—'}</span>
              </SideItem>
              <SideItem label="Modalidad">{modalidadLabel}</SideItem>
              <SideItem label="Estado solicitud">
                {(()=>{const ebc=estadoSolicitudColor(sol.estadoSolicitud||'');return(<span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,color:ebc.color,background:ebc.bg,padding:'2px 9px',borderRadius:999,fontFamily:F}}>{sol.estadoSolicitud||'—'}</span>);})()}
              </SideItem>
              {sol.departamento&&<SideItem label="Localización">{sol.departamento}</SideItem>}
              {sol.fechaVencimiento&&(
                <SideItem label="Vencimiento">
                  <span style={{fontSize:12.5,fontFamily:F}}>{fmtFechaHora(sol.fechaVencimiento)}</span>
                </SideItem>
              )}
            </div>

            {/* SQR */}
            {sol.sqrNumero&&(
              <div style={{padding:'18px 16px',borderBottom:'1px solid #f1f5f9'}}>
                <div style={labelStyle}>SQR</div>
                <div style={{fontSize:13,fontWeight:700,color:'#475569',fontFamily:'monospace',marginTop:4}}>{sol.sqrNumero}</div>
                {sol.fechaAperturaSqr&&<div style={{fontSize:11,color:FC_LABEL,fontFamily:F,marginTop:3}}>Apertura: {fmtFechaHora(sol.fechaAperturaSqr)}</div>}
              </div>
            )}

            <div style={{flex:1}}/>

            {/* Acciones */}
            <div style={{padding:'14px 16px',borderTop:'1px solid #f1f5f9',background:'white',display:'flex',flexDirection:'column' as const,gap:8}}>
              <button onClick={asignar} disabled={asignando||!responsable}
                style={{height:38,borderRadius:8,background:asignando||!responsable?'#94a3b8':'#1e5799',color:'white',border:'none',fontSize:13,fontWeight:600,fontFamily:F,cursor:asignando||!responsable?'not-allowed':'pointer',transition:'all .15s',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}
                onMouseOver={e=>{if(!asignando&&responsable)(e.currentTarget as HTMLButtonElement).style.background='#174a85';}}
                onMouseOut={e=>{if(!asignando&&responsable)(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
                {asignando?'Asignando…':'Asignar solicitud'}
              </button>
              <button onClick={onClose}
                style={{height:36,borderRadius:8,border:'1.5px solid #e2e8f0',background:'white',color:'#475569',fontSize:12.5,fontWeight:500,fontFamily:F,cursor:'pointer',transition:'all .15s'}}
                onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#f8fafc';}}
                onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
                Cerrar
              </button>
              <div style={{fontSize:10,color:FC_LABEL,textAlign:'center' as const,fontFamily:F}}>Solicitud #{sol.id} · {fmtFechaHora(sol.createdAt)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>

  );
}
/* =========================================================
   MÓDULO SOLICITUDES ABIERTAS
========================================================= */
/* =========================================================
   MODAL EDITAR SOLICITUD
========================================================= */
function ModalEditarSolicitud({
  sol,
  sesion,
  onClose,
  onGuardado,
}: {
  sol: Solicitud;
  sesion: Sesion;
  onClose: () => void;
  onGuardado: (updated: Solicitud) => void;
}) {
  const fmtFechaInput = (r: string | null) => {
    if (!r) return '';
    try {
      return new Date(r).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  const fmtFechaDisplay = (r: string) => {
    try {
      return new Date(r)
        .toLocaleString('es-CO', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
        .replace(',', '');
    } catch {
      return r;
    }
  };

  const tipoInicial = (() => {
    if (sol.sede === 'Público' || sol.sede === 'Privado') return sol.sede;
    if ((sol.fuente || '').toLowerCase().includes('secop')) return 'Público';
    return '';
  })();

  const modalidadParts = sol.modalidad?.includes(' — ')
    ? sol.modalidad.split(' — ')
    : [null, sol.modalidad || ''];

  const subtipoInicial = modalidadParts[1] || '';

  const [form, setForm] = useState({
    fechaCreacion: fmtFechaDisplay(sol.createdAt),
    nombrePersonal: sol.usuarioRegistro || sesion.usuario,
    tipoProceso: tipoInicial,
    subtipoProceso: subtipoInicial,
    entidadGrupo: sol.perfil || '',
    ciudad: sol.ciudad || '',
    entidad: (() => {
    const raw = sol.entidad || '';
    const parts = raw.split(' - ');
    return parts.length > 1 ? parts.slice(1).join(' - ').trim() : raw;
    })(),
    codigoProceso: sol.codigoProceso || '',
    objeto: sol.objeto || '',
    valor:
  sol.valor != null
    ? new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
      }).format(Number(sol.valor))
    : '',
    plataforma: sol.plataforma || '',
    fechaCierre: fmtFechaInput(sol.fechaCierre),
    estadoSolicitud:
      sol.estadoSolicitud === 'Rechazada' ? 'Rechazada' : 'En revisión',
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (f: string, v: string) =>
    setForm((p: typeof form) => ({ ...p, [f]: v }));

  const subtipos = SUBTIPOS[form.tipoProceso] || [];

  const handleGuardar = async () => {
    setError('');

    if (
      !form.tipoProceso ||
      !form.entidadGrupo ||
      !form.ciudad ||
      !form.entidad ||
      !form.codigoProceso ||
      !form.objeto
    ) {
      setError('Los campos marcados con * son obligatorios.');
      return;
    }

    setGuardando(true);

    try {
      const modalidadFinal = form.subtipoProceso
        ? `${form.tipoProceso} — ${form.subtipoProceso}`
        : form.tipoProceso;

      const res = await fetch('/api/solicitudes', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: sol.id,
    entidad: form.entidad,
    objeto: form.objeto,
    modalidad: modalidadFinal,
    perfil: form.entidadGrupo,
    ciudad: form.ciudad,
    plataforma: form.plataforma,
    fechaCierre: form.fechaCierre || null,
    estadoSolicitud: form.estadoSolicitud,
    origenSolicitud: sol.origenSolicitud ?? (sol.codigoProceso ? 'Comercial' : 'Especializada'),

  }),
});
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? 'No se pudo actualizar la solicitud');
      }

      onGuardado({
      ...sol,
      ...data.solicitud,
      entidad: form.entidad,
      objeto: form.objeto,
      modalidad: modalidadFinal,
      perfil: form.entidadGrupo,
      ciudad: form.ciudad,
      plataforma: form.plataforma,
      fechaCierre: form.fechaCierre || null,
      estadoSolicitud: form.estadoSolicitud,
    });

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const iS: React.CSSProperties = {
    width: '100%',
    height: 38,
    border: '1.5px solid #e2e8f0',
    borderRadius: 8,
    padding: '0 12px',
    fontSize: 13,
    fontFamily: 'var(--font)',
    color: '#1e293b',
    outline: 'none',
    boxSizing: 'border-box',
    background: 'white',
  };

  const iSdis: React.CSSProperties = {
    ...iS,
    background: '#f8fafc',
    color: '#94a3b8',
  };

  const readOnlyInput: React.CSSProperties = {
  background: '#f1f5f9',
  color: '#64748b',
  borderColor: '#e2e8f0',
  cursor: 'not-allowed',
  boxShadow: 'none',
};

  const lS: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    display: 'block',
    marginBottom: 5,
  };

  const fG: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card" style={{ maxWidth: 720, width: '92%',    maxHeight: '88vh',    overflow: 'hidden', }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1E5799' }}>
            <IcoPencil />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>
              Editar solicitud
            </h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <IcoClose />
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-body">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            <div style={fG}>
              <label style={lS}>Fecha de creación</label>
              <input style={iSdis} value={form.fechaCreacion} disabled />
            </div>

            <div style={fG}>
              <label style={lS}>Registrado por</label>
              <input style={iSdis} value={form.nombrePersonal} disabled />
            </div>

            <div style={fG}>
              <label style={lS}>Tipo de proceso *</label>
              <select
                style={iS}
                value={form.tipoProceso}
                onChange={(e) => set('tipoProceso', e.target.value)}
              >
                <option value="">Seleccionar</option>
                <option value="Público">Público</option>
                <option value="Privado">Privado</option>
              </select>
            </div>

            <div style={fG}>
              <label style={lS}>Modalidad *</label>
              <select
                style={iS}
                value={form.subtipoProceso}
                onChange={(e) => set('subtipoProceso', e.target.value)}
              >
                <option value="">Seleccionar</option>
                {subtipos.map((s: string) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div style={fG}>
              <label style={lS}>Entidad del grupo *</label>
              <select
                style={iS}
                value={form.entidadGrupo}
                onChange={(e) => set('entidadGrupo', e.target.value)}
              >
                <option value="">Seleccionar</option>
                <option value="aseocolba">Aseocolba</option>
                <option value="tempocolba">Tempocolba</option>
                <option value="vigicolba">Vigicolba</option>
              </select>
            </div>

            <div style={fG}>
              <label style={lS}>Ciudad *</label>
              <input
                style={iS}
                value={form.ciudad}
                onChange={(e) => set('ciudad', e.target.value)}
              />
            </div>

            <div style={fG}>
              <label style={lS}>Entidad *</label>
              <input
                style={iS}
                value={form.entidad}
                onChange={(e) => set('entidad', e.target.value)}
              />
            </div>

            <div style={fG}>
              <label style={lS}>Código del proceso *</label>
              <input style={iSdis} value={form.codigoProceso} disabled />
            </div>

            <div style={{ ...fG, gridColumn: '1 / -1' }}>
              <label style={lS}>Objeto *</label>
              <textarea
                style={{ ...iS, height: 90, padding: 12, resize: 'vertical' }}
                value={form.objeto}
                onChange={(e) => set('objeto', e.target.value)}
              />
            </div>

            <div style={fG}>
              <label style={lS}>Presupuesto</label>
              <input style={iSdis} value={form.valor} disabled />
            </div>

            <div style={fG}>
              <label style={lS}>Plataforma</label>
              <input
                style={iS}
                value={form.plataforma}
                onChange={(e) => set('plataforma', e.target.value)}
              />
            </div>

            <div style={fG}>
              <label style={lS}>Fecha de cierre</label>
              <input
                type="date"
                style={iS}
                value={form.fechaCierre}
                onChange={(e) => set('fechaCierre', e.target.value)}
              />
            </div>

            <div style={fG}>
              <label style={lS}>Estado de la solicitud *</label>
              <select
                style={iS}
                value={form.estadoSolicitud}
                onChange={(e) => set('estadoSolicitud', e.target.value)}
              >
                <option value="En revisión">En revisión</option>
                <option value="Rechazada">Rechazada</option>
              </select>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-cancel" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button className="modal-btn-save" onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
/* =========================================================
   MODAL CREAR SOLICITUD MANUAL
========================================================= */
const ENTIDADES_GRUPO=['Aseocolba','Vigicolba','Tempocolba'];
const TIPOS_PROCESO=['Público','Privado'];
const SUBTIPOS:Record<string,string[]>={
  'Público':['Licitación pública','Selección abreviada','Concurso de méritos','Contratación directa','Mínima cuantía','Régimen especial'],
  'Privado':['Cotización','Contrato directo','Invitación privada','Otro'],
};
const UEN_OPTIONS=['Barranquilla','Bogotá','Mina'];
const CIUDADES_CO=['Medellín','Bogotá D.C.','Cali','Barranquilla','Cartagena','Bucaramanga','Pereira','Manizales','Cúcuta','Ibagué','Santa Marta','Villavicencio','Pasto','Montería','Neiva','Armenia','Popayán','Valledupar','Sincelejo','Tunja','Riohacha','Quibdó','Florencia','Mocoa','Leticia','Puerto Inírida','San José del Guaviare','Mitú','Puerto Carreño','Yopal','Arauca','San Andrés','Otra'];

function ModalCrearSolicitud({
  sesion,
  onClose,
  onCreada,
  origenSolicitud,
}: {
  sesion: Sesion;
  onClose: () => void;
  onCreada: () => void;
  origenSolicitud: 'Comercial' | 'Especializada';
}) {
  const ahora = new Date().toLocaleString('es-CO',{
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit'
  }).replace(',','');

  const formInicial = {
  fechaSolicitud: ahora,
  nombrePersonal: sesion.usuario,
  origenSolicitud,
  tipoProceso: '',
  subtipoProceso: '',
  entidadGrupo: '',
  uen: '',
  ciudad: '',
  entidad: '',
  codigoProceso: '',
  objeto: '',
  valor: '',
  departamento: '',
  plataforma: '',
  linkDetalle: '',
  fechaCierre: '',

  nitContacto: '',
  personaContacto: '',
  telefonoContacto: '',
  direccionContacto: '',
  correoContacto: '',
};

const [form, setForm] = useState(() => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const draft = JSON.parse(raw);

      return {
        ...formInicial,
        ...draft,
        fechaSolicitud: ahora,
        nombrePersonal: sesion.usuario,
        origenSolicitud,
      };
    }
  } catch {}

  return formInicial;
});

  const [tieneBorrador, setTieneBorrador] = useState(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      return !!(d.entidad || d.codigoProceso || d.objeto || d.tipoProceso);
    } catch {
      return false;
    }
  });

  const [guardando,setGuardando] = useState(false);
  const [error,setError] = useState('');

  const set=(f:string,v:string)=>setForm((p:typeof form)=>({...p,[f]:v}));
  const subtipos=SUBTIPOS[form.tipoProceso]||[];

  const handleGuardar=async()=>{
  setError('');
  if(!form.tipoProceso||!form.entidadGrupo||!form.ciudad||!form.entidad||!form.codigoProceso||!form.objeto){
    setError('Los campos marcados con * son obligatorios.');return;
  }
  setGuardando(true);
  try{
    const modalidadFinal=form.subtipoProceso
      ?form.subtipoProceso
      :form.tipoProceso;

    const res=await fetch('/api/solicitudes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      codigoProceso:    form.codigoProceso,
      nombreProceso:    form.objeto,
      entidad:          form.entidad,
      objeto:           form.objeto,
      modalidad:        modalidadFinal,
      sede:             form.tipoProceso,
      perfil:           form.entidadGrupo,
      ciudad:           form.ciudad,
      departamento:     form.ciudad,
      plataforma:       form.plataforma||'Manual',
      linkDetalle:      form.linkDetalle||null,
      fechaCierre:      form.fechaCierre||null,
      fechaVencimiento: form.fechaCierre||null,
      observacion:      form.uen?`UEN: ${form.uen}`:(null),
      valor:            form.valor?Number(form.valor.replace(/[^0-9]/g,'')):null,
      origenSolicitud,

      // campos especializados
      nitContacto:      form.nitContacto||null,
      personaContacto:  form.personaContacto||null,
      telefonoContacto: form.telefonoContacto||null,
      direccionContacto:form.direccionContacto||null,
      correoContacto:   form.correoContacto||null,

      estadoSolicitud:  'En revisión',
      usuarioRegistro:  sesion.usuario,
      emailRegistro:    sesion.email,
      cargoRegistro:    sesion.cargo,
      entidadRegistro:  form.entidadGrupo,
      fuente:           form.plataforma||'Manual',
      aliasFuente:      '',
      docData:[],procData:{},obsData:[],
    })});
    const data=await res.json();
    if(!res.ok||!data.ok)throw new Error(data.error??'No se pudo crear la solicitud');
    try{localStorage.removeItem(DRAFT_KEY);}catch{/**/}
    onCreada();onClose();
  }catch(e){setError(e instanceof Error?e.message:'Error al guardar.');}
  finally{setGuardando(false);}
};

  const iS:React.CSSProperties={width:'100%',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',fontSize:13,fontFamily:'var(--font)',color:'#1e293b',outline:'none',boxSizing:'border-box' as const,background:'white'};
  const iSdis:React.CSSProperties={
  width:'100%',
  height:38,
  borderRadius:8,
  padding:'0 12px',
  fontSize:13,
  fontFamily:'var(--font)',
  boxSizing:'border-box' as const,
  background:'#f4f6f9',
  color:'#6b7280',
  border:'1.5px solid #f4f6f9',
  cursor:'default',
  pointerEvents:'none' as const,
  userSelect:'none' as const,
  boxShadow:'none',
  outline:'none',
};
  const lS:React.CSSProperties={fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:5};
  const Req=()=><span style={{color:'#dc2626',marginRight:2}}>*</span>;
  const fG:React.CSSProperties={display:'flex',flexDirection:'column' as const,gap:4};

  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'white',borderRadius:8,width:'96vw',maxWidth:860,maxHeight:'94vh',display:'flex',flexDirection:'column',boxShadow:'0 8px 32px rgba(0,0,0,.15)',overflow:'hidden'}}>

        {/* HEADER — minimalista */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 28px 16px',borderBottom:'1px solid #f1f5f9',flexShrink:0}}>
          <h3 style={{margin:0,fontSize:17,fontWeight:600,color:'#111827'}}>Crear solicitud</h3>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:6,border:'1px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#6b7280'}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#6b7280';}}>
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* BODY */}
        <div style={{overflowY:'auto',flex:1,padding:'20px 28px',display:'flex',flexDirection:'column',gap:14}}>
          {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'9px 12px',color:'#dc2626',fontSize:12}}>⚠️ {error}</div>}
          {tieneBorrador&&<div style={{background:'#fefce8',border:'1px solid #fde68a',borderRadius:6,padding:'9px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}><span style={{fontSize:12,color:'#92400e'}}>📋 Se restauró un borrador guardado automáticamente.</span><button onClick={()=>{try{localStorage.removeItem(DRAFT_KEY);}catch{/**/}setForm({...formInicial,fechaSolicitud:ahora,nombrePersonal:sesion.usuario});setTieneBorrador(false);}} style={{fontSize:11,color:'#92400e',background:'none',border:'1px solid #fde68a',borderRadius:4,padding:'2px 8px',cursor:'pointer',fontFamily:'var(--font)'}}>Descartar</button></div>}

        {/* Fecha / Usuario */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>Fecha de solicitud</label>
              <div style={{display:'flex',alignItems:'center',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',background:'#f8fafc',gap:8}}>
                <svg fill="none" stroke="#94a3b8" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14,flexShrink:0}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                <span style={{fontSize:13,color:'#475569',fontFamily:'var(--font)'}}>{form.fechaSolicitud}</span>
              </div>
            </div>
            <div style={fG}>
              <label style={lS}>Nombre del personal</label>
              <div style={{display:'flex',alignItems:'center',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',background:'#f8fafc',gap:8}}>
                <svg fill="none" stroke="#94a3b8" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14,flexShrink:0}}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
                <span style={{fontSize:13,color:'#475569',fontFamily:'var(--font)'}}>{form.nombrePersonal}</span>
              </div>
            </div>
          </div>

          {/* Tipo / Entidad grupo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={fG}>
              <label style={lS}><Req/>Tipo de proceso</label>
              <select
                style={iS}
                value={form.tipoProceso}
                onChange={(e) => {
                  set('tipoProceso', e.target.value);
                  set('subtipoProceso', '');
                }}
              >
                <option value="">— Seleccione —</option>
                <option value="Público">Público</option>
                <option value="Privado">Privado</option>
              </select>
            </div>

            <div style={fG}>
              <label style={lS}><Req/>Entidad del grupo</label>
              <select
                style={iS}
                value={form.entidadGrupo}
                onChange={(e) => set('entidadGrupo', e.target.value)}
              >
                <option value="">— Seleccione —</option>
                <option value="Aseocolba">Aseocolba</option>
                <option value="Tempocolba">Tempocolba</option>
                <option value="Vigicolba">Vigicolba</option>
              </select>
            </div>
          </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={fG}>
              <label style={lS}>Modalidad</label>
              <select
                style={form.tipoProceso ? iS : iSdis}
                value={form.subtipoProceso}
                onChange={(e) => set('subtipoProceso', e.target.value)}
                disabled={!form.tipoProceso}
              >
                <option value="">— Seleccione —</option>
                {subtipos.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div style={fG}>
              <label style={lS}><Req/>Ciudad</label>
              <select
                style={iS}
                value={form.ciudad}
                onChange={(e) => set('ciudad', e.target.value)}
              >
                <option value="">— Seleccione —</option>
                {CIUDADES_CO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {origenSolicitud === 'Especializada' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={fG}>
                  <label style={lS}>* NIT</label>
                  <input
                    style={iS}
                    placeholder="Ej. 900123456-7"
                    value={form.nitContacto}
                    onChange={(e) => set('nitContacto', e.target.value)}
                  />
                </div>

                <div style={fG}>
                  <label style={lS}>* Cliente</label>
                  <input
                    style={iS}
                    placeholder="Nombre del cliente o entidad contratante"
                    value={form.entidad}
                    onChange={(e) => set('entidad', e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={fG}>
                  <label style={lS}>Dirección</label>
                  <input
                    style={iS}
                    placeholder="Dirección de contacto"
                    value={form.direccionContacto}
                    onChange={(e) => set('direccionContacto', e.target.value)}
                  />
                </div>

                <div style={fG}>
                  <label style={lS}>* Correo</label>
                  <input
                    type="email"
                    style={iS}
                    placeholder="correo@empresa.com"
                    value={form.correoContacto}
                    onChange={(e) => set('correoContacto', e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={fG}>
                  <label style={lS}>* Teléfono</label>
                  <input
                    style={iS}
                    placeholder="Teléfono o celular"
                    value={form.telefonoContacto}
                    onChange={(e) => set('telefonoContacto', e.target.value)}
                  />
                </div>

                <div style={fG}>
                  <label style={lS}>* Persona contacto</label>
                  <input
                    style={iS}
                    placeholder="Nombre de la persona contacto"
                    value={form.personaContacto}
                    onChange={(e) => set('personaContacto', e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={fG}>
                <label style={lS}><Req/>Cliente</label>
                <input
                  style={iS}
                  placeholder="Nombre del cliente o entidad contratante"
                  value={form.entidad}
                  onChange={(e) => set('entidad', e.target.value)}
                />
              </div>

              <div />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={fG}>
              <label style={lS}><Req/>No. proceso</label>
              <input
                style={iS}
                placeholder="Ej. MC-007-2026"
                value={form.codigoProceso}
                onChange={(e) => set('codigoProceso', e.target.value)}
              />
            </div>

            <div style={fG}>
              <label style={lS}>Fecha cierre</label>
              <input
                type="date"
                style={iS}
                value={form.fechaCierre}
                onChange={(e) => set('fechaCierre', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={fG}>
              <label style={lS}>Presupuesto</label>
              <input
                style={iS}
                placeholder="Ej. 150000000"
                type="text"
                value={form.valor}
                onChange={(e) => set('valor', e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>

            <div style={fG}>
              <label style={lS}>Plataforma</label>
              <input
                style={iS}
                placeholder="Ej. SECOP II, Portal propio…"
                value={form.plataforma}
                onChange={(e) => set('plataforma', e.target.value)}
              />
            </div>
          </div>

          <div style={fG}>
            <label style={lS}><Req/>Descripción</label>
            <textarea
              style={{
                ...iS,
                height: 80,
                padding: '8px 12px',
                resize: 'vertical' as const,
                lineHeight: 1.5,
              }}
              placeholder="Descripción del objeto del contrato o proceso…"
              value={form.objeto}
              onChange={(e) => set('objeto', e.target.value)}
            />
          </div>
        </div>
        {/* FOOTER — centrado igual que la imagen */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'16px 28px',borderTop:'1px solid #f1f5f9',background:'white',flexShrink:0}}>
          <button onClick={handleGuardar} disabled={guardando} style={{height:38,padding:'0 32px',borderRadius:6,background:guardando?'#6b93c4':'#2563eb',color:'white',border:'none',fontSize:13,fontWeight:600,fontFamily:'var(--font)',cursor:guardando?'not-allowed':'pointer'}}>
            {guardando?'Guardando…':'Guardar'}
          </button>
          <button onClick={onClose} disabled={guardando} style={{height:38,padding:'0 24px',borderRadius:6,border:'1px solid #e2e8f0',background:'white',color:'#374151',fontSize:13,fontFamily:'var(--font)',cursor:'pointer'}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* Configuración por variante */
type VarianteSolicitudes = 'COMERCIAL' | 'ESPECIALIZADA' | 'TODAS' | 'RECHAZADA';
const VARIANTE_CONFIG:Record<VarianteSolicitudes,{titulo:string;emptyMsg:string}> = {
  COMERCIAL:     {titulo:'Solicitudes Comerciales',   emptyMsg:'No hay solicitudes comerciales abiertas. Gestiona un proceso desde Búsqueda de procesos.'},
  ESPECIALIZADA: {titulo:'Solicitudes Especializados', emptyMsg:'No hay solicitudes especializadas abiertas.'},
  TODAS:         {titulo:'Solicitudes abiertas',               emptyMsg:'No hay solicitudes abiertas. Gestiona un proceso desde Búsqueda de procesos.'},
  RECHAZADA:     {titulo:'Solicitudes rechazadas',              emptyMsg:'No hay solicitudes rechazadas.'},
};
/* Heurística de origen mientras no exista origenSolicitud en BD:
   COMERCIAL    = tiene codigoProceso  (viene de Búsqueda de procesos, no es manual)
   ESPECIALIZADA = no tiene codigoProceso (creada manualmente)
   Se reemplaza fácilmente cuando se agregue s.origenSolicitud al modelo */
function matchVariante(s: Solicitud, variante: VarianteSolicitudes): boolean {
  const estado = String(s.estadoSolicitud ?? '').toLowerCase();
  const origen = String(s.origenSolicitud ?? 'Comercial').toLowerCase();

  if (variante === 'TODAS') {
    return true;
  }

  if (variante === 'RECHAZADA' || (variante as string) === 'RECHAZADAS') {

    return estado.includes('rechazad');
  }

  if ((variante as string) === 'ELIMINADA' || (variante as string) === 'ELIMINADAS') {
    return true;
  }

  if (variante === 'COMERCIAL') {
    return origen === 'comercial';
  }

  if (variante === 'ESPECIALIZADA') {
    return origen === 'especializada';
  }

  return true;
}

/* =========================================================
   STEPPER DE FASES
========================================================= */
const FASES_SOL = [
  { label: 'Selección\nde proceso' },
  { label: 'En revisión\ncomercial' },
  { label: 'Asignada' },
  { label: 'En observación' },
  { label: 'En proceso' },
  { label: 'En evaluación' },
  { label: 'Cerrada' },
];

function getFaseIdx(estado: string): number {
  const e = (estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (e.includes('seleccion de proceso') || e === '') return 0;
  if (e.includes('revision') || e.includes('revisi')) return 1;
  if (e.includes('asignad')) return 2;
  if (e.includes('observaci')) return 3;
  if (e.includes('proceso') || e.includes('gesti')) return 4;
  if (e.includes('evaluac')) return 5;
  if (e.includes('cerrad') || e.includes('cerrad') || e.includes('liquid')) return 6;
  return 0;
}

function StepperSolicitud({ estadoSolicitud }: { estadoSolicitud: string }) {
  const actual = getFaseIdx(estadoSolicitud);

  const FASES_ICONS = [
    // Selección de proceso
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:16,height:16}}><path d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>,
    // En revisión comercial
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:16,height:16}}><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>,
    // Asignada
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:16,height:16}}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>,
    // En observación
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:16,height:16}}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>,
    // En proceso
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:16,height:16}}><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/></svg>,
    // En evaluación
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:16,height:16}}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
    // Cerrada
    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:16,height:16}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  ];

  return (
    <div style={{display:'flex',alignItems:'center',padding:'12px 0 4px',overflowX:'auto'}}>
      {FASES_SOL.map((fase, i) => {
        const done = i < actual;
        const active = i === actual;
        return (
          <React.Fragment key={i}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:72,flex:1}}>
              <div style={{
                width:38,height:38,borderRadius:'50%',
                background: done ? '#1e5799' : active ? '#1e5799' : '#f1f5f9',
                border: active ? '2.5px solid #1e5799' : done ? 'none' : '1.5px solid #e2e8f0',
                display:'flex',alignItems:'center',justifyContent:'center',
                flexShrink:0,
                color: done || active ? 'white' : '#94a3b8',
                boxShadow: active ? '0 0 0 4px rgba(30,87,153,0.1)' : 'none',
                transition:'all .2s',
              }}>
                {done
                  ? <svg fill="none" stroke="white" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:15,height:15}}><path d="M20 6L9 17l-5-5"/></svg>
                  : FASES_ICONS[i]
                }
              </div>
              <div style={{
                fontSize:10.5,
                fontWeight: active ? 700 : 400,
                marginTop:6,
                color: active ? '#1e5799' : done ? '#334155' : '#94a3b8',
                textAlign:'center' as const,
                whiteSpace:'pre' as const,
                lineHeight:1.3,
                fontFamily:'var(--font)',
              }}>{fase.label}</div>
            </div>
            {i < FASES_SOL.length - 1 && (
              <div style={{
                height:2,flex:1,maxWidth:36,flexShrink:0,marginBottom:22,
                background: i < actual ? '#1e5799' : '#e2e8f0',
                borderRadius:2,
              }}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* =========================================================
   FILA EXPANDIDA INLINE
========================================================= */
function FilaDetalle({
  sol, sesion, variante, onClose, onGuardado, colSpan,
}: {
  sol: Solicitud; sesion: Sesion; variante: string;
  onClose: () => void; onGuardado: (u: Solicitud) => void; colSpan: number;
}) {
  const [usuarios, setUsuarios] = React.useState<UsuarioAsignable[]>([]);
  const [responsable, setResponsable] = React.useState('');
  const [asignando, setAsignando] = React.useState(false);
  const [error, setError] = React.useState('');
  const [ok, setOk] = React.useState('');
  const [verDetalleProceso, setVerDetalleProceso] = React.useState(false);

  const F = 'var(--font)';
  const FC = '#334155';
  const FC_LABEL = '#94a3b8';
  const FC_DARK = '#0f172a';
  const lbl: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: FC_LABEL, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontFamily: F, marginBottom: 3 };
  const txt: React.CSSProperties = { fontSize: 12.5, color: FC, fontFamily: F, lineHeight: 1.5 };

  const asignaciones: Array<Record<string, unknown>> = Array.isArray(sol.asignaciones) ? sol.asignaciones as Array<Record<string, unknown>> : [];
  const pc = sol.perfil ? perfilColor(sol.perfil) : null;
  const portal = portalColorModal(sol.aliasFuente || '', sol.fuente || '', sol.fuente || '');
  const ebc = estadoSolicitudColor(sol.estadoSolicitud || '');
  const modalidadLabel = MMAP_MODALIDAD[sol.modalidad] ?? sol.modalidad ?? '—';

  const fmtFH = (r: string | null) => {
    if (!r) return '—';
    const d = new Date(r);
    return isNaN(d.getTime()) ? r : d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  };
  const fmtV = (v: number | null) => {
    if (v == null || isNaN(v) || v === 0) return '—';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
  };

  React.useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        const todos = data.filter((u: any) => u.estado === 'Activo');
        const filtered = variante === 'COMERCIAL' ? todos.filter((u: any) => u.proceso === 'Comercial')
          : variante === 'ESPECIALIZADA' ? todos.filter((u: any) => u.proceso && u.proceso !== 'Comercial')
          : todos;
        const usuariosAsignables: UsuarioAsignable[] = filtered.map(u => ({
        id: safeNumber(u.id),
        usuario: safeString(u.usuario),
        cargo: safeString(u.cargo),
        entidadGrupo: safeString(u.entidadGrupo),
        rol: safeString(u.rol, 'Usuario Final'),
        estado: safeString(u.estado, 'Activo'),
        proceso: safeString(u.proceso),
      }));

      setUsuarios(usuariosAsignables);
      }
    }).catch(() => {});
  }, []);

  const asignar = async () => {
    if (!responsable) { setError('Selecciona un responsable.'); return; }
    setAsignando(true); setError(''); setOk('');
    try {
      const u = usuarios.find(u => u.usuario === responsable);
      const ahora = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const fechaStr = `${ahora.getFullYear()}-${pad(ahora.getMonth()+1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
      const numAsig = asignaciones.length + 1;
      const nueva = {
        idAsignacion: `ASG-${String(numAsig).padStart(2,'0')}`,
        solicitudId: sol.id, solicitudNum: sol.id,
        analistaAsignado: u?.usuario || responsable, analistaCargo: u?.cargo || '',
        analistaEntidad: u?.entidadGrupo || '', asignadoPor: sesion.usuario || '',
        asignadoPorCargo: sesion.cargo || '', fechaAsignacion: fechaStr,
        estadoAsignacion: 'Pendiente', estadoBandeja: 'pendiente',
        entidad: sol.entidad || '', codigoProceso: sol.codigoProceso || '',
        objeto: sol.objeto || '', valor: sol.valor || null,
        modalidad: sol.modalidad || '', ciudad: sol.ciudad || sol.departamento || '',
        perfil: sol.perfil || '', fechaVencimiento: sol.fechaVencimiento || null, observacion: '',
      };
      const nuevasAsig = [...asignaciones, nueva];
      const res = await fetch('/api/solicitudes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sol.id, estadoSolicitud: 'Asignada', asignaciones: nuevasAsig }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error ?? 'Error al asignar.'); return; }
      setOk(`Asignado a ${u?.usuario || responsable}`);
      const updated: Solicitud = { ...sol, ...data.solicitud, estadoSolicitud: 'Asignada', asignaciones: nuevasAsig };
      onGuardado(updated);
      setTimeout(() => onClose(), 1200);
    } catch { setError('No se pudo conectar.'); }
    finally { setAsignando(false); }
  };

  return (
    <>
      {verDetalleProceso && <ModalDetallesProceso sol={sol} onClose={() => setVerDetalleProceso(false)} />}
      <tr style={{ background: '#f8fafc' }}>
        <td colSpan={colSpan} style={{ padding: 0, borderBottom: '2px solid #1e5799' }}>
          <div style={{ borderLeft: '3px solid #1e5799', margin: '0 4px', padding: '0 20px 20px' }}>

            {/* Seguimiento del proceso */}
            <StepperSolicitud estadoSolicitud={sol.estadoSolicitud || ''} />

            {/* Contenido en dos columnas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, marginTop: 12 }}>

              {/* Panel principal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#1e5799', color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: F }}>{portal.short}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: FC_DARK, fontFamily: F }}>{sol.entidad || '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' as const }}>
                      {sol.codigoProceso && <span style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', border: '1px solid #e8edf2', padding: '1px 8px', borderRadius: 5, fontFamily: 'monospace' }}>{sol.codigoProceso}</span>}
                      {pc && <span style={{ fontSize: 11, color: pc.color, background: pc.bg, padding: '1px 8px', borderRadius: 999, fontWeight: 600, fontFamily: F }}>{pc.label}</span>}
                      <span style={{ fontSize: 10.5, color: FC_LABEL, fontFamily: F }}>Ficha #{sol.id}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => setVerDetalleProceso(true)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 7, border: '1.5px solid #1e5799', background: 'white', color: '#1e5799', fontSize: 11.5, fontWeight: 600, fontFamily: F, cursor: 'pointer' }}>
                      <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ width: 13, height: 13 }}><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V8.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0014.586 2H5a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                      Ver datos del proceso
                    </button>
                    <button onClick={onClose}
                      style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}
                      onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2'; (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
                      onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'white'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; }}>
                      <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {/* Info general */}
                <div style={{ background: 'white', border: '1px solid #e8edf2', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#1e5799', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 10, fontFamily: F }}>Información del proceso</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                    {[
                      { label: 'Entidad', value: sol.entidad || '—' },
                      { label: 'Número de proceso', value: <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{sol.codigoProceso || '—'}</span> },
                      { label: 'Modalidad', value: modalidadLabel },
                      { label: 'Fuente', value: sol.fuente || '—' },
                      { label: 'Registrado por', value: `${sol.usuarioRegistro || '—'}${sol.cargoRegistro ? ` · ${sol.cargoRegistro}` : ''}` },
                      { label: 'Fecha registro', value: fmtFH(sol.createdAt) },
                    ].map(({ label, value }, i) => (
                      <div key={i} style={{ paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                        <div style={lbl}>{label}</div>
                        <div style={txt}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Asignación de responsable */}
                <div style={{ background: 'white', border: '1px solid #e8edf2', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#1e5799', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 10, fontFamily: F }}>Asignar responsable</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select value={responsable} onChange={e => setResponsable(e.target.value)}
                      style={{ flex: 1, height: 36, border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '0 10px', fontSize: 12.5, fontFamily: F, color: responsable ? FC_DARK : '#94a3b8', background: 'white', outline: 'none' }}>
                      <option value="">— Seleccione un responsable —</option>
                      {usuarios.map(u => <option key={u.id} value={u.usuario}>{u.usuario} · {u.cargo} · {u.entidadGrupo}</option>)}
                    </select>
                    <button onClick={asignar} disabled={asignando || !responsable}
                      style={{ height: 36, padding: '0 16px', borderRadius: 8, background: asignando || !responsable ? '#94a3b8' : '#1e5799', color: 'white', border: 'none', fontSize: 12.5, fontWeight: 600, fontFamily: F, cursor: asignando || !responsable ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ width: 13, height: 13 }}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /></svg>
                      {asignando ? 'Asignando…' : 'Asignar solicitud'}
                    </button>
                  </div>
                  {error && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', marginTop: 8, fontFamily: F }}>⚠️ {error}</div>}
                  {ok && <div style={{ fontSize: 12, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 10px', marginTop: 8, fontFamily: F }}>✓ {ok}</div>}
                </div>

                {/* Historial de asignaciones */}
                {asignaciones.length > 0 && (
                  <div style={{ background: 'white', border: '1px solid #e8edf2', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#1e5799', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 10, fontFamily: F }}>Historial de asignaciones ({asignaciones.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {asignaciones.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < asignaciones.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{ width: 12, height: 12 }}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /></svg>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: FC_DARK, fontFamily: F }}>{String(a.analistaAsignado || '—')}</div>
                            <div style={{ fontSize: 10.5, color: FC_LABEL, fontFamily: F }}>{String(a.analistaCargo || '')} · {String(a.fechaAsignacion || '').slice(0, 10)}</div>
                          </div>
                          <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: a.estadoAsignacion === 'Pendiente' ? '#fef3c7' : a.estadoAsignacion === 'Terminada' ? '#f0fdf4' : '#f1f5f9', color: a.estadoAsignacion === 'Pendiente' ? '#92400e' : a.estadoAsignacion === 'Terminada' ? '#15803d' : '#475569', fontFamily: F }}>{String(a.estadoAsignacion || '—')}</span>
                          <div style={{ fontSize: 10, color: FC_LABEL, fontFamily: 'monospace' }}>{String(a.idAsignacion || '')}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Panel lateral de acciones */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Presupuesto */}
                {sol.valor != null && sol.valor !== 0 && (
                  <div style={{ background: 'white', border: '1px solid #e8edf2', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={lbl}>Presupuesto oficial</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: FC_DARK, letterSpacing: '-0.02em', fontFamily: F, marginTop: 4 }}>{fmtV(sol.valor)}</div>
                  </div>
                )}

                {/* Datos clave */}
                <div style={{ background: 'white', border: '1px solid #e8edf2', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={lbl}>Número del proceso</div>
                    <div style={{ ...txt, fontFamily: 'monospace', fontSize: 12 }}>{sol.codigoProceso || '—'}</div>
                  </div>
                  <div>
                    <div style={lbl}>Modalidad</div>
                    <div style={txt}>{modalidadLabel}</div>
                  </div>
                  <div>
                    <div style={lbl}>Estado solicitud</div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: ebc.color, background: ebc.bg, padding: '2px 9px', borderRadius: 999, fontFamily: F }}>{sol.estadoSolicitud || '—'}</span>
                  </div>
                  {sol.departamento && (
                    <div>
                      <div style={lbl}>Localización</div>
                      <div style={txt}>{sol.departamento}</div>
                    </div>
                  )}
                  {sol.fechaVencimiento && (
                    <div>
                      <div style={lbl}>Vencimiento</div>
                      <div style={{ ...txt, fontSize: 12 }}>{fmtFH(sol.fechaVencimiento)}</div>
                    </div>
                  )}
                  {sol.sqrNumero && (
                    <div>
                      <div style={lbl}>SQR</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', fontFamily: 'monospace', marginTop: 2 }}>{sol.sqrNumero}</div>
                      {sol.fechaAperturaSqr && <div style={{ fontSize: 10.5, color: FC_LABEL, fontFamily: F, marginTop: 2 }}>Apertura: {fmtFH(sol.fechaAperturaSqr)}</div>}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 10, color: FC_LABEL, textAlign: 'center' as const, fontFamily: F, padding: '4px 0' }}>
                  Solicitud #{sol.id} · {fmtFH(sol.createdAt)}
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

function VistFicha({sol,sesion,variante,onVolver,onGuardado}:{sol:Solicitud;sesion:Sesion;variante:string;onVolver:()=>void;onGuardado:(u:Solicitud)=>void}){
  const [solActual,setSolActual]=React.useState(sol);
  const [usuarios, setUsuarios] = React.useState<UsuarioAsignable[]>([]);
  const [responsable,setResponsable]=React.useState('');
  const [asignando,setAsignando]=React.useState(false);
  const [error,setError]=React.useState('');
  const [tabActiva,setTabActiva]=React.useState<'resumen'|'requisitos'|'cronograma'|'documentacion'|'adendas'>('resumen');
  const [docVista,setDocVista]=React.useState<'grid'|'list'>('list');
  const [adendas,setAdendas]=React.useState<Array<{
  id:number;
  nombre:string;
  urlDocumento:string|null;
  tipoDocumento?:string|null;
  fechaDetectado:string;
}>>([]);
  const [cargandoAdendas,setCargandoAdendas]=React.useState(false);
  const [modoReasignar,setModoReasignar]=React.useState(false);

  const F='var(--font)';
  const FC='#334155';const FC_LABEL='#6b7280';const FC_DARK='#0f172a';
  const asignaciones = safeArray<Record<string, unknown>>(solActual.asignaciones);
  const pc=solActual.perfil?perfilColor(solActual.perfil):null;
  const fmtFH=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});};
  const fmtV=(v:number|null)=>{if(v==null||isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};
  const docArr = safeArray<DocumentoDinamico>(solActual.docData);
  const procDataEntries = Object.entries(solActual.procData || {}).filter(([, v]) => Boolean(v?.fechaI || v?.obs));
  const urlFuente=solActual.linkSecop||solActual.linkDetalle||solActual.linkSecopReg||'';
  const ebFuente=estadoBadgeColor(solActual.estadoFuente||'');
  const modalidadDisplay=(()=>{const m=solActual.modalidad?.trim();if(!m||m==='—')return'—';return MMAP_MODALIDAD[m]??m;})();
  const fuenteDisplay=solActual.fuente?solActual.fuente.charAt(0).toUpperCase()+solActual.fuente.slice(1):'—';
  const esEspecializada=variante==='ESPECIALIZADA';
  const solE = {
    nitContacto: safeString(solActual.nitContacto),
    personaContacto: safeString(solActual.personaContacto),
    telefonoContacto: safeString(solActual.telefonoContacto),
    direccionContacto: safeString(solActual.direccionContacto),
    correoContacto: safeString(solActual.correoContacto),
  };
  const estadosBloqueados=['En observación','En proceso','En evaluación','Cerrada'];
  const asignacionBloqueada=asignaciones.length>0&&estadosBloqueados.includes(String(asignaciones[asignaciones.length-1].estadoAsignacion||''));

  const getDocExt=(url:string,nombre?:string)=>{
    const s=(url||'').toLowerCase();const n=(nombre||'').toLowerCase();
    const isXls=s.indexOf('.xlsx')>=0||s.indexOf('.xls')>=0||n.indexOf('.xlsx')>=0||n.indexOf('.xls')>=0||n.indexOf('xlsx')>=0||n.indexOf('excel')>=0||n.indexOf('hoja')>=0;
    const isDoc=s.indexOf('.docx')>=0||s.indexOf('.doc')>=0||n.indexOf('.docx')>=0||n.indexOf('.doc')>=0||n.indexOf('word')>=0;
    const isZip=s.indexOf('.zip')>=0||s.indexOf('.rar')>=0||n.indexOf('.zip')>=0||n.indexOf('.rar')>=0;
    if(isXls)return{bg:'#f0fdf4',color:'#15803d',label:'XLS'};
    if(isDoc)return{bg:'#eff6ff',color:'#1d4ed8',label:'DOC'};
    if(isZip)return{bg:'#faf5ff',color:'#7e22ce',label:'ZIP'};
    return{bg:'#fff1f2',color:'#be123c',label:'PDF'};
  };

  React.useEffect(()=>{
    fetch(`/api/solicitudes/${sol.id}`).then(r=>r.json()).then(data=>{
      if(data.ok&&data.solicitud)setSolActual(data.solicitud);
    }).catch(()=>{});
  },[sol.id]);

  // Carga de usuarios activos disponibles para asignación.
  React.useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;

        const usuariosActivos = safeArray<UsuarioActivo>(data).filter(
          usuario => safeString(usuario.estado) === 'Activo'
        );

        const usuariosPorProceso =
          variante === 'COMERCIAL'
            ? usuariosActivos.filter(
                usuario => safeString(usuario.proceso) === 'Comercial'
              )
            : variante === 'ESPECIALIZADA'
              ? usuariosActivos.filter(usuario => {
                  const procesoUsuario = safeString(usuario.proceso);
                  return Boolean(procesoUsuario) && procesoUsuario !== 'Comercial';
                })
              : usuariosActivos;

        const usuariosAsignables: UsuarioAsignable[] = usuariosPorProceso.map(usuario => ({
          id: safeNumber(usuario.id),
          usuario: safeString(usuario.usuario),
          cargo: safeString(usuario.cargo),
          entidadGrupo: safeString(usuario.entidadGrupo),
          rol: safeString(usuario.rol, 'Usuario Final'),
          estado: safeString(usuario.estado, 'Activo'),
          proceso: safeString(usuario.proceso),
        }));

        setUsuarios(usuariosAsignables);
      })
      .catch(() => {});
  }, [variante]);

  React.useEffect(()=>{
  const procesoId=Number(solActual.procesoId);

  if(!Number.isInteger(procesoId)||procesoId<=0){
    setAdendas([]);
    return;
  }

  setCargandoAdendas(true);

  fetch(`/api/procesos/${procesoId}/adendas`)
    .then(r=>r.json())
    .then(data=>{
      const lista=Array.isArray(data?.adendas)
        ? data.adendas
        : Array.isArray(data?.data)
          ? data.data
          : [];

      setAdendas(lista);
    })
    .catch(()=>{
      setAdendas([]);
    })
    .finally(()=>{
      setCargandoAdendas(false);
    });
},[solActual.procesoId]);
  const asignar=async()=>{
    if(!responsable){setError('Selecciona un responsable.');return;}
    setAsignando(true);setError('');
    try{
      const u=usuarios.find(u=>u.usuario===responsable);
      const ahora=new Date();const pad=(n:number)=>String(n).padStart(2,'0');
      const fechaStr=`${ahora.getFullYear()}-${pad(ahora.getMonth()+1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
      const numAsig=asignaciones.length+1;
      const nueva={idAsignacion:`ASG-${String(numAsig).padStart(2,'0')}`,solicitudId:sol.id,solicitudNum:sol.id,analistaAsignado:u?.usuario||responsable,analistaCargo:u?.cargo||'',analistaEntidad:u?.entidadGrupo||'',asignadoPor:sesion.usuario||'',asignadoPorCargo:sesion.cargo||'',fechaAsignacion:fechaStr,estadoAsignacion:'Pendiente',estadoBandeja:'pendiente',entidad:solActual.entidad||'',codigoProceso:solActual.codigoProceso||'',objeto:solActual.objeto||'',valor:solActual.valor||null,modalidad:solActual.modalidad||'',ciudad:solActual.ciudad||solActual.departamento||'',perfil:solActual.perfil||'',fechaVencimiento:solActual.fechaVencimiento||null,observacion:''};
      const nuevasAsig=[...asignaciones,nueva];
      const res=await fetch('/api/solicitudes',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sol.id,estadoSolicitud:'Asignada',asignaciones:nuevasAsig})});
      const data=await res.json();
      if(!res.ok||!data.ok){setError(data.error??'Error al asignar.');return;}
      onGuardado({...solActual,...data.solicitud,estadoSolicitud:'Asignada',asignaciones:nuevasAsig});
      setModoReasignar(false);
      setResponsable('');
    }catch{setError('No se pudo conectar.');}
    finally{setAsignando(false);}
  };

  const MetaItem=({icon,label,value,badge}:{icon:React.ReactNode;label:string;value?:string;badge?:React.ReactNode})=>(
    <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontFamily:F,color:FC,flexShrink:0,minWidth:0}}>
      <span style={{color:'#94a3b8',display:'flex',alignItems:'center'}}>{icon}</span>
      <span style={{fontWeight:600,color:FC_DARK}}>{label}:</span>
      {badge?badge:<span style={{color:FC}}>{value}</span>}
    </div>
  );

  const sep=<div style={{width:1,height:14,background:'#cbd5e1',flexShrink:0}}/>;

  const TABS:[string,typeof tabActiva][]=[
    ['Resumen','resumen'],
    ['Requisitos','requisitos'],
    ['Cronograma','cronograma'],
    ['Documentación','documentacion'],
    ['Adendas','adendas'],
  ];

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'#f8fafc'}}>

      {/* Barra de información principal */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'4px 24px',flexShrink:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'nowrap' as const,overflow:'hidden'}}>
          {solActual.estadoFuente&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>} label="Estado" badge={<span style={{display:'inline-flex',alignItems:'center',fontSize:10,fontWeight:600,color:ebFuente.color,background:ebFuente.bg,padding:'1px 7px',borderRadius:999,fontFamily:F}}>{solActual.estadoFuente}</span>}/>{sep}</>}
          {fmtV(solActual.valor)&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} label="Presupuesto" badge={<span style={{fontWeight:600,color:'#475569',fontFamily:F,fontSize:10}}>{fmtV(solActual.valor)}</span>}/>{sep}</>}
          {pc&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5"/></svg>} label="Perfil" badge={<span style={{display:'inline-flex',alignItems:'center',fontSize:10,fontWeight:600,color:'white',background:pc.color,padding:'1px 7px',borderRadius:999,fontFamily:F}}>{pc.label}</span>}/>{sep}</>}
          {solActual.codigoProceso&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>} label="No. Proceso" badge={<span style={{fontWeight:600,color:'#475569',fontFamily:'monospace',fontSize:10}}>{solActual.codigoProceso}</span>}/>{sep}</>}
          {solActual.fechaVencimiento&&<MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>} label="Vencimiento" badge={<span style={{fontWeight:600,color:'#475569',fontFamily:F,fontSize:10}}>{fmtFH(solActual.fechaVencimiento)}</span>}/>}
        </div>
      </div>

      {/* Navegación de secciones */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'0 24px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:0}}>
          <button onClick={onVolver}
            style={{display:'inline-flex',alignItems:'center',gap:5,height:44,padding:'0 14px 0 0',border:'none',borderRight:'1px solid #e2e8f0',background:'transparent',color:'#475569',fontSize:12,fontWeight:500,fontFamily:F,cursor:'pointer',flexShrink:0,marginRight:16}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.color='#1e5799';}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.color='#475569';}}>
            <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Volver
          </button>
          {TABS.map(([label,key])=>(
            <button key={key} onClick={()=>setTabActiva(key as typeof tabActiva)}
              style={{height:44,padding:'0 16px',border:'none',borderBottom:tabActiva===key?'2.5px solid #1e5799':'2.5px solid transparent',background:'transparent',color:tabActiva===key?'#1e5799':'#64748b',fontSize:13,fontWeight:tabActiva===key?700:400,fontFamily:F,cursor:'pointer',transition:'all .15s',display:'inline-flex',alignItems:'center',gap:6,flexShrink:0}}>
              {label}
              {key==='documentacion'&&docArr.length>0&&<span style={{fontSize:10,fontWeight:700,background:tabActiva===key?'#1e5799':'#e2e8f0',color:tabActiva===key?'white':'#64748b',padding:'1px 6px',borderRadius:999}}>{docArr.length}</span>}
              {key==='cronograma'&&procDataEntries.length>0&&<span style={{fontSize:10,fontWeight:700,background:tabActiva===key?'#1e5799':'#e2e8f0',color:tabActiva===key?'white':'#64748b',padding:'1px 6px',borderRadius:999}}>{procDataEntries.length}</span>}
              {key==='adendas'&&adendas.length>0&&<span style={{fontSize:10,fontWeight:700,background:tabActiva===key?'#1e5799':'#e2e8f0',color:tabActiva===key?'white':'#64748b',padding:'1px 6px',borderRadius:999}}>{adendas.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Seguimiento del estado */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'0 24px',flexShrink:0}}>
        <StepperSolicitud estadoSolicitud={solActual.estadoSolicitud||''}/>
      </div>

      {/* Contenido principal */}
      <div style={{flex:1,overflow:'hidden',display:'grid',gridTemplateColumns:'1fr 300px',gap:16,padding:'16px 24px'}}>

        {/* Panel principal */}
        <div style={{display:'flex',flexDirection:'column',gap:12,overflowY:'auto',paddingRight:2,scrollbarWidth:'thin' as const,scrollbarColor:'transparent transparent'}}
          onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.scrollbarColor='#cbd5e1 transparent';}}
          onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.scrollbarColor='transparent transparent';}}>

          {tabActiva==='resumen'&&<>
            {solActual.objeto&&(
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'12px 14px',flexShrink:0,maxHeight:120,overflowY:'auto'}}>
                <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:10,fontFamily:F}}>Descripción</div>
                <p style={{margin:0,fontSize:11.5,color:'#334155',fontFamily:F,lineHeight:1.6,textAlign:'justify' as const}}>{solActual.objeto.charAt(0).toUpperCase()+solActual.objeto.slice(1)}</p>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,flexShrink:0}}>
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                  <svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14,flexShrink:0}}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
                  <span style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F}}>Entidad contratante</span>
                </div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
                  {esEspecializada&&solE.nitContacto&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>NIT</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:'monospace'}}>{solE.nitContacto}</div></div>}
                  <div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Organización</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{solActual.entidad||'—'}</div></div>
                  {esEspecializada&&solE.direccionContacto&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Dirección</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{solE.direccionContacto}</div></div>}
                  {solActual.ciudad&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Ciudad</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{solActual.ciudad}</div></div>}
                  {!esEspecializada&&solActual.departamento&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Localización</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{solActual.departamento}</div></div>}
                  {esEspecializada&&solActual.departamento&&(()=>{
                    const partes=(solActual.departamento||'').split(';').map((s:string)=>s.trim()).filter(Boolean);
                    const deptos=partes.map((p:string)=>p.split(':')[0].trim()).filter(Boolean).join(', ');
                    const ciudad=partes.map((p:string)=>p.includes(':')?p.split(':').slice(1).join(':').trim():'').filter(Boolean).join(', ');
                    return(<>
                      <div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Departamento</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{deptos||'—'}</div></div>
                      {ciudad&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Ciudad</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{ciudad}</div></div>}
                    </>);
                  })()}
                </div>
              </div>
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                  <svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14,flexShrink:0}}><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F}}>Información del contrato</span>
                </div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
                  <div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Modalidad</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{modalidadDisplay}</div></div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Fuente</div>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{fuenteDisplay}</div>
                      {urlFuente&&(<a href={urlFuente} target="_blank" rel="noopener noreferrer" title="Abrir en portal" style={{width:22,height:22,borderRadius:6,border:'1px solid #e2e8f0',background:'white',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#64748b',flexShrink:0,transition:'all .15s',textDecoration:'none'}} onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#1e5799';(e.currentTarget as HTMLAnchorElement).style.color='#1e5799';(e.currentTarget as HTMLAnchorElement).style.background='#eff6ff';}} onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLAnchorElement).style.color='#64748b';(e.currentTarget as HTMLAnchorElement).style.background='white';}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>)}
                    </div>
                  </div>
                  {esEspecializada&&solE.correoContacto&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Correo</div><div style={{fontSize:12,color:'#0f172a',fontFamily:F}}>{solE.correoContacto}</div></div>}
                  {esEspecializada&&solE.personaContacto&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Persona contacto</div><div style={{fontSize:12,color:'#0f172a',fontFamily:F}}>{solE.personaContacto}</div></div>}
                  {esEspecializada&&solE.telefonoContacto&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Teléfono</div><div style={{fontSize:12,color:'#0f172a',fontFamily:F}}>{solE.telefonoContacto}</div></div>}
                </div>
              </div>
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                  <svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14,flexShrink:0}}><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                  <span style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F}}>Registro</span>
                </div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
                  <div>
                    <div style={{fontSize:10,color:'#94a3b8',fontFamily:F,marginBottom:2}}>Registrado por</div>
                    <div style={{fontSize:12.5,fontWeight:600,color:'#0f172a',fontFamily:F}}>{solActual.usuarioRegistro||'—'}</div>
                    {solActual.cargoRegistro&&<div style={{fontSize:11,color:'#64748b',fontFamily:F,marginTop:1}}>{solActual.cargoRegistro}</div>}
                  </div>
                  <div><div style={{fontSize:10,color:'#94a3b8',fontFamily:F,marginBottom:2}}>Fecha de registro</div><div style={{fontSize:12,fontWeight:600,color:'#0f172a',fontFamily:F}}>{fmtFH(solActual.createdAt)}</div></div>
                  {solActual.sqrNumero&&<div><div style={{fontSize:10,color:'#94a3b8',fontFamily:F,marginBottom:2}}>No. SQR</div><div style={{fontSize:12,fontWeight:600,color:'#475569',fontFamily:'monospace'}}>{solActual.sqrNumero}</div></div>}
                </div>
              </div>
            </div>
          </>}

          {tabActiva==='requisitos'&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'20px 24px',flexShrink:0}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:16,fontFamily:F}}>Requisitos del proceso</div>
              {solActual.observacion
                ?<div style={{fontSize:13,color:FC,fontFamily:F,lineHeight:1.7,whiteSpace:'pre-wrap' as const}}>{solActual.observacion}</div>
                :<div style={{textAlign:'center' as const,padding:'40px 0',color:'#94a3b8'}}>
                  <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:32,height:32,margin:'0 auto 10px',display:'block',opacity:.4}}><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <div style={{fontSize:13,fontFamily:F}}>Sin requisitos registrados</div>
                </div>
              }
            </div>
          )}

          {tabActiva==='cronograma'&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'24px 28px',flexShrink:0}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.08em',marginBottom:20,fontFamily:F}}>Cronograma de fechas</div>
              {(solActual.fechaPublicacion||solActual.fechaVencimiento||procDataEntries.length>0)
                ?<div style={{display:'flex',flexDirection:'column' as const}}>
                  {solActual.fechaPublicacion&&(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:11,color:'#374151',fontFamily:F}}>Fecha de publicación</span><span style={{fontSize:11,fontWeight:700,color:FC_DARK,fontFamily:F,whiteSpace:'nowrap' as const}}>{fmtFH(solActual.fechaPublicacion)}</span></div>)}
                  {solActual.fechaVencimiento&&(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:procDataEntries.length>0?'1px solid #f1f5f9':'none'}}><span style={{fontSize:11,color:'#374151',fontFamily:F}}>Fecha de vencimiento</span><span style={{fontSize:11,fontWeight:700,color:'#dc2626',fontFamily:F,whiteSpace:'nowrap' as const}}>{fmtFH(solActual.fechaVencimiento)}</span></div>)}
                  {procDataEntries.map(([k, v], i) => {
  const vv = safeRecord(v);
  const obsCronograma = safeString(vv.obs, `Etapa ${i + 1}`);
  const fechaInicioCronograma = safeString(vv.fechaI);
  const fechaFinCronograma = safeString(vv.fechaF);

  return (
    <div
      key={k}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: i < procDataEntries.length - 1 ? '1px solid #f1f5f9' : 'none',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: '#374151',
          fontFamily: F,
          flex: 1,
          paddingRight: 24,
        }}
      >
        {obsCronograma}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: FC_DARK,
          fontFamily: F,
          whiteSpace: 'nowrap' as const,
          flexShrink: 0,
        }}
      >
        {fechaInicioCronograma}
        {fechaFinCronograma && fechaFinCronograma !== fechaInicioCronograma
          ? ` → ${fechaFinCronograma}`
          : ''}
      </span>
    </div>
  );
})}
                </div>
                :<div style={{textAlign:'center' as const,padding:'40px 0',color:'#94a3b8'}}>
                  <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:32,height:32,margin:'0 auto 10px',display:'block',opacity:.4}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  <div style={{fontSize:13,fontFamily:F}}>Sin cronograma registrado</div>
                </div>
              }
            </div>
          )}

          {tabActiva==='documentacion'&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'16px 20px',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.08em',fontFamily:F}}>Documentos {docArr.length>0&&`(${docArr.length})`}</div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  {docArr.some((d: DocumentoDinamico) =>String(d.ruta||d.url||d.link||''))&&(<button style={{display:'inline-flex',alignItems:'center',gap:5,height:28,padding:'0 12px',borderRadius:7,border:'1.5px solid #e2e8f0',background:'white',color:'#374151',fontSize:11.5,fontWeight:500,fontFamily:F,cursor:'pointer',transition:'all .15s'}} onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#1e5799';(e.currentTarget as HTMLButtonElement).style.color='#1e5799';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLButtonElement).style.color='#374151';}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar todo</button>)}
                  <div style={{display:'flex',border:'1.5px solid #e2e8f0',borderRadius:7,overflow:'hidden'}}>{([{v:'grid'},{v:'list'}] as {v:'grid'|'list'}[]).map(({v})=>(<button key={v} onClick={()=>setDocVista(v)} style={{width:28,height:26,border:'none',background:docVista===v?'#1e5799':'white',color:docVista===v?'white':'#64748b',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>{v==='grid'?<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>:<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}</button>))}</div>
                </div>
              </div>
              {docArr.length>0?docVista==='grid'?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))',gap:10}}>{docArr.map((d: DocumentoDinamico, i: number) =>{const url=String(d.ruta||d.url||d.link||'');const ext=getDocExt(url,String(d.nombre||d.titulo||''));return(<a key={i} href={url||'#'} target="_blank" rel="noopener noreferrer" style={{display:'flex',flexDirection:'column' as const,alignItems:'center',gap:6,padding:'10px 6px',border:'1.5px solid #f1f5f9',borderRadius:10,textDecoration:'none',background:'white',transition:'all .15s'}} onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#1e5799';(e.currentTarget as HTMLAnchorElement).style.background='#f8fbff';}} onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#f1f5f9';(e.currentTarget as HTMLAnchorElement).style.background='white';}}><div style={{position:'relative' as const,width:40,height:48}}><div style={{width:40,height:48,borderRadius:'3px 10px 3px 3px',background:ext.bg,border:`1.5px solid ${ext.color}30`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:6}}><div style={{position:'absolute' as const,top:0,right:0,width:10,height:10,background:'white',borderLeft:`1.5px solid ${ext.color}30`,borderBottom:`1.5px solid ${ext.color}30`,borderRadius:'0 0 0 3px'}}/><span style={{fontSize:7,fontWeight:800,color:ext.color,fontFamily:F,letterSpacing:'0.03em'}}>{ext.label}</span></div></div><div style={{fontSize:10,fontWeight:500,color:'#334155',fontFamily:F,textAlign:'center' as const,lineHeight:1.3,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const,maxWidth:'100%',wordBreak:'break-word' as const}}>{String(d.nombre||d.titulo||`Doc ${i+1}`)}</div></a>);})}</div>:<div style={{display:'flex',flexDirection:'column' as const}}>{docArr.map((d: DocumentoDinamico, i: number) =>{const url=String(d.ruta||d.url||d.link||'');const ext=getDocExt(url,String(d.nombre||d.titulo||''));const nombre=String(d.nombre||d.titulo||`Documento ${i+1}`).toUpperCase();return(<div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:i<docArr.length-1?'1px solid #f8fafc':'none'}}><div style={{width:28,height:34,borderRadius:'2px 7px 2px 2px',background:ext.bg,border:`1px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:4,position:'relative' as const,flexShrink:0}}><div style={{position:'absolute' as const,top:0,right:0,width:7,height:7,background:'white',borderLeft:`1px solid ${ext.color}20`,borderBottom:`1px solid ${ext.color}20`,borderRadius:'0 0 0 2px'}}/><span style={{fontSize:6,fontWeight:800,color:ext.color,fontFamily:F,letterSpacing:'0.02em'}}>{ext.label}</span></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,fontFamily:F}}>{nombre}</div></div><div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}><span style={{fontSize:10,fontWeight:600,color:'#64748b',fontFamily:F,background:'#f1f5f9',padding:'2px 7px',borderRadius:5,border:'1px solid #e2e8f0'}}>{ext.label}</span>{url&&(<a href={url} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,height:28,padding:'0 12px',borderRadius:7,background:'#1e5799',color:'white',fontSize:11,fontWeight:700,textDecoration:'none',fontFamily:F,transition:'all .15s',flexShrink:0}} onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.background='#174a85';}} onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.background='#1e5799';}}><svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar</a>)}</div></div>);})}</div>:<div style={{textAlign:'center' as const,padding:'40px 0',color:'#94a3b8'}}><svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:32,height:32,margin:'0 auto 10px',display:'block',opacity:.4}}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg><div style={{fontSize:13,fontFamily:F}}>Sin documentos disponibles</div></div>}
            </div>
          )}

          {tabActiva==='adendas'&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'16px 18px',flexShrink:0}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:12,fontFamily:F,display:'flex',alignItems:'center',gap:8}}>
                Adendas
                {adendas.length>0&&<span style={{fontSize:10,fontWeight:700,background:'#1e5799',color:'white',padding:'1px 7px',borderRadius:999}}>{adendas.length}</span>}
              </div>
              {cargandoAdendas?<div style={{fontSize:12,color:'#94a3b8',fontFamily:F}}>Cargando adendas…</div>:<div style={{display:'flex',flexDirection:'column' as const,gap:0}}>{adendas.length===0&&<div style={{textAlign:'center' as const,padding:'20px 0',color:'#94a3b8'}}><div style={{fontSize:12,fontFamily:F}}>Sin adendas detectadas</div></div>}{adendas.map((d,i)=>{const url=d.urlDocumento||'';const ext=getDocExt(url,d.nombre||'');const fecha=d.fechaDetectado?new Date(d.fechaDetectado).toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}):'';return(<div key={d.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i<adendas.length-1?'1px solid #f8fafc':'none'}}><div style={{width:28,height:34,borderRadius:'2px 7px 2px 2px',background:ext.bg,border:`1px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:4,position:'relative' as const,flexShrink:0}}><div style={{position:'absolute' as const,top:0,right:0,width:7,height:7,background:'white',borderLeft:`1px solid ${ext.color}20`,borderBottom:`1px solid ${ext.color}20`,borderRadius:'0 0 0 2px'}}/><span style={{fontSize:6,fontWeight:800,color:ext.color,fontFamily:F}}>{ext.label}</span></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,fontFamily:F}}>{d.nombre||'Sin nombre'}</div>{fecha&&<div style={{fontSize:10,color:'#94a3b8',fontFamily:F,marginTop:1}}>Detectado: {fecha}</div>}</div>{url&&(<a href={url} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,height:28,padding:'0 12px',borderRadius:7,background:'#1e5799',color:'white',fontSize:11,fontWeight:700,textDecoration:'none',fontFamily:F,transition:'all .15s',flexShrink:0}} onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.background='#174a85';}} onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.background='#1e5799';}}><svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar</a>)}</div>);})}</div>}
            </div>
          )}
        </div>

        {/* Panel lateral de acciones */}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {esEspecializada?(
            <button style={{width:'100%',height:38,borderRadius:10,background:'#1e5799',color:'white',border:'none',fontSize:13,fontWeight:600,fontFamily:F,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .15s'}} onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#174a85';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12v4m0 0l-2-2m2 2l2-2"/></svg>
              Visita técnica
            </button>
          ):(
            <>
              <button style={{width:'100%',height:38,borderRadius:10,background:'white',color:'#1e5799',border:'1.5px solid #1e5799',fontSize:13,fontWeight:600,fontFamily:F,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .15s'}} onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#eff6ff';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                Ver documento IA
              </button>
              <button style={{width:'100%',height:38,borderRadius:10,background:'white',color:'#1e5799',border:'1.5px solid #1e5799',fontSize:13,fontWeight:600,fontFamily:F,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .15s'}} onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#eff6ff';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                Ver licitaciones similares
              </button>
            </>
          )}

          <div style={{height:1,background:'#f1f5f9',margin:'2px 0'}}/>

          {asignaciones.length>0&&(!modoReasignar||asignacionBloqueada)?(
            <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'12px 14px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                <div style={{fontSize:10,fontWeight:700,color:'#15803d',textTransform:'uppercase' as const,letterSpacing:'0.07em',fontFamily:F}}>Responsables asignados</div>
                {!asignacionBloqueada&&(
                  <button onClick={()=>setModoReasignar(true)}
                    style={{fontSize:10,fontWeight:600,color:'#1e5799',background:'white',border:'1px solid #1e5799',borderRadius:6,padding:'2px 8px',cursor:'pointer',fontFamily:F}}
                    onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#eff6ff';}}
                    onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
                    + Agregar
                  </button>
                )}
                {asignacionBloqueada&&(
                  <span style={{fontSize:10,color:'#94a3b8',fontFamily:F,fontStyle:'italic'}}>En gestión</span>
                )}
              </div>
              <div style={{display:'flex',flexDirection:'column' as const,gap:6}}>
                {asignaciones.map((a,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:24,height:24,borderRadius:'50%',background:'#15803d',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,flexShrink:0,fontFamily:F}}>{String(a.analistaAsignado||'?').slice(0,2).toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:'#14532d',fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{String(a.analistaAsignado||'—')}</div>
                      <div style={{fontSize:10,color:'#15803d',fontFamily:F}}>{String(a.analistaCargo||'')} · {String(a.idAsignacion||'')}</div>
                    </div>
                    {!asignacionBloqueada&&(
                      <button onClick={async()=>{
                        const nuevasAsig=asignaciones.filter((_,idx)=>idx!==i);
                        const nuevoEstado=nuevasAsig.length===0?'En revisión':solActual.estadoSolicitud||'En revisión';
                        const res=await fetch('/api/solicitudes',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sol.id,estadoSolicitud:nuevoEstado,asignaciones:nuevasAsig})});
                        const data=await res.json();
                        if(res.ok&&data.ok){
                          const updated={...solActual,...data.solicitud,asignaciones:nuevasAsig,estadoSolicitud:nuevoEstado};
                          setSolActual(updated);
                          onGuardado(updated);
                        }
                      }}
                        style={{width:20,height:20,borderRadius:'50%',border:'1px solid #bbf7d0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',padding:0,flexShrink:0}}
                        onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#fca5a5';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}}
                        onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#bbf7d0';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';}}>
                        <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ):(
            <>
              {modoReasignar&&(
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:11,fontWeight:600,color:FC_DARK,fontFamily:F}}>Agregar responsable</span>
                  <button onClick={()=>{setModoReasignar(false);setResponsable('');setError('');}}
                    style={{fontSize:10,color:'#64748b',background:'none',border:'none',cursor:'pointer',fontFamily:F}}>
                    Cancelar
                  </button>
                </div>
              )}
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:10,fontFamily:F}}>Asignar responsable</div>
                <div style={{position:'relative' as const}}>
                  <select value={responsable} onChange={e=>setResponsable(e.target.value)}
                    style={{width:'100%',height:34,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 32px 0 10px',fontSize:12,fontFamily:F,color:responsable?FC_DARK:'#94a3b8',background:'white',outline:'none',boxSizing:'border-box' as const,appearance:'none' as const,cursor:'pointer'}}>
                    <option value="">— Seleccione —</option>
                    {usuarios.map(u=><option key={u.id} value={u.usuario}>{u.usuario} · {u.cargo}</option>)}
                  </select>
                  <div style={{position:'absolute' as const,right:10,top:'50%',transform:'translateY(-50%)',pointerEvents:'none' as const,color:'#94a3b8'}}>
                    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M6 9l6 6 6-6"/></svg>
                  </div>
                </div>
                {responsable&&(()=>{
                  const u=usuarios.find(x=>x.usuario===responsable);
                  if(!u)return null;
                  return(
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8,padding:'7px 10px',background:'#f8fafc',borderRadius:7,border:'1px solid #f1f5f9'}}>
                      <div style={{width:26,height:26,borderRadius:'50%',background:'#1e5799',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0,fontFamily:F}}>{u.usuario.slice(0,2).toUpperCase()}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:FC_DARK,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{u.usuario}</div>
                        <div style={{fontSize:10.5,color:FC_LABEL,fontFamily:F}}>{u.cargo}</div>
                      </div>
                      <button onClick={()=>setResponsable('')}
                        style={{width:20,height:20,borderRadius:'50%',border:'1px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',padding:0,flexShrink:0}}
                        onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#fca5a5';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}}
                        onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';}}>
                        <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  );
                })()}
                {error&&<div style={{fontSize:11.5,color:'#dc2626',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'5px 9px',marginTop:8,fontFamily:F}}>⚠️ {error}</div>}
              </div>
              <button onClick={asignar} disabled={asignando||!responsable}
                style={{width:'100%',height:40,borderRadius:10,background:asignando||!responsable?'#e2e8f0':'#1e5799',color:asignando||!responsable?'#94a3b8':'white',border:'none',fontSize:13,fontWeight:700,fontFamily:F,cursor:asignando||!responsable?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .15s',boxShadow:asignando||!responsable?'none':'0 2px 8px rgba(30,87,153,0.15)'}}
                onMouseOver={e=>{if(!asignando&&responsable)(e.currentTarget as HTMLButtonElement).style.background='#174a85';}}
                onMouseOut={e=>{if(!asignando&&responsable)(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
                {asignando?'Asignando…':'Asignar proceso'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VistFichaBusqueda({sol,sesion,onVolver,onGestionar,puedeGestionar=true}:{sol:Solicitud;sesion:Sesion;onVolver:()=>void;onGestionar:()=>Promise<void>;puedeGestionar?:boolean}){
  const [guardando,setGuardando]=React.useState(false);
  const [error,setError]=React.useState('');
  const [tabActiva,setTabActiva]=React.useState<'resumen'|'requisitos'|'cronograma'|'documentacion'|'adendas'>('resumen');
  const [docVista,setDocVista]=React.useState<'grid'|'list'>('list');
  const [adendas,setAdendas]=React.useState<Array<{
  id:number;
  nombre:string;
  urlDocumento:string|null;
  tipoDocumento?:string|null;
  fechaDetectado:string;
}>>([]);
  const [cargandoAdendas,setCargandoAdendas]=React.useState(false);
  const [solActual,setSolActual]=React.useState(sol);
  React.useEffect(()=>{
    fetch(`/api/solicitudes/${sol.id}`).then(r=>r.json()).then(data=>{
      if(data.ok&&data.solicitud)setSolActual(data.solicitud);
    }).catch(()=>{});
  },[sol.id]);
  const F='var(--font)';
  const FC='#334155';const FC_LABEL='#6b7280';const FC_DARK='#0f172a';
  const pc=sol.perfil?perfilColor(sol.perfil):null;
  const fmtFH=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});};
  const fmtV=(v:number|null)=>{if(v==null||isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};
  const docArr = safeArray<DocumentoDinamico>(sol.docData);
  const procDataEntries = Object.entries(safeRecord(sol.procData)).filter(([, value]) => {
  const item = safeRecord(value);
  return Boolean(safeString(item.fechaI) || safeString(item.obs));
  });

  React.useEffect(()=>{
  const procesoId=Number(sol.procesoId);

  if(!Number.isInteger(procesoId)||procesoId<=0){
    setAdendas([]);
    return;
  }

  setCargandoAdendas(true);

  fetch(`/api/procesos/${procesoId}/adendas`)
    .then(r=>r.json())
    .then(data=>{
      const lista=Array.isArray(data?.adendas)
        ? data.adendas
        : Array.isArray(data?.data)
          ? data.data
          : [];

      setAdendas(lista);
    })
    .catch(()=>{
      setAdendas([]);
    })
    .finally(()=>{
      setCargandoAdendas(false);
    });
},[sol.procesoId]);

  const urlFuente=sol.linkSecop||sol.linkDetalle||sol.linkSecopReg||'';
  const ebFuente=estadoBadgeColor(sol.estadoFuente||'');
  const modalidadDisplay=(()=>{
    const m=sol.modalidad?.trim();
    if(m&&m!=='—')return MMAP_MODALIDAD[m]??m;
    const n=(sol.nombreProceso||sol.entidad||sol.objeto||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(n.includes('minima cuantia'))return'Mínima cuantía';
    if(n.includes('licitacion'))return'Licitación pública';
    if(n.includes('seleccion abreviada'))return'Selección abreviada';
    if(n.includes('contratacion directa'))return'Contratación directa';
    if(n.includes('concurso de meritos'))return'Concurso de méritos';
    if(n.includes('regimen especial'))return'Régimen especial';
    if(n.includes('subasta'))return'Subasta inversa';
    return'—';
  })();
  const fuenteDisplay=sol.fuente?sol.fuente.charAt(0).toUpperCase()+sol.fuente.slice(1):'—';

  const getDocExt=(url:string,nombre?:string)=>{
    const s=(url||'').toLowerCase();const n=(nombre||'').toLowerCase();
    const isXls=s.indexOf('.xlsx')>=0||s.indexOf('.xls')>=0||n.indexOf('.xlsx')>=0||n.indexOf('.xls')>=0||n.indexOf('xlsx')>=0||n.indexOf('excel')>=0||n.indexOf('hoja')>=0;
    const isDoc=s.indexOf('.docx')>=0||s.indexOf('.doc')>=0||n.indexOf('.docx')>=0||n.indexOf('.doc')>=0||n.indexOf('word')>=0;
    const isZip=s.indexOf('.zip')>=0||s.indexOf('.rar')>=0||n.indexOf('.zip')>=0||n.indexOf('.rar')>=0;
    if(isXls)return{bg:'#f0fdf4',color:'#475569',label:'XLS'};
    if(isDoc)return{bg:'#eff6ff',color:'#1d4ed8',label:'DOC'};
    if(isZip)return{bg:'#faf5ff',color:'#7e22ce',label:'ZIP'};
    return{bg:'#fff1f2',color:'#be123c',label:'PDF'};
  };

  const MetaItem=({icon,label,value,badge}:{icon:React.ReactNode;label:string;value?:string;badge?:React.ReactNode})=>(
    <div style={{display:'flex',alignItems:'center',gap:5,fontSize:12,fontFamily:F,color:FC,flexShrink:0}}>
      <span style={{color:'#94a3b8',display:'flex',alignItems:'center'}}>{icon}</span>
      <span style={{fontWeight:600,color:FC_DARK}}>{label}:</span>
      {badge?badge:<span style={{color:FC}}>{value}</span>}
    </div>
  );
  const sep=<div style={{width:1,height:14,background:'#cbd5e1',flexShrink:0}}/>;
  const TABS:[string,typeof tabActiva][]=[['Resumen','resumen'],['Requisitos','requisitos'],['Cronograma','cronograma'],['Documentación','documentacion'],['Adendas','adendas']];

  const hGestionar=async()=>{
    setGuardando(true);setError('');
    try{await onGestionar();}
    catch(e){setError(e instanceof Error?e.message:'Error al gestionar.');}
    finally{setGuardando(false);}
  };

  const bloqueAdendas=(
    <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'16px 18px',flexShrink:0}}>
      <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:12,fontFamily:F,display:'flex',alignItems:'center',gap:8}}>
        Adendas
        {adendas.length>0&&<span style={{fontSize:10,fontWeight:700,background:'#1e5799',color:'white',padding:'1px 7px',borderRadius:999}}>{adendas.length}</span>}
      </div>
      {cargandoAdendas
        ?<div style={{fontSize:12,color:'#94a3b8',fontFamily:F}}>Cargando adendas…</div>
        :<div style={{display:'flex',flexDirection:'column' as const,gap:0}}>
          {adendas.length===0&&<div style={{textAlign:'center' as const,padding:'20px 0',color:'#94a3b8'}}><div style={{fontSize:12,fontFamily:F}}>Sin adendas detectadas</div></div>}
          {adendas.map((d,i)=>{
            const url=d.urlDocumento||'';
            const s=url.toLowerCase();
            const ext=s.includes('.xlsx')||s.includes('.xls')?{bg:'#f0fdf4',color:'#475569',label:'XLS'}:s.includes('.docx')||s.includes('.doc')?{bg:'#eff6ff',color:'#1d4ed8',label:'DOC'}:s.includes('.zip')||s.includes('.rar')?{bg:'#faf5ff',color:'#7e22ce',label:'ZIP'}:{bg:'#fff1f2',color:'#be123c',label:'PDF'};
            const fecha=d.fechaDetectado?new Date(d.fechaDetectado).toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}):'';
            return(
              <div key={d.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i<adendas.length-1?'1px solid #f8fafc':'none'}}>
                <div style={{width:28,height:34,borderRadius:'2px 7px 2px 2px',background:ext.bg,border:`1px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:4,position:'relative' as const,flexShrink:0}}>
                  <div style={{position:'absolute' as const,top:0,right:0,width:7,height:7,background:'white',borderLeft:`1px solid ${ext.color}20`,borderBottom:`1px solid ${ext.color}20`,borderRadius:'0 0 0 2px'}}/>
                  <span style={{fontSize:6,fontWeight:800,color:ext.color,fontFamily:F}}>{ext.label}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,fontFamily:F}}>{d.nombre||'Sin nombre'}</div>
                  {fecha&&<div style={{fontSize:10,color:'#94a3b8',fontFamily:F,marginTop:1}}>Detectado: {fecha}</div>}
                </div>
                {url&&(
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    style={{display:'inline-flex',alignItems:'center',gap:5,height:28,padding:'0 12px',borderRadius:7,background:'#1e5799',color:'white',fontSize:11,fontWeight:700,textDecoration:'none',fontFamily:F,transition:'all .15s',flexShrink:0}}
                    onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.background='#174a85';}}
                    onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.background='#1e5799';}}>
                    <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Descargar
                  </a>
                )}
              </div>
            );
          })}
        </div>
      }
    </div>
  );

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'#f8fafc'}}>
      {/* Barra de información principal */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'4px 24px',flexShrink:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'nowrap' as const,overflow:'hidden'}}>
          {sol.estadoFuente&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>} label="Estado" badge={<span style={{display:'inline-flex',alignItems:'center',fontSize:10,fontWeight:600,color:ebFuente.color,background:ebFuente.bg,padding:'1px 7px',borderRadius:999,fontFamily:F}}>{sol.estadoFuente}</span>}/>{sep}</>}
          {fmtV(sol.valor)&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} label="Presupuesto" badge={<span style={{fontWeight:600,color:'#475569',fontFamily:F,fontSize:10}}>{fmtV(sol.valor)}</span>}/>{sep}</>}
          {pc&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5"/></svg>} label="Perfil" badge={<span style={{display:'inline-flex',alignItems:'center',fontSize:10,fontWeight:600,color:'white',background:pc.color,padding:'1px 7px',borderRadius:999,fontFamily:F}}>{pc.label}</span>}/>{sep}</>}
          {sol.codigoProceso&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>} label="No. Proceso" badge={<span style={{fontWeight:600,color:'#475569',fontFamily:'monospace',fontSize:10}}>{sol.codigoProceso}</span>}/>{sep}</>}
          {sol.fechaVencimiento&&<MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>} label="Vencimiento" badge={<span style={{fontWeight:600,color:'#475569',fontFamily:F,fontSize:10}}>{fmtFH(sol.fechaVencimiento)}</span>}/>}
        </div>
      </div>
      {/* Navegación de secciones */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'0 24px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:0}}>
          <button onClick={onVolver}
            style={{display:'inline-flex',alignItems:'center',gap:5,height:44,padding:'0 14px 0 0',border:'none',borderRight:'1px solid #e2e8f0',background:'transparent',color:'#475569',fontSize:12,fontWeight:500,fontFamily:F,cursor:'pointer',flexShrink:0,marginRight:16}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.color='#1e5799';}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.color='#475569';}}>
            <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Volver
          </button>
          {TABS.map(([label,key])=>(
            <button key={key} onClick={()=>setTabActiva(key as typeof tabActiva)}
              style={{height:44,padding:'0 16px',border:'none',borderBottom:tabActiva===key?'2.5px solid #1e5799':'2.5px solid transparent',background:'transparent',color:tabActiva===key?'#1e5799':'#64748b',fontSize:13,fontWeight:tabActiva===key?700:400,fontFamily:F,cursor:'pointer',transition:'all .15s',display:'inline-flex',alignItems:'center',gap:6,flexShrink:0}}>
              {label}
              {key==='documentacion'&&docArr.length>0&&<span style={{fontSize:10,fontWeight:700,background:tabActiva===key?'#1e5799':'#e2e8f0',color:tabActiva===key?'white':'#64748b',padding:'1px 6px',borderRadius:999}}>{docArr.length}</span>}
              {key==='cronograma'&&procDataEntries.length>0&&<span style={{fontSize:10,fontWeight:700,background:tabActiva===key?'#1e5799':'#e2e8f0',color:tabActiva===key?'white':'#64748b',padding:'1px 6px',borderRadius:999}}>{procDataEntries.length}</span>}
              {key==='adendas'&&adendas.length>0&&<span style={{fontSize:10,fontWeight:700,background:tabActiva===key?'#1e5799':'#e2e8f0',color:tabActiva===key?'white':'#64748b',padding:'1px 6px',borderRadius:999}}>{adendas.length}</span>}
            </button>
          ))}
        </div>
      </div>
      {/* Seguimiento del estado */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'0 24px',flexShrink:0}}>
        <StepperSolicitud estadoSolicitud={solActual.estadoSolicitud||'Selección de proceso'}/>
      </div>
      {/* Contenido principal */}
      <div style={{flex:1,overflow:'hidden',display:'grid',gridTemplateColumns:'1fr 300px',gap:16,padding:'16px 24px'}}>
        <div style={{display:'flex',flexDirection:'column',gap:12,overflowY:'auto',paddingRight:2,scrollbarWidth:'thin' as const,scrollbarColor:'transparent transparent'}}
          onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.scrollbarColor='#cbd5e1 transparent';}}
          onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.scrollbarColor='transparent transparent';}}>
          {tabActiva==='resumen'&&<>
            {sol.objeto&&(<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'16px 18px',flexShrink:0}}><div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:10,fontFamily:F}}>Descripción</div><p style={{margin:0,fontSize:11.5,color:'#334155',fontFamily:F,lineHeight:1.6,textAlign:'justify' as const}}>{sol.objeto.charAt(0).toUpperCase()+sol.objeto.slice(1)}</p></div>)}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,flexShrink:0}}>
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px'}}><div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}><svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14,flexShrink:0}}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z"/></svg><span style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F}}>Entidad contratante</span></div><div style={{display:'flex',flexDirection:'column' as const,gap:8}}><div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Organización</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{sol.entidad||'—'}</div></div>{sol.departamento&&(()=>{const partes=(sol.departamento||'').split(';').map((s:string)=>s.trim()).filter(Boolean);const deptos=partes.map((p:string)=>p.split(':')[0].trim()).filter(Boolean).join(', ');const ciudad=partes.map((p:string)=>p.includes(':')?p.split(':').slice(1).join(':').trim():'').filter(Boolean).join(', ');return(<><div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Departamento</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{deptos||'—'}</div></div>{ciudad&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Ciudad</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{ciudad}</div></div>}</>);})()}</div></div>
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px'}}><div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}><svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14,flexShrink:0}}><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg><span style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F}}>Información del contrato</span></div><div style={{display:'flex',flexDirection:'column' as const,gap:8}}><div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Modalidad</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{modalidadDisplay}</div></div><div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Fuente</div><div style={{display:'flex',alignItems:'center',gap:6}}><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{fuenteDisplay}</div>{urlFuente&&(<a href={urlFuente} target="_blank" rel="noopener noreferrer" title="Abrir en portal" style={{width:22,height:22,borderRadius:6,border:'1px solid #e2e8f0',background:'white',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#64748b',flexShrink:0,transition:'all .15s',textDecoration:'none'}} onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#1e5799';(e.currentTarget as HTMLAnchorElement).style.color='#1e5799';(e.currentTarget as HTMLAnchorElement).style.background='#eff6ff';}} onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLAnchorElement).style.color='#64748b';(e.currentTarget as HTMLAnchorElement).style.background='white';}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>)}</div></div><div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>No. proceso</div><div style={{fontSize:12,color:'#0f172a',fontFamily:'monospace'}}>{sol.codigoProceso||'—'}</div></div><div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Duración</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{(sol as any).duracionContrato?`${String((sol as any).duracionContrato)} meses`:'—'}</div></div></div></div>
              <div/>
            </div>
          </>}
          {tabActiva==='requisitos'&&(<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'20px 24px',flexShrink:0}}><div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:16,fontFamily:F}}>Requisitos del proceso</div><div style={{textAlign:'center' as const,padding:'40px 0',color:'#94a3b8'}}><svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:32,height:32,margin:'0 auto 10px',display:'block',opacity:.4}}><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg><div style={{fontSize:13,fontFamily:F}}>Sin requisitos registrados</div></div></div>)}
          {tabActiva==='cronograma'&&(<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'24px 28px',flexShrink:0}}><div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.08em',marginBottom:20,fontFamily:F}}>Cronograma de fechas</div>{(sol.fechaPublicacion||sol.fechaVencimiento||procDataEntries.length>0)?<div style={{display:'flex',flexDirection:'column' as const}}>{sol.fechaPublicacion&&(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:11,color:'#374151',fontFamily:F}}>Fecha de publicación</span><span style={{fontSize:11,fontWeight:700,color:FC_DARK,fontFamily:F,whiteSpace:'nowrap' as const}}>{fmtFH(sol.fechaPublicacion)}</span></div>)}{sol.fechaVencimiento&&(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:procDataEntries.length>0?'1px solid #f1f5f9':'none'}}><span style={{fontSize:11,color:'#374151',fontFamily:F}}>Fecha de vencimiento</span><span style={{fontSize:11,fontWeight:700,color:'#475569',fontFamily:F,whiteSpace:'nowrap' as const}}>{fmtFH(sol.fechaVencimiento)}</span></div>)}{procDataEntries.map(([k,v],i)=>{const vv = safeRecord(v); return(<div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',borderBottom:i<procDataEntries.length-1?'1px solid #f1f5f9':'none'}}><span style={{fontSize:11,color:'#374151',fontFamily:F,flex:1,paddingRight:24}}>{safeString(vv.obs, `Etapa ${i + 1}`)}</span><span style={{fontSize:11,fontWeight:700,color:FC_DARK,fontFamily:F,whiteSpace:'nowrap' as const,flexShrink:0}}>{safeString(vv.fechaI)}{safeString(vv.fechaF) && safeString(vv.fechaF) !== safeString(vv.fechaI) ? ` → ${safeString(vv.fechaF)}` : ''}</span></div>);})}</div>:<div style={{textAlign:'center' as const,padding:'40px 0',color:'#94a3b8'}}><svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:32,height:32,margin:'0 auto 10px',display:'block',opacity:.4}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg><div style={{fontSize:13,fontFamily:F}}>Sin cronograma registrado</div></div>}</div>)}
          {tabActiva==='documentacion'&&(<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'16px 20px',flexShrink:0}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}><div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.08em',fontFamily:F}}>Documentos {docArr.length>0&&`(${docArr.length})`}</div><div style={{display:'flex',border:'1.5px solid #e2e8f0',borderRadius:7,overflow:'hidden'}}>{([{v:'grid'},{v:'list'}] as {v:'grid'|'list'}[]).map(({v})=>(<button key={v} onClick={()=>setDocVista(v)} style={{width:28,height:26,border:'none',background:docVista===v?'#1e5799':'white',color:docVista===v?'white':'#64748b',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>{v==='grid'?<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>:<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}</button>))}</div></div>{docArr.length>0?docVista==='grid'?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))',gap:10}}>{docArr.map((d: DocumentoDinamico, i: number) =>{const url=String(d.ruta||d.url||d.link||'');const ext=getDocExt(url,String(d.nombre||d.titulo||''));return(<a key={i} href={url||'#'} target="_blank" rel="noopener noreferrer" style={{display:'flex',flexDirection:'column' as const,alignItems:'center',gap:6,padding:'10px 6px',border:'1.5px solid #f1f5f9',borderRadius:10,textDecoration:'none',background:'white',transition:'all .15s'}} onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#1e5799';(e.currentTarget as HTMLAnchorElement).style.background='#f8fbff';}} onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#f1f5f9';(e.currentTarget as HTMLAnchorElement).style.background='white';}}><div style={{position:'relative' as const,width:40,height:48}}><div style={{width:40,height:48,borderRadius:'3px 10px 3px 3px',background:ext.bg,border:`1.5px solid ${ext.color}30`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:6}}><div style={{position:'absolute' as const,top:0,right:0,width:10,height:10,background:'white',borderLeft:`1.5px solid ${ext.color}30`,borderBottom:`1.5px solid ${ext.color}30`,borderRadius:'0 0 0 3px'}}/><span style={{fontSize:7,fontWeight:800,color:ext.color,fontFamily:F,letterSpacing:'0.03em'}}>{ext.label}</span></div></div><div style={{fontSize:10,fontWeight:500,color:'#334155',fontFamily:F,textAlign:'center' as const,lineHeight:1.3,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const,maxWidth:'100%',wordBreak:'break-word' as const}}>{String(d.nombre||d.titulo||`Doc ${i+1}`)}</div></a>);})}</div>:<div style={{display:'flex',flexDirection:'column' as const}}>{docArr.map((d: DocumentoDinamico, i: number) =>{const url=String(d.ruta||d.url||d.link||'');const ext=getDocExt(url,String(d.nombre||d.titulo||''));const nombre=String(d.nombre||d.titulo||`Documento ${i+1}`).toUpperCase();return(<div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:i<docArr.length-1?'1px solid #f8fafc':'none'}}><div style={{width:28,height:34,borderRadius:'2px 7px 2px 2px',background:ext.bg,border:`1px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:4,position:'relative' as const,flexShrink:0}}><div style={{position:'absolute' as const,top:0,right:0,width:7,height:7,background:'white',borderLeft:`1px solid ${ext.color}20`,borderBottom:`1px solid ${ext.color}20`,borderRadius:'0 0 0 2px'}}/><span style={{fontSize:6,fontWeight:800,color:ext.color,fontFamily:F,letterSpacing:'0.02em'}}>{ext.label}</span></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,fontFamily:F}}>{nombre}</div></div><div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}><span style={{fontSize:10,fontWeight:600,color:'#64748b',fontFamily:F,background:'#f1f5f9',padding:'2px 7px',borderRadius:5,border:'1px solid #e2e8f0'}}>{ext.label}</span>{url&&(<a href={url} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,height:28,padding:'0 12px',borderRadius:7,background:'#1e5799',color:'white',fontSize:11,fontWeight:700,textDecoration:'none',fontFamily:F,transition:'all .15s',flexShrink:0}} onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.background='#174a85';}} onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.background='#1e5799';}}><svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar</a>)}</div></div>);})}</div>:<div style={{textAlign:'center' as const,padding:'40px 0',color:'#94a3b8'}}><svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:32,height:32,margin:'0 auto 10px',display:'block',opacity:.4}}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg><div style={{fontSize:13,fontFamily:F}}>Sin documentos disponibles</div></div>}</div>)}
          {tabActiva==='adendas'&&bloqueAdendas}
        </div>
        {/* Panel lateral de acciones */}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <button style={{width:'100%',height:38,borderRadius:10,background:'white',color:'#1e5799',border:'1.5px solid #1e5799',fontSize:13,fontWeight:600,fontFamily:F,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .15s'}} onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#eff6ff';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            Ver documento IA
          </button>
          <button style={{width:'100%',height:38,borderRadius:10,background:'white',color:'#1e5799',border:'1.5px solid #1e5799',fontSize:13,fontWeight:600,fontFamily:F,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .15s'}} onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#eff6ff';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            Ver licitaciones similares
          </button>
          <div style={{height:1,background:'#f1f5f9',margin:'2px 0'}}/>
          {error&&<div style={{fontSize:11.5,color:'#dc2626',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'5px 9px',fontFamily:F}}>⚠️ {error}</div>}
          {puedeGestionar?(
            <button onClick={hGestionar} disabled={guardando}
              style={{width:'100%',height:40,borderRadius:10,background:guardando?'#6b93c4':'#1e5799',color:'white',border:'none',fontSize:13,fontWeight:700,fontFamily:F,cursor:guardando?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .15s',boxShadow:guardando?'none':'0 2px 8px rgba(30,87,153,0.15)'}}
              onMouseOver={e=>{if(!guardando)(e.currentTarget as HTMLButtonElement).style.background='#174a85';}}
              onMouseOut={e=>{if(!guardando)(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              {guardando?'Guardando…':'Gestionar proceso'}
            </button>
          ):(
            <div style={{width:'100%',height:40,borderRadius:10,background:'#f1f5f9',color:'#94a3b8',border:'none',fontSize:12,fontFamily:F,display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Sin permiso para gestionar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModuloSolicitudesAbiertasBase({sesion,variante}:{sesion:Sesion;variante:VarianteSolicitudes}){
  const cfg = VARIANTE_CONFIG[variante];
  const [solicitudes,setSolicitudes]=useState<Solicitud[]>([]);
  const [cargando,setCargando]=useState(true);const[error,setError]=useState('');
  const [busqueda,setBusqueda]=useState('');
  const [seleccionados,setSeleccionados]=useState<number[]>([]);
  const [modalProceso,setModalProceso]=useState<Solicitud|null>(null);
  const [modalEliminar,setModalEliminar]=useState(false);
  const [modalCrear,setModalCrear]=useState(false);
  const [modalEditar,setModalEditar]=useState<Solicitud|null>(null);
  const [fichaAbierta,setFichaAbierta]=useState<Solicitud|null>(null);

  const origenSolicitudAuto =
    String(variante).toUpperCase().includes('ESPECIAL')
      ? 'Especializada'
      : 'Comercial';

  const mostrarColumnasContacto = variante === 'ESPECIALIZADA';

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      let url = '/api/solicitudes?limit=200';
      if (variante === 'RECHAZADA') {
        url += '&estado=Rechazada';
      } else if (variante === 'COMERCIAL' || variante === 'ESPECIALIZADA') {
        url += '&estado=En%20revisi%C3%B3n';
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Error al cargar solicitudes.');
        return;
      }
      setSolicitudes((data.solicitudes ?? []).slice().sort((a: Solicitud, b: Solicitud) => a.id - b.id));
    } catch {
      setError('No se pudo conectar.');
    } finally {
      setCargando(false);
    }
  }, [variante]);

  useEffect(()=>{cargar();},[cargar]);

  const porVariante=useMemo(()=>solicitudes.filter(s=>matchVariante(s,variante)),[solicitudes,variante]);

  const filtradas=useMemo(()=>porVariante.filter(s=>{
    const q=busqueda.toLowerCase();
    return[s.codigoProceso,s.entidad,s.objeto,s.perfil,s.departamento,
           s.estadoSolicitud,s.usuarioRegistro,s.ciudad,s.modalidad,
           s.sqrNumero].some(v=>(v||'').toLowerCase().includes(q));
  }),[porVariante,busqueda]);

  const POR_PAGINA_SOLICITUDES = 7;
  const [paginaSolicitudes, setPaginaSolicitudes] = useState(1);

  useEffect(() => {
    setPaginaSolicitudes(1);
    setSeleccionados([]);
  }, [busqueda, variante]);

  const totalPagesSolicitudes = Math.max(1,Math.ceil(filtradas.length / POR_PAGINA_SOLICITUDES));
  const paginaSeguraSolicitudes = Math.min(paginaSolicitudes, totalPagesSolicitudes);
  const solicitudesPagina = filtradas.slice(
    (paginaSeguraSolicitudes - 1) * POR_PAGINA_SOLICITUDES,
    paginaSeguraSolicitudes * POR_PAGINA_SOLICITUDES
  );

  const todosMarcados = solicitudesPagina.length > 0 && solicitudesPagina.every((s) => seleccionados.includes(s.id));

  const toggleAll = (c: boolean) => {
    const idsPagina = solicitudesPagina.map((s) => s.id);
    setSeleccionados((prev) => {
      if (c) return Array.from(new Set([...prev, ...idsPagina]));
      return prev.filter((id) => !idsPagina.includes(id));
    });
  };

  const toggleOne = (id: number, c: boolean) =>
    setSeleccionados((prev) =>
      c ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
    );

  const abrirModal=(s:Solicitud)=>setModalProceso(s);

  const fmtFecha=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  const fmtFechaCorta=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});};
  const fmtV=(v:number|null)=>{if(!v||v===0)return'—';return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};
  const tipoFromSolicitud=(s:Solicitud)=>{if((s.fuente||'').toLowerCase().includes('secop'))return'Público';if(s.sede==='Público'||s.sede==='Privado')return s.sede;return(s.fuente||'').toLowerCase().includes('manual')?'Manual':'Privado';};
  const sqrDisplay=(s:Solicitud)=>{
    if(s.sqrError)return{label:'Error SQR',bg:'#fef2f2',color:'#dc2626'};
    if(s.sqrNumero)return{label:s.sqrNumero,bg:'#E8F5E9',color:'#475569'};
    return{label:'Sin SQR',bg:'#f1f5f9',color:'#94a3b8'};
  };
  const modalidadSolicitud=(s:Solicitud)=>{
    const m=MMAP_MODALIDAD[s.modalidad]||s.modalidad||'';
    if(m)return m;
    const n=(s.nombreProceso||s.objeto||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(n.includes('minima cuantia'))return'Mínima cuantía';
    if(n.includes('licitacion'))return'Licitación pública';
    if(n.includes('seleccion abreviada'))return'Selección abreviada';
    if(n.includes('contratacion directa'))return'Contratación directa';
    if(n.includes('concurso de meritos'))return'Concurso de méritos';
    if(n.includes('regimen especial'))return'Régimen especial';
    return'—';
  };

  const exportarExcelSolicitudes=()=>{
  const datos=filtradas.length>0?filtradas:porVariante;
  const hacer=(XLSX:XlsxLike)=>{
    const cab=[
      'N°','Origen','Tipo proceso','Entidad grupo','No. proceso','Entidad contratante',
      'Objeto','Modalidad','Ciudad','Departamento','Perfil','Fuente','Plataforma',
      'Estado fuente','Estado solicitud','Presupuesto','Fecha publicación',
      'Fecha cierre','Fecha vencimiento','No. SQR','Registrado por','Cargo registro',
      'Fecha registro','NIT contacto','Persona contacto','Teléfono contacto',
      'Correo contacto','Dirección contacto','Link detalle','Asignaciones',
    ];
    const fmtF=(v:string|null|undefined)=>{
      if(!v)return'';
      const d=new Date(v);
      return isNaN(d.getTime())?v:d.toLocaleDateString('es-CO');
    };
    const fmtV=(v:number|null|undefined)=>{
      if(v==null||isNaN(v)||v===0)return'';
      return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);
    };
    const filas=datos.map(s=>[
      s.id,
      s.origenSolicitud||'Comercial',
      (s.fuente||'').toLowerCase().includes('secop')?'Público':'Privado',
      s.perfil||'',
      s.codigoProceso||'',
      s.entidad||'',
      s.objeto||'',
      modalidadSolicitud(s),
      s.ciudad||'',
      s.departamento||'',
      s.perfil||'',
      s.fuente||'',
      s.plataforma||'',
      s.estadoFuente||'',
      s.estadoSolicitud||'',
      fmtV(s.valor),
      fmtF(s.fechaPublicacion),
      fmtF(s.fechaCierre),
      fmtF(s.fechaVencimiento),
      s.sqrNumero||'',
      s.usuarioRegistro||'',
      s.cargoRegistro||'',
      fmtF(s.createdAt),
      s.nitContacto||'',
      s.personaContacto||'',
      s.telefonoContacto||'',
      s.correoContacto||'',
      s.direccionContacto||'',
      s.linkDetalle||s.linkSecop||s.linkSecopReg||'',
      Array.isArray(s.asignaciones)
        ?safeArray<Record<string, unknown>>(s.asignaciones).map(a=>`${safeString(a.analistaAsignado)} (${safeString(a.estadoAsignacion)})`).join(' | ')
        :'',
    ]);
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([cab,...filas]);
    ws['!cols']=[
      {wch:6},{wch:14},{wch:12},{wch:14},{wch:20},{wch:30},{wch:40},{wch:20},
      {wch:16},{wch:16},{wch:14},{wch:14},{wch:14},{wch:16},{wch:16},{wch:16},
      {wch:16},{wch:14},{wch:14},{wch:12},{wch:18},{wch:18},{wch:16},{wch:14},
      {wch:18},{wch:16},{wch:24},{wch:20},{wch:30},{wch:40},
    ];
    const titulo=cfg.titulo.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
    XLSX.utils.book_append_sheet(wb,ws,cfg.titulo.slice(0,31));
    XLSX.writeFile(wb,`${titulo}_${new Date().toISOString().slice(0,10)}.xlsx`,{bookType:'xlsx',type:'binary'});
  };
  const xlsx = getWindowXlsx();
  if(xlsx){hacer(xlsx);}
  else{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=()=>{const loadedXlsx=getWindowXlsx();if(loadedXlsx)hacer(loadedXlsx);};
    document.head.appendChild(s);
  }
};

  const COLS=[
    {w:48,label:'N°'},
    {w:88,label:'Tipo proceso'},
    {w:100,label:'Entidad grupo'},
    {w:120,label:'No. proceso'},
    {w:1,label:'Entidad contratante'},
    {w:120,label:'Modalidad'},
    {w:96,label:'Fecha cierre'},
    {w:44,label:'Ficha'},
  ];

  if(fichaAbierta) return (
    <VistFicha
      sol={fichaAbierta} sesion={sesion} variante={variante}
      onVolver={()=>setFichaAbierta(null)}
      onGuardado={(updated)=>{setSolicitudes(prev=>prev.map(x=>x.id===updated.id?updated:x));setFichaAbierta(updated);}}
    />
  );

  if(cargando)return<div className="content"><div className="module-status">Cargando solicitudes…</div></div>;
  if(error)return<div className="content"><div className="module-status error">{error}</div></div>;

  return(<>
    {modalCrear && (
      <ModalCrearSolicitud
        sesion={sesion}
        origenSolicitud={origenSolicitudAuto}
        onClose={() => setModalCrear(false)}
        onCreada={() => {setModalCrear(false);cargar();}}
      />
    )}
    {modalEditar&&<ModalEditarSolicitud sol={modalEditar} sesion={sesion} onClose={()=>setModalEditar(null)} onGuardado={(updated)=>{setSolicitudes(prev=>prev.map(s=>s.id===updated.id?updated:s));setModalEditar(null);setSeleccionados([]);}}/>}
    {modalEliminar&&<ModalConfirmarEliminarSolicitud solicitudes={solicitudes.filter(s=>seleccionados.includes(s.id))} onClose={()=>setModalEliminar(false)} onEliminado={()=>{setSeleccionados([]);cargar();}} sesion={sesion}/>}
    <div className="content">
      <div className="page-header">
        <div className="page-title"><IcoSolicitudes/><span>{cfg.titulo}</span></div>
        <div className="page-actions">
          <input type="text" className="search-box" placeholder="Buscar…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
          <button className="icon-btn" title="Información"><IcoInfo/></button>
          <button className="icon-btn" title="Filtrar"><IcoFilter/></button>
          <button className="icon-btn" title="Actualizar" onClick={()=>{setBusqueda('');cargar();}}><IcoRefresh/></button>
          <button className="icon-btn" title="Columnas"><IcoColumns/></button>
          <button className="icon-btn blue-fill" title="Nueva solicitud" onClick={()=>setModalCrear(true)}><IcoPlus/></button>
          <button className="icon-btn" title="Editar solicitud" disabled={seleccionados.length!==1} onClick={()=>{const s=solicitudes.find(s=>s.id===seleccionados[0]);if(s)setModalEditar(s);}}><IcoPencil/></button>
          <button className="icon-btn red" title="Eliminar" disabled={seleccionados.length===0} onClick={()=>setModalEliminar(true)}><IcoTrash/></button>
          <button className="icon-btn green" title="Exportar Excel" onClick={exportarExcelSolicitudes}><IcoExcel/></button>
        </div>
      </div>
      <div className="table-card">
        <div className="table-scroll">
          <table style={{tableLayout:'auto',width:'100%'}}>
            <thead>
              <tr>
                <th style={{width:36}}><div className="th-top"><input type="checkbox" className="cbx" checked={todosMarcados} onChange={e=>toggleAll(e.target.checked)}/></div></th>
                <th style={{width:48}}><div className="th-top">N°</div></th>
                <th style={{width:88}}><div className="th-top">Tipo proceso</div></th>
                <th style={{width:100}}><div className="th-top">Entidad grupo</div></th>
                <th style={{width:120}}><div className="th-top">No. proceso</div></th>
                <th style={{width:180,whiteSpace:'normal' as const}}><div className="th-top">Entidad contratante</div></th>
                <th style={{width:120}}><div className="th-top">Modalidad</div></th>
                <th style={{width:96}}><div className="th-top">Fecha cierre</div></th>
                <th style={{width:44}}><div className="th-top">Ficha</div></th>
              </tr>
              <tr>
                <th/><th/><th/><th/><th/><th/><th/><th/><th/>
              </tr>
            </thead>
            <tbody>
              {filtradas.length===0
                ?<tr><td colSpan={9} style={{textAlign:'center',color:'#6b7280',padding:'36px 10px',fontSize:13}}>
                  {porVariante.length===0?cfg.emptyMsg:'Sin resultados.'}
                </td></tr>
                :solicitudesPagina.map(s=>{
                  const ebc=estadoSolicitudColor(s.estadoSolicitud||'');
                  const pc=s.perfil?perfilColor(s.perfil):null;
                  const tipoP=tipoFromSolicitud(s);
                  const sqr=sqrDisplay(s);
                  const modalidad=modalidadSolicitud(s);
                  return(
                    <tr key={'row-'+s.id} onDoubleClick={()=>abrirModal(s)} style={{cursor:'default'}}>
                      <td className="center"><input type="checkbox" className="cbx" checked={seleccionados.includes(s.id)} onChange={e=>toggleOne(s.id,e.target.checked)}/></td>
                      <td style={{fontWeight:700,color:'#374151',fontSize:13}}>{s.id}</td>
                      <td><span style={{fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:20,background:tipoP==='Público'?'#EAF2FB':tipoP==='Privado'?'#F3E5F5':'#F1F5F9',color:tipoP==='Público'?'#1E5799':tipoP==='Privado'?'#4A148C':'#64748b',whiteSpace:'nowrap'}}>{tipoP}</span></td>
                      <td>{pc?<span style={{fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:20,background:pc.bg,color:pc.color,whiteSpace:'nowrap'}}>{pc.label}</span>:<span style={{fontSize:12,color:'#374151'}}>—</span>}</td>
                      <td style={{fontFamily:'monospace',fontSize:11,color:'#475569',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.codigoProceso||'—'}</td>
                      <td style={{fontSize:10,color:'#374151',whiteSpace:'normal' as const,wordBreak:'break-word' as const,lineHeight:1.4,verticalAlign:'middle',padding:'8px 10px',minWidth:160,maxWidth:260}}>{s.entidad||'—'}</td>
                      <td style={{fontSize:11,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{modalidad}</td>
                      <td style={{fontSize:11,color:'#64748b',whiteSpace:'nowrap'}}>{fmtFechaCorta(s.fechaCierre||s.fechaVencimiento)}</td>
                      <td className="center">
                        <button onClick={e=>{e.stopPropagation();setFichaAbierta(s);}} title="Ver ficha detallada"
                          style={{width:30,height:30,borderRadius:8,border:'1.5px solid #d1d5db',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#1a5ea8',transition:'all .15s'}}
                          onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#EAF2FB';(e.currentTarget as HTMLButtonElement).style.borderColor='#1a5ea8';}}
                          onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.borderColor='#d1d5db';}}>
                          <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:15,height:15}}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <span>
            {filtradas.length > 0
              ? `${(paginaSeguraSolicitudes - 1) * POR_PAGINA_SOLICITUDES + 1}–${Math.min(
                  paginaSeguraSolicitudes * POR_PAGINA_SOLICITUDES,
                  filtradas.length
                )} de ${filtradas.length} solicitudes`
              : `0 de ${solicitudes.length} solicitudes`}
          </span>
          <div className="pages">
            <button className="page-btn" onClick={() => setPaginaSolicitudes((p) => Math.max(1, p - 1))} disabled={paginaSeguraSolicitudes <= 1}>Anterior</button>
            {Array.from({ length: totalPagesSolicitudes }, (_, i) => i + 1).map((n) => (
              <button key={n} className={`page-btn${n === paginaSeguraSolicitudes ? ' active' : ''}`} onClick={() => setPaginaSolicitudes(n)}>{n}</button>
            ))}
            <button className="page-btn" onClick={() => setPaginaSolicitudes((p) => Math.min(totalPagesSolicitudes, p + 1))} disabled={paginaSeguraSolicitudes >= totalPagesSolicitudes}>Siguiente</button>
          </div>
        </div>
      </div>
    </div>
  </>);
}

/* Variantes del módulo de solicitudes */
function ModuloSolicitudesTodas({sesion}:{sesion:Sesion}){return<ModuloSolicitudesAbiertasBase sesion={sesion} variante="TODAS"/>;}
function ModuloSolicitudesRechazadas({sesion}:{sesion:Sesion}){return<ModuloSolicitudesAbiertasBase sesion={sesion} variante="RECHAZADA"/>;}
function ModuloSolicitudesComercial({sesion}:{sesion:Sesion}){return<ModuloSolicitudesAbiertasBase sesion={sesion} variante="COMERCIAL"/>;}
function ModuloSolicitudesEspecializada({sesion}:{sesion:Sesion}){return<ModuloSolicitudesAbiertasBase sesion={sesion} variante="ESPECIALIZADA"/>;}

/* =========================================================
   MÓDULO SOLICITUDES ELIMINADAS
========================================================= */
function ModuloSolicitudesEliminadas(){
  const [registros,setRegistros]=useState<DeletedSolicitud[]>([]);
  const [cargando,setCargando]=useState(true);const[error,setError]=useState('');
  const [busqueda,setBusqueda]=useState('');
  const [seleccionados,setSeleccionados]=useState<number[]>([]);
  const [recuperando,setRecuperando]=useState(false);

  const cargar=useCallback(async()=>{setCargando(true);setError('');try{const res=await fetch('/api/deleted-solicitudes');const data=await res.json();if(!res.ok||!data.ok){setError(data.error??'Error al cargar.');return;}setRegistros(data.solicitudes??[]);}catch{setError('No se pudo conectar.');}finally{setCargando(false);};},[]);
  useEffect(()=>{cargar();},[cargar]);

  const filtrados=useMemo(()=>registros.filter(s=>{const q=busqueda.toLowerCase();return[s.codigoProceso,s.entidad,s.objeto,s.perfil,s.estadoSolicitud,s.usuarioRegistro,s.deletedByUsuario].some(v=>(v||'').toLowerCase().includes(q));}),[registros,busqueda]);
  const todosMarcados=filtrados.length>0&&seleccionados.length===filtrados.length;
  const toggleAll=(c:boolean)=>setSeleccionados(c?filtrados.map(s=>s.id):[]);
  const toggleOne=(id:number,c:boolean)=>setSeleccionados(p=>c?[...p,id]:p.filter(x=>x!==id));

  const handleRecuperar=async()=>{
    if(seleccionados.length===0)return;
    setRecuperando(true);
    try{await Promise.all(seleccionados.map(id=>fetch('/api/deleted-solicitudes',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})));setSeleccionados([]);cargar();}
    catch{setError('Error al recuperar.');}finally{setRecuperando(false);}
  };

  const fmtFecha=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};

  if(cargando)return<div className="content"><div className="module-status">Cargando solicitudes eliminadas…</div></div>;
  if(error)return<div className="content"><div className="module-status error">{error}</div></div>;

  return(<div className="content">
    <div className="page-header">
      <div className="page-title"><IcoTrash/><span>Solicitudes eliminadas : {filtrados.length} / {registros.length}</span></div>
      <div className="page-actions">
        <input type="text" className="search-box" placeholder="Buscar…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
        <button className="icon-btn" title="Actualizar" onClick={()=>{setBusqueda('');cargar();}}><IcoRefresh/></button>
        <button className="icon-btn" title="Recuperar seleccionados" disabled={seleccionados.length===0||recuperando} onClick={handleRecuperar} style={{color:seleccionados.length>0?'#16a34a':'',borderColor:seleccionados.length>0?'#16a34a':''}}><IcoRestore/></button>
      </div>
    </div>
    <div className="table-card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={{width:36}}><div className="th-top"><input type="checkbox" className="cbx" checked={todosMarcados} onChange={e=>toggleAll(e.target.checked)}/></div></th>
              {(['ID orig.','Estado','Entidad del grupo','Cliente','No. proceso','Modalidad','Presupuesto','Plataforma','Eliminado por','Correo eliminador','Fecha eliminación'] as string[]).map(h=><th key={h}><div className="th-top">{h}</div></th>)}
            </tr>
            <tr><th/>{Array.from({length:11}).map((_,i)=><th key={i}><div style={{padding:'0 10px 5px',color:'#d1d5db',fontSize:11}}>≡</div></th>)}</tr>
          </thead>
          <tbody>
            {filtrados.length===0
              ?<tr><td colSpan={12} style={{textAlign:'center',color:'#6b7280',padding:'36px 10px',fontSize:13}}>No hay solicitudes eliminadas.</td></tr>
              :filtrados.map(s=>{
                const ebc=estadoSolicitudColor(s.estadoSolicitud||'');
                const pc=s.perfil?perfilColor(s.perfil):null;
                return(<tr key={s.id}>
                  <td className="center"><input type="checkbox" className="cbx" checked={seleccionados.includes(s.id)} onChange={e=>toggleOne(s.id,e.target.checked)}/></td>
                  <td style={{fontWeight:600,color:'#374151',fontSize:13}}>#{s.originalId??s.id}</td>
                  <td><span className="badge" style={{background:ebc.bg,color:ebc.color,fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:600}}>{s.estadoSolicitud||'—'}</span></td>
                  <td>{pc?<span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:pc.bg,color:pc.color}}>{pc.label}</span>:<span style={{fontSize:12,color:'#374151'}}>—</span>}</td>
                  <td style={{fontSize:12,fontWeight:500,color:'#1e293b'}}>{s.entidad||'—'}</td>
                  <td style={{fontFamily:'monospace',fontSize:11,color:'#475569'}}>{s.codigoProceso||'—'}</td>
                  <td style={{fontSize:12,color:'#374151'}}>{MMAP_MODALIDAD[s.modalidad]||s.modalidad||'—'}</td>
                  <td style={{fontSize:12,fontWeight:600,color:'#475569',whiteSpace:'nowrap'}}>{s.valor?new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(s.valor):'—'}</td>
                  <td style={{fontSize:11,color:'#64748b'}}>{s.plataforma||s.aliasFuente||'—'}</td>
                  <td style={{fontSize:11,color:'#64748b'}}>{s.deletedByUsuario||'—'}</td>
                  <td style={{fontSize:11,color:'#64748b'}}>{s.deletedByEmail||'—'}</td>
                  <td style={{fontSize:11,color:'#64748b',whiteSpace:'nowrap'}}>{fmtFecha(s.deletedAt)}</td>
                </tr>);
              })
            }
          </tbody>
        </table>
      </div>
      <div className="pagination-bar"><span>{filtrados.length>0?`1 - ${filtrados.length} de ${registros.length}`:`0 de ${registros.length}`}</span></div>
    </div>
  </div>);
}

/* =========================================================
   MÓDULO EXÁMENES MÉDICOS
========================================================= */
const EXAMEN_COLS=[
  {key:'cod_grupo_exam', label:'Grupo',         w:110},
  {key:'cod_examen',     label:'Cód. examen',   w:130},
  {key:'nit_proveedor',  label:'NIT proveedor', w:150},
  {key:'codmun',         label:'Cód. mun.',     w:100},
  {key:'ciudad',         label:'Ciudad',        w:150},
  {key:'descripcion',    label:'Examen',        w:320},
  {key:'vlr_costo',      label:'Valor',         w:130},
];
const EXAMEN_LIMIT=30;

const GRUPO_PALETA=[
  {bg:'#EAF2FB',color:'#1E5799'},{bg:'#E8F5E9',color:'#1B5E20'},{bg:'#FFF8E1',color:'#E65100'},
  {bg:'#F3E5F5',color:'#4A148C'},{bg:'#FEF3C7',color:'#92400E'},{bg:'#FCE4EC',color:'#880E4F'},
  {bg:'#E0F7FA',color:'#006064'},{bg:'#F1F8E9',color:'#33691E'},
];
function badgeGrupo(g:string):{bg:string;color:string}{
  if(!g)return{bg:'#F1F5F9',color:'#475569'};
  let h=0;for(let i=0;i<g.length;i++)h=(h*31+g.charCodeAt(i))&0xffff;
  return GRUPO_PALETA[h%GRUPO_PALETA.length];
}

function ModuloExamenesMedicos(){
  const [rows,setRows]=useState<ExamenMedico[]>([]);const[total,setTotal]=useState(0);const[totalPags,setTotalPags]=useState(1);const[pagina,setPagina]=useState(1);const[cargando,setCargando]=useState(false);const[error,setError]=useState('');
  const [modo,setModo]=useState<'todos'|'grupo'>('todos');const[grupoExam,setGrupoExam]=useState('');const[codmun,setCodmun]=useState('');
  const [pF,setPF]=useState(false);const[fCiudad,setFCiudad]=useState('');const[fA,setFA]=useState({ciudad:''});
  const [busqueda,setBusqueda]=useState('');const[seleccionados,setSeleccionados]=useState<Set<number>>(new Set());const[exportando,setExportando]=useState(false);

  const fetchTodos=useCallback(async(pag:number)=>{
    setCargando(true);setError('');setSeleccionados(new Set());
    try{const params=new URLSearchParams({page:String(pag),limit:String(EXAMEN_LIMIT)});if(busqueda.trim())params.set('q',busqueda.trim());const res=await fetch(`/api/examenes?${params}`);const data=await res.json();if(!res.ok||!data.ok){setError(data.error??`Error ${res.status}`);return;}setRows(data.data??[]);setTotal(data.total??0);setTotalPags(data.totalPages??1);setPagina(data.page??pag);}
    catch{setError('No se pudo conectar.');}finally{setCargando(false);}
  },[busqueda]);

  const fetchGrupo=useCallback(async(pag:number)=>{
    if(!grupoExam.trim()&&!codmun.trim()){setError('Ingresa al menos Grupo examen o Código municipio.');return;}
    setCargando(true);setError('');setSeleccionados(new Set());
    try{const body:Record<string,unknown>={page:pag,limit:EXAMEN_LIMIT};if(grupoExam.trim())body.grupo_exam=grupoExam.trim();if(codmun.trim())body.codmun=codmun.trim();const res=await fetch('/api/examenes/por-grupo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok||!data.ok){setError(data.error??`Error ${res.status}`);return;}setRows(data.data??[]);setTotal(data.total??0);setTotalPags(data.totalPages??1);setPagina(data.page??pag);}
    catch{setError('No se pudo conectar.');}finally{setCargando(false);}
  },[grupoExam,codmun]);

  useEffect(()=>{fetchTodos(1);},[]);
  const irPagina=(p:number)=>{setPagina(p);if(modo==='todos')fetchTodos(p);else fetchGrupo(p);};
  const resetTodos=()=>{setModo('todos');setGrupoExam('');setCodmun('');setBusqueda('');setPagina(1);setFA({ciudad:''});setFCiudad('');fetchTodos(1);};
  const aplicarFiltros=()=>{setFA({ciudad:fCiudad});setPF(false);};
  const limpiarFiltros=()=>{setFCiudad('');setFA({ciudad:''});};
  const hayFA=!!fA.ciudad;

  const rowsFiltrados=useMemo(()=>{let l=rows;if(fA.ciudad.trim()){const c=fA.ciudad.toLowerCase();l=l.filter(r=>String(r.ciudad||'').toLowerCase().includes(c));}if(busqueda.trim()){const q=busqueda.toLowerCase();l=l.filter(r=>Object.values(r).some(v=>String(v??'').toLowerCase().includes(q)));}return l;},[rows,fA,busqueda]);
  const todosMarcados=rowsFiltrados.length>0&&rowsFiltrados.every((_,i)=>seleccionados.has(i));
  const toggleAll=(c:boolean)=>setSeleccionados(prev=>{const s=new Set(prev);rowsFiltrados.forEach((_,i)=>c?s.add(i):s.delete(i));return s;});
  const toggleOne=(i:number,c:boolean)=>setSeleccionados(prev=>{const s=new Set(prev);c?s.add(i):s.delete(i);return s;});
  const fmtCOP=(v:unknown)=>{const n=Number(v);if(!v||isNaN(n)||n===0)return'—';return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(n);};

  const exportarExcelExamenes=async()=>{
    setExportando(true);setError('');
    try{
      const res=await fetch(`/api/examenes?export=true`);const data=await res.json();if(!res.ok||!data.ok){setError(data.error??'Error al exportar.');return;}
      const todos:ExamenMedico[]=data.data??[];
      const hacer=(XLSX:XlsxLike)=>{const cab=['Grupo','Cód. examen','NIT proveedor','Cód. municipio','Ciudad','Examen','Valor'];const filas=todos.map(r=>[String(r.cod_grupo_exam??''),String(r.cod_examen??''),String(r.nit_proveedor??''),String(r.codmun??''),String(r.ciudad??''),String(r.descripcion??''),Number(r.vlr_costo)||0]);const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([cab,...filas]);const range=XLSX.utils.decode_range(ws['!ref']??'A1');for(let R=1;R<=range.e.r;R++){const cell=ws[XLSX.utils.encode_cell({r:R,c:6})];const cellRecord=safeRecord(cell);if(cellRecord.t==='n')cellRecord.z='$#,##0';}ws['!cols']=[{wch:12},{wch:14},{wch:16},{wch:12},{wch:18},{wch:50},{wch:16}];XLSX.utils.book_append_sheet(wb,ws,'Exámenes médicos');XLSX.writeFile(wb,`examenes_medicos_${new Date().toISOString().slice(0,10)}.xlsx`,{bookType:'xlsx',type:'binary'});};
       
      const xlsx = getWindowXlsx();if(xlsx){hacer(xlsx);}else{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>{const loadedXlsx=getWindowXlsx();if(loadedXlsx)hacer(loadedXlsx);};document.head.appendChild(s);}
    }catch{setError('No se pudo exportar.');}finally{setExportando(false);}
  };

  const pagesArr=(()=>{const t=totalPags;if(t<=7)return Array.from({length:t},(_,i)=>i+1);const arr:(number|-1)[]=[];arr.push(1);if(pagina>3)arr.push(-1);for(let i=Math.max(2,pagina-1);i<=Math.min(t-1,pagina+1);i++)arr.push(i);if(pagina<t-2)arr.push(-1);arr.push(t);return arr;})();

  return(<>
    {pF&&<div style={{position:'fixed',inset:0,zIndex:900}} onClick={()=>setPF(false)}><div onClick={e=>e.stopPropagation()} style={{position:'fixed',top:52,right:12,width:288,maxHeight:'calc(100vh - 70px)',background:'white',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,.18)',border:'1px solid #e2e8f0',display:'flex',flexDirection:'column',zIndex:901,overflow:'hidden'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px 12px',borderBottom:'1px solid #f1f5f9',flexShrink:0}}><span style={{fontSize:13.5,fontWeight:700,color:'#0f172a'}}>Filtrar exámenes</span><button onClick={()=>setPF(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:20,lineHeight:1,padding:'0 2px'}}>×</button></div><div style={{overflowY:'auto',flex:1,padding:'14px 16px'}}><div style={{marginBottom:4}}><label style={{fontSize:11.5,fontWeight:600,color:'#64748b',display:'block',marginBottom:5}}>Ciudad</label><input type="text" value={fCiudad} onChange={e=>setFCiudad(e.target.value)} placeholder="Ej. MEDELLÍN" style={{width:'100%',height:34,border:'1px solid #e2e8f0',borderRadius:8,padding:'0 10px',fontSize:12.5,fontFamily:'var(--font)',color:'#374151',outline:'none',boxSizing:'border-box'}}/></div></div><div style={{padding:'12px 16px',borderTop:'1px solid #f1f5f9',display:'flex',gap:8,flexShrink:0}}><button onClick={aplicarFiltros} style={{flex:1,height:36,borderRadius:8,background:'#1E5799',color:'white',border:'none',fontSize:13,fontWeight:700,fontFamily:'var(--font)',cursor:'pointer'}}>Aplicar</button><button onClick={limpiarFiltros} style={{height:36,padding:'0 16px',borderRadius:8,background:'white',color:'#64748b',border:'1px solid #e2e8f0',fontSize:13,fontFamily:'var(--font)',cursor:'pointer'}}>Limpiar</button></div></div></div>}
    <div className="content">
      <div className="page-header">
        <div className="page-title"><IcoExamenes/><span>Exámenes médicos : {rowsFiltrados.length} / {total}</span></div>
        <div className="page-actions">
          <input type="text" className="search-box" placeholder="Buscar en página…" value={busqueda} onChange={e=>setBusqueda(e.target.value)} disabled={cargando}/>
          <button className="icon-btn" title="Información"><IcoInfo/></button>
          <button className={`icon-btn${hayFA?' active':''}`} title="Filtrar" onClick={()=>{setFCiudad(fA.ciudad);setPF(v=>!v);}} style={{position:'relative'}}><IcoFilter/>{hayFA&&<span style={{position:'absolute',top:2,right:2,width:7,height:7,borderRadius:'50%',background:'#ef4444',border:'1.5px solid white'}}/>}</button>
          <button className="icon-btn" title="Recargar" onClick={resetTodos} disabled={cargando}><IcoRefresh/></button>
          <button className="icon-btn" title="Columnas"><IcoColumns/></button>
          <button className="icon-btn green" title="Exportar Excel completo" onClick={exportarExcelExamenes} disabled={cargando||exportando}><IcoExcel/></button>
        </div>
      </div>
      {hayFA&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>{fA.ciudad&&<span style={{display:'inline-flex',alignItems:'center',gap:5,height:24,padding:'0 10px',borderRadius:20,background:'#EAF2FB',color:'#1E5799',fontSize:11,fontWeight:600}}>Ciudad: {fA.ciudad}<button onClick={()=>setFA(f=>({...f,ciudad:''}))} style={{background:'none',border:'none',cursor:'pointer',color:'#2E7BC4',fontSize:14,lineHeight:1,padding:0,marginLeft:2}}>×</button></span>}<button onClick={limpiarFiltros} style={{height:24,padding:'0 10px',borderRadius:20,background:'#fee2e2',color:'#dc2626',fontSize:11,fontWeight:600,border:'none',cursor:'pointer',fontFamily:'var(--font)'}}>Limpiar</button></div>}
      {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:12,marginBottom:12}}>⚠️ {error}</div>}
      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th style={{width:36}}><div className="th-top"><input type="checkbox" className="cbx" checked={todosMarcados} onChange={e=>toggleAll(e.target.checked)}/></div></th>{EXAMEN_COLS.map(c=><th key={c.key} style={{minWidth:c.w}}><div className="th-top">{c.label}</div></th>)}</tr>
              <tr><th/>{EXAMEN_COLS.map(c=><th key={c.key}><div style={{padding:'0 10px 5px',color:'#d1d5db',fontSize:11}}>≡</div></th>)}</tr>
            </thead>
            <tbody>
              {cargando?<tr><td colSpan={EXAMEN_COLS.length+1} style={{textAlign:'center',padding:'40px 10px'}}><div style={{display:'inline-flex',alignItems:'center',gap:10,color:'#1E5799',fontSize:13}}><svg style={{animation:'spin 1s linear infinite',width:18,height:18}} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4 4v5h5M20 20v-5h-5"/><path d="M4.055 9A8 8 0 0120 15.944M19.945 15A8 8 0 014 8.056"/></svg>Cargando exámenes…</div></td></tr>
              :rowsFiltrados.length===0?<tr><td colSpan={EXAMEN_COLS.length+1} style={{textAlign:'center',color:'#6b7280',padding:'40px 10px',fontSize:13}}>{total===0?'No hay datos. Usa los filtros o recarga.':'Sin resultados.'}</td></tr>
              :rowsFiltrados.map((row,i)=>{const selec=seleccionados.has(i);const bg=badgeGrupo(String(row.cod_grupo_exam||''));return(<tr key={i} style={{background:selec?'#f0f7ff':'white',cursor:'default'}} onMouseOver={e=>{if(!selec)(e.currentTarget as HTMLTableRowElement).style.background='#f8fafc';}} onMouseOut={e=>{(e.currentTarget as HTMLTableRowElement).style.background=selec?'#f0f7ff':'white';}}><td className="center"><input type="checkbox" className="cbx" checked={selec} onChange={e=>toggleOne(i,e.target.checked)}/></td><td><span style={{display:'inline-flex',alignItems:'center',height:24,padding:'0 10px',borderRadius:20,fontSize:11,fontWeight:700,background:bg.bg,color:bg.color,whiteSpace:'nowrap'}}>{String(row.cod_grupo_exam||'—')}</span></td><td><span style={{fontSize:11,fontFamily:'monospace',fontWeight:700,padding:'3px 10px',borderRadius:6,background:'#0f172a',color:'white',whiteSpace:'nowrap',letterSpacing:'0.03em'}}>{String(row.cod_examen||'—')}</span></td><td style={{fontSize:12,color:'#64748b',fontFamily:'monospace'}}>{String(row.nit_proveedor||'—')}</td><td style={{fontSize:12,color:'#64748b',textAlign:'center' as const}}>{String(row.codmun||'—')}</td><td style={{fontSize:12,fontWeight:500,color:'#1e293b'}}>{String(row.ciudad||'—')}</td><td style={{maxWidth:320}} title={String(row.descripcion||'')}><div style={{fontSize:12,color:'#374151',lineHeight:1.45,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const,overflow:'hidden'}}>{String(row.descripcion||'—')}</div></td><td style={{fontSize:12.5,fontWeight:700,color:'#475569',whiteSpace:'nowrap',textAlign:'right' as const,paddingRight:16}}>{fmtCOP(row.vlr_costo)}</td></tr>);})}
            </tbody>
          </table>
        </div>
        <div className="pagination-bar" style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px'}}>
          <span style={{fontSize:12,color:'#64748b'}}>{total>0?`${((pagina-1)*EXAMEN_LIMIT)+1} – ${Math.min(pagina*EXAMEN_LIMIT,total)} de ${total.toLocaleString('es-CO')}`:'0 resultados'}</span>
          <div className="pages" style={{display:'flex',alignItems:'center',gap:4}}>
            <button className="page-btn" onClick={()=>irPagina(pagina-1)} disabled={pagina<=1||cargando}>‹</button>
            {pagesArr.map((n,i)=>n===-1?<span key={`el${i}`} style={{padding:'0 4px',color:'#9ca3af',fontSize:12}}>…</span>:<button key={n} className={`page-btn${n===pagina?' active':''}`} onClick={()=>n!==pagina&&irPagina(n)} disabled={cargando}>{n}</button>)}
            <button className="page-btn" onClick={()=>irPagina(pagina+1)} disabled={pagina>=totalPags||cargando}>›</button>
          </div>
        </div>
      </div>
    </div>
  </>);
}

/* =========================================================
   USUARIOS ELIMINADOS
========================================================= */
function ModuloUsuariosEliminados(){
  const [registros,setRegistros]=useState<DeletedUser[]>([]);const[cargando,setCargando]=useState(true);const[errorCarga,setErrorCarga]=useState('');const[busqueda,setBusqueda]=useState('');
  const cargar=useCallback(async()=>{setCargando(true);setErrorCarga('');try{const res=await fetch('/api/deleted-users');if(!res.ok)throw new Error();setRegistros(await res.json());}catch{setErrorCarga('No se pudo cargar usuarios eliminados.');}finally{setCargando(false);};},[]);
  useEffect(()=>{cargar();},[cargar]);
  const filtrados=registros.filter(u=>{const q=busqueda.toLowerCase();return[u.cedula,u.entidadGrupo,u.cargo,u.email,u.usuario,u.rol].some(v=>v.toLowerCase().includes(q));});
  const fmt=(r:string)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  if(cargando)return<div className="content"><div className="module-status">Cargando usuarios eliminados…</div></div>;
  if(errorCarga)return<div className="content"><div className="module-status error">{errorCarga}</div></div>;
  return(<div className="content"><div className="page-header"><div className="page-title"><IcoTrash/><span>Usuarios eliminados : {filtrados.length} / {registros.length}</span></div><div className="page-actions"><input type="text" className="search-box" placeholder="Buscar…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/><button className="icon-btn" onClick={()=>{setBusqueda('');cargar();}}><IcoRefresh/></button></div></div><div className="table-card"><div className="table-scroll"><table><thead><tr>{['Cédula','Celular','Entidad','Cargo','Email','Usuario','Rol','Estado','Eliminado por','Correo eliminador','Fecha eliminación'].map(h=><th key={h}><div className="th-top">{h}</div></th>)}</tr></thead><tbody>{filtrados.length===0?<tr><td colSpan={11} style={{textAlign:'center',color:'#6b7280',padding:'28px 10px'}}>No hay registros.</td></tr>:filtrados.map(u=><tr key={u.id}><td>{u.cedula}</td><td>{u.celular}</td><td>{u.entidadGrupo}</td><td>{u.cargo}</td><td>{u.email}</td><td>{u.usuario}</td><td>{u.rol}</td><td><span className="badge" style={{background:'#fee2e2',color:'#dc2626',fontSize:11}}>{u.estado}</span></td><td>{u.deletedByUsuario||'—'}</td><td>{u.deletedByEmail||'—'}</td><td>{fmt(u.deletedAt)}</td></tr>)}</tbody></table></div><div className="pagination-bar"><span>1 - {filtrados.length} de {registros.length}</span></div></div></div>);
}

/* =========================================================
   MÓDULO PROCESOS NUEVOS
========================================================= */
interface ProcesoNuevoItem {
  id:number; procesoId:number|null; sourceKey:string;
  codigoProceso:string|null; nombre:string|null; entidad:string|null;
  objeto:string|null; fuente:string|null; aliasFuente:string|null;
  modalidad:string|null; perfil:string|null; departamento:string|null;
  estadoFuente:string|null; fechaPublicacion:string|null;
  fechaVencimiento:string|null; valor:number|null;
  linkDetalle:string|null; linkSecop:string|null; linkSecopReg:string|null;
  fechaDeteccion:string;
}

function ModuloProcesoNuevos({sesion,onModuleChange,puedeGestionar=true}:{sesion:Sesion;onModuleChange:(m:string)=>void;puedeGestionar?:boolean}){
  const [procesos,setProcesos]=useState<ProcesoNuevoItem[]>([]);
  const [total,setTotal]=useState(0);const[totalPages,setTotalPages]=useState(1);
  const [pagina,setPagina]=useState(1);
  const [cargando,setCargando]=useState(true);
  const [error,setError]=useState('');
  const [busqueda,setBusqueda]=useState('');
  const [busquedaInput,setBusquedaInput]=useState('');
  const [filtro,setFiltro]=useState<'hoy'|'ayer'|'semana'|'rango'>('hoy');
  const [desde,setDesde]=useState('');
  const [hasta,setHasta]=useState('');
  const [detalle,setDetalle]=useState<ProcesoNuevoItem|null>(null);
  const [gestionando,setGestionando]=useState(false);
  const [errorGestion,setErrorGestion]=useState('');
  const LIMIT=30;

  const syncEnCursoRef = React.useRef(false);
  const intervaloSyncRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const cargar = useCallback(async (page:number, q?:string) => {
    setCargando(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        filtro,
      });

      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const termino = q !== undefined ? q : busqueda;
      if (termino) params.set('query', termino);

      const res = await fetch(`/api/procesos/nuevos?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? 'No se pudo cargar procesos nuevos.');
        setProcesos([]);
        setTotal(0);
        setTotalPages(1);
        return;
      }

      setProcesos(data.procesos ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch {
      setError('No se pudo cargar procesos nuevos.');
      setProcesos([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setCargando(false);
    }
  }, [filtro, desde, hasta, busqueda]);

  const syncAutomatico = useCallback(async () => {
    if (syncEnCursoRef.current) return;

    syncEnCursoRef.current = true;

    try {
      const res = await fetch('/api/procesos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          silencioso: true,
          maxResultados: 50,
          limitPorPagina: 25,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || (data && data.ok === false)) {
        return;
      }

      await cargar(1);
      setPagina(1);
    } catch {
      // silencioso
    } finally {
      syncEnCursoRef.current = false;
    }
  }, [cargar]);

  useEffect(() => {
    cargar(1);

    intervaloSyncRef.current = setInterval(() => {
      syncAutomatico();
    }, 120000);

    return () => {
      if (intervaloSyncRef.current) {
        clearInterval(intervaloSyncRef.current);
        intervaloSyncRef.current = null;
      }
    };
  }, [cargar, syncAutomatico]);

  const handleGestionar=async(p:ProcesoNuevoItem)=>{
    setGestionando(true);setErrorGestion('');
    try{
      const res=await fetch('/api/solicitudes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        externalId:p.procesoId||null,codigoProceso:p.codigoProceso,nombreProceso:p.nombre,
        entidad:p.entidad,objeto:p.objeto,fuente:p.fuente,aliasFuente:p.aliasFuente,
        modalidad:p.modalidad,perfil:p.perfil,departamento:p.departamento,
        estadoFuente:p.estadoFuente,fechaPublicacion:p.fechaPublicacion,
        fechaVencimiento:p.fechaVencimiento,valor:p.valor,
        linkDetalle:p.linkDetalle,linkSecop:p.linkSecop,linkSecopReg:p.linkSecopReg,
        usuarioRegistro:sesion.usuario,emailRegistro:sesion.email,
        cargoRegistro:sesion.cargo,entidadRegistro:sesion.entidadGrupo,
        estadoSolicitud:'En revisión',docData:[],procData:{},
      })});
      const data=await res.json();
      if(!res.ok||!data.ok)throw new Error(data.error??'No se pudo crear la solicitud');
      setDetalle(null);onModuleChange('solicitudesAbiertas');
    }catch(e){setErrorGestion(e instanceof Error?e.message:'Error al gestionar.');}finally{setGestionando(false);}
  };

  const fmtFecha=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  const fmtFechaCorta=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});};
  const fmtV=(v:number|null)=>{if(!v||v===0)return'—';return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};

  const filtrados=useMemo(()=>{
    if(!busqueda.trim())return procesos;
    const q=busqueda.toLowerCase();
    return procesos.filter(p=>[p.codigoProceso,p.entidad,p.objeto,p.perfil,p.departamento,p.fuente,p.modalidad].some(v=>(v||'').toLowerCase().includes(q)));
  },[procesos,busqueda]);

  const pagesArr=(()=>{const t=totalPages;if(t<=7)return Array.from({length:t},(_,i)=>i+1);const arr:(number|-1)[]=[];arr.push(1);if(pagina>3)arr.push(-1);for(let i=Math.max(2,pagina-1);i<=Math.min(t-1,pagina+1);i++)arr.push(i);if(pagina<t-2)arr.push(-1);arr.push(t);return arr;})();

  const BTNS_FILTRO:[string,'hoy'|'ayer'|'semana'|'rango'][]=[['Hoy','hoy'],['Ayer','ayer'],['Últimos 7 días','semana'],['Rango','rango']];
  const portalC=(a:string,f:string)=>portalColor(a||'',f||'');
  const perfilC=(p:string|null)=>p?perfilColor(p):{bg:'#F1F5F9',color:'#475569',label:p||'—'};

  return(<>
    {detalle&&(
      <ModalDetalleProceso
        p={{
          id: detalle.procesoId ?? detalle.id,
          nombre: detalle.nombre ?? '',
          codigoProceso: detalle.codigoProceso ?? '',
          entidad: detalle.entidad ?? '',
          objeto: detalle.objeto ?? '',
          fuente: detalle.fuente ?? '',
          aliasFuente: detalle.aliasFuente ?? '',
          modalidad: detalle.modalidad ?? '',
          perfil: detalle.perfil ?? '',
          departamento: detalle.departamento ?? '',
          estado: detalle.estadoFuente ?? '',
          fechaPublicacion: detalle.fechaPublicacion ?? null,
          fechaVencimiento: detalle.fechaVencimiento ?? null,
          valor: detalle.valor ?? null,
          linkDetalle: detalle.linkDetalle ?? '',
          linkSecop: detalle.linkSecop ?? '',
          linkSecopReg: detalle.linkSecopReg ?? '',
          fuentes: [
            ...(detalle.linkSecop ? [{ label: detalle.aliasFuente === 'S2' ? 'SECOP II' : detalle.aliasFuente === 'S1' ? 'SECOP I' : 'Portal', url: detalle.linkSecop }] : []),
            ...(detalle.linkSecopReg ? [{ label: 'Registro', url: detalle.linkSecopReg }] : []),
            ...(detalle.linkDetalle ? [{ label: 'Detalle', url: detalle.linkDetalle }] : []),
          ],
          totalCronogramas: 0,
          totalDocumentos: 0,
          cronogramas: [],
          documentos: [],
        }}
        onClose={() => setDetalle(null)}
      />
    )}

    <div className="content">
      <div className="page-header">
        <div className="page-title"><IcoBusqueda/><span>Procesos nuevos : {filtrados.length} / {total}</span></div>
        <div className="page-actions">
          <input type="text" className="search-box" placeholder="Buscar…" value={busquedaInput} onChange={e=>setBusquedaInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){setBusqueda(busquedaInput);setPagina(1);cargar(1,busquedaInput);}}} disabled={cargando}/>
          <button className="icon-btn" title="Buscar" onClick={()=>{setBusqueda(busquedaInput);setPagina(1);cargar(1,busquedaInput);}} disabled={cargando}><IcoRefresh/></button>        </div>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12,flexWrap:'wrap'}}>
        {BTNS_FILTRO.map(([label,key])=>(
          <button key={key} onClick={()=>{setFiltro(key);setPagina(1);}}
            style={{height:30,padding:'0 14px',borderRadius:20,border:`1.5px solid ${filtro===key?'#1E5799':'#e2e8f0'}`,background:filtro===key?'#1E5799':'white',color:filtro===key?'white':'#374151',fontSize:12,fontWeight:filtro===key?700:400,fontFamily:'var(--font)',cursor:'pointer',transition:'all .15s'}}>
            {label}
          </button>
        ))}
        {filtro==='rango'&&(
          <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:4}}>
            <input type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={{height:30,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 8px',fontSize:12,fontFamily:'var(--font)',color:'#374151',outline:'none'}}/>
            <span style={{fontSize:12,color:'#94a3b8'}}>—</span>
            <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={{height:30,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 8px',fontSize:12,fontFamily:'var(--font)',color:'#374151',outline:'none'}}/>
            <button onClick={()=>cargar(1)} disabled={!desde} style={{height:30,padding:'0 14px',borderRadius:8,background:'#1E5799',color:'white',border:'none',fontSize:12,fontWeight:600,fontFamily:'var(--font)',cursor:desde?'pointer':'not-allowed',opacity:desde?1:.5}}>Buscar</button>
          </div>
        )}
        <span style={{fontSize:11.5,color:'#94a3b8',marginLeft:4}}>
          {filtro==='hoy'&&'Detectados hoy'}
          {filtro==='ayer'&&'Detectados ayer'}
          {filtro==='semana'&&'Últimos 7 días'}
          {filtro==='rango'&&desde&&`Desde ${desde}${hasta?` hasta ${hasta}`:''}`}
        </span>
      </div>

      {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:12,marginBottom:12}}>⚠️ {error}</div>}
      {cargando&&<div className="module-status">Cargando procesos nuevos…</div>}

      {!cargando&&(
        filtrados.length===0
          ?<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:'40px 20px',textAlign:'center' as const,color:'#94a3b8',fontSize:13}}>
            {total===0
              ?<><p style={{margin:'0 0 8px',fontWeight:500}}>No hay procesos nuevos para el período seleccionado.</p><p style={{margin:0,fontSize:12}}>Los procesos nuevos aparecen aquí automáticamente al sincronizar.</p></>
              :`Sin resultados para "${busqueda}".`}
          </div>
          :<div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[{w:148,label:'Fecha detección'},{w:220,label:'Entidad / Cliente'},{w:340,label:'Objeto'},{w:110,label:'F. publicación'},{w:90,label:'Detalle'}].map(({w,label})=>(
                      <th key={label} style={{minWidth:w}}><div className="th-top">{label}</div></th>
                    ))}
                  </tr>
                <tr>{Array.from({length:5}).map((_,i)=><th key={i}><div style={{padding:'0 10px 5px',color:'#d1d5db',fontSize:11}}>≡</div></th>)}</tr>
                </thead>
                <tbody>
                  {filtrados.map(p=>{
                    const pc2=p.perfil?perfilColor(p.perfil):null;
                    const port=portalColor(p.aliasFuente||'',p.fuente||'');
                    return(
                      <tr key={p.id} style={{cursor:'default'}}
                        onMouseOver={e=>{(e.currentTarget as HTMLTableRowElement).style.background='#f8fafc';}}
                        onMouseOut={e=>{(e.currentTarget as HTMLTableRowElement).style.background='white';}}>
                        <td><div style={{display:'flex',flexDirection:'column',gap:1}}><span style={{fontSize:12,fontWeight:600,color:'#1E5799'}}>{fmtFechaCorta(p.fechaDeteccion)}</span><span style={{fontSize:10.5,color:'#94a3b8'}}>{new Date(p.fechaDeteccion).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span></div></td>
                        <td style={{fontSize:12,fontWeight:500,color:'#1e293b'}}>{p.entidad||'—'}</td>
                        <td style={{maxWidth:340}}><div style={{fontSize:12,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:340}} title={p.objeto||''}>{p.objeto||'—'}</div></td>
                        <td style={{fontSize:11,color:'#64748b',whiteSpace:'nowrap'}}>{fmtFechaCorta(p.fechaPublicacion)}</td>
                        <td style={{textAlign:'center' as const}}>
                          <button onClick={()=>setDetalle(p)} title="Ver detalle"
                            style={{width:30,height:30,borderRadius:8,border:'1.5px solid #D0E4F3',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#1E5799',margin:'0 auto',transition:'all .15s'}}
                            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#EAF2FB';(e.currentTarget as HTMLButtonElement).style.borderColor='#1E5799';}}
                            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.borderColor='#D0E4F3';}}>
                            <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:15,height:15}}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination-bar">
              <span>{total>0?`${(pagina-1)*LIMIT+1}–${Math.min(pagina*LIMIT,total)} de ${total.toLocaleString('es-CO')}`:'0 resultados'}</span>
              <div className="pages">
                <button className="page-btn" onClick={()=>{setPagina(p=>p-1);cargar(pagina-1);}} disabled={pagina<=1||cargando}>‹</button>
                {pagesArr.map((n,i)=>n===-1?<span key={`el${i}`} style={{padding:'0 3px',color:'#9ca3af',fontSize:12}}>…</span>:<button key={n} className={`page-btn${n===pagina?' active':''}`} onClick={()=>{if(n!==pagina){setPagina(n);cargar(n);}}} disabled={cargando}>{n}</button>)}
                <button className="page-btn" onClick={()=>{setPagina(p=>p+1);cargar(pagina+1);}} disabled={pagina>=totalPages||cargando}>›</button>
              </div>
            </div>
          </div>
      )}
    </div>
  </>);
}
function Placeholder({nombre}:{nombre:string}){
  return (
    <div className="content">
      <div style={{background:'white',border:'1px solid #e5e7eb',borderRadius:8,padding:22}}>
        <h2 style={{margin:'0 0 8px',fontSize:18,color:'#1f2937'}}>{nombre}</h2>
        <p style={{margin:0,color:'#6b7280',fontSize:13}}>Módulo en construcción.</p>
      </div>
    </div>
  );
}
/* =========================================================
   ROOT
========================================================= */
/* Catálogos de causas para gestión */
const CAUSAS_ESPECIFICAS: Record<string, string[]> = {
  'Indicador': ['Endeudamiento','Razón de cobertura de intereses','Rentabilidad del activo','Rentabilidad del patrimonio','Capital de trabajo'],
  'Condición habilitante': ['Limitado a Mipyme','Establecimiento de comercio'],
  'Criterio técnico / operativo': ['Perfil del personal','Experiencia','Requisitos ponderables'],
  'Condición del proceso': ['Presupuesto insuficiente','Proceso cancelado por la entidad','Excluido por sorteo'],
  'Otro': ['Otro concepto'],
};
const TIPOS_CAUSA = Object.keys(CAUSAS_ESPECIFICAS);
const ESTADOS_ASIGNACION = ['En observación','En proceso','En evaluación','Cerrada'];
const RESULTADOS_CIERRE = ['Adjudicado','No adjudicado','No presentado'];

function ModalGestionAsignacion({sol,asignacion,onClose,onGuardado,sesion}:{sol:Solicitud;asignacion:Record<string,unknown>;onClose:()=>void;onGuardado:(updated:Solicitud)=>void;sesion:Sesion;}){
  const asignacionActual = safeRecord(asignacion);
  const estadoActual = safeString(getRecordValue(asignacionActual, 'estadoAsignacion'), 'Pendiente');
  const [estadoAsig,setEstadoAsig]=React.useState<string>(estadoActual);
  const [tipoCausa,setTipoCausa]=React.useState<string>(safeString(getRecordValue(asignacionActual, 'tipoCausa')));
  const [causaEspecifica,setCausaEspecifica]=React.useState<string>(safeString(getRecordValue(asignacionActual, 'causaEspecifica')));
  const [observacion,setObservacion]=React.useState<string>(safeString(getRecordValue(asignacionActual, 'observacionesGestion')));
  const [resultado,setResultado]=React.useState<string>(safeString(getRecordValue(asignacionActual, 'resultadoFinal')));
  const [indicadores, setIndicadores] = React.useState<IndicadorAsignacion[]>(() => safeArray<IndicadorAsignacion>(asignacion.indicadores));
  const [indForm,setIndForm]=React.useState({valorRequerido:'',valorEvidenciado:'',cumple:'',obs:''});
  const [guardando,setGuardando]=React.useState(false);
  const [cerrando,setCerrando]=React.useState(false);
  const [error,setError]=React.useState('');
  const [verDetalle,setVerDetalle]=React.useState(false);

  const F='var(--font)';
  const FC='#334155';const FC_LABEL='#94a3b8';const FC_DARK='#0f172a';
  const baseText:React.CSSProperties={fontSize:13,color:FC,fontFamily:F,lineHeight:1.5};
  const labelStyle:React.CSSProperties={fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:4};
  const iS:React.CSSProperties={width:'100%',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',fontSize:13,fontFamily:F,color:FC_DARK,outline:'none',background:'white',boxSizing:'border-box' as const};
  const iSdis:React.CSSProperties={...iS,background:'#f8fafc',color:FC_LABEL,cursor:'not-allowed'};

  const fmtV=(v:number|null)=>{if(v==null||isNaN(v)||v===0)return'—';return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};

  const esObservacion=estadoAsig==='En observación';
  const esCierre=estadoAsig==='Cerrada';
  const esEvaluacion=estadoAsig==='En evaluación';
  const esIndicador=tipoCausa==='Indicador';
  const causasEsp=CAUSAS_ESPECIFICAS[tipoCausa]||[];

  const setTipo=(v:string)=>{setTipoCausa(v);setCausaEspecifica('');setIndicadores([]);};

  const pc=sol.perfil?perfilColor(sol.perfil):null;
  const portalInfo=portalColor(sol.aliasFuente||'',sol.fuente||'');

  const agregarIndicador=()=>{
    if(!causaEspecifica||!indForm.valorRequerido||!indForm.valorEvidenciado||!indForm.cumple){
      setError('Completa todos los campos del indicador.');return;
    }
    setError('');
    setIndicadores(prev=>[...prev,{subcausa:causaEspecifica,...indForm}]);
    setIndForm({valorRequerido:'',valorEvidenciado:'',cumple:'',obs:''});
  };

  const guardarEstado=async(nuevoEstadoForzado?:string)=>{
    setError('');
    const nuevoEstado=nuevoEstadoForzado??estadoAsig;

    if(nuevoEstado==='En observación'){
      if(!tipoCausa||!causaEspecifica){setError('Debes seleccionar tipo de causa y causa específica.');return;}
      if(esIndicador&&indicadores.length===0){setError('Agrega al menos un indicador.');return;}
    }
    if(nuevoEstado==='Cerrada'&&estadoActual==='En evaluación'){
      if(!resultado){setError('Debes seleccionar un resultado.');return;}
    }

    nuevoEstadoForzado?setCerrando(true):setGuardando(true);
    try{
      const ahora=new Date();const pad=(n:number)=>String(n).padStart(2,'0');
      const fechaStr=`${ahora.getFullYear()}-${pad(ahora.getMonth()+1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
      const asigs = [...safeArray<Record<string, unknown>>(sol.asignaciones)];
      const idx=asigs.findIndex(a=>a.idAsignacion===asignacion.idAsignacion);
      const estadoReal=nuevoEstado.replace('← ','');
      const nuevoEstadoSol=estadoReal==='Cerrada'?'Cerrada':estadoReal==='En evaluación'?'En evaluación':estadoReal==='En proceso'?'En proceso':estadoReal==='En observación'?'En observación':estadoReal==='Pendiente'?'Asignada':estadoReal==='Asignada'?'Asignada':'Asignada';
      const updatedAsig:Record<string,unknown>={
        ...asignacion,
        estadoAsignacion:estadoReal,
        tipoCausa:tipoCausa||null,
        causaEspecifica:causaEspecifica||null,
        indicadores:esIndicador&&indicadores.length>0?indicadores:null,
        resultadoFinal:estadoReal==='Cerrada'?resultado||null:null,
        observacionesGestion:observacion,
        ultimaActualizacion:fechaStr,
        gestionadoPor:sesion.usuario,
      };
      if(idx>=0)asigs[idx]=updatedAsig;
      const res=await fetch('/api/solicitudes',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sol.id,asignaciones:asigs,estadoSolicitud:nuevoEstadoSol})});
      const data=await res.json();
      if(!res.ok||!data.ok){setError(data.error??'Error al guardar.');return;}
      onGuardado({...sol,...data.solicitud,asignaciones:asigs,estadoSolicitud:nuevoEstadoSol});
      onClose();
    }catch{setError('No se pudo conectar.');}
    finally{setGuardando(false);setCerrando(false);}
  };

  // Estados disponibles según estado actual
  const estadosDisponibles=(()=>{
    if(estadoActual==='Pendiente')return['En observación','En proceso'];
    if(estadoActual==='En observación')return['Pendiente','En proceso'];
    if(estadoActual==='En proceso')return['Asignada','En evaluación'];
    if(estadoActual==='En evaluación')return['En proceso','Cerrada'];
    return[];
  })()

  const puedeGestionarEstado=estadosDisponibles.length>0&&estadoActual!=='Cerrada';
  const puedesCerrarPorObservacion=estadoActual==='En observación';

  return(
    <>
      {verDetalle&&<ModalDetallesProceso sol={sol} onClose={()=>setVerDetalle(false)}/>}
      <div className="modal-overlay" style={{zIndex:1100}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        <div style={{background:'white',borderRadius:12,width:'94vw',maxWidth:760,maxHeight:'92vh',display:'flex',flexDirection:'column' as const,boxShadow:'0 20px 60px rgba(15,32,64,.2)',overflow:'hidden',border:'1px solid #e2e8f0'}}>

          {/* HEADER */}
          <div style={{background:'white',borderBottom:'1px solid #f1f5f9',padding:'16px 24px',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:FC_DARK,fontFamily:F}}>Gestión de asignación</div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
                  <span style={{fontSize:11,color:FC_LABEL,fontFamily:F}}>{String(asignacion.idAsignacion||'—')} · {sol.entidad||'—'}</span>
                  <span style={{display:'inline-flex',alignItems:'center',fontSize:10,fontWeight:600,padding:'1px 8px',borderRadius:999,background:estadoActual==='Cerrada'?'#f1f5f9':estadoActual==='En observación'?'#FFF8E1':estadoActual==='En proceso'?'#EAF2FB':estadoActual==='En evaluación'?'#E8F5E9':'#fef3c7',color:estadoActual==='Cerrada'?'#475569':estadoActual==='En observación'?'#92400e':estadoActual==='En proceso'?'#1e5799':estadoActual==='En evaluación'?'#15803d':'#92400e',fontFamily:F}}>
                    {estadoActual}
                  </span>
                </div>
              </div>
              <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:'1.5px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8'}}
                onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}}
                onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          {/* BODY */}
          <div style={{overflowY:'auto',flex:1,padding:'20px 24px',display:'flex',flexDirection:'column' as const,gap:18}}>
            {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:12,fontFamily:F}}>⚠️ {error}</div>}

            {/* Datos del proceso */}
            <div style={{background:'#f8fafc',border:'1px solid #f1f5f9',borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontSize:10,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:12}}>Datos del proceso</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 24px'}}>
                {[
                  {label:'N° Solicitud',value:`#${sol.id}`},
                  {label:'Analista asignado',value:String(asignacion.analistaAsignado||'—')},
                  {label:'Entidad del grupo',value:pc?.label||'—'},
                  {label:'Ciudad',value:sol.ciudad||sol.departamento||'—'},
                  {label:'No. proceso',value:sol.codigoProceso||'—'},
                  {label:'Presupuesto',value:fmtV(sol.valor)},
                ].map(({label,value},i)=>(
                  <div key={i}>
                    <div style={labelStyle}>{label}</div>
                    <div style={{...baseText,fontSize:12.5}}>{value}</div>
                  </div>
                ))}
                {sol.objeto&&<div style={{gridColumn:'1/-1'}}>
                  <div style={labelStyle}>Descripción</div>
                  <div style={{...baseText,fontSize:12,lineHeight:1.6}}>{sol.objeto.charAt(0).toUpperCase()+sol.objeto.slice(1).toLowerCase()}</div>
                </div>}
              </div>
              <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #f1f5f9'}}>
                <button onClick={()=>setVerDetalle(true)}
                  style={{display:'inline-flex',alignItems:'center',gap:6,height:30,padding:'0 14px',borderRadius:7,border:'1.5px solid #1e5799',background:'white',color:'#1e5799',fontSize:12,fontWeight:600,fontFamily:F,cursor:'pointer'}}
                  onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#eff6ff';}}
                  onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}>
                  <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V8.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0014.586 2H5a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                  Ver datos del proceso
                </button>
              </div>
            </div>

            {/* Si está cerrada — mostrar resumen */}
            {estadoActual==='Cerrada'&&(
              <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'14px 16px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#15803d',letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:10}}>Asignación cerrada</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 24px'}}>
                  {String(asignacion.tipoCausa||'')&&<div><div style={labelStyle}>Tipo de causa</div><div style={{...baseText,fontSize:12.5}}>{String(asignacion.tipoCausa)}</div></div>}
                  {String(asignacion.causaEspecifica||'')&&<div><div style={labelStyle}>Causa específica</div><div style={{...baseText,fontSize:12.5}}>{String(asignacion.causaEspecifica)}</div></div>}
                  {String(asignacion.resultadoFinal||'')&&<div><div style={labelStyle}>Resultado</div><div style={{...baseText,fontSize:12.5,fontWeight:600}}>{String(asignacion.resultadoFinal)}</div></div>}
                  {String(asignacion.observacionesGestion||'')&&<div style={{gridColumn:'1/-1'}}><div style={labelStyle}>Observaciones</div><div style={{...baseText,fontSize:12}}>{String(asignacion.observacionesGestion)}</div></div>}
                </div>
              </div>
            )}

            {/* Gestión — solo si no está cerrada */}
            {puedeGestionarEstado&&(
              <div>
                <div style={{fontSize:11,fontWeight:700,color:FC_DARK,fontFamily:F,marginBottom:14,paddingBottom:8,borderBottom:'1px solid #f1f5f9'}}>
                  Avanzar estado
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 20px'}}>

                  {/* Selector estado */}
                  <div>
                    <div style={labelStyle}>Nuevo estado *</div>
                    <select style={iS} value={estadoAsig} onChange={e=>setEstadoAsig(e.target.value)}>
                      {estadosDisponibles.map(e=><option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>

                  {/* Resultado — solo En evaluación → Cerrada */}
                  {esCierre&&(
                    <div>
                      <div style={labelStyle}>Resultado *</div>
                      <select style={iS} value={resultado} onChange={e=>setResultado(e.target.value)}>
                        <option value="">— Seleccione —</option>
                        {RESULTADOS_CIERRE.map(r=><option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Causa — solo En observación */}
                  {esObservacion&&<>
                    <div>
                      <div style={labelStyle}>Tipo de causa *</div>
                      <select style={iS} value={tipoCausa} onChange={e=>setTipo(e.target.value)}>
                        <option value="">— Seleccione —</option>
                        {TIPOS_CAUSA.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {tipoCausa&&<div>
                      <div style={labelStyle}>Causa específica *</div>
                      <select style={iS} value={causaEspecifica} onChange={e=>setCausaEspecifica(e.target.value)}>
                        <option value="">— Seleccione —</option>
                        {causasEsp.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>}

                    {/* Indicadores */}
                    {esIndicador&&causaEspecifica&&<div style={{gridColumn:'1/-1'}}>
                      {indicadores.length>0&&(
                        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px',marginBottom:10,display:'flex',flexDirection:'column' as const,gap:6}}>
                          <div style={{fontSize:10,fontWeight:700,color:FC_LABEL,fontFamily:F,letterSpacing:'0.08em',textTransform:'uppercase' as const,marginBottom:2}}>
                            Indicadores registrados · {indicadores.length}
                          </div>
                          {indicadores.map((ind,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:'white',border:'1px solid #e2e8f0',borderRadius:7,padding:'7px 10px'}}>
                              <div style={{width:18,height:18,borderRadius:'50%',background:ind.cumple==='Sí'?'#E8F5E9':'#FFEBEE',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                {ind.cumple==='Sí'
                                  ?<svg fill="none" stroke="#15803d" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M20 6L9 17l-5-5"/></svg>
                                  :<svg fill="none" stroke="#dc2626" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M18 6L6 18M6 6l12 12"/></svg>
                                }
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:600,color:FC_DARK,fontFamily:F}}>{ind.subcausa}</div>
                                <div style={{fontSize:10.5,color:FC_LABEL,fontFamily:F}}>Req: {ind.valorRequerido} · Evid: {ind.valorEvidenciado} · {ind.cumple==='Sí'?'Cumple':'No cumple'}</div>
                              </div>
                              <button onClick={()=>setIndicadores(prev=>prev.filter((_,idx)=>idx!==i))}
                                style={{width:20,height:20,borderRadius:'50%',border:'1px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',padding:0,flexShrink:0}}
                                onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.color='#ef4444';(e.currentTarget as HTMLButtonElement).style.borderColor='#fca5a5';}}
                                onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';(e.currentTarget as HTMLButtonElement).style.borderColor='#e2e8f0';}}>
                                <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{background:'#f8fafc',borderRadius:8,padding:'12px 14px',border:'1px dashed #d1d5db'}}>
                        <div style={{fontSize:10,fontWeight:700,color:FC_LABEL,fontFamily:F,letterSpacing:'0.08em',textTransform:'uppercase' as const,marginBottom:10}}>
                          Agregar indicador · {causaEspecifica}
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                          <div>
                            <div style={{fontSize:11,fontWeight:600,color:'#374151',fontFamily:F,marginBottom:4}}>Valor requerido *</div>
                            <input style={{...iS,height:34}} placeholder="Ej. 1,5" value={indForm.valorRequerido} onChange={e=>setIndForm(p=>({...p,valorRequerido:e.target.value}))}/>
                          </div>
                          <div>
                            <div style={{fontSize:11,fontWeight:600,color:'#374151',fontFamily:F,marginBottom:4}}>Valor evidenciado *</div>
                            <input style={{...iS,height:34}} placeholder="Ej. 1,2" value={indForm.valorEvidenciado} onChange={e=>setIndForm(p=>({...p,valorEvidenciado:e.target.value}))}/>
                          </div>
                          <div>
                            <div style={{fontSize:11,fontWeight:600,color:'#374151',fontFamily:F,marginBottom:4}}>¿Cumple? *</div>
                            <select style={{...iS,height:34}} value={indForm.cumple} onChange={e=>setIndForm(p=>({...p,cumple:e.target.value}))}>
                              <option value="">—</option>
                              <option value="Sí">Sí</option>
                              <option value="No">No</option>
                            </select>
                          </div>
                        </div>
                        <div style={{marginBottom:8}}>
                          <div style={{fontSize:11,fontWeight:600,color:'#374151',fontFamily:F,marginBottom:4}}>Observación técnica</div>
                          <textarea style={{...iS,height:52,padding:'6px 12px',resize:'vertical' as const,lineHeight:1.5}} placeholder="Detalle técnico…" value={indForm.obs} onChange={e=>setIndForm(p=>({...p,obs:e.target.value}))}/>
                        </div>
                        <button onClick={agregarIndicador}
                          style={{height:30,padding:'0 14px',borderRadius:7,background:'#1e5799',color:'white',border:'none',fontSize:12,fontWeight:600,fontFamily:F,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5}}>
                          <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M12 5v14M5 12h14"/></svg>
                          Agregar
                        </button>
                      </div>
                    </div>}
                  </>}

                  {/* Observación general */}
                  <div style={{gridColumn:'1/-1'}}>
                    <div style={labelStyle}>Observaciones de gestión</div>
                    <textarea style={{...iS,height:72,padding:'8px 12px',resize:'vertical' as const,lineHeight:1.5}}
                      value={observacion} onChange={e=>setObservacion(e.target.value)}
                      placeholder="Registre novedades, avances o acuerdos…"/>
                  </div>
                </div>

                {/* Avisos */}
                {esObservacion&&tipoCausa&&causaEspecifica&&(
                  <div style={{marginTop:12,background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#9a3412',fontFamily:F}}>
                    ⚠️ La asignación quedará en espera (<strong>En observación</strong>) con causa: <strong>{tipoCausa} → {causaEspecifica}</strong>
                  </div>
                )}
                {esCierre&&resultado&&(
                  <div style={{marginTop:12,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#14532d',fontFamily:F}}>
                    ✓ La asignación quedará <strong>Cerrada</strong> con resultado: <strong>{resultado}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Cerrar por observación — solo si está en En observación */}
            {puedesCerrarPorObservacion&&(
              <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:10,padding:'14px 16px'}}>
                <div style={{fontSize:11,fontWeight:700,color:'#92400e',fontFamily:F,marginBottom:6}}>Cerrar por observación</div>
                <div style={{fontSize:12,color:'#78350f',fontFamily:F,marginBottom:10,lineHeight:1.5}}>
                  Si la entidad no resolvió favorablemente la observación, puedes cerrar la asignación con la causa ya registrada.
                </div>
                <div style={{marginBottom:10}}>
                  <div style={labelStyle}>Resultado *</div>
                  <select style={{...iS,maxWidth:280}} value={resultado} onChange={e=>setResultado(e.target.value)}>
                    <option value="">— Seleccione resultado —</option>
                    {RESULTADOS_CIERRE.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button onClick={()=>guardarEstado('Cerrada')} disabled={cerrando||!resultado}
                  style={{height:34,padding:'0 16px',borderRadius:8,background:cerrando||!resultado?'#d97706':'#b45309',color:'white',border:'none',fontSize:12,fontWeight:600,fontFamily:F,cursor:cerrando||!resultado?'not-allowed':'pointer',display:'inline-flex',alignItems:'center',gap:6,transition:'all .15s'}}
                  onMouseOver={e=>{if(!cerrando&&resultado)(e.currentTarget as HTMLButtonElement).style.background='#92400e';}}
                  onMouseOut={e=>{if(!cerrando&&resultado)(e.currentTarget as HTMLButtonElement).style.background='#b45309';}}>
                  <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  {cerrando?'Cerrando…':'Cerrar por observación'}
                </button>
              </div>
            )}
          </div>

          {/* FOOTER */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 24px',borderTop:'1px solid #f1f5f9',background:'white',flexShrink:0}}>
            <div style={{fontSize:11,color:FC_LABEL,fontFamily:F}}>
              Asignado por: {String(asignacion.asignadoPor||'—')} · {String(asignacion.fechaAsignacion||'—').slice(0,10)}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={onClose} disabled={guardando||cerrando}
                style={{height:36,padding:'0 16px',borderRadius:8,border:'1.5px solid #e2e8f0',background:'white',color:'#475569',fontSize:12.5,fontFamily:F,cursor:'pointer'}}>
                Cancelar
              </button>
              {puedeGestionarEstado&&(
                <button onClick={()=>guardarEstado()} disabled={guardando||cerrando}
                  style={{height:36,padding:'0 20px',borderRadius:8,background:guardando?'#6b93c4':'#1e5799',color:'white',border:'none',fontSize:12.5,fontWeight:600,fontFamily:F,cursor:guardando?'not-allowed':'pointer',transition:'all .15s'}}
                  onMouseOver={e=>{if(!guardando)(e.currentTarget as HTMLButtonElement).style.background='#174a85';}}
                  onMouseOut={e=>{if(!guardando)(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
                  {guardando?'Guardando…':'Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function GestionAsignacionInline({
  sol,
  asignacion,
  sesion,
  onVolver,
  onGuardado
}: {
  sol: Solicitud;
  asignacion: Record<string, unknown>;
  sesion: Sesion;
  onVolver: () => void;
  onGuardado: (u: Solicitud) => void;
}) {
  const estadoActual = String(asignacion.estadoAsignacion || 'Pendiente');

  const [estadoAsig, setEstadoAsig] = React.useState<string>(() => {
    if (estadoActual === 'Pendiente' || estadoActual === 'Asignada') return 'En observación';
    if (estadoActual === 'En observación') return 'En proceso';
    if (estadoActual === 'En proceso') return 'En evaluación';
    if (estadoActual === 'En evaluación') return 'Cerrada';
    return 'En proceso';
  });
  const asignacionActual = safeRecord(asignacion);
  const [tipoCausa,setTipoCausa]=React.useState<string>(safeString(getRecordValue(asignacionActual, 'tipoCausa')));
  const [causaEspecifica,setCausaEspecifica]=React.useState<string>(safeString(getRecordValue(asignacionActual, 'causaEspecifica')));
  const [observacion,setObservacion]=React.useState<string>(safeString(getRecordValue(asignacionActual, 'observacionesGestion')));
  const [resultado,setResultado]=React.useState<string>(safeString(getRecordValue(asignacionActual, 'resultadoFinal')));
  const [indicadores, setIndicadores] = React.useState<IndicadorAsignacion[]>(() => safeArray<IndicadorAsignacion>(asignacion.indicadores));
  const [indForm,setIndForm]=React.useState({valorRequerido:'',valorEvidenciado:'',cumple:'',obs:''});
  const [guardando,setGuardando]=React.useState(false);
  const [cerrando,setCerrando]=React.useState(false);
  const [error,setError]=React.useState('');

  const F='var(--font)';
  const FC='#334155';const FC_LABEL='#94a3b8';const FC_DARK='#0f172a';
  const iS:React.CSSProperties={width:'100%',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',fontSize:13,fontFamily:F,color:FC_DARK,outline:'none',background:'white',boxSizing:'border-box' as const};
  const lbl:React.CSSProperties={fontSize:11,fontWeight:600,color:'#374151',fontFamily:F,marginBottom:5,display:'block' as const};

  const esObservacion=estadoAsig==='En observación';
  const esCierre=estadoAsig==='Cerrada';
  const esIndicador=tipoCausa==='Indicador';
  const causasEsp=CAUSAS_ESPECIFICAS[tipoCausa]||[];
  const setTipo=(v:string)=>{setTipoCausa(v);setCausaEspecifica('');setIndicadores([]);};

  const fmtV=(v:number|null)=>{if(v==null||isNaN(v)||v===0)return'—';return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};
  const pc=sol.perfil?perfilColor(sol.perfil):null;

  const estadosDisponibles=(()=>{
    if(estadoActual==='Pendiente')return['En observación','En proceso'];
    if(estadoActual==='En observación')return['← Pendiente','En proceso'];
    if(estadoActual==='En proceso')return['← Pendiente','En evaluación'];
    if(estadoActual==='En evaluación')return['← En proceso','Cerrada'];
    if(estadoActual==='Asignada')return['En observación','En proceso'];
    return['En observación','En proceso'];
  })();

  const puedesCerrarPorObservacion=estadoActual==='En observación';

  const agregarIndicador=()=>{
    if(!causaEspecifica||!indForm.valorRequerido||!indForm.valorEvidenciado||!indForm.cumple){
      setError('Completa todos los campos del indicador.');return;
    }
    setError('');
    setIndicadores(prev=>[...prev,{subcausa:causaEspecifica,...indForm}]);
    setIndForm({valorRequerido:'',valorEvidenciado:'',cumple:'',obs:''});
  };

  const guardarEstado=async(nuevoEstadoForzado?:string)=>{
    setError('');
    const nuevoEstado=nuevoEstadoForzado??estadoAsig;
    if(nuevoEstado==='En observación'){
      if(!tipoCausa||!causaEspecifica){setError('Selecciona tipo de causa y causa específica.');return;}
      if(esIndicador&&indicadores.length===0){setError('Agrega al menos un indicador.');return;}
    }
    if(nuevoEstado==='Cerrada'&&!resultado){setError('Selecciona un resultado.');return;}
    nuevoEstadoForzado?setCerrando(true):setGuardando(true);
    try{
      const ahora=new Date();const pad=(n:number)=>String(n).padStart(2,'0');
      const fechaStr=`${ahora.getFullYear()}-${pad(ahora.getMonth()+1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;
      const asigs = [...safeArray<Record<string, unknown>>(sol.asignaciones)];
      const idx=asigs.findIndex(a=>a.idAsignacion===asignacion.idAsignacion);
      const estadoReal=nuevoEstado.replace('← ','');
      const nuevoEstadoSol=estadoReal==='Cerrada'?'Cerrada':estadoReal==='En evaluación'?'En evaluación':estadoReal==='En proceso'?'En proceso':estadoReal==='En observación'?'En observación':estadoReal==='Pendiente'?'Asignada':estadoReal==='Asignada'?'Asignada':'Asignada';
      const updatedAsig:Record<string,unknown>={
        ...asignacion,
        estadoAsignacion:estadoReal,
        tipoCausa:tipoCausa||null,
        causaEspecifica:causaEspecifica||null,
        indicadores:esIndicador&&indicadores.length>0?indicadores:null,
        resultadoFinal:estadoReal==='Cerrada'?resultado||null:null,
        observacionesGestion:observacion,
        ultimaActualizacion:fechaStr,
        gestionadoPor:sesion.usuario,
      };
      if(idx>=0)asigs[idx]=updatedAsig;
      const res=await fetch('/api/solicitudes',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sol.id,asignaciones:asigs,estadoSolicitud:nuevoEstadoSol})});
      const data=await res.json();
      if(!res.ok||!data.ok){setError(data.error??'Error al guardar.');return;}
      onGuardado({...sol,...data.solicitud,asignaciones:asigs,estadoSolicitud:nuevoEstadoSol});
    }catch{setError('No se pudo conectar.');}
    finally{setGuardando(false);setCerrando(false);}
  };

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'#f8fafc'}}>

      {/* BARRA */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'0 24px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:0}}>
          <button onClick={onVolver}
            style={{display:'inline-flex',alignItems:'center',gap:5,height:44,padding:'0 14px 0 0',border:'none',borderRight:'1px solid #e2e8f0',background:'transparent',color:'#475569',fontSize:12,fontWeight:500,fontFamily:F,cursor:'pointer',flexShrink:0,marginRight:16}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.color='#1e5799';}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.color='#475569';}}>
            <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Volver a la ficha
          </button>
          <span style={{fontSize:13,fontWeight:600,color:FC_DARK,fontFamily:F}}>Gestión de asignación</span>
          <span style={{marginLeft:10,fontSize:11,color:FC_LABEL,fontFamily:F}}>{String(asignacion.idAsignacion||'—')} · {sol.entidad||'—'}</span>
        </div>
      </div>

      {/* Contenido principal */}
      <div style={{flex:1,overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column' as const,gap:16,scrollbarWidth:'thin' as const}}>
        {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:12,fontFamily:F}}>⚠️ {error}</div>}

        {/* Resumen proceso */}
        <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'16px'}}>
          <div style={{fontSize:10,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:12}}>Datos del proceso</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px 24px'}}>
            {[
              {label:'N° Solicitud',value:`#${sol.id}`},
              {label:'Responsable',value:String(asignacion.analistaAsignado||'—')},
              {label:'Entidad del grupo',value:pc?.label||'—'},
              {label:'Ciudad',value:sol.ciudad||sol.departamento||'—'},
              {label:'No. proceso',value:sol.codigoProceso||'—'},
              {label:'Presupuesto',value:fmtV(sol.valor)},
            ].map(({label,value},i)=>(
              <div key={i}>
                <div style={{fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:3}}>{label}</div>
                <div style={{fontSize:12.5,color:FC_DARK,fontFamily:F}}>{value}</div>
              </div>
            ))}
            {sol.objeto&&<div style={{gridColumn:'1/-1'}}>
              <div style={{fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:3}}>Descripción</div>
              <div style={{fontSize:12,color:FC,fontFamily:F,lineHeight:1.6}}>{sol.objeto.charAt(0).toUpperCase()+sol.objeto.slice(1).toLowerCase()}</div>
            </div>}
          </div>
        </div>

        {/* Estado actual */}
        {estadoActual==='Cerrada'?(
          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'16px'}}>
            <div style={{fontSize:10,fontWeight:700,color:'#15803d',letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:10}}>Asignación cerrada</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 24px'}}>
              {String(asignacion.tipoCausa||'')&&<div><div style={{fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:3}}>Tipo de causa</div><div style={{fontSize:12.5,color:FC_DARK,fontFamily:F}}>{String(asignacion.tipoCausa)}</div></div>}
              {String(asignacion.causaEspecifica||'')&&<div><div style={{fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:3}}>Causa específica</div><div style={{fontSize:12.5,color:FC_DARK,fontFamily:F}}>{String(asignacion.causaEspecifica)}</div></div>}
              {String(asignacion.resultadoFinal||'')&&<div><div style={{fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:3}}>Resultado</div><div style={{fontSize:12.5,fontWeight:600,color:FC_DARK,fontFamily:F}}>{String(asignacion.resultadoFinal)}</div></div>}
              {String(asignacion.observacionesGestion||'')&&<div style={{gridColumn:'1/-1'}}><div style={{fontSize:9,fontWeight:700,color:FC_LABEL,letterSpacing:'0.1em',textTransform:'uppercase' as const,fontFamily:F,marginBottom:3}}>Observaciones</div><div style={{fontSize:12,color:FC,fontFamily:F,lineHeight:1.6}}>{String(asignacion.observacionesGestion)}</div></div>}
            </div>
          </div>
        ):(
          <>
            {/* Avanzar estado */}
            {estadosDisponibles.length>0&&(
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'16px'}}>
                <div style={{fontSize:11,fontWeight:700,color:FC_DARK,fontFamily:F,marginBottom:16,paddingBottom:10,borderBottom:'1px solid #f1f5f9'}}>Avanzar estado</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 20px'}}>

                  <div>
                    <label style={lbl}>Nuevo estado *</label>
                    <select style={iS} value={estadoAsig} onChange={e=>setEstadoAsig(e.target.value)}>
                      {estadosDisponibles.map(e=><option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>

                  {esCierre&&<div>
                    <label style={lbl}>Resultado *</label>
                    <select style={iS} value={resultado} onChange={e=>setResultado(e.target.value)}>
                      <option value="">— Seleccione —</option>
                      {RESULTADOS_CIERRE.map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>}

                  {esObservacion&&<>
                    <div>
                      <label style={lbl}>Tipo de causa *</label>
                      <select style={iS} value={tipoCausa} onChange={e=>setTipo(e.target.value)}>
                        <option value="">— Seleccione —</option>
                        {TIPOS_CAUSA.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {tipoCausa&&<div>
                      <label style={lbl}>Causa específica *</label>
                      <select style={iS} value={causaEspecifica} onChange={e=>setCausaEspecifica(e.target.value)}>
                        <option value="">— Seleccione —</option>
                        {causasEsp.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>}

                    {esIndicador&&causaEspecifica&&<div style={{gridColumn:'1/-1'}}>
                      {indicadores.length>0&&(
                        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px',marginBottom:10,display:'flex',flexDirection:'column' as const,gap:6}}>
                          <div style={{fontSize:10,fontWeight:700,color:FC_LABEL,fontFamily:F,textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:2}}>Indicadores registrados · {indicadores.length}</div>
                          {indicadores.map((ind,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:'white',border:'1px solid #e2e8f0',borderRadius:7,padding:'7px 10px'}}>
                              <div style={{width:18,height:18,borderRadius:'50%',background:ind.cumple==='Sí'?'#E8F5E9':'#FFEBEE',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                {ind.cumple==='Sí'?<svg fill="none" stroke="#15803d" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M20 6L9 17l-5-5"/></svg>:<svg fill="none" stroke="#dc2626" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M18 6L6 18M6 6l12 12"/></svg>}
                              </div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:600,color:FC_DARK,fontFamily:F}}>{ind.subcausa}</div>
                                <div style={{fontSize:10.5,color:FC_LABEL,fontFamily:F}}>Req: {ind.valorRequerido} · Evid: {ind.valorEvidenciado} · {ind.cumple==='Sí'?'Cumple':'No cumple'}</div>
                              </div>
                              <button onClick={()=>setIndicadores(prev=>prev.filter((_,idx)=>idx!==i))} style={{width:20,height:20,borderRadius:'50%',border:'1px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',padding:0,flexShrink:0}} onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';}}>
                                <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M18 6L6 18M6 6l12 12"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{background:'#f8fafc',borderRadius:8,padding:'12px 14px',border:'1px dashed #d1d5db'}}>
                        <div style={{fontSize:10,fontWeight:700,color:FC_LABEL,fontFamily:F,textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:10}}>Agregar indicador · {causaEspecifica}</div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                          <div><label style={lbl}>Valor requerido *</label><input style={{...iS,height:34}} placeholder="Ej. 1,5" value={indForm.valorRequerido} onChange={e=>setIndForm(p=>({...p,valorRequerido:e.target.value}))}/></div>
                          <div><label style={lbl}>Valor evidenciado *</label><input style={{...iS,height:34}} placeholder="Ej. 1,2" value={indForm.valorEvidenciado} onChange={e=>setIndForm(p=>({...p,valorEvidenciado:e.target.value}))}/></div>
                          <div><label style={lbl}>¿Cumple? *</label><select style={{...iS,height:34}} value={indForm.cumple} onChange={e=>setIndForm(p=>({...p,cumple:e.target.value}))}><option value="">—</option><option value="Sí">Sí</option><option value="No">No</option></select></div>
                        </div>
                        <div style={{marginBottom:8}}><label style={lbl}>Observación técnica</label><textarea style={{...iS,height:52,padding:'6px 12px',resize:'vertical' as const,lineHeight:1.5}} placeholder="Detalle técnico…" value={indForm.obs} onChange={e=>setIndForm(p=>({...p,obs:e.target.value}))}/></div>
                        <button onClick={agregarIndicador} style={{height:30,padding:'0 14px',borderRadius:7,background:'#1e5799',color:'white',border:'none',fontSize:12,fontWeight:600,fontFamily:F,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5}}>
                          <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M12 5v14M5 12h14"/></svg>Agregar
                        </button>
                      </div>
                    </div>}
                  </>}

                  <div style={{gridColumn:'1/-1'}}>
                    <label style={lbl}>Observaciones de gestión</label>
                    <textarea style={{...iS,height:80,padding:'8px 12px',resize:'vertical' as const,lineHeight:1.5}} value={observacion} onChange={e=>setObservacion(e.target.value)} placeholder="Registre novedades, avances o acuerdos…"/>
                  </div>
                </div>

                {esObservacion&&tipoCausa&&causaEspecifica&&(
                  <div style={{marginTop:12,background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#9a3412',fontFamily:F}}>
                    ⚠️ La asignación quedará en espera (<strong>En observación</strong>) con causa: <strong>{tipoCausa} → {causaEspecifica}</strong>
                  </div>
                )}
                {esCierre&&resultado&&(
                  <div style={{marginTop:12,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#14532d',fontFamily:F}}>
                    ✓ La asignación quedará <strong>Cerrada</strong> con resultado: <strong>{resultado}</strong>
                  </div>
                )}

                <div style={{marginTop:16,display:'flex',justifyContent:'flex-end'}}>
                  <button onClick={()=>guardarEstado()} disabled={guardando}
                    style={{height:38,padding:'0 28px',borderRadius:8,background:guardando?'#6b93c4':'#1e5799',color:'white',border:'none',fontSize:13,fontWeight:600,fontFamily:F,cursor:guardando?'not-allowed':'pointer',transition:'all .15s'}}
                    onMouseOver={e=>{if(!guardando)(e.currentTarget as HTMLButtonElement).style.background='#174a85';}}
                    onMouseOut={e=>{if(!guardando)(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
                    {guardando?'Guardando…':'Guardar'}
                  </button>
                </div>
              </div>
            )}

            {/* Cerrar por observación */}
            {puedesCerrarPorObservacion&&(
              <div style={{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:10,padding:'16px'}}>
                <div style={{fontSize:11,fontWeight:700,color:'#92400e',fontFamily:F,marginBottom:6}}>Cerrar por observación</div>
                <div style={{fontSize:12,color:'#78350f',fontFamily:F,marginBottom:12,lineHeight:1.5}}>
                  Si la entidad no resolvió favorablemente la observación, cierra la asignación con la causa ya registrada.
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{...lbl,color:'#92400e'}}>Resultado *</label>
                  <select style={{...iS,maxWidth:280}} value={resultado} onChange={e=>setResultado(e.target.value)}>
                    <option value="">— Seleccione resultado —</option>
                    {RESULTADOS_CIERRE.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button onClick={()=>guardarEstado('Cerrada')} disabled={cerrando||!resultado}
                  style={{height:34,padding:'0 16px',borderRadius:8,background:cerrando||!resultado?'#d97706':'#b45309',color:'white',border:'none',fontSize:12,fontWeight:600,fontFamily:F,cursor:cerrando||!resultado?'not-allowed':'pointer',display:'inline-flex',alignItems:'center',gap:6,transition:'all .15s'}}
                  onMouseOver={e=>{if(!cerrando&&resultado)(e.currentTarget as HTMLButtonElement).style.background='#92400e';}}
                  onMouseOut={e=>{if(!cerrando&&resultado)(e.currentTarget as HTMLButtonElement).style.background='#b45309';}}>
                  <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  {cerrando?'Cerrando…':'Cerrar por observación'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   VISTA FICHA ASIGNACION
========================================================= */
function VistFichaAsignacion({sol,sesion,onVolver,onGuardado}:{sol:Solicitud;sesion:Sesion;onVolver:()=>void;onGuardado:(u:Solicitud)=>void;}){
  const [tabActiva,setTabActiva]=React.useState<'resumen'|'requisitos'|'cronograma'|'documentacion'|'adendas'>('resumen');
  const [docVista,setDocVista]=React.useState<'grid'|'list'>('list');
  const [adendas,setAdendas]=React.useState<Array<{
  id:number;
  nombre:string;
  urlDocumento:string|null;
  tipoDocumento?:string|null;
  fechaDetectado:string;
}>>([]);
  const [cargandoAdendas,setCargandoAdendas]=React.useState(false);
  const [gestionAsig,setGestionAsig]=React.useState<Record<string,unknown>|null>(null);

  const F='var(--font)';
  const FC='#334155';const FC_LABEL='#6b7280';const FC_DARK='#0f172a';

  const asignaciones = safeArray<Record<string, unknown>>(sol.asignaciones);
  const asigActual=asignaciones[asignaciones.length-1]||{};
  const estadoAsig = safeString(asigActual.estadoAsignacion, 'Pendiente');

  const analistaAsignadoTexto = safeString(asigActual.analistaAsignado, '—');
  const analistaIniciales = safeString(asigActual.analistaAsignado, '?')
    .slice(0, 2)
    .toUpperCase();
  const analistaCargoTexto = safeString(asigActual.analistaCargo);
  const idAsignacionTexto = safeString(asigActual.idAsignacion, '—');
  const fechaAsignacionTexto = safeString(asigActual.fechaAsignacion, '—').slice(0, 10);
  const asignadoPorTexto = safeString(asigActual.asignadoPor, '—');
  const tipoCausaTexto = safeString(asigActual.tipoCausa);
  const causaEspecificaTexto = safeString(asigActual.causaEspecifica, '—');
  const resultadoFinalTexto = safeString(asigActual.resultadoFinal);

  const pc=sol.perfil?perfilColor(sol.perfil):null;
  const fmtFH=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});};
  const fmtV=(v:number|null)=>{if(v==null||isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};
  const ebFuente=estadoBadgeColor(sol.estadoFuente||'');
  const docArr = safeArray<DocumentoDinamico>(sol.docData);
  const procDataEntries = Object.entries(sol.procData || {}).filter(([, v]) => Boolean(v?.fechaI || v?.obs));
  const urlFuente=sol.linkSecop||sol.linkDetalle||sol.linkSecopReg||'';
  const modalidadDisplay=(()=>{const m=sol.modalidad?.trim();if(!m||m==='—')return'—';return MMAP_MODALIDAD[m]??m;})();
  const fuenteDisplay=sol.fuente?sol.fuente.charAt(0).toUpperCase()+sol.fuente.slice(1):'—';
  const esEspecializada=String(sol.origenSolicitud||'').toLowerCase().includes('especial');
  const solE = {
    nitContacto: safeString(sol.nitContacto),
    personaContacto: safeString(sol.personaContacto),
    telefonoContacto: safeString(sol.telefonoContacto),
    direccionContacto: safeString(sol.direccionContacto),
    correoContacto: safeString(sol.correoContacto),
  };

  const getDocExt=(url:string,nombre?:string)=>{
    const s=(url||'').toLowerCase();const n=(nombre||'').toLowerCase();
    if(s.indexOf('.xlsx')>=0||s.indexOf('.xls')>=0||n.indexOf('excel')>=0)return{bg:'#f0fdf4',color:'#15803d',label:'XLS'};
    if(s.indexOf('.docx')>=0||s.indexOf('.doc')>=0||n.indexOf('word')>=0)return{bg:'#eff6ff',color:'#1d4ed8',label:'DOC'};
    if(s.indexOf('.zip')>=0||s.indexOf('.rar')>=0)return{bg:'#faf5ff',color:'#7e22ce',label:'ZIP'};
    return{bg:'#fff1f2',color:'#be123c',label:'PDF'};
  };

  React.useEffect(()=>{
  const procesoId=Number(sol.procesoId);

  if(!Number.isInteger(procesoId)||procesoId<=0){
    setAdendas([]);
    return;
  }

  setCargandoAdendas(true);

  fetch(`/api/procesos/${procesoId}/adendas`)
    .then(r=>r.json())
    .then(data=>{
      const lista=Array.isArray(data?.adendas)
        ? data.adendas
        : Array.isArray(data?.data)
          ? data.data
          : [];

      setAdendas(lista);
    })
    .catch(()=>{
      setAdendas([]);
    })
    .finally(()=>{
      setCargandoAdendas(false);
    });
},[sol.procesoId]);

  const estadoAsigColor=(e:string)=>{
    const s=e.toLowerCase();
    if(s.includes('pendiente'))return{bg:'#fef3c7',color:'#92400e'};
    if(s.includes('observaci'))return{bg:'#fff7ed',color:'#9a3412'};
    if(s.includes('proceso'))return{bg:'#EAF2FB',color:'#1e5799'};
    if(s.includes('evaluaci'))return{bg:'#E8F5E9',color:'#15803d'};
    if(s.includes('cerrada')||s.includes('cerrado'))return{bg:'#f1f5f9',color:'#475569'};
    return{bg:'#f1f5f9',color:'#475569'};
  };

  const MetaItem=({icon,label,badge}:{icon:React.ReactNode;label:string;badge:React.ReactNode})=>(
    <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontFamily:F,color:FC,flexShrink:0,minWidth:0}}>
      <span style={{color:'#94a3b8',display:'flex',alignItems:'center'}}>{icon}</span>
      <span style={{fontWeight:600,color:FC_DARK}}>{label}:</span>
      {badge}
    </div>
  );
  const sep=<div style={{width:1,height:14,background:'#cbd5e1',flexShrink:0}}/>;

  const TABS:[string,typeof tabActiva][]=[['Resumen','resumen'],['Requisitos','requisitos'],['Cronograma','cronograma'],['Documentación','documentacion'],['Adendas','adendas']];

  if(gestionAsig){
    return(
      <GestionAsignacionInline
        sol={sol}
        asignacion={gestionAsig}
        sesion={sesion}
        onVolver={()=>setGestionAsig(null)}
        onGuardado={(updated)=>{
          onGuardado(updated);
          setGestionAsig(null);
        }}
      />
    );
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'#f8fafc'}}>

      {/* Barra de información principal */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'4px 24px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'nowrap' as const,overflow:'hidden'}}>
          {sol.estadoFuente&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>} label="Estado" badge={<span style={{display:'inline-flex',alignItems:'center',fontSize:10,fontWeight:600,color:ebFuente.color,background:ebFuente.bg,padding:'1px 7px',borderRadius:999,fontFamily:F}}>{sol.estadoFuente}</span>}/>{sep}</>}
          {fmtV(sol.valor)&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} label="Presupuesto" badge={<span style={{fontWeight:600,color:'#475569',fontFamily:F,fontSize:10}}>{fmtV(sol.valor)}</span>}/>{sep}</>}
          {pc&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5"/></svg>} label="Perfil" badge={<span style={{display:'inline-flex',alignItems:'center',fontSize:10,fontWeight:600,color:'white',background:pc.color,padding:'1px 7px',borderRadius:999,fontFamily:F}}>{pc.label}</span>}/>{sep}</>}
          {sol.codigoProceso&&<><MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>} label="No. Proceso" badge={<span style={{fontWeight:600,color:'#475569',fontFamily:'monospace',fontSize:10}}>{sol.codigoProceso}</span>}/>{sep}</>}
          {sol.fechaVencimiento&&<MetaItem icon={<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>} label="Vencimiento" badge={<span style={{fontWeight:600,color:'#475569',fontFamily:F,fontSize:10}}>{fmtFH(sol.fechaVencimiento)}</span>}/>}
        </div>
      </div>

      {/* Navegación de secciones */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'0 24px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:0}}>
          <button onClick={onVolver}
            style={{display:'inline-flex',alignItems:'center',gap:5,height:44,padding:'0 14px 0 0',border:'none',borderRight:'1px solid #e2e8f0',background:'transparent',color:'#475569',fontSize:12,fontWeight:500,fontFamily:F,cursor:'pointer',flexShrink:0,marginRight:16}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.color='#1e5799';}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.color='#475569';}}>
            <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Volver
          </button>
          {TABS.map(([label,key])=>(
            <button key={key} onClick={()=>setTabActiva(key as typeof tabActiva)}
              style={{height:44,padding:'0 16px',border:'none',borderBottom:tabActiva===key?'2.5px solid #1e5799':'2.5px solid transparent',background:'transparent',color:tabActiva===key?'#1e5799':'#64748b',fontSize:13,fontWeight:tabActiva===key?700:400,fontFamily:F,cursor:'pointer',transition:'all .15s',display:'inline-flex',alignItems:'center',gap:6,flexShrink:0}}>
              {label}
              {key==='documentacion'&&docArr.length>0&&<span style={{fontSize:10,fontWeight:700,background:tabActiva===key?'#1e5799':'#e2e8f0',color:tabActiva===key?'white':'#64748b',padding:'1px 6px',borderRadius:999}}>{docArr.length}</span>}
              {key==='adendas'&&adendas.length>0&&<span style={{fontSize:10,fontWeight:700,background:tabActiva===key?'#1e5799':'#e2e8f0',color:tabActiva===key?'white':'#64748b',padding:'1px 6px',borderRadius:999}}>{adendas.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Seguimiento del estado */}
      <div style={{background:'white',borderBottom:'1px solid #e2e8f0',padding:'0 24px',flexShrink:0}}>
        <StepperSolicitud estadoSolicitud={sol.estadoSolicitud||''}/>
      </div>

      {/* Contenido principal */}
      <div style={{flex:1,overflow:'hidden',display:'grid',gridTemplateColumns:'1fr 280px',gap:16,padding:'16px 24px'}}>

        {/* Columna izquierda — igual que VistFicha */}
        <div style={{display:'flex',flexDirection:'column',gap:12,overflowY:'auto',paddingRight:2,scrollbarWidth:'thin' as const,scrollbarColor:'transparent transparent'}}
          onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.scrollbarColor='#cbd5e1 transparent';}}
          onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.scrollbarColor='transparent transparent';}}>

          {tabActiva==='resumen'&&<>
            {sol.objeto&&(
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'12px 14px',flexShrink:0,maxHeight:120,overflowY:'auto'}}>
                <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:10,fontFamily:F}}>Descripción</div>
                <p style={{margin:0,fontSize:11.5,color:'#334155',fontFamily:F,lineHeight:1.6}}>{sol.objeto.charAt(0).toUpperCase()+sol.objeto.slice(1)}</p>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,flexShrink:0}}>
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                  <svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
                  <span style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F}}>Entidad contratante</span>
                </div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
                  {esEspecializada&&solE.nitContacto&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>NIT</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:'monospace'}}>{solE.nitContacto}</div></div>}
                  <div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Organización</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{sol.entidad||'—'}</div></div>
                  {sol.ciudad&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Ciudad</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{sol.ciudad}</div></div>}
                  {sol.departamento&&<div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Departamento</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{sol.departamento}</div></div>}
                </div>
              </div>
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                  <svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F}}>Información del contrato</span>
                </div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
                  <div><div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Modalidad</div><div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{modalidadDisplay}</div></div>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:'#374151',fontFamily:F,marginBottom:2}}>Fuente</div>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{fontSize:12.5,color:'#0f172a',fontFamily:F}}>{fuenteDisplay}</div>
                      {urlFuente&&<a href={urlFuente} target="_blank" rel="noopener noreferrer" style={{width:22,height:22,borderRadius:6,border:'1px solid #e2e8f0',background:'white',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#64748b',textDecoration:'none'}} onMouseOver={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#1e5799';(e.currentTarget as HTMLAnchorElement).style.color='#1e5799';}} onMouseOut={e=>{(e.currentTarget as HTMLAnchorElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLAnchorElement).style.color='#64748b';}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 16px'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                  <svg fill="none" stroke="#64748b" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                  <span style={{fontSize:11,fontWeight:700,color:'#374151',fontFamily:F}}>Registro</span>
                </div>
                <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
                  <div><div style={{fontSize:10,color:'#94a3b8',fontFamily:F,marginBottom:2}}>Registrado por</div><div style={{fontSize:12.5,fontWeight:600,color:'#0f172a',fontFamily:F}}>{sol.usuarioRegistro||'—'}</div>{sol.cargoRegistro&&<div style={{fontSize:11,color:'#64748b',fontFamily:F,marginTop:1}}>{sol.cargoRegistro}</div>}</div>
                  <div><div style={{fontSize:10,color:'#94a3b8',fontFamily:F,marginBottom:2}}>Fecha de registro</div><div style={{fontSize:12,fontWeight:600,color:'#0f172a',fontFamily:F}}>{fmtFH(sol.createdAt)}</div></div>
                  {sol.sqrNumero&&<div><div style={{fontSize:10,color:'#94a3b8',fontFamily:F,marginBottom:2}}>No. SQR</div><div style={{fontSize:12,fontWeight:600,color:'#475569',fontFamily:'monospace'}}>{sol.sqrNumero}</div></div>}
                </div>
              </div>
            </div>
          </>}

          {tabActiva==='requisitos'&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'20px 24px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:16,fontFamily:F}}>Requisitos del proceso</div>
              {sol.observacion?<div style={{fontSize:13,color:FC,fontFamily:F,lineHeight:1.7,whiteSpace:'pre-wrap' as const}}>{sol.observacion}</div>:<div style={{textAlign:'center' as const,padding:'40px 0',color:'#94a3b8',fontSize:13,fontFamily:F}}>Sin requisitos registrados</div>}
            </div>
          )}

          {tabActiva==='cronograma'&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'24px 28px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.08em',marginBottom:20,fontFamily:F}}>Cronograma de fechas</div>
              {(sol.fechaPublicacion||sol.fechaVencimiento||procDataEntries.length>0)
                ?<div style={{display:'flex',flexDirection:'column' as const}}>
                  {sol.fechaPublicacion&&<div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid #f1f5f9'}}><span style={{fontSize:11,color:'#374151',fontFamily:F}}>Fecha de publicación</span><span style={{fontSize:11,fontWeight:700,color:FC_DARK,fontFamily:F}}>{fmtFH(sol.fechaPublicacion)}</span></div>}
                  {sol.fechaVencimiento&&<div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',borderBottom:procDataEntries.length>0?'1px solid #f1f5f9':'none'}}><span style={{fontSize:11,color:'#374151',fontFamily:F}}>Fecha de vencimiento</span><span style={{fontSize:11,fontWeight:700,color:'#dc2626',fontFamily:F}}>{fmtFH(sol.fechaVencimiento)}</span></div>}
                  {procDataEntries.map(([k, v], i) => {
  const vv = safeRecord(v);
  const obsCronograma = safeString(vv.obs, `Etapa ${i + 1}`);
  const fechaInicioCronograma = safeString(vv.fechaI);
  const fechaFinCronograma = safeString(vv.fechaF);

  return (
    <div
      key={k}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '12px 0',
        borderBottom: i < procDataEntries.length - 1 ? '1px solid #f1f5f9' : 'none',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: '#374151',
          fontFamily: F,
          flex: 1,
          paddingRight: 24,
        }}
      >
        {obsCronograma}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: FC_DARK,
          fontFamily: F,
          whiteSpace: 'nowrap' as const,
        }}
      >
        {fechaInicioCronograma}
        {fechaFinCronograma && fechaFinCronograma !== fechaInicioCronograma
          ? ` → ${fechaFinCronograma}`
          : ''}
      </span>
    </div>
  );
})}
                </div>
                :<div style={{textAlign:'center' as const,padding:'40px 0',color:'#94a3b8',fontSize:13,fontFamily:F}}>Sin cronograma registrado</div>
              }
            </div>
          )}

          {tabActiva==='documentacion'&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'16px 20px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.08em',marginBottom:14,fontFamily:F}}>Documentos {docArr.length>0&&`(${docArr.length})`}</div>
              {docArr.length>0
                ?<div style={{display:'flex',flexDirection:'column' as const}}>
                  {docArr.map((d: DocumentoDinamico, i: number) =>{
                    const url=String(d.ruta||d.url||d.link||'');
                    const ext=getDocExt(url,String(d.nombre||d.titulo||''));
                    return(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:i<docArr.length-1?'1px solid #f8fafc':'none'}}>
                        <div style={{width:28,height:34,borderRadius:'2px 7px 2px 2px',background:ext.bg,border:`1px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:4,position:'relative' as const,flexShrink:0}}>
                          <div style={{position:'absolute' as const,top:0,right:0,width:7,height:7,background:'white',borderLeft:`1px solid ${ext.color}20`,borderBottom:`1px solid ${ext.color}20`,borderRadius:'0 0 0 2px'}}/>
                          <span style={{fontSize:6,fontWeight:800,color:ext.color,fontFamily:F}}>{ext.label}</span>
                        </div>
                        <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,fontFamily:F}}>{String(d.nombre||d.titulo||`Documento ${i+1}`)}</div></div>
                        {url&&<a href={url} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,height:28,padding:'0 12px',borderRadius:7,background:'#1e5799',color:'white',fontSize:11,fontWeight:700,textDecoration:'none',fontFamily:F,flexShrink:0}}>
                          <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Descargar
                        </a>}
                      </div>
                    );
                  })}
                </div>
                :<div style={{textAlign:'center' as const,padding:'40px 0',color:'#94a3b8',fontSize:13,fontFamily:F}}>Sin documentos disponibles</div>
              }
            </div>
          )}

          {tabActiva==='adendas'&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'16px 18px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:12,fontFamily:F}}>Adendas {adendas.length>0&&<span style={{fontSize:10,fontWeight:700,background:'#1e5799',color:'white',padding:'1px 7px',borderRadius:999,marginLeft:6}}>{adendas.length}</span>}</div>
              {cargandoAdendas?<div style={{fontSize:12,color:'#94a3b8',fontFamily:F}}>Cargando adendas…</div>
                :adendas.length===0?<div style={{textAlign:'center' as const,padding:'20px 0',color:'#94a3b8',fontSize:12,fontFamily:F}}>Sin adendas detectadas</div>
                :adendas.map((d,i)=>{
                  const url=d.urlDocumento||'';const ext=getDocExt(url,d.nombre||'');
                  const fecha=d.fechaDetectado?new Date(d.fechaDetectado).toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}):'';
                  return(
                    <div key={d.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i<adendas.length-1?'1px solid #f8fafc':'none'}}>
                      <div style={{width:28,height:34,borderRadius:'2px 7px 2px 2px',background:ext.bg,border:`1px solid ${ext.color}20`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:4,position:'relative' as const,flexShrink:0}}>
                        <div style={{position:'absolute' as const,top:0,right:0,width:7,height:7,background:'white',borderLeft:`1px solid ${ext.color}20`,borderBottom:`1px solid ${ext.color}20`,borderRadius:'0 0 0 2px'}}/>
                        <span style={{fontSize:6,fontWeight:800,color:ext.color,fontFamily:F}}>{ext.label}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,fontFamily:F}}>{d.nombre||'Sin nombre'}</div>{fecha&&<div style={{fontSize:10,color:'#94a3b8',fontFamily:F,marginTop:1}}>Detectado: {fecha}</div>}</div>
                      {url&&<a href={url} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,height:28,padding:'0 12px',borderRadius:7,background:'#1e5799',color:'white',fontSize:11,fontWeight:700,textDecoration:'none',fontFamily:F,flexShrink:0}}>
                        <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:10,height:10}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Descargar
                      </a>}
                    </div>
                  );
                })
              }
            </div>
          )}
        </div>

        {/* Columna derecha — flujo asignación */}
        <div style={{display:'flex',flexDirection:'column',gap:10,overflowY:'auto',scrollbarWidth:'thin' as const,scrollbarColor:'transparent transparent'}}
          onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.scrollbarColor='#cbd5e1 transparent';}}
          onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.scrollbarColor='transparent transparent';}}>

          {/* Información del responsable asignado */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:10,fontFamily:F}}>
              Responsable asignado
            </div>

            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div style={{width:32,height:32,borderRadius:'50%',background:'#1e5799',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,fontFamily:F}}>
                {analistaIniciales}
              </div>

              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12.5,fontWeight:600,color:FC_DARK,fontFamily:F,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>
                  {analistaAsignadoTexto}
                </div>
                <div style={{fontSize:10.5,color:FC_LABEL,fontFamily:F}}>
                  {analistaCargoTexto}
                </div>
              </div>
            </div>

            <div style={{display:'flex',flexDirection:'column' as const,gap:6}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:10,color:FC_LABEL,fontFamily:F}}>ID asignación</span>
                <span style={{fontSize:10.5,fontWeight:600,color:'#475569',fontFamily:'monospace'}}>
                  {idAsignacionTexto}
                </span>
              </div>

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:10,color:FC_LABEL,fontFamily:F}}>Fecha asignación</span>
                <span style={{fontSize:10.5,color:FC_DARK,fontFamily:F}}>
                  {fechaAsignacionTexto}
                </span>
              </div>

              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:10,color:FC_LABEL,fontFamily:F}}>Asignado por</span>
                <span style={{fontSize:10.5,color:FC_DARK,fontFamily:F}}>
                  {asignadoPorTexto}
                </span>
              </div>
            </div>
          </div>
          {/* Estado actual */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:'#1e5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:8,fontFamily:F}}>Estado de asignación</div>
            <span style={{display:'inline-flex',alignItems:'center',fontSize:12,fontWeight:600,padding:'4px 12px',borderRadius:999,...estadoAsigColor(estadoAsig),fontFamily:F}}>
              {estadoAsig}
            </span>
            {/* Resumen causa si está en observación */}
            {estadoAsig === 'En observación' && tipoCausaTexto && (
              <div style={{marginTop:10,padding:'8px 10px',background:'#fff7ed',borderRadius:7,border:'1px solid #fed7aa'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#92400e',fontFamily:F,marginBottom:3}}>
                  Causa registrada
                </div>
                <div style={{fontSize:11.5,color:'#78350f',fontFamily:F}}>
                  {tipoCausaTexto} → {causaEspecificaTexto}
                </div>
              </div>
            )}
            {/* Resumen resultado si está cerrada */}
            {estadoAsig === 'Cerrada' && (
            <div style={{marginTop:10,padding:'8px 10px',background:'#f0fdf4',borderRadius:7,border:'1px solid #bbf7d0'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#15803d',fontFamily:F,marginBottom:3}}>
                {resultadoFinalTexto ? 'Resultado' : 'Cerrada por observación'}
              </div>

              {resultadoFinalTexto && (
                <div style={{fontSize:11.5,fontWeight:600,color:'#14532d',fontFamily:F}}>
                  {resultadoFinalTexto}
                </div>
              )}

              {tipoCausaTexto && (
                <div style={{fontSize:11,color:'#15803d',fontFamily:F,marginTop:2}}>
                  {tipoCausaTexto} → {causaEspecificaTexto}
                </div>
              )}
            </div>
          )}
          </div>

          {/* Botones de flujo */}
          {estadoAsig!=='Cerrada'&&(
          <button
            onClick={()=>setGestionAsig(asigActual)}
              style={{width:'100%',height:40,borderRadius:10,background:'#1e5799',color:'white',border:'none',fontSize:13,fontWeight:700,fontFamily:F,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .15s',boxShadow:'0 2px 8px rgba(30,87,153,0.15)'}}
              onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#174a85';}}
              onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='#1e5799';}}>
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              Gestionar asignación
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Módulo de asignaciones pendientes
========================================================= */
function ModuloAsignacionesPendientes({sesion}:{sesion:Sesion}){
  const [solicitudes,setSolicitudes]=React.useState<Solicitud[]>([]);
  const [cargando,setCargando]=React.useState(true);
  const [error,setError]=React.useState('');
  const [busqueda,setBusqueda]=React.useState('');
  const [fichaAbierta,setFichaAbierta]=React.useState<Solicitud|null>(null);
  const [seleccionados,setSeleccionados]=React.useState<number[]>([]);
  const [modalGestion,setModalGestion]=React.useState<{sol:Solicitud;asig:Record<string,unknown>}|null>(null);

  const cargar=React.useCallback(async()=>{
    setCargando(true);setError('');
    try{
      const res=await fetch('/api/solicitudes?estadoSolicitud=Asignada&limit=200');
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Error');
      const lista:Solicitud[]=Array.isArray(data.solicitudes)?data.solicitudes:Array.isArray(data)?data:[];
      const pendientes=lista.filter(s=>{
        const asigs = safeArray<Record<string, unknown>>(s.asignaciones);
        return asigs.some(a=>String(a.estadoAsignacion||'').toLowerCase()==='pendiente');
      });
      setSolicitudes(pendientes);
    }catch(e){setError(e instanceof Error?e.message:'Error al cargar');}
    finally{setCargando(false);}
  },[]);

  React.useEffect(()=>{cargar();},[cargar]);

  const fmtFecha=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});};
  const fmtV=(v:number|null)=>{if(v==null||isNaN(v)||v===0)return'—';return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};

  const filtradas=solicitudes.filter(s=>{
    if(!busqueda)return true;
    const q=busqueda.toLowerCase();
    return(
      (s.entidad||'').toLowerCase().includes(q)||
      (s.codigoProceso||'').toLowerCase().includes(q)||
      (s.objeto||'').toLowerCase().includes(q)||
      (s.ciudad||'').toLowerCase().includes(q)
    );
  });

  const getAnalista=(sol:Solicitud)=>{
    const asigs = safeArray<Record<string, unknown>>(sol.asignaciones);
    const pendiente=asigs.filter(a=>String(a.estadoAsignacion||'').toLowerCase()==='pendiente').pop();
    return pendiente?{
      nombre:String(pendiente.analistaAsignado||'—'),
      cargo:String(pendiente.analistaCargo||''),
      fecha:String(pendiente.fechaAsignacion||'').slice(0,10),
      id:String(pendiente.idAsignacion||''),
    }:null;
  };

  const getDiasRestantes=(fecha:string|null)=>{
    if(!fecha)return null;
    const diff=new Date(fecha).getTime()-Date.now();
    return Math.ceil(diff/(1000*60*60*24));
  };

  const sqrDisplay=(s:Solicitud)=>{
    if(s.sqrError)return{label:'Error SQR',bg:'#fef2f2',color:'#dc2626'};
    if(s.sqrNumero)return{label:s.sqrNumero,bg:'#E8F5E9',color:'#475569'};
    return{label:'Sin SQR',bg:'#f1f5f9',color:'#94a3b8'};
  };

  const todosMarcados=filtradas.length>0&&filtradas.every(s=>seleccionados.includes(s.id));
  const toggleAll=(c:boolean)=>setSeleccionados(c?filtradas.map(s=>s.id):[]);
  const toggleOne=(id:number,c:boolean)=>setSeleccionados(prev=>c?[...prev,id]:prev.filter(x=>x!==id));

  const COLS=[
    {w:60,label:'N°'},
    {w:110,label:'Estado'},
    {w:52,label:'Ficha'},
    {w:90,label:'SQR'},
    {w:130,label:'Fecha asignación'},
    {w:120,label:'Entidad grupo'},
    {w:180,label:'Cliente'},
    {w:150,label:'No. proceso'},
    {w:200,label:'Descripción'},
    {w:150,label:'Analista asignado'},
    {w:110,label:'Vencimiento'},
    {w:130,label:'Presupuesto'},
  ];

  if(cargando)return<div className="content"><div className="module-status">Cargando asignaciones…</div></div>;
  if(error)return<div className="content"><div className="module-status error">{error}</div></div>;

  if(fichaAbierta){
    return(
      <div style={{height:'100%',display:'flex',flexDirection:'column'}}>
        <VistFichaAsignacion
        sol={fichaAbierta}
        sesion={sesion}
        onVolver={()=>setFichaAbierta(null)}
        onGuardado={(updated)=>{
          setSolicitudes(prev=>prev.map(s=>s.id===updated.id?updated:s));
          setFichaAbierta(updated);
        }}
      />
      </div>
    );
  }

  return(
    <>

      <div className="content">
        <div className="page-header">
          <div className="page-title">
            <IcoAsignaciones/>
            <span>Asignaciones pendientes : {filtradas.length} / {solicitudes.length}</span>
          </div>
          <div className="page-actions">
            <input type="text" className="search-box" placeholder="Buscar…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
            <button className="icon-btn" title="Actualizar" onClick={()=>{setBusqueda('');cargar();}}><IcoRefresh/></button>
          </div>
        </div>

        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{width:36}}>
                    <div className="th-top">
                      <input type="checkbox" className="cbx" checked={todosMarcados} onChange={e=>toggleAll(e.target.checked)}/>
                    </div>
                  </th>
                  {COLS.map(({w,label})=><th key={label} style={{minWidth:w}}><div className="th-top">{label}</div></th>)}
                </tr>
                <tr><th/>{COLS.map(({label})=><th key={label}><div style={{padding:'0 10px 5px',color:'#d1d5db',fontSize:11}}>≡</div></th>)}</tr>
              </thead>
              <tbody>
                {filtradas.length===0
                  ?<tr><td colSpan={COLS.length+1} style={{textAlign:'center',color:'#6b7280',padding:'36px 10px',fontSize:13}}>
                    No hay asignaciones pendientes.
                  </td></tr>
                  :filtradas.map(s=>{
                    const ebc=estadoSolicitudColor(s.estadoSolicitud||'');
                    const pc=s.perfil?perfilColor(s.perfil):null;
                    const sqr=sqrDisplay(s);
                    const analista=getAnalista(s);
                    const dias=getDiasRestantes(s.fechaVencimiento||null);
                    return(
                      <tr key={s.id}
                        onDoubleClick={()=>setFichaAbierta(s)}
                        style={{cursor:'default'}}>
                        <td className="center">
                          <input type="checkbox" className="cbx" checked={seleccionados.includes(s.id)} onChange={e=>toggleOne(s.id,e.target.checked)}/>
                        </td>
                        <td style={{fontWeight:700,color:'#374151',fontSize:13}}>{s.id}</td>
                        <td>
                          <span className="badge" style={{background:ebc.bg,color:ebc.color,fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:600,whiteSpace:'nowrap'}}>
                            {s.estadoSolicitud}
                          </span>
                        </td>
                        <td className="center">
                          <button
                            onClick={e=>{e.stopPropagation();setFichaAbierta(s);}}
                            title="Ver ficha"
                            style={{width:34,height:34,borderRadius:10,border:'1.5px solid #d1d5db',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#1a5ea8',transition:'all .15s'}}
                            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#EAF2FB';(e.currentTarget as HTMLButtonElement).style.borderColor='#1a5ea8';}}
                            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.borderColor='#d1d5db';}}>
                            <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:17,height:17}}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          </button>
                        </td>
                        <td>
                          <span style={{display:'inline-flex',alignItems:'center',fontSize:10.5,fontWeight:700,padding:'3px 9px',borderRadius:20,background:sqr.bg,color:sqr.color,whiteSpace:'nowrap',fontFamily:'monospace'}}>
                            {sqr.label}
                          </span>
                        </td>
                        <td style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>{analista?.fecha||'—'}</td>
                        <td>
                          {pc
                            ?<span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:pc.bg,color:pc.color,whiteSpace:'nowrap'}}>{pc.label}</span>
                            :<span style={{fontSize:12,color:'#374151'}}>—</span>
                          }
                        </td>
                        <td style={{fontSize:12,fontWeight:500,color:'#1e293b',maxWidth:180}}>
                          <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {s.entidad||'—'}
                          </div>
                        </td>
                        <td style={{fontFamily:'monospace',fontSize:11,color:'#475569',whiteSpace:'nowrap'}}>{s.codigoProceso||'—'}</td>
                        <td style={{maxWidth:200}} title={s.objeto||''}>
                          <div style={{fontSize:12,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>
                            {s.objeto?(s.objeto.charAt(0).toUpperCase()+s.objeto.slice(1).toLowerCase()):'—'}
                          </div>
                        </td>
                        <td style={{fontSize:12,color:'#1e293b'}}>
                          {analista?(
                            <div>
                              <div style={{fontWeight:600}}>{analista.nombre}</div>
                              <div style={{fontSize:10.5,color:'#94a3b8'}}>{analista.id}</div>
                            </div>
                          ):'—'}
                        </td>
                        <td style={{whiteSpace:'nowrap'}}>
                          {s.fechaVencimiento?(
                            <div>
                              <div style={{fontSize:12,color:'#1e293b'}}>{fmtFecha(s.fechaVencimiento)}</div>
                              {dias!==null&&(
                                <div style={{fontSize:10.5,fontWeight:600,color:dias<0?'#dc2626':dias<=3?'#d97706':'#64748b'}}>
                                  {dias<0?'Vencido':dias===0?'Hoy':dias===1?'Mañana':`${dias} días`}
                                </div>
                              )}
                            </div>
                          ):'—'}
                        </td>
                        <td style={{fontSize:12,fontWeight:600,color:'#475569',whiteSpace:'nowrap'}}>{fmtV(s.valor)}</td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
          <div className="pagination-bar">
            <span>{filtradas.length} de {solicitudes.length} asignaciones</span>
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================================================
   MÓDULO ASIGNACIONES TERMINADAS
========================================================= */
function ModuloAsignacionesTerminadas({sesion}:{sesion:Sesion}){
  const [solicitudes,setSolicitudes]=React.useState<Solicitud[]>([]);
  const [cargando,setCargando]=React.useState(true);
  const [error,setError]=React.useState('');
  const [busqueda,setBusqueda]=React.useState('');
  const [fichaAbierta,setFichaAbierta]=React.useState<Solicitud|null>(null);
  const [seleccionados,setSeleccionados]=React.useState<number[]>([]);

  const cargar=React.useCallback(async()=>{
    setCargando(true);setError('');
    try{
      const res=await fetch('/api/solicitudes?estadoSolicitud=Cerrada&limit=200');
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Error');
      const lista:Solicitud[]=Array.isArray(data.solicitudes)?data.solicitudes:Array.isArray(data)?data:[];
      const cerradas=lista.filter(s=>{
        const asigs = safeArray<Record<string, unknown>>(s.asignaciones);
        return asigs.some(a=>{
          const estado=String(a.estadoAsignacion||'').toLowerCase();
          return estado==='cerrada'||estado==='cerrado'||estado==='cerrada'||estado==='cerrado';
        });
      });
      setSolicitudes(cerradas);
    }catch(e){setError(e instanceof Error?e.message:'Error al cargar');}
    finally{setCargando(false);}
  },[]);

  React.useEffect(()=>{cargar();},[cargar]);

  const fmtFecha=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});};
  const fmtV=(v:number|null)=>{if(v==null||isNaN(v)||v===0)return'—';return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};

  const filtradas=solicitudes.filter(s=>{
    if(!busqueda)return true;
    const q=busqueda.toLowerCase();
    return(
      (s.entidad||'').toLowerCase().includes(q)||
      (s.codigoProceso||'').toLowerCase().includes(q)||
      (s.objeto||'').toLowerCase().includes(q)||
      (s.ciudad||'').toLowerCase().includes(q)
    );
  });

  const getUltimaAsignacion=(sol:Solicitud)=>{
    const asigs = safeArray<Record<string, unknown>>(sol.asignaciones);
    const cerrada=asigs.filter(a=>{
      const estado=String(a.estadoAsignacion||'').toLowerCase();
      return estado==='cerrada'||estado==='cerrado'||estado==='cerrada'||estado==='cerrado';
    }).pop();
    return cerrada?{
      nombre:String(cerrada.analistaAsignado||'—'),
      cargo:String(cerrada.analistaCargo||''),
      fecha:String(cerrada.fechaAsignacion||'').slice(0,10),
      id:String(cerrada.idAsignacion||''),
      estado:String(cerrada.estadoAsignacion||''),
      resultado:String(cerrada.resultadoFinal||'—'),
      causa:String(cerrada.tipoCausa||''),
      causaEsp:String(cerrada.causaEspecifica||''),
    }:null;
  };

  const sqrDisplay=(s:Solicitud)=>{
    if(s.sqrError)return{label:'Error SQR',bg:'#fef2f2',color:'#dc2626'};
    if(s.sqrNumero)return{label:s.sqrNumero,bg:'#E8F5E9',color:'#475569'};
    return{label:'Sin SQR',bg:'#f1f5f9',color:'#94a3b8'};
  };

  const todosMarcados=filtradas.length>0&&filtradas.every(s=>seleccionados.includes(s.id));
  const toggleAll=(c:boolean)=>setSeleccionados(c?filtradas.map(s=>s.id):[]);
  const toggleOne=(id:number,c:boolean)=>setSeleccionados(prev=>c?[...prev,id]:prev.filter(x=>x!==id));

  const COLS=[
    {w:60,label:'N°'},
    {w:110,label:'Estado'},
    {w:52,label:'Ficha'},
    {w:90,label:'SQR'},
    {w:130,label:'Fecha asignación'},
    {w:120,label:'Entidad grupo'},
    {w:180,label:'Cliente'},
    {w:150,label:'No. proceso'},
    {w:200,label:'Descripción'},
    {w:150,label:'Analista'},
    {w:140,label:'Resultado'},
    {w:130,label:'Presupuesto'},
  ];

  if(cargando)return<div className="content"><div className="module-status">Cargando asignaciones cerradas…</div></div>;
  if(error)return<div className="content"><div className="module-status error">{error}</div></div>;

  if(fichaAbierta){
    return(
      <div style={{height:'100%',display:'flex',flexDirection:'column'}}>
        <VistFichaAsignacion
        sol={fichaAbierta}
        sesion={sesion}
        onVolver={()=>setFichaAbierta(null)}
        onGuardado={(updated)=>{
          setSolicitudes(prev=>prev.map(s=>s.id===updated.id?updated:s));
          setFichaAbierta(updated);
        }}
      />
      </div>
    );
  }

  return(
    <div className="content">
      <div className="page-header">
        <div className="page-title">
          <IcoAsignaciones/>
          <span>Asignaciones cerradas : {filtradas.length} / {solicitudes.length}</span>
        </div>
        <div className="page-actions">
          <input type="text" className="search-box" placeholder="Buscar…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
          <button className="icon-btn" title="Actualizar" onClick={()=>{setBusqueda('');cargar();}}><IcoRefresh/></button>
        </div>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{width:36}}>
                  <div className="th-top">
                    <input type="checkbox" className="cbx" checked={todosMarcados} onChange={e=>toggleAll(e.target.checked)}/>
                  </div>
                </th>
                {COLS.map(({w,label})=><th key={label} style={{minWidth:w}}><div className="th-top">{label}</div></th>)}
              </tr>
              <tr><th/>{COLS.map(({label})=><th key={label}><div style={{padding:'0 10px 5px',color:'#d1d5db',fontSize:11}}>≡</div></th>)}</tr>
            </thead>
            <tbody>
              {filtradas.length===0
                ?<tr><td colSpan={COLS.length+1} style={{textAlign:'center',color:'#6b7280',padding:'36px 10px',fontSize:13}}>
                  No hay asignaciones cerradas.
                </td></tr>
                :filtradas.map(s=>{
                  const ebc=estadoSolicitudColor(s.estadoSolicitud||'');
                  const pc=s.perfil?perfilColor(s.perfil):null;
                  const sqr=sqrDisplay(s);
                  const asig=getUltimaAsignacion(s);
                  const resultado=asig?.resultado||'—';
                  const resultadoColor=resultado==='Adjudicado'?{bg:'#E3F2FD',color:'#0D47A1'}:resultado==='No adjudicado'?{bg:'#FFEBEE',color:'#B71C1C'}:resultado==='No presentado'?{bg:'#FFF8E1',color:'#E65100'}:{bg:'#f1f5f9',color:'#475569'};
                  return(
                    <tr key={s.id}
                      onDoubleClick={()=>setFichaAbierta(s)}
                      style={{cursor:'default'}}>
                      <td className="center">
                        <input type="checkbox" className="cbx" checked={seleccionados.includes(s.id)} onChange={e=>toggleOne(s.id,e.target.checked)}/>
                      </td>
                      <td style={{fontWeight:700,color:'#374151',fontSize:13}}>{s.id}</td>
                      <td>
                        <span className="badge" style={{background:ebc.bg,color:ebc.color,fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:600,whiteSpace:'nowrap'}}>
                          {s.estadoSolicitud}
                        </span>
                      </td>
                      <td className="center">
                        <button
                          onClick={e=>{e.stopPropagation();setFichaAbierta(s);}}
                          title="Ver ficha"
                          style={{width:34,height:34,borderRadius:10,border:'1.5px solid #d1d5db',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#1a5ea8',transition:'all .15s'}}
                          onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#EAF2FB';(e.currentTarget as HTMLButtonElement).style.borderColor='#1a5ea8';}}
                          onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.borderColor='#d1d5db';}}>
                          <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:17,height:17}}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        </button>
                      </td>
                      <td>
                        <span style={{display:'inline-flex',alignItems:'center',fontSize:10.5,fontWeight:700,padding:'3px 9px',borderRadius:20,background:sqr.bg,color:sqr.color,whiteSpace:'nowrap',fontFamily:'monospace'}}>
                          {sqr.label}
                        </span>
                      </td>
                      <td style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>{asig?.fecha||'—'}</td>
                      <td>
                        {pc
                          ?<span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:pc.bg,color:pc.color,whiteSpace:'nowrap'}}>{pc.label}</span>
                          :<span style={{fontSize:12,color:'#374151'}}>—</span>
                        }
                      </td>
                      <td style={{fontSize:12,fontWeight:500,color:'#1e293b',maxWidth:180}}>
                        <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {s.entidad||'—'}
                        </div>
                      </td>
                      <td style={{fontFamily:'monospace',fontSize:11,color:'#475569',whiteSpace:'nowrap'}}>{s.codigoProceso||'—'}</td>
                      <td style={{maxWidth:200}} title={s.objeto||''}>
                        <div style={{fontSize:12,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>
                          {s.objeto?(s.objeto.charAt(0).toUpperCase()+s.objeto.slice(1).toLowerCase()):'—'}
                        </div>
                      </td>
                      <td style={{fontSize:12,color:'#1e293b'}}>
                        {asig?(
                          <div>
                            <div style={{fontWeight:600}}>{asig.nombre}</div>
                            <div style={{fontSize:10.5,color:'#94a3b8'}}>{asig.id}</div>
                          </div>
                        ):'—'}
                      </td>
                      <td>
                        <span style={{display:'inline-flex',alignItems:'center',fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:resultadoColor.bg,color:resultadoColor.color,whiteSpace:'nowrap'}}>
                          {resultado}
                        </span>
                      </td>
                      <td style={{fontSize:12,fontWeight:600,color:'#475569',whiteSpace:'nowrap'}}>{fmtV(s.valor)}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <span>{filtradas.length} de {solicitudes.length} asignaciones</span>
        </div>
      </div>
    </div>
  );
}

export default function LicycolbaPage() {
  const [sesionCargada, setSesionCargada] = useState(false);
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [activeModule, setActiveModule] = useState('dashboard');
  const [openAccordion, setOpenAccordion] = useState<string | null>('busqueda');

  useEffect(() => {
    const raw = sessionStorage.getItem('licycolba_sesion');
    if (raw) {
      try { setSesion(JSON.parse(raw)); } catch { setSesion(null); }
    }
    setSesionCargada(true);
  }, []);

  const borrarSesion = () => { sessionStorage.removeItem('licycolba_sesion'); setSesion(null); };
  const handleLogin = (s: Sesion) => { sessionStorage.setItem('licycolba_sesion', JSON.stringify(s)); setSesion(s); };
  const handleSesionActualizada = (s: Sesion) => { sessionStorage.setItem('licycolba_sesion', JSON.stringify(s)); setSesion(s); };
  const handleAccordionToggle = (key: string) => { setOpenAccordion((prev) => (prev === key ? null : key)); };

  if (!sesionCargada) return null;
  if (!sesion) return <PantallaLogin onLogin={handleLogin} />;

  // ─── Permisos derivados del rol de sesión ──────────────────────────────────
  // Centraliza las constantes de permisos para no repetir llamadas a puede()
  // dispersas en el JSX. Agregar aquí nuevas constantes según se necesiten.
  const rol = sesion.rol;
  const puedeVerBusqueda            = puedeVerModulo(rol, 'busqueda');
  const puedeCrearSolicitud         = puede(rol, 'busqueda', 'crear');
  const puedeGestionarBusqueda      = puede(rol, 'busqueda', 'gestionar');
  const puedeVerSolicitudesComercial= puedeVerModulo(rol, 'solicitudesComercial');
  const puedeEditarSolicitud        = puede(rol, 'solicitudesComercial', 'editar');
  const puedeVerAsignaciones        = puedeVerModulo(rol, 'asignaciones');
  const puedeAsignar                = puede(rol, 'asignaciones', 'asignar');
  const puedeReasignar              = puede(rol, 'asignaciones', 'reasignar');
  const puedeGestionarAsignacion    = puede(rol, 'asignaciones', 'gestionar');
  const puedeEliminar               = puede(rol, 'solicitudesComercial', 'eliminar');
  const puedeAdministrarUsuarios    = puede(rol, 'usuarios', 'administrar');
  const soloLectura                 = esSoloLectura(rol);


  const renderContent = () => {
    switch (activeModule) {
      case 'procesosNuevos': return <ModuloProcesoNuevos sesion={sesion} onModuleChange={setActiveModule} puedeGestionar={puedeGestionarBusqueda}/>;
      case 'busquedaFinal': return <ModuloBusquedaFinal onModuleChange={setActiveModule} sesion={sesion} puedeGestionar={puedeGestionarBusqueda}/>;
      case 'solicitudesAbiertas': return <ModuloSolicitudesComercial sesion={sesion}/>;
      case 'solicitudesComercial': return <ModuloSolicitudesComercial sesion={sesion}/>;
      case 'solicitudesEspecializada': return <ModuloSolicitudesEspecializada sesion={sesion}/>;
      case 'solicitudesRechazadas': return <ModuloSolicitudesRechazadas sesion={sesion}/>;
      case 'solicitudesEliminadas': return <ModuloSolicitudesEliminadas/>;
      case 'solicitudesTodas': return <ModuloSolicitudesTodas sesion={sesion}/>;
      case 'usuarios': return <ModuloUsuarios sesion={sesion} onSesionActualizada={handleSesionActualizada}/>;
      case 'perfiles': return <ModuloPerfiles sesion={sesion}/>;
      case 'usuariosEliminados': return <ModuloUsuariosEliminados/>;
      case 'examenesMedicos': return <ModuloExamenesMedicos/>;
      case 'dashboard': return <Placeholder nombre="Dashboard"/>;
      case 'trm': return <Placeholder nombre="TRM — Tasa de Cambio"/>;
      case 'asignacionesPendientes': return <ModuloAsignacionesPendientes sesion={sesion}/>;
      case 'asignacionesCerradas': return <ModuloAsignacionesTerminadas sesion={sesion}/>;
      default: return <Placeholder nombre={activeModule}/>;
    }
  };

  return (
    <div className="app">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        openAccordion={openAccordion}
        onAccordionToggle={handleAccordionToggle}
        sesion={sesion}
        onLogout={borrarSesion}
      />
      <main className="main">
        <LicyTopbar
          moduloActual={activeModule}
          sesion={sesion}
          onLogout={borrarSesion}
          onBuscarGlobal={(texto) => console.log('búsqueda global:', texto)}
        />
        <div className="main-content-scroll">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}