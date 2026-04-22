'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

/* ══════════════════════════════════════════════════════════════
   TIPOS
══════════════════════════════════════════════════════════════ */
interface Sesion { usuario:string; cargo:string; email:string; entidadGrupo:string; rol:string; }
interface UserPayload { cedula:string; celular:string; entidadGrupo:string; cargo:string; email:string; usuario:string; rol:string; estado:string; firmaDigital:string; password:string; }
const PAYLOAD_VACIO:UserPayload={cedula:'',celular:'',entidadGrupo:'',cargo:'',email:'',usuario:'',rol:'',estado:'Activo',firmaDigital:'',password:''};
interface User { id:number; cedula:string; celular:string; entidadGrupo:string; cargo:string; email:string; usuario:string; rol:string; estado:string; firmaDigital:string|null; createdAt:string; updatedAt:string; }
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
}
interface ProcesosApiResponse { ok:boolean; total_resultados_api:number; total_resultados_filtrados:number; total_resultados_entregados:number; procesos:LiciProceso[]; error?:string; }

/* ── SOLICITUD ── */
interface Solicitud {
  id:number; procesoId:number|null; procesoSourceKey:string;
  codigoProceso:string; nombreProceso:string; entidad:string; objeto:string;
  fuente:string; aliasFuente:string; modalidad:string; perfil:string;
  departamento:string; estadoFuente:string; fechaPublicacion:string|null;
  fechaVencimiento:string|null; valor:number|null;
  linkDetalle:string; linkSecop:string; linkSecopReg:string;
  estadoSolicitud:string; observacion:string|null;
  ciudad:string; sede:string; plataforma:string;
  fechaCierre:string|null;
  procStep:number;
  procData:Record<string,{fechaI:string;fechaF:string;obs:string}>;
  obsData:unknown[]; docData:unknown[]; asignaciones:unknown[];
  revisor:string; aprobador:string;
  usuarioRegistro:string; emailRegistro:string; cargoRegistro:string; entidadRegistro:string;
  sqrNumero:string|null;
  sqrCreada:boolean;
  sqrCerrada:boolean;
  sqrError:string|null;
  fechaAperturaSqr:string|null;
  fechaCierreSqr:string|null;
  resultadoFinal:string|null;
  causalCierre:string|null;
  createdAt:string; updatedAt:string;
}

interface DeletedSolicitud {
  id:number; originalId:number|null;
  codigoProceso:string; nombreProceso:string; entidad:string; objeto:string;
  fuente:string; aliasFuente:string; modalidad:string; perfil:string;
  departamento:string; estadoFuente:string; fechaPublicacion:string|null;
  fechaVencimiento:string|null; valor:number|null; linkDetalle:string;
  estadoSolicitud:string; observacion:string|null;
  ciudad:string; sede:string; plataforma:string; fechaCierre:string|null;
  procStep:number; revisor:string; aprobador:string;
  usuarioRegistro:string; emailRegistro:string; cargoRegistro:string; entidadRegistro:string;
  createdAt:string|null; updatedAt:string|null;
  deletedAt:string; deletedByUsuario:string|null; deletedByEmail:string|null;
}

interface ExamenMedico { [k:string]:unknown; }

/* ── Flujos stepper ── */
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

/* ── Colores ── */
const portalColor=(a:string,f:string)=>{const au=a.toUpperCase();const fu=f.toUpperCase();if(au==='S2'||fu.includes('SECOP II'))return{label:'S2',bg:'#1E5799',color:'white'};if(au==='S1'||fu.includes('SECOP I'))return{label:'S1',bg:'#16a34a',color:'white'};return{label:au||'NC',bg:'#0F2040',color:'white'};};
const portalColorModal=(a:string,f:string,r:string)=>{const au=a.toUpperCase();const fu=f.toUpperCase();if(au==='S2'||fu.includes('SECOP II'))return{short:'S2',label:'SECOP II',bg:'#1E5799',color:'white'};if(au==='S1'||fu.includes('SECOP I'))return{short:'S1',label:'SECOP I',bg:'#16a34a',color:'white'};return{short:au||'NC',label:r||'Otro portal',bg:'#0F2040',color:'white'};};
const estadoBadgeColor=(e:string)=>{const s=e.toLowerCase();if(s.includes('convocatoria')||s.includes('publicado')||s.includes('abierto')||s.includes('vigente'))return{bg:'#E8F5E9',color:'#1B5E20'};if(s.includes('adjudicado'))return{bg:'#E3F2FD',color:'#0D47A1'};if(s.includes('cerrado')||s.includes('vencido'))return{bg:'#EAF2FB',color:'#1E5799'};if(s.includes('cancelado')||s.includes('desierto'))return{bg:'#FFEBEE',color:'#B71C1C'};if(s.includes('evaluac')||s.includes('selecc'))return{bg:'#FFF8E1',color:'#E65100'};return{bg:'#F1F5F9',color:'#475569'};};
const estadoModalColor=(e:string)=>{const s=e.toLowerCase();if(s.includes('convocatoria')||s.includes('publicado')||s.includes('abierto')||s.includes('vigente'))return{bg:'#E8F5E9',color:'#1B5E20',dot:'#2E7D32'};if(s.includes('adjudicado'))return{bg:'#E3F2FD',color:'#0D47A1',dot:'#1565C0'};if(s.includes('cerrado')||s.includes('vencido'))return{bg:'#EAF2FB',color:'#1E5799',dot:'#2E7BC4'};if(s.includes('cancelado')||s.includes('desierto'))return{bg:'#FFEBEE',color:'#B71C1C',dot:'#C62828'};if(s.includes('evaluac')||s.includes('selecc'))return{bg:'#FFF8E1',color:'#E65100',dot:'#EF6C00'};return{bg:'#F1F5F9',color:'#475569',dot:'#94A3B8'};};
const perfilColor=(p:string)=>{const s=p.toLowerCase();if(s.includes('aseo'))return{bg:'#E8F5E9',color:'#1B5E20',label:'Aseocolba'};if(s.includes('vigi'))return{bg:'#EAF2FB',color:'#1E5799',label:'Vigicolba'};if(s.includes('tempo'))return{bg:'#FFF8E1',color:'#E65100',label:'Tempocolba'};return{bg:'#F1F5F9',color:'#475569',label:p.charAt(0).toUpperCase()+p.slice(1)};};
const estadoSolicitudColor=(e:string)=>{const s=(e||'').toLowerCase();if(s==='abierta'||s.includes('revisión')||s.includes('revision'))return{bg:'#e0f2fe',color:'#0369a1'};if(s==='asignada')return{bg:'#E8F5E9',color:'#1B5E20'};if(s==='adjudicada'||s==='aceptada')return{bg:'#E3F2FD',color:'#0D47A1'};if(s.includes('no ')|| s==='rechazada')return{bg:'#FFEBEE',color:'#B71C1C'};if(s==='cerrada')return{bg:'#F1F5F9',color:'#475569'};return{bg:'#FFF8E1',color:'#E65100'};};

/* ══════════════════════════════════════════════════════════════
   ICONOS
══════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════════════════ */
function PantallaLogin({onLogin}:{onLogin:(s:Sesion)=>void}) {
  const [email,setEmail]=useState('');const[password,setPassword]=useState('');const[showPass,setShowPass]=useState(false);const[error,setError]=useState('');const[loading,setLoading]=useState(false);
  const handleSubmit=async(e:React.FormEvent)=>{e.preventDefault();setError('');const em=email.trim().toLowerCase();if(!em||!em.includes('@')){setError('Ingresa un correo válido.');return;}if(!password){setError('La contraseña es obligatoria.');return;}setLoading(true);try{const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,password})});const data=await res.json();if(!res.ok){setError(data.error??'No se pudo iniciar sesión.');return;}guardarSesion(data as Sesion);onLogin(data as Sesion);}catch{setError('No se pudo conectar.');}finally{setLoading(false);}};
  return(<div className="login-page"><div className="login-deco login-deco-tl"/><div className="login-deco login-deco-br"/><div className="login-card"><div className="login-brand">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="https://www.grupocolba.com.co/wp-content/uploads/2021/05/grupocolba-logo.png" alt="Grupo Colba" className="login-logo"/></div>{error&&<div className="login-error">{error}</div>}<form className="login-form" onSubmit={handleSubmit} noValidate><div className="login-field"><label className="login-label">Correo electrónico</label><input className="login-input" type="email" placeholder="comercial@grupocolba.com" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" disabled={loading}/></div><div className="login-field"><label className="login-label">Contraseña</label><div className="login-pass-wrap"><input className="login-input login-input-pass" type={showPass?'text':'password'} placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" disabled={loading}/><button type="button" className="login-eye" onClick={()=>setShowPass(v=>!v)} tabIndex={-1}>{showPass?<IcoEyeOff/>:<IcoEyeOn/>}</button></div></div><button type="submit" className="login-btn" disabled={loading}>{loading?'Verificando…':'Ingresar'}</button></form><p className="login-footer">COPYRIGHT © 2026 <strong>Grupo Colba</strong></p></div></div>);
}

/* ── Badge conteo procesos nuevos de hoy ── */
function BadgeNuevosHoy(){
  const[count,setCount]=React.useState<number|null>(null);
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

/* ══════════════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════════════ */
interface SidebarProps{collapsed:boolean;onToggle:()=>void;activeModule:string;onModuleChange:(m:string)=>void;openAccordion:string|null;onAccordionToggle:(k:string)=>void;sesion:Sesion;onLogout:()=>void;}
function Sidebar({collapsed,onToggle,activeModule,onModuleChange,openAccordion,onAccordionToggle,sesion,onLogout}:SidebarProps){
  const ni=(mod:string)=>['nav-item',activeModule===mod?'active':'',openAccordion===mod?'open':''].filter(Boolean).join(' ');
  const solAbiertasModules=['solicitudesComercial','solicitudesEspecializada'];
  const [subOpen,setSubOpen]=React.useState<string|null>(solAbiertasModules.includes(activeModule)?'solicitudesAbiertas':null);
  const toggleSub=(k:string)=>setSubOpen(prev=>prev===k?null:k);
  return(<aside className={`sidebar${collapsed?' collapsed':''}`}><div className="sidebar-logo" style={{flexShrink:0}}><div className="logo-box"><div className="logo-qs">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="https://www.grupocolba.com.co/wp-content/uploads/2021/05/grupocolba-logo.png" alt="Grupo Colba"/></div><div className="logo-version"><strong>LICYCOLBA</strong></div></div><button className="toggle-btn" onClick={onToggle}><IcoChevL/></button></div><div className="sidebar-scroll"><div className="sidebar-user"><IcoUser/><div className="sidebar-user-info"><div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{sesion.usuario.replace(/(?:^|[.\s_-])(\w)/g,(m,c)=>m.replace(c,c.toUpperCase()))}</div><div style={{fontSize:10.5,color:'var(--sidebar-text-dim)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>{sesion.cargo}</div></div></div><nav className="sidebar-nav"><div className="nav-item" onClick={onLogout}><IcoLogout/><span className="nav-item-text">Cerrar sesión</span></div><div className={ni('dashboard')} onClick={()=>onModuleChange('dashboard')}><IcoDashboard/><span className="nav-item-text">Dashboard</span></div><div className={ni('trm')} onClick={()=>onModuleChange('trm')}><IcoTRM/><span className="nav-item-text">TRM</span></div><div className="section-title">MÓDULOS</div><div className={ni('busqueda')} onClick={()=>onAccordionToggle('busqueda')}><IcoBusqueda/><span className="nav-item-text">Búsqueda de procesos</span><span className="nav-arrow"><IcoChevR/></span></div><div className="sub-nav"><div className={`sub-item${activeModule==='procesosNuevos'?' active':''}`} onClick={()=>onModuleChange('procesosNuevos')}>Procesos nuevos<BadgeNuevosHoy/></div><div className={`sub-item${activeModule==='busquedaFinal'?' active':''}`} onClick={()=>onModuleChange('busquedaFinal')}>Todos los procesos</div></div><div className={ni('solicitudes')} onClick={()=>onAccordionToggle('solicitudes')}><IcoSolicitudes/><span className="nav-item-text">Solicitudes</span><span className="nav-arrow"><IcoChevR/></span></div><div className="sub-nav"><div className={`sub-item${['solicitudesComercial','solicitudesEspecializada'].includes(activeModule)?' active':''}`} onClick={()=>toggleSub('solicitudesAbiertas')} style={{display:'flex',alignItems:'center',cursor:'pointer',width:'100%'}}>Solicitudes abiertas<span style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',transform:subOpen==='solicitudesAbiertas'?'rotate(90deg)':'none',transition:'transform .2s',width:16,height:16,opacity:.7}}><IcoChevR/></span></div>{subOpen==='solicitudesAbiertas'&&<div style={{paddingLeft:12}}><div className={`sub-item${activeModule==='solicitudesComercial'?' active':''}`} onClick={()=>onModuleChange('solicitudesComercial')}>Comercial</div><div className={`sub-item${activeModule==='solicitudesEspecializada'?' active':''}`} onClick={()=>onModuleChange('solicitudesEspecializada')}>Especializados</div></div>}<div className={`sub-item${activeModule==='solicitudesRechazadas'?' active':''}`} onClick={()=>onModuleChange('solicitudesRechazadas')}>Solicitudes rechazadas</div><div className={`sub-item${activeModule==='solicitudesEliminadas'?' active':''}`} onClick={()=>onModuleChange('solicitudesEliminadas')}>Solicitudes eliminadas</div><div className={`sub-item${activeModule==='solicitudesTodas'?' active':''}`} onClick={()=>onModuleChange('solicitudesTodas')}>Todas las solicitudes</div></div><div className={ni('asignaciones')} onClick={()=>onAccordionToggle('asignaciones')}><IcoAsignaciones/><span className="nav-item-text">Asignaciones</span><span className="nav-arrow"><IcoChevR/></span></div><div className="sub-nav"><div className="sub-item" onClick={()=>onModuleChange('asignacionesPendientes')}>Asignaciones pendientes</div><div className="sub-item" onClick={()=>onModuleChange('asignacionesTerminadas')}>Asignaciones terminadas</div></div><div className={ni('cronogramas')} onClick={()=>onAccordionToggle('cronogramas')}><IcoCronogramas/><span className="nav-item-text" style={{opacity:0.5}}>Cronogramas</span><span className="nav-arrow"><IcoChevR/></span></div><div className="sub-nav"><div className="sub-item">Todos los cronogramas</div></div><div className={ni('maestroDeDocumentos')} onClick={()=>onModuleChange('maestroDeDocumentos')}><IcoMaestro/><span className="nav-item-text">Maestro de documentos</span></div><div className={ni('estructuraDeCostos')} onClick={()=>onModuleChange('estructuraDeCostos')}><IcoEstructura/><span className="nav-item-text">Estructura de costos</span></div><div className={ni('examenesMedicos')} onClick={()=>onModuleChange('examenesMedicos')}><IcoExamenes/><span className="nav-item-text">Exámenes médicos</span></div><div className={ni('usuarios')} onClick={()=>onAccordionToggle('usuarios')}><IcoUsuarios/><span className="nav-item-text">Usuarios y perfiles</span><span className="nav-arrow"><IcoChevR/></span></div><div className="sub-nav"><div className={`sub-item${activeModule==='usuarios'?' active':''}`} onClick={()=>onModuleChange('usuarios')}>Usuarios</div><div className={`sub-item${activeModule==='perfiles'?' active':''}`} onClick={()=>onModuleChange('perfiles')}>Perfiles</div><div className={`sub-item${activeModule==='usuariosEliminados'?' active':''}`} onClick={()=>onModuleChange('usuariosEliminados')}>Usuarios eliminados</div></div><div className={ni('indicadores')} onClick={()=>onAccordionToggle('indicadores')}><IcoIndicadores/><span className="nav-item-text" style={{opacity:0.5}}>Indicadores</span><span className="nav-arrow"><IcoChevR/></span></div><div className="sub-nav"><div className="sub-item">Panel de indicadores</div></div><div className="section-title">CUENTA</div><div className="nav-item"><IcoConfig/><span className="nav-item-text">Configuración de cuenta</span></div><div className="section-title">LICYCOLBA</div></nav></div></aside>);
}

/* ══════════════════════════════════════════════════════════════
   MODALES USUARIOS
══════════════════════════════════════════════════════════════ */
function ModalNuevoUsuario({onClose,onCreado}:{onClose:()=>void;onCreado:()=>void}){
  const [form,setForm]=useState<UserPayload>(PAYLOAD_VACIO);const[showPass,setShowPass]=useState(false);const[guardando,setGuardando]=useState(false);const[error,setError]=useState('');
  const set=(f:keyof UserPayload,v:string)=>setForm(p=>({...p,[f]:v}));
  const PT=({v}:{v:boolean})=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:15,height:15}}>{v?<><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg>);
  const handleGuardar=async()=>{setError('');if(!form.cedula||!form.email||!form.usuario||!form.rol||!form.cargo||!form.entidadGrupo||!form.celular){setError('Todos los campos * son obligatorios.');return;}if(!form.password||form.password.length<6){setError('La contraseña debe tener al menos 6 caracteres.');return;}setGuardando(true);try{const res=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const data=await res.json();if(!res.ok){setError(data.error??'Error al guardar.');return;}onCreado();onClose();}catch{setError('No se pudo conectar.');}finally{setGuardando(false);}};
  return(<div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-card"><div className="modal-header"><div style={{display:'flex',alignItems:'center',gap:8,color:'#1E5799'}}><IcoUsuarios/><h3 style={{margin:0,fontSize:15,fontWeight:600,color:'#111827'}}>Nuevo usuario</h3></div><button className="modal-close-btn" onClick={onClose}><IcoClose/></button></div>{error&&<div className="modal-error">{error}</div>}<div className="modal-body"><div className="form-row"><div className="form-field"><label>Cédula *</label><input type="text" autoComplete="off" value={form.cedula} onChange={e=>set('cedula',e.target.value)}/></div><div className="form-field"><label>Celular *</label><input type="tel" autoComplete="off" value={form.celular} onChange={e=>set('celular',e.target.value)}/></div></div><div className="form-row"><div className="form-field"><label>Entidad del grupo *</label><input type="text" autoComplete="off" value={form.entidadGrupo} onChange={e=>set('entidadGrupo',e.target.value)}/></div><div className="form-field"><label>Cargo *</label><input type="text" autoComplete="off" value={form.cargo} onChange={e=>set('cargo',e.target.value)}/></div></div><div className="form-row"><div className="form-field"><label>Email *</label><input type="text" autoComplete="off" value={form.email} onChange={e=>set('email',e.target.value)}/></div><div className="form-field"><label>Nombre de usuario *</label><input type="text" autoComplete="off" value={form.usuario} onChange={e=>set('usuario',e.target.value)}/></div></div><div className="form-row"><div className="form-field"><label>Rol *</label><input type="text" autoComplete="off" value={form.rol} onChange={e=>set('rol',e.target.value)}/></div><div className="form-field"><label>Estado</label><select value={form.estado} onChange={e=>set('estado',e.target.value)}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select></div></div><div className="form-row"><div className="form-field"><label>Contraseña * <span style={{fontSize:10.5,color:'#9ca3af',fontWeight:400}}>(mín. 6)</span></label><div style={{position:'relative'}}><input type={showPass?'text':'password'} placeholder="••••••••" autoComplete="new-password" style={{paddingRight:40}} value={form.password} onChange={e=>set('password',e.target.value)}/><button type="button" onClick={()=>setShowPass(v=>!v)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',border:'none',background:'transparent',cursor:'pointer',color:'#6b7280',width:24,height:24,padding:0,display:'flex',alignItems:'center',justifyContent:'center'}} tabIndex={-1}><PT v={showPass}/></button></div></div><div className="form-field"/></div></div><div className="modal-actions"><button className="modal-btn-cancel" onClick={onClose} disabled={guardando}>Cancelar</button><button className="modal-btn-save" onClick={handleGuardar} disabled={guardando}>{guardando?'Guardando…':'Guardar usuario'}</button></div></div></div>);
}
function ModalEditarUsuario({usuario:u,onClose,onGuardado}:{usuario:User;onClose:()=>void;onGuardado:()=>void}){
  const [form,setForm]=useState({cedula:u.cedula,celular:u.celular,entidadGrupo:u.entidadGrupo,cargo:u.cargo,email:u.email,usuario:u.usuario,rol:u.rol,estado:u.estado,firmaDigital:u.firmaDigital??'',password:''});const[showPass,setShowPass]=useState(false);const[guardando,setGuardando]=useState(false);const[error,setError]=useState('');
  const set=(f:keyof typeof form,v:string)=>setForm(p=>({...p,[f]:v}));
  const PT=({v}:{v:boolean})=>(<svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:15,height:15}}>{v?<><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg>);
  const handleGuardar=async()=>{setError('');if(!form.cedula||!form.email||!form.usuario||!form.rol||!form.cargo||!form.entidadGrupo||!form.celular){setError('Todos los campos * son obligatorios.');return;}if(form.password&&form.password.length<6){setError('La contraseña debe tener al menos 6 caracteres.');return;}setGuardando(true);try{const payload={...form};if(!payload.password)delete(payload as Partial<typeof payload>).password;const res=await fetch(`/api/users/${u.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok){setError(data.error??'Error al guardar.');return;}onGuardado();onClose();}catch{setError('No se pudo conectar.');}finally{setGuardando(false);}};
  return(<div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-card"><div className="modal-header"><div style={{display:'flex',alignItems:'center',gap:8,color:'#1E5799'}}><IcoPencil/><h3 style={{margin:0,fontSize:15,fontWeight:600,color:'#111827'}}>Editar usuario</h3></div><button className="modal-close-btn" onClick={onClose}><IcoClose/></button></div>{error&&<div className="modal-error">{error}</div>}<div className="modal-body"><div className="form-row"><div className="form-field"><label>Cédula *</label><input type="text" value={form.cedula} onChange={e=>set('cedula',e.target.value)}/></div><div className="form-field"><label>Celular *</label><input type="tel" value={form.celular} onChange={e=>set('celular',e.target.value)}/></div></div><div className="form-row"><div className="form-field"><label>Entidad del grupo *</label><input type="text" value={form.entidadGrupo} onChange={e=>set('entidadGrupo',e.target.value)}/></div><div className="form-field"><label>Cargo *</label><input type="text" value={form.cargo} onChange={e=>set('cargo',e.target.value)}/></div></div><div className="form-row"><div className="form-field"><label>Email *</label><input type="email" value={form.email} onChange={e=>set('email',e.target.value)}/></div><div className="form-field"><label>Nombre de usuario *</label><input type="text" value={form.usuario} onChange={e=>set('usuario',e.target.value)}/></div></div><div className="form-row"><div className="form-field"><label>Rol *</label><input type="text" value={form.rol} onChange={e=>set('rol',e.target.value)}/></div><div className="form-field"><label>Estado</label><select value={form.estado} onChange={e=>set('estado',e.target.value)}><option value="Activo">Activo</option><option value="Inactivo">Inactivo</option></select></div></div><div className="form-row"><div className="form-field"><label>Nueva contraseña <span style={{fontSize:10.5,color:'#9ca3af',fontWeight:400,marginLeft:6}}>(vacío = no cambiar)</span></label><div style={{position:'relative'}}><input type={showPass?'text':'password'} placeholder="••••••••" autoComplete="new-password" style={{paddingRight:40}} value={form.password} onChange={e=>set('password',e.target.value)}/><button type="button" onClick={()=>setShowPass(v=>!v)} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',border:'none',background:'transparent',cursor:'pointer',color:'#6b7280',width:24,height:24,padding:0,display:'flex',alignItems:'center',justifyContent:'center'}} tabIndex={-1}><PT v={showPass}/></button></div></div><div className="form-field"/></div></div><div className="modal-actions"><button className="modal-btn-cancel" onClick={onClose} disabled={guardando}>Cancelar</button><button className="modal-btn-save" onClick={handleGuardar} disabled={guardando}>{guardando?'Guardando…':'Guardar cambios'}</button></div></div></div>);
}
function ModalConfirmarEliminarUsuario({usuarios:sel,onClose,onEliminado,sesion}:{usuarios:User[];onClose:()=>void;onEliminado:()=>void;sesion:Sesion}){
  const [eliminando,setEliminando]=useState(false);const[error,setError]=useState('');
  const handleEliminar=async()=>{setError('');setEliminando(true);try{const r=await Promise.all(sel.map(u=>fetch(`/api/users/${u.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({deletedByUsuario:sesion.usuario,deletedByEmail:sesion.email})}).then(r=>r.json())));if(r.some((x:Record<string,unknown>)=>x.error)){setError('Algunos usuarios no pudieron eliminarse.');return;}onEliminado();onClose();}catch{setError('Error de conexión.');}finally{setEliminando(false);}};
  return(<div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-card" style={{maxWidth:420}}><div className="modal-header"><div style={{display:'flex',alignItems:'center',gap:8,color:'#ef4444'}}><IcoTrash/><h3 style={{margin:0,fontSize:15,fontWeight:600,color:'#111827'}}>Confirmar eliminación</h3></div><button className="modal-close-btn" onClick={onClose}><IcoClose/></button></div>{error&&<div className="modal-error">{error}</div>}<div className="modal-body"><p style={{fontSize:13,color:'#374151',margin:0}}>Vas a eliminar <strong>{sel.length} usuario{sel.length>1?'s':''}</strong>:</p><ul style={{margin:'10px 0 0',paddingLeft:18,fontSize:12,color:'#6b7280'}}>{sel.map(u=><li key={u.id}>{u.usuario} — {u.email}</li>)}</ul><p style={{fontSize:12,color:'#ef4444',marginTop:12,fontWeight:500}}>Esta acción no se puede deshacer.</p></div><div className="modal-actions"><button className="modal-btn-cancel" onClick={onClose} disabled={eliminando}>Cancelar</button><button onClick={handleEliminar} disabled={eliminando} style={{height:34,padding:'0 18px',border:'none',borderRadius:6,background:'#ef4444',color:'white',fontFamily:'var(--font)',fontSize:12,fontWeight:600,cursor:'pointer'}}>{eliminando?'Eliminando…':`Eliminar ${sel.length>1?sel.length+' usuarios':'usuario'}`}</button></div></div></div>);
}

/* ══════════════════════════════════════════════════════════════
   MODAL CONFIRMAR ELIMINAR SOLICITUD
══════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════
   EXCEL
══════════════════════════════════════════════════════════════ */
function exportarExcel(usuarios:User[]){
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hacer=(XLSX:any)=>{const cab=['ID','Cédula','Celular','Entidad del grupo','Cargo','Email','Usuario','Rol','Estado'];const filas=usuarios.map(u=>[u.id,u.cedula,u.celular,u.entidadGrupo,u.cargo,u.email,u.usuario,u.rol,u.estado]);const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([cab,...filas]);XLSX.utils.book_append_sheet(wb,ws,'Usuarios');XLSX.writeFile(wb,`usuarios_${new Date().toISOString().slice(0,10)}.xlsx`);};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if((window as any).XLSX){hacer((window as any).XLSX);return;}
  const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s.onload=()=>hacer((window as any).XLSX);document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════════
   MÓDULO USUARIOS
══════════════════════════════════════════════════════════════ */
function ModuloUsuarios({sesion,onSesionActualizada}:{sesion:Sesion;onSesionActualizada:(s:Sesion)=>void}){
  const [usuarios,setUsuarios]=useState<User[]>([]);const[cargando,setCargando]=useState(true);const[errorCarga,setErrorCarga]=useState('');const[busqueda,setBusqueda]=useState('');const[seleccionados,setSeleccionados]=useState<number[]>([]);const[modalAbierto,setModalAbierto]=useState(false);const[modalEditar,setModalEditar]=useState<User|null>(null);const[modalEliminar,setModalEliminar]=useState(false);
  const cargarUsuarios=useCallback(async()=>{setCargando(true);setErrorCarga('');try{const res=await fetch('/api/users');if(!res.ok)throw new Error();setUsuarios(await res.json());}catch{setErrorCarga('No se pudo cargar usuarios.');}finally{setCargando(false);};},[]);
  useEffect(()=>{cargarUsuarios();},[cargarUsuarios]);
  const filtrados=usuarios.filter(u=>{const q=busqueda.toLowerCase();return[u.cedula,u.entidadGrupo,u.cargo,u.email,u.usuario,u.rol].some(v=>v.toLowerCase().includes(q));});
  const todosMarcados=filtrados.length>0&&seleccionados.length===filtrados.length;
  const toggleAll=(c:boolean)=>setSeleccionados(c?filtrados.map(u=>u.id):[]);
  const toggleOne=(id:number,c:boolean)=>setSeleccionados(p=>c?[...p,id]:p.filter(x=>x!==id));
  if(cargando)return<div className="content"><div className="module-status">Cargando usuarios…</div></div>;
  if(errorCarga)return<div className="content"><div className="module-status error">{errorCarga}</div></div>;
  return(<>{modalAbierto&&<ModalNuevoUsuario onClose={()=>setModalAbierto(false)} onCreado={cargarUsuarios}/>}{modalEditar&&<ModalEditarUsuario usuario={modalEditar} onClose={()=>setModalEditar(null)} onGuardado={()=>{setSeleccionados([]);cargarUsuarios();if(modalEditar.email===sesion.email){const s:Sesion={usuario:modalEditar.usuario,cargo:modalEditar.cargo,email:modalEditar.email,entidadGrupo:modalEditar.entidadGrupo,rol:modalEditar.rol};guardarSesion(s);onSesionActualizada(s);}}}/>}{modalEliminar&&<ModalConfirmarEliminarUsuario usuarios={usuarios.filter(u=>seleccionados.includes(u.id))} onClose={()=>setModalEliminar(false)} onEliminado={()=>{setSeleccionados([]);cargarUsuarios();}} sesion={sesion}/>}<div className="content"><div className="page-header"><div className="page-title"><IcoUsuarios/><span>Usuarios : {filtrados.length} / {usuarios.length}</span></div><div className="page-actions"><input type="text" className="search-box" placeholder="Buscar…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/><button className="icon-btn" title="Información"><IcoInfo/></button><button className="icon-btn" title="Actualizar" onClick={()=>{setBusqueda('');cargarUsuarios();}}><IcoRefresh/></button><button className="icon-btn blue-fill" title="Nuevo usuario" onClick={()=>setModalAbierto(true)}><IcoPlus/></button><button className="icon-btn" title="Editar" disabled={seleccionados.length!==1} onClick={()=>{const u=usuarios.find(u=>u.id===seleccionados[0]);if(u)setModalEditar(u);}}><IcoPencil/></button><button className="icon-btn red" title="Eliminar" disabled={seleccionados.length===0} onClick={()=>setModalEliminar(true)}><IcoTrash/></button><button className="icon-btn green" title="Exportar Excel" onClick={()=>exportarExcel(filtrados)}><IcoExcel/></button></div></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th style={{width:36}}><div className="th-top"><input type="checkbox" className="cbx" checked={todosMarcados} onChange={e=>toggleAll(e.target.checked)}/></div></th>{([[140,'Cédula'],[130,'Celular'],[180,'Entidad del grupo'],[180,'Cargo'],[220,'Email'],[160,'Usuario'],[160,'Rol'],[110,'Estado']] as [number,string][]).map(([w,label])=><th key={label} style={{minWidth:w}}><div className="th-top">{label}</div></th>)}<th style={{minWidth:110,textAlign:'center'}}><div className="th-top">Firma digital</div></th></tr><tr><th/>{Array.from({length:9}).map((_,i)=><th key={i}><div style={{padding:'0 10px 5px',color:'#d1d5db',fontSize:11}}>≡</div></th>)}</tr></thead><tbody>{filtrados.length===0?<tr><td colSpan={10} style={{textAlign:'center',color:'#6b7280',padding:'28px 10px'}}>{busqueda?'Sin resultados.':'No hay usuarios registrados.'}</td></tr>:filtrados.map(u=><tr key={u.id}><td className="center"><input type="checkbox" className="cbx" checked={seleccionados.includes(u.id)} onChange={e=>toggleOne(u.id,e.target.checked)}/></td><td>{u.cedula}</td><td>{u.celular}</td><td>{u.entidadGrupo}</td><td>{u.cargo}</td><td>{u.email}</td><td>{u.usuario}</td><td>{u.rol}</td><td><span className="badge" style={{background:u.estado==='Activo'?'#d1fae5':'#fee2e2',color:u.estado==='Activo'?'#065f46':'#dc2626',fontSize:11}}>{u.estado}</span></td><td style={{textAlign:'center'}}><button className="firma-btn" title="Cargar firma digital" onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#EAF2FB';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';}}><IcoUpload/></button></td></tr>)}</tbody></table></div><div className="pagination-bar"><span>{filtrados.length>0?`1 - ${filtrados.length} de ${usuarios.length}`:`0 de ${usuarios.length}`}</span></div></div></div></>);
}

/* ══════════════════════════════════════════════════════════════
   MODAL DOCUMENTOS (Búsqueda)
══════════════════════════════════════════════════════════════ */
function ModalDocumentos({p,onClose}:{p:LiciProceso;onClose:()=>void}){
  const docs=p.documentos??[];
  const extInfo=(d:LiciDocumento)=>{const src=(d.ruta||d.url||'').toLowerCase();if(src.includes('.xlsx')||src.includes('.xls'))return{bg:'#E8F5E9',color:'#1B5E20',border:'#A5D6A7',label:'XLS'};if(src.includes('.docx')||src.includes('.doc'))return{bg:'#E3F2FD',color:'#0D47A1',border:'#90CAF9',label:'DOC'};if(src.includes('.zip')||src.includes('.rar'))return{bg:'#F3E5F5',color:'#4A148C',border:'#CE93D8',label:'ZIP'};return{bg:'#FFEBEE',color:'#B71C1C',border:'#EF9A9A',label:'PDF'};};
  return(<div className="modal-overlay" style={{zIndex:1100}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div style={{background:'white',borderRadius:12,width:'92vw',maxWidth:760,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(15,32,64,.18)',overflow:'hidden',border:'1px solid #e2e8f0'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 24px',borderBottom:'1px solid #f1f5f9',flexShrink:0}}><div><h3 style={{margin:0,fontSize:15,fontWeight:700,color:'#0f172a'}}>Documentos del proceso</h3><div style={{fontSize:11.5,color:'#64748b',marginTop:3}}>{p.entidad||''}{p.codigoProceso?` · ${p.codigoProceso}`:''}</div></div><button onClick={onClose} style={{width:30,height:30,borderRadius:'50%',background:'white',border:'1px solid #e2e8f0',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8'}} onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}} onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><div style={{padding:'10px 24px',background:'#EAF2FB',borderBottom:'1px solid #D0E4F3',flexShrink:0,display:'flex',alignItems:'center',gap:10}}><div style={{width:28,height:28,borderRadius:6,background:'#1E5799',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg fill="none" stroke="white" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg></div><span style={{fontSize:12.5,color:'#1E5799',fontWeight:500}}><strong style={{fontWeight:700}}>{docs.length}</strong> documento{docs.length!==1?'s':''} disponible{docs.length!==1?'s':''} para descarga</span></div><div style={{overflowY:'auto',flex:1,padding:'14px 20px',display:'flex',flexDirection:'column',gap:6}}>{docs.length===0?<div style={{textAlign:'center',color:'#94a3b8',padding:'40px 0',fontSize:13}}>No hay documentos disponibles.</div>:docs.map((d,i)=>{const ext=extInfo(d);const url=d.ruta||d.url||'';return(<div key={i} style={{display:'flex',alignItems:'center',gap:12,background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 14px'}} onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#A8CCEC';(e.currentTarget as HTMLDivElement).style.background='#FAFCFF';}} onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLDivElement).style.background='white';}}><div style={{width:40,height:40,borderRadius:8,flexShrink:0,background:ext.bg,border:`1px solid ${ext.border}`,color:ext.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800}}>{ext.label}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:12.5,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.nombre||`Documento ${i+1}`}</div>{url&&<div style={{fontSize:10.5,color:'#94a3b8',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{url}</div>}</div>{url?<a href={url} target="_blank" rel="noopener noreferrer" style={{flexShrink:0,display:'inline-flex',alignItems:'center',gap:5,height:30,padding:'0 14px',borderRadius:6,background:'#1E5799',color:'white',fontSize:11.5,fontWeight:600,textDecoration:'none',whiteSpace:'nowrap'}}><svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar</a>:<span style={{fontSize:11,color:'#94a3b8',flexShrink:0}}>Sin enlace</span>}</div>);})}</div><div style={{padding:'10px 20px',borderTop:'1px solid #f1f5f9',flexShrink:0,display:'flex',justifyContent:'flex-end'}}><button onClick={onClose} style={{height:32,padding:'0 18px',borderRadius:6,border:'1px solid #e2e8f0',background:'white',color:'#374151',fontSize:12,fontWeight:500,fontFamily:'var(--font)',cursor:'pointer'}}>Cerrar</button></div></div></div>);
}

function CopiarLinkBtn({url}:{url:string}){const[copiado,setCopiado]=React.useState(false);const copiar=(e:React.MouseEvent)=>{e.stopPropagation();navigator.clipboard.writeText(url).then(()=>{setCopiado(true);setTimeout(()=>setCopiado(false),1800);});};return(<button onClick={copiar} style={{flexShrink:0,display:'inline-flex',alignItems:'center',gap:5,height:30,padding:'0 14px',borderRadius:20,border:'1.5px solid #16a34a',color:copiado?'white':'#16a34a',background:copiado?'#16a34a':'white',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--font)',whiteSpace:'nowrap',transition:'all .2s'}}>{copiado?<><svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:11,height:11}}><path d="M20 6L9 17l-5-5"/></svg>Copiado</>:<><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:11,height:11}}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copiar link</>}</button>);}
function useSecopLink(codigoProceso:string,aliasFuente:string){const[link,setLink]=React.useState<string|null>(null);const[loading,setLoading]=React.useState(false);React.useEffect(()=>{if(!codigoProceso)return;const alias=aliasFuente.toUpperCase();if(alias!=='S1'&&alias!=='S2')return;setLoading(true);fetch(`/api/licitaciones/secop-link?codigo=${encodeURIComponent(codigoProceso)}&alias=${alias}`).then(r=>r.json()).then(data=>{if(data.ok&&data.link)setLink(data.link);}).catch(()=>{}).finally(()=>setLoading(false));},[codigoProceso,aliasFuente]);return{link,loading};}

function VerDocumentosBtn({p}:{p:LiciProceso}){const[open,setOpen]=React.useState(false);return(<>{open&&<ModalDocumentos p={p} onClose={()=>setOpen(false)}/>}<button onClick={e=>{e.stopPropagation();setOpen(true);}} style={{display:'inline-flex',alignItems:'center',gap:6,height:28,padding:'0 14px',borderRadius:20,border:'1.5px solid #1E5799',color:'#1E5799',background:'white',fontSize:11,fontWeight:600,fontFamily:'var(--font)',cursor:'pointer'}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>Ver documentos{(p.documentos?.length??0)>0?` (${p.documentos!.length})`:''}</button></>);}

function ModalDetalleProceso({p,onClose,onGestionar}:{p:LiciProceso;onClose:()=>void;onGestionar?:()=>Promise<void>}){
  const [guardando,setGuardando]=useState(false);const[errorGuardar,setErrorGuardar]=useState('');
  const fmt=(raw:string|null)=>{if(!raw)return null;const d=new Date(raw.replace(' ','T'));if(Number.isNaN(d.getTime()))return raw;return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});};
  const fmtV=(v:number|null)=>{if(v==null||Number.isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};
  const portal=portalColorModal(p.aliasFuente||'',p.fuente||'',p.fuente||'');
  const eb=estadoModalColor(p.estado||'');const pc=p.perfil?perfilColor(p.perfil):null;
  const {link:secopLink,loading:secopLoading}=useSecopLink(p.codigoProceso||'',p.aliasFuente||'');
  const modalidad=p.modalidad?(MMAP_MODALIDAD[p.modalidad]??p.modalidad):null;const valor=fmtV(p.valor);
  const hasDoc=p.documentos&&p.documentos.length>0;const hasCron=p.cronogramas&&p.cronogramas.length>0;
  const fuentes:Array<{label:string;url:string}>=[];
  if(p.fuentes?.length){p.fuentes.forEach(f=>{const u=String(f.url||f.link||'');if(u)fuentes.push({label:String(f.nombre||portal.label),url:u});});}
  if(!fuentes.length&&p.linkSecop)fuentes.push({label:portal.label,url:p.linkSecop});
  if(!fuentes.length&&p.linkDetalle)fuentes.push({label:portal.label,url:p.linkDetalle});
  const sT:React.CSSProperties={fontSize:11,fontWeight:700,color:'#1E5799',textTransform:'uppercase',letterSpacing:'0.07em',paddingBottom:10,marginBottom:2,borderBottom:'1px solid #f1f5f9'};
  const rB:React.CSSProperties={display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'8px 0',borderBottom:'1px solid #f8fafc',fontSize:12.5};
  const rL:React.CSSProperties={color:'#64748b',flex:1,paddingRight:16};
  const rV:React.CSSProperties={color:'#1e293b',whiteSpace:'nowrap',textAlign:'right' as const};
  const hG=async()=>{if(!onGestionar)return;setGuardando(true);setErrorGuardar('');try{await onGestionar();}catch(e){setErrorGuardar(e instanceof Error?e.message:'Error al guardar.');}finally{setGuardando(false);}};
  return(<div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div style={{background:'white',borderRadius:12,width:'94vw',maxWidth:840,maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 16px 48px rgba(15,32,64,.16)',overflow:'hidden',border:'1px solid #e2e8f0'}}><div style={{background:'white',borderBottom:'1px solid #f1f5f9',padding:'18px 24px',flexShrink:0}}><div style={{display:'flex',alignItems:'flex-start',gap:14}}><div style={{width:42,height:42,borderRadius:'50%',background:portal.bg,color:portal.color,fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{portal.short}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:15,fontWeight:600,color:'#0f172a',marginBottom:6,lineHeight:1.3}}>{p.entidad||'Detalle del proceso'}</div><div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>{p.codigoProceso&&<span style={{fontSize:11,color:'#64748b',background:'#f1f5f9',padding:'2px 8px',borderRadius:4}}>{p.codigoProceso}</span>}{p.estado&&<span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:eb.color,background:eb.bg,padding:'3px 10px',borderRadius:20}}><span style={{width:5,height:5,borderRadius:'50%',background:eb.dot,flexShrink:0}}/>{p.estado}</span>}{pc&&<span style={{fontSize:11,color:pc.color,background:pc.bg,padding:'3px 10px',borderRadius:20,fontWeight:600}}>{pc.label}</span>}</div></div><button onClick={onClose} style={{width:28,height:28,borderRadius:'50%',border:'1px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',flexShrink:0}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M18 6L6 18M6 6l12 12"/></svg></button></div></div><div style={{overflowY:'auto',flex:1,padding:'14px 24px 18px',display:'flex',flexDirection:'column',gap:10}}>{(p.objeto||p.nombre)&&<div style={{background:'#FAFCFF',border:'1px solid #D0E4F3',borderRadius:8,padding:'12px 16px'}}><div style={{fontSize:10,fontWeight:700,color:'#1E5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:6}}>Objeto del proceso</div><p style={{margin:0,fontSize:13,color:'#1e293b',lineHeight:1.65}}>{p.objeto||p.nombre}</p></div>}<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}><div style={sT}>Información general</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',columnGap:32}}>{[{label:'Entidad',value:<strong style={{fontWeight:600}}>{p.entidad||'—'}</strong>},{label:'Número del proceso',value:p.codigoProceso||'—'},...(modalidad?[{label:'Modalidad',value:modalidad}]:[]),{label:'Fuente / portal',value:portal.label},{label:'Estado',value:<span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:eb.color,background:eb.bg,padding:'2px 10px',borderRadius:20}}><span style={{width:5,height:5,borderRadius:'50%',background:eb.dot}}/>{p.estado||'—'}</span>},...(p.departamento?[{label:'Localización',value:p.departamento}]:[]),...(valor?[{label:'Presupuesto oficial',value:<span style={{fontWeight:700,color:'#15803d'}}>{valor}</span>}]:[]),...(pc?[{label:'Perfil de negocio',value:<span style={{color:pc.color,fontWeight:600}}>{pc.label}</span>}]:[])].map((item,i)=><div key={i} style={{padding:'9px 0',borderBottom:'1px solid #f8fafc'}}><div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:3}}>{item.label}</div><div style={{fontSize:12.5,color:'#1e293b'}}>{item.value}</div></div>)}</div></div><div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}><div style={sT}>Cronograma de fechas</div>{fmt(p.fechaPublicacion)&&<div style={rB}><span style={rL}>Fecha de publicación</span><span style={rV}>{fmt(p.fechaPublicacion)}</span></div>}{fmt(p.fechaVencimiento)&&<div style={{...rB,borderBottom:hasCron?'1px solid #f8fafc':'none'}}><span style={rL}>Fecha de vencimiento</span><span style={{...rV,color:'#dc2626',fontWeight:600}}>{fmt(p.fechaVencimiento)}</span></div>}{hasCron&&p.cronogramas!.map((cr,i)=><div key={i} style={{...rB,borderBottom:i<p.cronogramas!.length-1?'1px solid #f8fafc':'none'}}><span style={rL}>{cr.nombre||`Etapa ${i+1}`}</span><span style={rV}>{cr.fecha||'—'}</span></div>)}</div>{fuentes.length>0&&<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}><div style={sT}>Fuentes relacionadas</div>{fuentes.map((f,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:i>0?'8px 0 0':'2px 0 0'}}><span style={{fontSize:11,fontWeight:600,color:'#475569',flexShrink:0,minWidth:64}}>{f.label}</span><a href={f.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11.5,color:'#1E5799',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.url}</a><CopiarLinkBtn url={f.url}/></div>)}</div>}{p.linkDetalle&&<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><div><div style={{fontSize:11,fontWeight:700,color:'#1E5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:3}}>Documentos del proceso</div><div style={{fontSize:12,color:'#94a3b8'}}>{hasDoc?`${p.documentos!.length} documento${p.documentos!.length!==1?'s':''} disponible${p.documentos!.length!==1?'s':''}`:''}</div></div><VerDocumentosBtn p={p}/></div></div>}{errorGuardar&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:12}}>⚠️ {errorGuardar}</div>}</div><div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,padding:'12px 24px',borderTop:'1px solid #e2e8f0',background:'white',flexShrink:0}}>{(secopLink||p.linkDetalle)&&<a href={secopLink||p.linkDetalle} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:6,height:34,padding:'0 14px',borderRadius:8,border:'1px solid #D0E4F3',background:'white',color:secopLoading?'#94a3b8':'#1E5799',fontSize:12,fontWeight:500,textDecoration:'none'}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>{secopLoading?'Buscando link…':'Abrir en portal'}</a>}{onGestionar&&<button onClick={hG} disabled={guardando} style={{display:'inline-flex',alignItems:'center',gap:6,height:34,padding:'0 16px',borderRadius:8,background:guardando?'#6b93c4':'#1E5799',color:'white',border:'none',fontSize:12,fontWeight:600,fontFamily:'var(--font)',cursor:guardando?'not-allowed':'pointer'}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>{guardando?'Guardando…':'Gestionar proceso'}</button>}<button onClick={onClose} style={{height:34,padding:'0 16px',borderRadius:8,border:'1px solid #e2e8f0',background:'white',color:'#374151',fontSize:12,fontFamily:'var(--font)',cursor:'pointer'}}>Cerrar</button></div></div></div>);
}

/* ══════════════════════════════════════════════════════════════
   TARJETA PROCESO
══════════════════════════════════════════════════════════════ */
function TarjetaProceso({p,onDetalle,leido}:{p:LiciProceso;onDetalle:()=>void;leido:boolean}){
  const fV=(v:number|null)=>{if(v==null||Number.isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};
  const fD=(r:string|null)=>{if(!r)return null;const d=new Date(r);return Number.isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});};
  const portal=portalColor(p.aliasFuente||'',p.fuente||'');const eb=estadoBadgeColor(p.estado||'');const pc=p.perfil?perfilColor(p.perfil):null;
  const valor=fV(p.valor);const fecha=fD(p.fechaPublicacion);const vence=fD(p.fechaVencimiento);
  return(<div onClick={onDetalle} style={{background:'white',border:`1px solid ${leido?'#e2e8f0':'#bbf7d0'}`,borderRadius:12,padding:'16px 18px',cursor:'pointer',transition:'box-shadow .15s, border-color .15s',position:'relative',overflow:'hidden'}} onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='0 4px 16px rgba(0,0,0,.09)';(e.currentTarget as HTMLDivElement).style.borderColor=leido?'#A8CCEC':'#86efac';}} onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.boxShadow='none';(e.currentTarget as HTMLDivElement).style.borderColor=leido?'#e2e8f0':'#bbf7d0';}}>{!leido&&<div style={{position:'absolute',top:12,left:12,background:'#dcfce7',color:'#166534',fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:20}}>No leído</div>}<div style={{display:'flex',alignItems:'flex-start',gap:12,marginTop:leido?0:24}}><div style={{position:'relative',flexShrink:0}} onMouseOver={e=>{const t=e.currentTarget.querySelector('.portal-tip') as HTMLElement;if(t)t.style.opacity='1';}} onMouseOut={e=>{const t=e.currentTarget.querySelector('.portal-tip') as HTMLElement;if(t)t.style.opacity='0';}}><div style={{width:38,height:38,borderRadius:'50%',background:portal.bg,color:portal.color,fontSize:11,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center'}}>{portal.label}</div><div className="portal-tip" style={{opacity:0,pointerEvents:'none',transition:'opacity .15s',position:'absolute',top:'110%',left:'50%',transform:'translateX(-50%)',background:'#1e293b',color:'white',fontSize:11,fontWeight:600,whiteSpace:'nowrap',padding:'4px 10px',borderRadius:6,zIndex:100}}>{p.fuente||portal.label}<div style={{position:'absolute',bottom:'100%',left:'50%',transform:'translateX(-50%)',width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderBottom:'5px solid #1e293b'}}/></div></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:700,color:'#0f172a',lineHeight:1.3,marginBottom:2}}>{p.entidad||'—'}</div>{p.codigoProceso&&<div style={{fontSize:11,color:'#94a3b8',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.codigoProceso}</div>}</div><div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}><span style={{fontSize:11,fontWeight:600,padding:'3px 12px',borderRadius:20,background:eb.bg,color:eb.color}}>{p.estado||'—'}</span>{pc&&<span style={{fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:20,background:pc.bg,color:pc.color}}>{pc.label}</span>}</div></div><div style={{fontSize:12.5,color:'#334155',lineHeight:1.5,marginTop:12,marginLeft:50,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const,overflow:'hidden'}}>{p.objeto||p.nombre||'—'}</div><div style={{display:'flex',alignItems:'center',gap:16,marginTop:10,marginLeft:50,flexWrap:'wrap'}}>{valor&&<span style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{valor}</span>}{p.departamento&&<span style={{fontSize:11,color:'#64748b',display:'flex',alignItems:'center',gap:3}}><svg fill="currentColor" viewBox="0 0 20 20" style={{width:11,height:11}}><path d="M10 2a6 6 0 00-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 00-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z"/></svg>{p.departamento}</span>}{fecha&&<span style={{fontSize:11,color:'#94a3b8'}}>📅 {fecha}</span>}{vence&&<span style={{fontSize:11,color:'#ef4444',fontWeight:500}}>⏰ Vence: {vence}</span>}</div><div style={{height:1,background:'#f1f5f9',margin:'12px 0 10px'}}/><div style={{display:'flex',alignItems:'center',gap:8}} onClick={e=>e.stopPropagation()}><VerDocumentosBtn p={p}/><button onClick={onDetalle} style={{display:'inline-flex',alignItems:'center',gap:5,height:28,padding:'0 14px',borderRadius:20,border:'1.5px solid #1E5799',color:'#1E5799',background:'white',fontSize:11,fontWeight:600,fontFamily:'var(--font)',cursor:'pointer'}}><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>Gestionar proceso</button></div></div>);
}

/* ══════════════════════════════════════════════════════════════
   MÓDULO BÚSQUEDA
══════════════════════════════════════════════════════════════ */
function ModuloBusquedaProcesos({onModuleChange,sesion}:{onModuleChange?:(mod:string)=>void;sesion?:Sesion}){
  const [busqueda,setBusqueda]=useState('');const[pagina,setPagina]=useState(1);const[resultado,setResultado]=useState<ProcesosApiResponse|null>(null);const[cargando,setCargando]=useState(true);const[syncing,setSyncing]=useState(false);const[error,setError]=useState('');const[detalle,setDetalle]=useState<LiciProceso|null>(null);
  const [leidos,setLeidos]=useState<Set<string>>(()=>{try{const r=localStorage.getItem('lici_leidos');return r?new Set(JSON.parse(r) as string[]):new Set();}catch{return new Set();}});
  const [pF,setPF]=useState(false);const[fEnt,setFEnt]=useState<'all'|'aseocolba'|'tempocolba'|'vigicolba'>('all');const[fPor,setFPor]=useState<'all'|'publico'|'privado'>('all');const[fDpto,setFDpto]=useState('');const[fCod,setFCod]=useState('');const[fFD,setFFD]=useState('');const[fFH,setFFH]=useState('');const[fFuente,setFFuente]=useState('all');
  const [fA,setFA]=useState({entidad:'all' as 'all'|'aseocolba'|'tempocolba'|'vigicolba',portal:'all' as 'all'|'publico'|'privado',fuente:'all',dpto:'',codigo:'',fechaDesde:'',fechaHasta:''});
  const hayFA=fA.entidad!=='all'||fA.portal!=='all'||fA.fuente!=='all'||fA.dpto||fA.codigo||fA.fechaDesde||fA.fechaHasta;
  const aplicar=()=>{setFA({entidad:fEnt,portal:fPor,fuente:fFuente,dpto:fDpto,codigo:fCod,fechaDesde:fFD,fechaHasta:fFH});setPagina(1);setPF(false);};
  const limpiar=()=>{setFEnt('all');setFPor('all');setFFuente('all');setFDpto('');setFCod('');setFFD('');setFFH('');setFA({entidad:'all',portal:'all',fuente:'all',dpto:'',codigo:'',fechaDesde:'',fechaHasta:''});setBusqueda('');setPagina(1);};
  const POR_PAGINA=30;
  const marcarLeido=(p:LiciProceso)=>{const key=p.codigoProceso||p.linkDetalle||String(p.id);if(!key||leidos.has(key))return;const next=new Set(leidos).add(key);setLeidos(next);try{localStorage.setItem('lici_leidos',JSON.stringify([...next]));}catch{/**/}};
  const abrirDetalle=(p:LiciProceso)=>{marcarLeido(p);setDetalle(p);};const esLeido=(p:LiciProceso)=>leidos.has(p.codigoProceso||p.linkDetalle||String(p.id));
  const consultar=useCallback(async(pag:number)=>{setCargando(true);setError('');try{const res=await fetch(`/api/procesos?page=${pag}&limit=${POR_PAGINA}`);const data:ProcesosApiResponse=await res.json();if(!res.ok||!data.ok){setError(data.error??`Error ${res.status}`);setResultado(null);}else{setResultado(data);}}catch{setError('No se pudo conectar.');setResultado(null);}finally{setCargando(false);};},[]);
  useEffect(()=>{consultar(1);},[consultar]);
  const handleSync=async()=>{setSyncing(true);setError('');try{const res=await fetch('/api/procesos/sync',{method:'POST'});const data=await res.json();if(!data.ok){setError(`Sync falló: ${data.errores?.[0]??'Error'}`); }else{await consultar(1);setPagina(1);}}catch{setError('No se pudo ejecutar el sync.');}finally{setSyncing(false);}};
  const handleGestionar=async(p:LiciProceso)=>{
    const res=await fetch('/api/solicitudes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      externalId:p.id||null,codigoProceso:p.codigoProceso,nombreProceso:p.nombre,
      entidad:p.entidad,objeto:p.objeto,fuente:p.fuente,aliasFuente:p.aliasFuente,
      modalidad:p.modalidad,perfil:p.perfil,departamento:p.departamento,
      estadoFuente:p.estado,fechaPublicacion:p.fechaPublicacion,
      fechaVencimiento:p.fechaVencimiento,valor:p.valor,
      linkDetalle:p.linkDetalle,linkSecop:p.linkSecop,linkSecopReg:p.linkSecopReg,
      usuarioRegistro:sesion?.usuario??'',emailRegistro:sesion?.email??'',
      cargoRegistro:sesion?.cargo??'',entidadRegistro:sesion?.entidadGrupo??'',
      estadoSolicitud:'En revisión',
      docData: p.documentos??[],
      procData: (p.cronogramas??[]).reduce((acc:Record<string,{fechaI:string;fechaF:string;obs:string}>,cr,i)=>({
        ...acc,
        [`step_${i}`]:{fechaI:cr.fecha??'',fechaF:cr.fecha??'',obs:cr.nombre??`Etapa ${i+1}`},
      }),{}),
    })});
    const data=await res.json();
    if(!res.ok||!data.ok)throw new Error(data.error??'No se pudo crear la solicitud');
    setDetalle(null);onModuleChange?.('solicitudesAbiertas');
  };
  const filtrados=useMemo(()=>{if(!resultado?.procesos)return[];let l=resultado.procesos;if(fA.entidad!=='all')l=l.filter(p=>(p.perfil||'').toLowerCase()===fA.entidad.toLowerCase());if(fA.portal!=='all')l=l.filter(p=>{const f=(p.fuente||p.aliasFuente||'').toLowerCase();return fA.portal==='publico'?f.includes('secop'):!f.includes('secop');});if(fA.fuente!=='all')l=l.filter(p=>{const f=(p.fuente||p.aliasFuente||'').toLowerCase();if(fA.fuente==='secop i')return f.includes('secop i')&&!f.includes('secop ii');if(fA.fuente==='secop ii')return f.includes('secop ii');if(fA.fuente==='otro')return!f.includes('secop');return true;});if(fA.dpto.trim()){const d=fA.dpto.toLowerCase();l=l.filter(p=>(p.departamento||'').toLowerCase().includes(d));}if(fA.codigo.trim()){const c=fA.codigo.toLowerCase();l=l.filter(p=>(p.codigoProceso||'').toLowerCase().includes(c)||(p.entidad||'').toLowerCase().includes(c)||(p.objeto||'').toLowerCase().includes(c));}if(fA.fechaDesde){const desde=new Date(fA.fechaDesde);l=l.filter(p=>{if(!p.fechaPublicacion)return false;return new Date(p.fechaPublicacion.replace(' ','T'))>=desde;});}if(fA.fechaHasta){const hasta=new Date(fA.fechaHasta);hasta.setHours(23,59,59);l=l.filter(p=>{if(!p.fechaPublicacion)return false;return new Date(p.fechaPublicacion.replace(' ','T'))<=hasta;});}if(busqueda.trim()){const q=busqueda.toLowerCase();l=l.filter(p=>[p.entidad,p.nombre,p.objeto,p.codigoProceso,p.departamento,p.estado,p.fuente,p.perfil].some(v=>(v||'').toLowerCase().includes(q)));}return l;},[resultado,fA,busqueda]);
  const totalApi=resultado?.total_resultados_api??0;const totalPages=Math.max(1,Math.ceil(totalApi/POR_PAGINA));
  const handlePagina=(p:number)=>{setPagina(p);consultar(p);};const handleRefresh=()=>{setPagina(1);setBusqueda('');limpiar();consultar(1);};
  const badgesFiltros=[fA.entidad!=='all'&&{label:`Entidad: ${fA.entidad}`,clear:()=>setFA(f=>({...f,entidad:'all'}))},fA.portal!=='all'&&{label:`Tipo: ${fA.portal==='publico'?'Público':'Privado'}`,clear:()=>setFA(f=>({...f,portal:'all'}))},fA.fuente!=='all'&&{label:`Fuente: ${fA.fuente}`,clear:()=>setFA(f=>({...f,fuente:'all'}))},fA.dpto&&{label:`Dpto: ${fA.dpto}`,clear:()=>setFA(f=>({...f,dpto:''}))},fA.codigo&&{label:`Código: ${fA.codigo}`,clear:()=>setFA(f=>({...f,codigo:''}))},fA.fechaDesde&&{label:`Desde: ${fA.fechaDesde}`,clear:()=>setFA(f=>({...f,fechaDesde:''}))},fA.fechaHasta&&{label:`Hasta: ${fA.fechaHasta}`,clear:()=>setFA(f=>({...f,fechaHasta:''}))}].filter(Boolean) as {label:string;clear:()=>void}[];
  const dptosSug=useMemo(()=>{if(!resultado?.procesos)return[];const s=new Set(resultado.procesos.map(p=>(p.departamento||'').split(':')[0].trim()).filter(Boolean));return Array.from(s).sort();},[resultado]);
  const sEl:React.CSSProperties={width:'100%',height:34,border:'1px solid #e2e8f0',borderRadius:8,padding:'0 10px',fontSize:12.5,fontFamily:'var(--font)',color:'#374151',background:'white',outline:'none',cursor:'pointer'};
  const iEl:React.CSSProperties={width:'100%',height:34,border:'1px solid #e2e8f0',borderRadius:8,padding:'0 10px',fontSize:12.5,fontFamily:'var(--font)',color:'#374151',outline:'none',boxSizing:'border-box'};
  const lEl:React.CSSProperties={fontSize:11.5,fontWeight:600,color:'#64748b',display:'block',marginBottom:5};
  return(<>{detalle&&<ModalDetalleProceso p={detalle} onClose={()=>setDetalle(null)} onGestionar={()=>handleGestionar(detalle)}/>}
  {pF&&<div style={{position:'fixed',inset:0,zIndex:900}} onClick={()=>setPF(false)}><div onClick={e=>e.stopPropagation()} style={{position:'fixed',top:52,right:12,width:304,maxHeight:'calc(100vh - 70px)',background:'white',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,.18)',border:'1px solid #e2e8f0',display:'flex',flexDirection:'column',zIndex:901,overflow:'hidden'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px 12px',borderBottom:'1px solid #f1f5f9',flexShrink:0}}><span style={{fontSize:13.5,fontWeight:700,color:'#0f172a'}}>Filtrar procesos</span><button onClick={()=>setPF(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:20,lineHeight:1,padding:'0 2px'}}>×</button></div><div style={{overflowY:'auto',flex:1,padding:'14px 16px'}}><div style={{marginBottom:13}}><label style={lEl}>Entidad del grupo</label><select value={fEnt} onChange={e=>setFEnt(e.target.value as typeof fEnt)} style={sEl}><option value="all">Todas</option><option value="aseocolba">Aseocolba</option><option value="tempocolba">Tempocolba</option><option value="vigicolba">Vigicolba</option></select></div><div style={{marginBottom:13}}><label style={lEl}>Tipo de proceso</label><select value={fPor} onChange={e=>setFPor(e.target.value as typeof fPor)} style={sEl}><option value="all">Todos</option><option value="publico">Público</option><option value="privado">Privado</option></select></div><div style={{marginBottom:13}}><label style={lEl}>Portal / Fuente</label><select value={fFuente} onChange={e=>setFFuente(e.target.value)} style={sEl}><option value="all">Todos</option><option value="secop i">SECOP I</option><option value="secop ii">SECOP II</option><option value="otro">Otro</option></select></div><div style={{marginBottom:13}}><label style={lEl}>Departamento</label><select value={fDpto} onChange={e=>setFDpto(e.target.value)} style={sEl}><option value="">Todos</option>{dptosSug.map(d=><option key={d} value={d}>{d}</option>)}</select></div><div style={{marginBottom:13}}><label style={lEl}>No. proceso / Entidad / Objeto</label><input type="text" value={fCod} onChange={e=>setFCod(e.target.value)} placeholder="Ej. MC-007-2026…" style={iEl}/></div><div style={{marginBottom:13}}><label style={lEl}>Fecha publicación — desde</label><input type="date" value={fFD} onChange={e=>setFFD(e.target.value)} style={iEl}/></div><div style={{marginBottom:4}}><label style={lEl}>Fecha publicación — hasta</label><input type="date" value={fFH} onChange={e=>setFFH(e.target.value)} style={iEl}/></div></div><div style={{padding:'12px 16px',borderTop:'1px solid #f1f5f9',display:'flex',gap:8,flexShrink:0}}><button onClick={aplicar} style={{flex:1,height:36,borderRadius:8,background:'#1E5799',color:'white',border:'none',fontSize:13,fontWeight:700,fontFamily:'var(--font)',cursor:'pointer'}}>Aplicar</button><button onClick={limpiar} style={{height:36,padding:'0 16px',borderRadius:8,background:'white',color:'#64748b',border:'1px solid #e2e8f0',fontSize:13,fontFamily:'var(--font)',cursor:'pointer'}}>Limpiar</button></div></div></div>}
  <div className="content"><div className="page-header"><div className="page-title"><svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:16,height:16}}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><span>Búsqueda de procesos</span></div><div className="page-actions"><input type="text" className="search-box" placeholder="Buscar en resultados…" value={busqueda} onChange={e=>setBusqueda(e.target.value)} disabled={cargando}/><button className={`icon-btn${hayFA?' active':''}`} title="Filtrar" onClick={()=>{setFEnt(fA.entidad);setFPor(fA.portal);setFDpto(fA.dpto);setFCod(fA.codigo);setFFD(fA.fechaDesde);setFFH(fA.fechaHasta);setFFuente(fA.fuente);setPF(v=>!v);}} style={{position:'relative'}}><IcoFilter/>{hayFA&&<span style={{position:'absolute',top:2,right:2,width:7,height:7,borderRadius:'50%',background:'#ef4444',border:'1.5px solid white'}}/>}</button><button className="icon-btn" title="Recargar" onClick={handleRefresh} disabled={cargando||syncing}><IcoRefresh/></button><button className="icon-btn" title="Sincronizar" onClick={handleSync} disabled={syncing||cargando} style={{position:'relative',borderColor:syncing?'#1E5799':undefined,color:syncing?'#1E5799':undefined}}><IcoSync/>{syncing&&<span style={{position:'absolute',top:-3,right:-3,width:8,height:8,borderRadius:'50%',background:'#1E5799',border:'1.5px solid white'}}/>}</button></div></div>
  {badgesFiltros.length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>{badgesFiltros.map((b,i)=><span key={i} style={{display:'inline-flex',alignItems:'center',gap:5,height:24,padding:'0 10px',borderRadius:20,background:'#EAF2FB',color:'#1E5799',fontSize:11,fontWeight:600}}>{b.label}<button onClick={b.clear} style={{background:'none',border:'none',cursor:'pointer',color:'#2E7BC4',fontSize:13,lineHeight:1,padding:0,display:'flex',alignItems:'center'}}>×</button></span>)}<button onClick={limpiar} style={{height:24,padding:'0 10px',borderRadius:20,background:'#fee2e2',color:'#dc2626',fontSize:11,fontWeight:600,border:'none',cursor:'pointer',fontFamily:'var(--font)'}}>Limpiar todos</button></div>}
  {syncing&&<div style={{background:'#EAF2FB',border:'1px solid #D0E4F3',borderRadius:8,padding:'10px 14px',color:'#1E5799',fontSize:12,marginBottom:12}}>🔄 Sincronizando procesos…</div>}
  {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:12,marginBottom:12}}>⚠️ {error}</div>}
  {cargando&&!syncing&&<div className="module-status">Cargando procesos…</div>}
  {!cargando&&resultado&&(<>{filtrados.length===0?<div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:12,padding:'40px 20px',textAlign:'center',color:'#94a3b8',fontSize:13}}>{totalApi===0?<><p style={{margin:'0 0 12px'}}>No hay procesos en la base local.</p><button onClick={handleSync} disabled={syncing} style={{height:36,padding:'0 20px',borderRadius:8,background:'#1E5799',color:'white',border:'none',fontSize:13,fontWeight:600,fontFamily:'var(--font)',cursor:'pointer'}}>Sincronizar ahora</button></>:busqueda?`Sin resultados para "${busqueda}".`:'Sin resultados.'}</div>:<div style={{display:'flex',flexDirection:'column',gap:10}}>{filtrados.map((p,i)=><TarjetaProceso key={`${p.codigoProceso||p.linkDetalle||p.objeto}-${i}`} p={p} leido={esLeido(p)} onDetalle={()=>abrirDetalle(p)}/>)}</div>}
  <div className="pagination-bar" style={{marginTop:16}}><span>{totalApi>0?`${(pagina-1)*POR_PAGINA+1} – ${Math.min(pagina*POR_PAGINA,totalApi)} de ${totalApi.toLocaleString('es-CO')}`:'0 resultados'}</span><div className="pages"><button className="page-btn" onClick={()=>handlePagina(pagina-1)} disabled={pagina<=1||cargando}>‹</button>{(()=>{const total=totalPages;let pages:(number|-1)[]=[];if(total<=7){pages=Array.from({length:total},(_,i)=>i+1);}else{pages=[1];if(pagina>3)pages.push(-1);for(let i=Math.max(2,pagina-1);i<=Math.min(total-1,pagina+1);i++)pages.push(i);if(pagina<total-2)pages.push(-1);pages.push(total);}return pages.map((n,i)=>n===-1?<span key={`el${i}`} style={{padding:'0 3px',color:'#9ca3af',fontSize:12}}>…</span>:<button key={n} className={`page-btn${n===pagina?' active':''}`} onClick={()=>n!==pagina&&handlePagina(n)} disabled={cargando}>{n}</button>);})()}<button className="page-btn" onClick={()=>handlePagina(pagina+1)} disabled={pagina>=totalPages||cargando}>›</button></div></div></>)}</div></>);
}
const ModuloBusquedaFinal=ModuloBusquedaProcesos;

/* ══════════════════════════════════════════════════════════════
   MODAL DETALLES DEL PROCESO (desde solicitud)
   Muestra la información original del proceso capturado.
   Solo lectura — similar al modal de Búsqueda de procesos.
══════════════════════════════════════════════════════════════ */
function ModalDetallesProceso({sol,onClose}:{sol:Solicitud;onClose:()=>void}){
  const fmtFecha=(r:string|null)=>{if(!r)return null;const d=new Date(r.replace(' ','T'));if(Number.isNaN(d.getTime()))return r;return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});};
  const fmtV=(v:number|null)=>{if(v==null||Number.isNaN(v)||v===0)return null;return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};

  const portal=portalColorModal(sol.aliasFuente||'',sol.fuente||'',sol.fuente||'');
  const eb=estadoModalColor(sol.estadoFuente||'');
  const pc=sol.perfil?perfilColor(sol.perfil):null;
  const modalidadLabel=MMAP_MODALIDAD[sol.modalidad]??sol.modalidad??'—';
  const valor=fmtV(sol.valor);

  const docArr=Array.isArray(sol.docData)
    ?sol.docData as Array<{nombre?:string;url?:string;ruta?:string;[k:string]:unknown}>
    :[];
  const procDataEntries=Object.entries(sol.procData||{}).filter(([,v])=>v?.fechaI);
  const obsArr=Array.isArray(sol.obsData)
    ?sol.obsData as Array<{texto?:string;autor?:string;fecha?:string;[k:string]:unknown}>
    :[];
  const asigArr=Array.isArray(sol.asignaciones)
    ?sol.asignaciones as Array<{nombre?:string;cargo?:string;rol?:string;[k:string]:unknown}>
    :[];

  const fuentes:Array<{label:string;url:string}>=[];
  if(sol.linkSecop)fuentes.push({label:portal.short,url:sol.linkSecop});
  if(sol.linkSecopReg&&sol.linkSecopReg!==sol.linkSecop)fuentes.push({label:'Reg.',url:sol.linkSecopReg});
  if(sol.linkDetalle&&sol.linkDetalle!==sol.linkSecop)fuentes.push({label:'Detalle',url:sol.linkDetalle});

  const extInfo=(url:string)=>{const s=(url||'').toLowerCase();if(s.includes('.xlsx')||s.includes('.xls'))return{bg:'#E8F5E9',color:'#1B5E20',border:'#A5D6A7',label:'XLS'};if(s.includes('.docx')||s.includes('.doc'))return{bg:'#E3F2FD',color:'#0D47A1',border:'#90CAF9',label:'DOC'};if(s.includes('.zip')||s.includes('.rar'))return{bg:'#F3E5F5',color:'#4A148C',border:'#CE93D8',label:'ZIP'};return{bg:'#FFEBEE',color:'#B71C1C',border:'#EF9A9A',label:'PDF'};};

  const sT:React.CSSProperties={fontSize:11,fontWeight:700,color:'#1E5799',textTransform:'uppercase',letterSpacing:'0.07em',paddingBottom:10,marginBottom:10,borderBottom:'1px solid #f1f5f9'};
  const rB:React.CSSProperties={display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'8px 0',borderBottom:'1px solid #f8fafc',fontSize:12.5};

  return(
    <div className="modal-overlay" style={{zIndex:1050}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'white',borderRadius:12,width:'94vw',maxWidth:860,maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(15,32,64,.22)',overflow:'hidden',border:'1px solid #e2e8f0'}}>

        {/* HEADER */}
        <div style={{background:'white',borderBottom:'1px solid #f1f5f9',padding:'18px 24px',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
            <div style={{width:42,height:42,borderRadius:'50%',background:portal.bg,color:portal.color,fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{portal.short}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:600,color:'#0f172a',marginBottom:6,lineHeight:1.3}}>{sol.entidad||'Detalle del proceso'}</div>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                {sol.codigoProceso&&<span style={{fontSize:11,color:'#64748b',background:'#f1f5f9',padding:'2px 8px',borderRadius:4}}>{sol.codigoProceso}</span>}
                {sol.estadoFuente&&<span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:eb.color,background:eb.bg,padding:'3px 10px',borderRadius:20}}><span style={{width:5,height:5,borderRadius:'50%',background:eb.dot,flexShrink:0}}/>{sol.estadoFuente}</span>}
                {pc&&<span style={{fontSize:11,color:pc.color,background:pc.bg,padding:'3px 10px',borderRadius:20,fontWeight:600}}>{pc.label}</span>}
                <span style={{fontSize:10,color:'#94a3b8',background:'#f8fafc',padding:'2px 8px',borderRadius:4,border:'1px solid #e2e8f0'}}>Solo lectura</span>
              </div>
            </div>
            <button onClick={onClose} style={{width:28,height:28,borderRadius:'50%',border:'1px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',flexShrink:0}}
              onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}}
              onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#94a3b8';}}>
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* CUERPO */}
        <div style={{overflowY:'auto',flex:1,padding:'16px 24px 20px',display:'flex',flexDirection:'column',gap:12}}>

          {/* Objeto */}
          {sol.objeto&&(
            <div style={{background:'#FAFCFF',border:'1px solid #D0E4F3',borderRadius:8,padding:'12px 16px'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#1E5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:6}}>Objeto del proceso</div>
              <p style={{margin:0,fontSize:13,color:'#1e293b',lineHeight:1.65}}>{sol.objeto}</p>
            </div>
          )}

          {/* Info general */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}>
            <div style={sT}>Información general</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',columnGap:32}}>
              {[
                {label:'Entidad',value:<strong style={{fontWeight:600}}>{sol.entidad||'—'}</strong>},
                {label:'Número del proceso',value:<span style={{fontFamily:'monospace'}}>{sol.codigoProceso||'—'}</span>},
                {label:'Modalidad',value:modalidadLabel},
                {label:'Fuente / portal',value:portal.label},
                {label:'Estado fuente',value:sol.estadoFuente?<span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,color:eb.color,background:eb.bg,padding:'2px 10px',borderRadius:20}}><span style={{width:5,height:5,borderRadius:'50%',background:eb.dot}}/>{sol.estadoFuente}</span>:'—'},
                ...(sol.departamento?[{label:'Localización',value:sol.departamento}]:[]),
                ...(valor?[{label:'Presupuesto oficial',value:<span style={{fontWeight:700,color:'#15803d'}}>{valor}</span>}]:[]),
                ...(pc?[{label:'Perfil de negocio',value:<span style={{color:pc.color,fontWeight:600}}>{pc.label}</span>}]:[]),
                ...(sol.plataforma?[{label:'Plataforma',value:sol.plataforma}]:[]),
                ...(sol.ciudad?[{label:'Ciudad',value:sol.ciudad}]:[]),
              ].map((item,i)=>(
                <div key={i} style={{padding:'9px 0',borderBottom:'1px solid #f8fafc'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:3}}>{item.label}</div>
                  <div style={{fontSize:12.5,color:'#1e293b'}}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Cronograma / fechas */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}>
            <div style={sT}>Cronograma de fechas</div>
            {sol.fechaPublicacion&&(
              <div style={rB}>
                <span style={{color:'#64748b',flex:1,paddingRight:16}}>Fecha de publicación</span>
                <span style={{color:'#1e293b',whiteSpace:'nowrap'}}>{fmtFecha(sol.fechaPublicacion)}</span>
              </div>
            )}
            {sol.fechaVencimiento&&(
              <div style={{...rB,borderBottom:procDataEntries.length>0?'1px solid #f8fafc':'none'}}>
                <span style={{color:'#64748b',flex:1,paddingRight:16}}>Fecha de vencimiento</span>
                <span style={{color:'#dc2626',fontWeight:600,whiteSpace:'nowrap'}}>{fmtFecha(sol.fechaVencimiento)}</span>
              </div>
            )}
            {procDataEntries.map(([k,v],i)=>{
              const idx=Number(k.replace('step_',''));
              const flujo=getFlujo(sol.modalidad,sol.fuente);
              const paso=flujo[idx];
              return(
                <div key={k} style={{...rB,borderBottom:i<procDataEntries.length-1?'1px solid #f8fafc':'none'}}>
                  <span style={{color:'#64748b',flex:1,paddingRight:16}}>{v.obs||paso?.label?.replace('\n',' ')||`Etapa ${idx+1}`}</span>
                  <span style={{color:'#1e293b',whiteSpace:'nowrap'}}>{v.fechaI}{v.fechaF&&v.fechaF!==v.fechaI?` → ${v.fechaF}`:''}</span>
                </div>
              );
            })}
            {!sol.fechaPublicacion&&!sol.fechaVencimiento&&procDataEntries.length===0&&(
              <p style={{fontSize:12,color:'#94a3b8',margin:0}}>Sin fechas registradas.</p>
            )}
          </div>

          {/* Fuentes / Links */}
          {fuentes.length>0&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}>
              <div style={sT}>Fuentes y enlaces</div>
              {fuentes.map((f,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:i>0?'8px 0 0':'2px 0 0'}}>
                  <span style={{fontSize:11,fontWeight:600,color:'#475569',flexShrink:0,minWidth:64}}>{f.label}</span>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11.5,color:'#1E5799',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.url}</a>
                  <CopiarLinkBtn url={f.url}/>
                </div>
              ))}
            </div>
          )}

          {/* Documentación */}
          <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}>
            <div style={sT}>Documentación</div>
            {docArr.length===0
              ?<p style={{fontSize:12,color:'#94a3b8',margin:0}}>Sin documentos registrados.</p>
              :docArr.map((d,i)=>{
                const url=d.ruta||d.url||'';
                const ext=extInfo(url);
                return(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:12,background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 14px',marginBottom:i<docArr.length-1?6:0}}
                    onMouseOver={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#A8CCEC';(e.currentTarget as HTMLDivElement).style.background='#FAFCFF';}}
                    onMouseOut={e=>{(e.currentTarget as HTMLDivElement).style.borderColor='#e2e8f0';(e.currentTarget as HTMLDivElement).style.background='white';}}>
                    <div style={{width:40,height:40,borderRadius:8,flexShrink:0,background:ext.bg,border:`1px solid ${ext.border}`,color:ext.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800}}>{ext.label}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.nombre||`Documento ${i+1}`}</div>
                      {url&&<div style={{fontSize:10.5,color:'#94a3b8',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{url}</div>}
                    </div>
                    {url
                      ?<a href={url} target="_blank" rel="noopener noreferrer" style={{flexShrink:0,display:'inline-flex',alignItems:'center',gap:5,height:30,padding:'0 14px',borderRadius:6,background:'#1E5799',color:'white',fontSize:11.5,fontWeight:600,textDecoration:'none',whiteSpace:'nowrap'}}>
                        <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Descargar
                      </a>
                      :<span style={{fontSize:11,color:'#94a3b8',flexShrink:0}}>Sin enlace</span>
                    }
                  </div>
                );
              })
            }
          </div>

          {/* Observaciones */}
          {obsArr.length>0&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}>
              <div style={sT}>Observaciones</div>
              {obsArr.map((ob,i)=>(
                <div key={i} style={{background:'#FAFCFF',border:'1px solid #D0E4F3',borderRadius:8,padding:'8px 12px',marginBottom:i<obsArr.length-1?6:0}}>
                  {ob.autor&&<div style={{fontSize:10.5,fontWeight:700,color:'#1a5ea8',marginBottom:3}}>{String(ob.autor)}{ob.fecha?` · ${String(ob.fecha)}`:''}</div>}
                  <div style={{fontSize:12,color:'#374151',lineHeight:1.5}}>{String(ob.texto||JSON.stringify(ob))}</div>
                </div>
              ))}
            </div>
          )}

          {/* Asignaciones */}
          {asigArr.length>0&&(
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 16px'}}>
              <div style={sT}>Asignaciones</div>
              {asigArr.map((a,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:6,padding:'7px 10px',marginBottom:i<asigArr.length-1?5:0}}>
                  <div style={{width:26,height:26,borderRadius:'50%',background:'#1a5ea8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <svg fill="none" stroke="white" strokeWidth={2} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
                  </div>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:'#1e293b'}}>{String(a.nombre||`Asignado ${i+1}`)}</div>
                    {(a.cargo||a.rol)&&<div style={{fontSize:10.5,color:'#64748b'}}>{String(a.cargo||a.rol||'')}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 24px',borderTop:'1px solid #e2e8f0',background:'white',flexShrink:0}}>
          <div style={{fontSize:11,color:'#94a3b8'}}>Datos capturados al momento de gestionar · Solicitud #{sol.id}</div>
          <div style={{display:'flex',gap:8}}>
            {(sol.linkSecop||sol.linkDetalle)&&(
              <a href={sol.linkSecop||sol.linkDetalle} target="_blank" rel="noopener noreferrer"
                style={{display:'inline-flex',alignItems:'center',gap:6,height:34,padding:'0 14px',borderRadius:8,border:'1px solid #D0E4F3',background:'white',color:'#1E5799',fontSize:12,fontWeight:500,textDecoration:'none'}}>
                <IcoExternalLink/>Abrir en portal
              </a>
            )}
            <button onClick={onClose} style={{height:34,padding:'0 18px',borderRadius:8,border:'1px solid #e2e8f0',background:'white',color:'#374151',fontSize:12,fontFamily:'var(--font)',cursor:'pointer'}}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MODAL PROCESO — Control de solicitud (edición de estado)
   ModalDetallesProceso se abre desde aquí con el botón.
══════════════════════════════════════════════════════════════ */
function ModalProceso({sol,onClose,onGuardado}:{sol:Solicitud;onClose:()=>void;onGuardado:(updated:Solicitud)=>void}){
  const [nuevoEstado,setNuevoEstado]=useState<string>(sol.estadoSolicitud||'En revisión');
  const [guardando,setGuardando]=useState(false);
  const [error,setError]=useState('');
  const [guardadoOk,setGuardadoOk]=useState(false);
  const [verDetalle,setVerDetalle]=useState(false);

  const fmtFechaHora=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});};

  const pc=sol.perfil?perfilColor(sol.perfil):null;
  const ebc=estadoSolicitudColor(sol.estadoSolicitud||'');
  const portalInfo=portalColor(sol.aliasFuente||'',sol.fuente||'');

  const sqrLabel=sol.sqrError?'Error SQR':sol.sqrNumero?sol.sqrNumero:'Sin SQR';
  const sqrBg=sol.sqrError?'#fef2f2':sol.sqrNumero?'#E8F5E9':'#f1f5f9';
  const sqrColor=sol.sqrError?'#dc2626':sol.sqrNumero?'#15803d':'#64748b';

  const guardarEstado=async()=>{
    if(nuevoEstado===sol.estadoSolicitud){onClose();return;}
    setGuardando(true);setError('');setGuardadoOk(false);
    try{
      const res=await fetch('/api/solicitudes',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:sol.id,estadoSolicitud:nuevoEstado})});
      const data=await res.json();
      if(!res.ok||!data.ok){setError(data.error??'Error al guardar.');return;}
      setGuardadoOk(true);
      const updated:Solicitud={...sol,...data.solicitud,estadoSolicitud:nuevoEstado};
      onGuardado(updated);
      setTimeout(()=>onClose(),800);
    }catch{setError('No se pudo conectar.');}
    finally{setGuardando(false);}
  };

  const filaInfo=(label:string,valor:React.ReactNode)=>(
    <div style={{display:'flex',flexDirection:'column',gap:2,marginBottom:10}}>
      <span style={{fontSize:9.5,fontWeight:700,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.07em'}}>{label}</span>
      <span style={{fontSize:12.5,color:'#1e293b',lineHeight:1.4}}>{valor}</span>
    </div>
  );

  return(
    <>
      {verDetalle&&<ModalDetallesProceso sol={sol} onClose={()=>setVerDetalle(false)}/>}

      <div className="modal-overlay" style={{zIndex:900}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        <div style={{background:'white',borderRadius:12,width:'94vw',maxWidth:680,maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(15,32,64,.22)',overflow:'hidden',border:'1px solid #e2e8f0'}}>

          {/* HEADER */}
          <div style={{background:'linear-gradient(135deg,#0d2d5e 0%,#1a5ea8 100%)',padding:'16px 22px',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:14}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
                  <span style={{fontSize:11,fontWeight:700,color:'rgba(255,255,255,0.6)',letterSpacing:'0.06em'}}>FICHA DE SOLICITUD #{sol.id}</span>
                  <span style={{fontSize:11,padding:'2px 10px',borderRadius:20,background:ebc.bg,color:ebc.color,fontWeight:700}}>{sol.estadoSolicitud}</span>
                  {pc&&<span style={{fontSize:11,padding:'2px 10px',borderRadius:20,background:pc.bg,color:pc.color,fontWeight:600}}>{pc.label}</span>}
                  <span style={{fontSize:11,padding:'2px 8px',borderRadius:6,background:'rgba(255,255,255,0.15)',color:'white',fontWeight:600}}>{portalInfo.label}</span>
                </div>
                <div style={{fontSize:15,fontWeight:700,color:'white',lineHeight:1.3,marginBottom:4}}>{sol.entidad||sol.nombreProceso||'Proceso sin nombre'}</div>
                <div style={{fontSize:11.5,color:'rgba(255,255,255,0.7)',fontFamily:'monospace'}}>{sol.codigoProceso||''}</div>
              </div>
              <button onClick={onClose} style={{width:30,height:30,borderRadius:'50%',border:'1px solid rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.1)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'white',flexShrink:0}}
                onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.2)';}}
                onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.1)';}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          {/* BANNER SQR */}
          <div style={{background:sqrBg,borderBottom:'1px solid #e2e8f0',padding:'10px 22px',flexShrink:0,display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:28,height:28,borderRadius:6,background:sol.sqrNumero?'#15803d':sol.sqrError?'#dc2626':'#94a3b8',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {sol.sqrNumero
                  ?<svg fill="none" stroke="white" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M20 6L9 17l-5-5"/></svg>
                  :sol.sqrError
                    ?<svg fill="none" stroke="white" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                    :<svg fill="none" stroke="white" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                }
              </div>
              <div>
                <div style={{fontSize:9.5,fontWeight:700,color:'#64748b',textTransform:'uppercase' as const,letterSpacing:'0.07em'}}>SQR — Generado automáticamente</div>
                <div style={{fontSize:13.5,fontWeight:700,color:sqrColor,fontFamily:'monospace',marginTop:1}}>{sqrLabel}</div>
              </div>
            </div>
            {sol.fechaAperturaSqr&&(
              <div style={{display:'flex',flexDirection:'column',gap:1}}>
                <span style={{fontSize:9.5,fontWeight:700,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.07em'}}>Apertura SQR</span>
                <span style={{fontSize:11.5,color:'#374151',fontWeight:500}}>{fmtFechaHora(sol.fechaAperturaSqr)}</span>
              </div>
            )}
            {sol.fechaCierreSqr&&(
              <div style={{display:'flex',flexDirection:'column',gap:1}}>
                <span style={{fontSize:9.5,fontWeight:700,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.07em'}}>Cierre SQR</span>
                <span style={{fontSize:11.5,color:'#374151',fontWeight:500}}>{fmtFechaHora(sol.fechaCierreSqr)}</span>
              </div>
            )}
            {sol.sqrCerrada&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#6b7280',color:'white',fontWeight:600}}>SQR Cerrada</span>}
            {sol.sqrError&&<div style={{flex:1,minWidth:180}}><span style={{fontSize:11,color:'#dc2626',lineHeight:1.4}}>{sol.sqrError}</span></div>}
          </div>

          {/* CUERPO */}
          <div style={{flex:1,overflowY:'auto',padding:'18px 22px',display:'flex',flexDirection:'column',gap:16}}>

            {/* Resumen read-only del proceso */}
            <div style={{background:'#FAFCFF',border:'1px solid #D0E4F3',borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#1E5799',textTransform:'uppercase' as const,letterSpacing:'0.08em',marginBottom:12,paddingBottom:8,borderBottom:'2px solid #EAF2FB'}}>
                Resumen del proceso
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 24px'}}>
                {filaInfo('Entidad / Cliente',<strong style={{fontWeight:600}}>{sol.entidad||'—'}</strong>)}
                {filaInfo('Número de proceso',<span style={{fontFamily:'monospace'}}>{sol.codigoProceso||'—'}</span>)}
                {filaInfo('Modalidad',MMAP_MODALIDAD[sol.modalidad]||sol.modalidad||'—')}
                {filaInfo('Fuente',`${sol.fuente||'—'}${sol.plataforma?` (${sol.plataforma})`:''}`)}
                {filaInfo('Registrado por',`${sol.usuarioRegistro||'—'}${sol.cargoRegistro?` · ${sol.cargoRegistro}`:''}`)}
                {filaInfo('Fecha registro',fmtFechaHora(sol.createdAt))}
              </div>

              {/* Botón Ver datos del proceso */}
              <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid #D0E4F3'}}>
                <button
                  onClick={()=>setVerDetalle(true)}
                  style={{display:'inline-flex',alignItems:'center',gap:8,height:36,padding:'0 18px',borderRadius:8,border:'1.5px solid #1E5799',background:'white',color:'#1E5799',fontSize:12.5,fontWeight:600,fontFamily:'var(--font)',cursor:'pointer',transition:'all .15s'}}
                  onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#EAF2FB';(e.currentTarget as HTMLButtonElement).style.borderColor='#1a5ea8';}}
                  onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.borderColor='#1E5799';}}>
                  <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}>
                    <path d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V8.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0014.586 2H5a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                  </svg>
                  Ver datos del proceso
                </button>
              </div>
            </div>

            {/* Control de solicitud — única sección editable */}
            <div style={{background:'#FAFCFF',border:'1px solid #D0E4F3',borderRadius:10,padding:'14px 16px'}}>
              <div style={{fontSize:10,fontWeight:700,color:'#1E5799',textTransform:'uppercase' as const,letterSpacing:'0.08em',marginBottom:12,paddingBottom:8,borderBottom:'2px solid #EAF2FB'}}>
                Control de solicitud
              </div>
              <div style={{fontSize:11.5,color:'#64748b',marginBottom:10,lineHeight:1.5}}>
                Solo puedes cambiar el estado a <strong>Rechazada</strong> o volver a <strong>En revisión</strong>.
              </div>
              <label style={{fontSize:11,fontWeight:700,color:'#374151',display:'block',marginBottom:6}}>Estado de la solicitud</label>
              <select
                value={nuevoEstado}
                onChange={e=>setNuevoEstado(e.target.value)}
                style={{width:'100%',height:38,border:'2px solid #1a5ea8',borderRadius:8,padding:'0 12px',fontSize:13,fontFamily:'var(--font)',color:'#1e293b',background:'white',outline:'none',cursor:'pointer',fontWeight:600}}>
                <option value="En revisión">En revisión</option>
                <option value="Rechazada">Rechazada</option>
              </select>
              {nuevoEstado!==sol.estadoSolicitud&&(
                <div style={{marginTop:8,fontSize:11,color:'#0369a1',background:'#e0f2fe',borderRadius:6,padding:'5px 10px'}}>
                  ← Cambiará de <strong>{sol.estadoSolicitud}</strong> a <strong>{nuevoEstado}</strong>
                </div>
              )}
            </div>
          </div>

          {/* FOOTER */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 22px',borderTop:'2px solid #EAF2FB',background:'#FAFCFF',flexShrink:0}}>
            <div style={{fontSize:11,color:'#94a3b8'}}>Solicitud #{sol.id} · {fmtFechaHora(sol.createdAt)}</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {guardadoOk&&<span style={{fontSize:11.5,color:'#15803d',fontWeight:600,display:'flex',alignItems:'center',gap:4}}><svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M20 6L9 17l-5-5"/></svg>Guardado</span>}
              {error&&<span style={{fontSize:11.5,color:'#dc2626'}}>⚠️ {error}</span>}
              <button onClick={onClose} style={{height:36,padding:'0 16px',borderRadius:8,border:'1px solid #e2e8f0',background:'white',color:'#374151',fontSize:12,fontFamily:'var(--font)',cursor:'pointer',fontWeight:500}}>Cerrar</button>
              <button onClick={guardarEstado} disabled={guardando} style={{height:36,padding:'0 20px',borderRadius:8,background:guardando?'#6b93c4':'#1a5ea8',color:'white',border:'none',fontSize:12,fontWeight:700,fontFamily:'var(--font)',cursor:guardando?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:6}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{width:12,height:12}}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {guardando?'Guardando…':'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   MÓDULO SOLICITUDES ABIERTAS
══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   MODAL EDITAR SOLICITUD
══════════════════════════════════════════════════════════════ */
function ModalEditarSolicitud({sol,sesion,onClose,onGuardado}:{sol:Solicitud;sesion:Sesion;onClose:()=>void;onGuardado:(updated:Solicitud)=>void}){
  const fmtFechaInput=(r:string|null)=>{if(!r)return'';try{return new Date(r).toISOString().slice(0,10);}catch{return'';}};
  const fmtFechaDisplay=(r:string)=>{try{return new Date(r).toLocaleString('es-CO',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).replace(',','');}catch{return r;}};

  // Detectar tipo de proceso desde sede o fuente
  const tipoInicial=(()=>{
    if(sol.sede==='Público'||sol.sede==='Privado')return sol.sede;
    if((sol.fuente||'').toLowerCase().includes('secop'))return'Público';
    return '';
  })();
  // Detectar modalidad: si modalidad contiene " — " viene de flujo antiguo, separar
  const modalidadParts=sol.modalidad?.includes(' — ')?(sol.modalidad.split(' — ')):[null,sol.modalidad||''];
  const subtipoInicial=modalidadParts[1]||'';

  const [form,setForm]=useState({
    fechaCreacion:fmtFechaDisplay(sol.createdAt),
    nombrePersonal:sol.usuarioRegistro||sesion.usuario,
    tipoProceso:tipoInicial,
    subtipoProceso:subtipoInicial,
    entidadGrupo:sol.perfil||'',
    ciudad:sol.ciudad||'',
    entidad:sol.entidad||'',
    codigoProceso:sol.codigoProceso||'',
    objeto:sol.objeto||'',
    valor:sol.valor?String(sol.valor):'',
    plataforma:sol.plataforma||'',
    fechaCierre:fmtFechaInput(sol.fechaCierre),
  });
  const [guardando,setGuardando]=useState(false);
  const [error,setError]=useState('');

  const set=(f:string,v:string)=>setForm(p=>{const next={...p,[f]:v};try{localStorage.setItem(DRAFT_KEY,JSON.stringify(next));setTieneBorrador(true);}catch{/**/}return next;});
  const subtipos=SUBTIPOS[form.tipoProceso]||[];

  const handleGuardar=async()=>{
    setError('');
    if(!form.tipoProceso||!form.entidadGrupo||!form.ciudad||!form.entidad||!form.codigoProceso||!form.objeto){
      setError('Los campos marcados con * son obligatorios.');return;
    }
    setGuardando(true);
    try{
      const res=await fetch('/api/solicitudes',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        id:              sol.id,
        codigoProceso:   form.codigoProceso,
        nombreProceso:   form.objeto,
        entidad:         form.entidad,
        objeto:          form.objeto,
        modalidad:       form.subtipoProceso||form.tipoProceso,
        sede:            form.tipoProceso,
        perfil:          form.entidadGrupo,
        ciudad:          form.ciudad,
        plataforma:      form.plataforma||sol.plataforma||'Manual',
        fechaCierre:     form.fechaCierre||null,
        valor:           form.valor?Number(form.valor.replace(/[^0-9]/g,'')):null,
        entidadRegistro: form.entidadGrupo,
      })});
      const data=await res.json();
      if(!res.ok||!data.ok)throw new Error(data.error??'No se pudo guardar');
      onGuardado({...sol,...data.solicitud});
      onClose();
    }catch(e){setError(e instanceof Error?e.message:'Error al guardar.');}
    finally{setGuardando(false);}
  };

  const iS:React.CSSProperties={width:'100%',height:38,border:'1.5px solid #e2e8f0',borderRadius:8,padding:'0 12px',fontSize:13,fontFamily:'var(--font)',color:'#1e293b',outline:'none',boxSizing:'border-box' as const,background:'white'};
  const iSdis:React.CSSProperties={...iS,background:'#f8fafc',color:'#94a3b8'};
  const lS:React.CSSProperties={fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:5};
  const fG:React.CSSProperties={display:'flex',flexDirection:'column' as const,gap:4};

  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'white',borderRadius:8,width:'96vw',maxWidth:860,maxHeight:'94vh',display:'flex',flexDirection:'column',boxShadow:'0 8px 32px rgba(0,0,0,.15)',overflow:'hidden'}}>

        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 28px 16px',borderBottom:'1px solid #f1f5f9',flexShrink:0}}>
          <div>
            <h3 style={{margin:0,fontSize:17,fontWeight:600,color:'#111827'}}>Editar solicitud</h3>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>Solicitud #{sol.id}</div>
          </div>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:6,border:'1px solid #e2e8f0',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#6b7280'}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#fef2f2';(e.currentTarget as HTMLButtonElement).style.color='#ef4444';}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.color='#6b7280';}}>
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:14,height:14}}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div style={{overflowY:'auto',flex:1,padding:'20px 28px',display:'flex',flexDirection:'column',gap:14}}>
          {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,padding:'9px 12px',color:'#dc2626',fontSize:12}}>⚠️ {error}</div>}

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>Fecha de creación</label>
              <input style={iSdis} value={form.fechaCreacion} readOnly/>
            </div>
            <div style={fG}>
              <label style={lS}>Usuario registra</label>
              <input style={iSdis} value={form.nombrePersonal} readOnly/>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>* Tipo de proceso</label>
              <select style={iS} value={form.tipoProceso} onChange={e=>{set('tipoProceso',e.target.value);set('subtipoProceso','');}}>
                <option value="">— Seleccione —</option>
                {TIPOS_PROCESO.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={fG}>
              <label style={lS}>* Entidad del grupo</label>
              <select style={iS} value={form.entidadGrupo} onChange={e=>set('entidadGrupo',e.target.value)}>
                <option value="">— Seleccione —</option>
                {ENTIDADES_GRUPO.map(e=><option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>Modalidad</label>
              <select style={form.tipoProceso?iS:iSdis} value={form.subtipoProceso} onChange={e=>set('subtipoProceso',e.target.value)} disabled={!form.tipoProceso}>
                <option value="">— Seleccione —</option>
                {subtipos.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={fG}>
              <label style={lS}>* Ciudad</label>
              <select style={iS} value={form.ciudad} onChange={e=>set('ciudad',e.target.value)}>
                <option value="">— Seleccione —</option>
                {CIUDADES_CO.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>* Cliente</label>
              <input style={iS} placeholder="Nombre del cliente o entidad contratante" value={form.entidad} onChange={e=>set('entidad',e.target.value)}/>
            </div>
            <div style={fG}>
              <label style={lS}>* No. proceso</label>
              <input style={iS} placeholder="Ej. MC-007-2026" value={form.codigoProceso} onChange={e=>set('codigoProceso',e.target.value)}/>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>Presupuesto</label>
              <input style={iS} placeholder="Ej. 150000000" type="text" value={form.valor} onChange={e=>set('valor',e.target.value.replace(/[^0-9]/g,''))}/>
            </div>
            <div style={fG}>
              <label style={lS}>Plataforma</label>
              <input style={iS} placeholder="Ej. SECOP II, Portal propio…" value={form.plataforma} onChange={e=>set('plataforma',e.target.value)}/>
            </div>
          </div>

          <div style={fG}>
            <label style={lS}>* Descripción</label>
            <textarea style={{...iS,height:80,padding:'8px 12px',resize:'vertical' as const,lineHeight:1.5}} placeholder="Descripción del objeto del contrato o proceso…" value={form.objeto} onChange={e=>set('objeto',e.target.value)}/>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>Fecha cierre</label>
              <input type="date" style={iS} value={form.fechaCierre} onChange={e=>set('fechaCierre',e.target.value)}/>
            </div>
            <div/>
          </div>
        </div>

        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'16px 28px',borderTop:'1px solid #f1f5f9',background:'white',flexShrink:0}}>
          <button onClick={handleGuardar} disabled={guardando} style={{height:38,padding:'0 32px',borderRadius:6,background:guardando?'#6b93c4':'#2563eb',color:'white',border:'none',fontSize:13,fontWeight:600,fontFamily:'var(--font)',cursor:guardando?'not-allowed':'pointer'}}>
            {guardando?'Guardando…':'Guardar'}
          </button>
          <button onClick={()=>{try{localStorage.removeItem(DRAFT_KEY);}catch{/**/}onClose();}} disabled={guardando} style={{height:38,padding:'0 24px',borderRadius:6,border:'1px solid #e2e8f0',background:'white',color:'#374151',fontSize:13,fontFamily:'var(--font)',cursor:'pointer'}}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MODAL CREAR SOLICITUD MANUAL
══════════════════════════════════════════════════════════════ */
const ENTIDADES_GRUPO=['Aseocolba','Vigicolba','Tempocolba'];
const TIPOS_PROCESO=['Público','Privado'];
const SUBTIPOS:Record<string,string[]>={
  'Público':['Licitación pública','Selección abreviada','Concurso de méritos','Contratación directa','Mínima cuantía','Régimen especial'],
  'Privado':['Cotización','Contrato directo','Invitación privada','Otro'],
};
const UEN_OPTIONS=['Barranquilla','Bogotá','Mina'];
const CIUDADES_CO=['Medellín','Bogotá D.C.','Cali','Barranquilla','Cartagena','Bucaramanga','Pereira','Manizales','Cúcuta','Ibagué','Santa Marta','Villavicencio','Pasto','Montería','Neiva','Armenia','Popayán','Valledupar','Sincelejo','Tunja','Riohacha','Quibdó','Florencia','Mocoa','Leticia','Puerto Inírida','San José del Guaviare','Mitú','Puerto Carreño','Yopal','Arauca','San Andrés','Otra'];

function ModalCrearSolicitud({sesion,onClose,onCreada}:{sesion:Sesion;onClose:()=>void;onCreada:()=>void}){
  const ahora=new Date().toLocaleString('es-CO',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).replace(',','');
  const DRAFT_KEY='licycolba_draft_solicitud';
  const formInicial={fechaSolicitud:ahora,nombrePersonal:sesion.usuario,tipoProceso:'',subtipoProceso:'',entidadGrupo:'',uen:'',ciudad:'',entidad:'',codigoProceso:'',objeto:'',valor:'',departamento:'',plataforma:'',linkDetalle:'',fechaCierre:''};
  const [form,setForm]=useState(()=>{try{const raw=localStorage.getItem(DRAFT_KEY);if(raw){const draft=JSON.parse(raw);return{...formInicial,...draft,fechaSolicitud:ahora,nombrePersonal:sesion.usuario};}}catch{/**/}return formInicial;});
  const [tieneBorrador,setTieneBorrador]=React.useState(()=>{try{const raw=localStorage.getItem(DRAFT_KEY);if(!raw)return false;const d=JSON.parse(raw);return!!(d.entidad||d.codigoProceso||d.objeto||d.tipoProceso);}catch{return false;}});
  const [guardando,setGuardando]=useState(false);
  const [error,setError]=useState('');

  const set=(f:string,v:string)=>setForm(p=>({...p,[f]:v}));
  const subtipos=SUBTIPOS[form.tipoProceso]||[];

  const handleGuardar=async()=>{
    setError('');
    if(!form.tipoProceso||!form.entidadGrupo||!form.ciudad||!form.entidad||!form.codigoProceso||!form.objeto){
      setError('Los campos marcados con * son obligatorios.');return;
    }
    setGuardando(true);
    try{
      // Mapear solo los campos que existen en el modelo Solicitud
      const modalidadFinal = form.subtipoProceso
        ? `${form.tipoProceso} — ${form.subtipoProceso}`
        : form.tipoProceso;
      const observacionFinal = form.uen ? `UEN: ${form.uen}` : null;

      const res=await fetch('/api/solicitudes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        codigoProceso:   form.codigoProceso,
        nombreProceso:   form.objeto,
        entidad:         form.entidad,
        objeto:          form.objeto,
        modalidad:       form.subtipoProceso||form.tipoProceso,
        sede:            form.tipoProceso,
        perfil:          form.entidadGrupo,
        ciudad:          form.ciudad,
        plataforma:      form.plataforma||'Manual',
        linkDetalle:     form.linkDetalle,
        fechaCierre:     form.fechaCierre||null,
        observacion:     observacionFinal,
        valor:           form.valor?Number(form.valor.replace(/[^0-9]/g,'')):null,
        estadoSolicitud: 'En revisión',
        usuarioRegistro: sesion.usuario,
        emailRegistro:   sesion.email,
        cargoRegistro:   sesion.cargo,
        entidadRegistro: form.entidadGrupo,
        fuente:          form.plataforma||'Manual',
        aliasFuente:     '',
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
  const iSdis:React.CSSProperties={...iS,background:'#f8fafc',color:'#94a3b8'};
  const lS:React.CSSProperties={fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:5};
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

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>Fecha de creación</label>
              <input style={iSdis} value={form.fechaSolicitud} readOnly/>
            </div>
            <div style={fG}>
              <label style={lS}>Usuario registra</label>
              <input style={iSdis} value={form.nombrePersonal} readOnly/>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>* Tipo de proceso</label>
              <select style={iS} value={form.tipoProceso} onChange={e=>{set('tipoProceso',e.target.value);set('subtipoProceso','');}}>
                <option value="">— Seleccione —</option>
                {TIPOS_PROCESO.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={fG}>
              <label style={lS}>* Entidad del grupo</label>
              <select style={iS} value={form.entidadGrupo} onChange={e=>set('entidadGrupo',e.target.value)}>
                <option value="">— Seleccione —</option>
                {ENTIDADES_GRUPO.map(e=><option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>Modalidad</label>
              <select style={form.tipoProceso?iS:iSdis} value={form.subtipoProceso} onChange={e=>set('subtipoProceso',e.target.value)} disabled={!form.tipoProceso}>
                <option value="">— Seleccione —</option>
                {subtipos.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={fG}>
              <label style={lS}>* Ciudad</label>
              <select style={iS} value={form.ciudad} onChange={e=>set('ciudad',e.target.value)}>
                <option value="">— Seleccione —</option>
                {CIUDADES_CO.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>* Cliente</label>
              <input style={iS} placeholder="Nombre del cliente o entidad contratante" value={form.entidad} onChange={e=>set('entidad',e.target.value)}/>
            </div>
            <div style={fG}>
              <label style={lS}>* No. proceso</label>
              <input style={iS} placeholder="Ej. MC-007-2026" value={form.codigoProceso} onChange={e=>set('codigoProceso',e.target.value)}/>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>Presupuesto</label>
              <input style={iS} placeholder="Ej. 150000000" type="text" value={form.valor} onChange={e=>set('valor',e.target.value.replace(/[^0-9]/g,''))}/>
            </div>
            <div style={fG}>
              <label style={lS}>Plataforma</label>
              <input style={iS} placeholder="Ej. SECOP II, Portal propio…" value={form.plataforma} onChange={e=>set('plataforma',e.target.value)}/>
            </div>
          </div>

          <div style={fG}>
            <label style={lS}>* Descripción</label>
            <textarea style={{...iS,height:80,padding:'8px 12px',resize:'vertical' as const,lineHeight:1.5}} placeholder="Descripción del objeto del contrato o proceso…" value={form.objeto} onChange={e=>set('objeto',e.target.value)}/>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div style={fG}>
              <label style={lS}>Fecha cierre</label>
              <input type="date" style={iS} value={form.fechaCierre} onChange={e=>set('fechaCierre',e.target.value)}/>
            </div>
            <div/>
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

/* ── Config por variante ── */
type VarianteSolicitudes = 'COMERCIAL' | 'ESPECIALIZADA' | 'TODAS' | 'RECHAZADA';
const VARIANTE_CONFIG:Record<VarianteSolicitudes,{titulo:string;emptyMsg:string}> = {
  COMERCIAL:     {titulo:'Solicitudes abiertas — Comercial',   emptyMsg:'No hay solicitudes comerciales abiertas. Gestiona un proceso desde Búsqueda de procesos.'},
  ESPECIALIZADA: {titulo:'Solicitudes abiertas — Especializados', emptyMsg:'No hay solicitudes especializadas abiertas.'},
  TODAS:         {titulo:'Solicitudes abiertas',               emptyMsg:'No hay solicitudes abiertas. Gestiona un proceso desde Búsqueda de procesos.'},
  RECHAZADA:     {titulo:'Solicitudes rechazadas',              emptyMsg:'No hay solicitudes rechazadas.'},
};
/* Heurística de origen mientras no exista origenSolicitud en BD:
   COMERCIAL    = tiene codigoProceso  (viene de Búsqueda de procesos, no es manual)
   ESPECIALIZADA = no tiene codigoProceso (creada manualmente)
   Se reemplaza fácilmente cuando se agregue s.origenSolicitud al modelo */
function matchVariante(s:Solicitud, variante:VarianteSolicitudes):boolean {
  if(variante==='TODAS') return true;
  if(variante==='RECHAZADA') return (s.estadoSolicitud||'').toLowerCase().includes('rechazad');
  const tieneOrigen = !!(s.codigoProceso && s.codigoProceso.trim());
  return variante==='COMERCIAL' ? tieneOrigen : !tieneOrigen;
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

  const cargar=useCallback(async()=>{
    setCargando(true);setError('');
    try{
      const estadoQuery=variante==='RECHAZADA'?'Rechazada':'En%20revisi%C3%B3n';
      const res=await fetch(`/api/solicitudes?estado=${estadoQuery}&limit=200`);
      const data=await res.json();
      if(!res.ok||!data.ok){setError(data.error??'Error al cargar solicitudes.');return;}
      setSolicitudes((data.solicitudes??[]).slice().sort((a:Solicitud,b:Solicitud)=>a.id-b.id));
    }catch{setError('No se pudo conectar.');}
    finally{setCargando(false);}
  },[]);
  useEffect(()=>{cargar();},[cargar]);

  /* Primero filtrar por variante, luego por búsqueda */
  const porVariante=useMemo(()=>solicitudes.filter(s=>matchVariante(s,variante)),[solicitudes,variante]);

  const filtradas=useMemo(()=>porVariante.filter(s=>{
    const q=busqueda.toLowerCase();
    return[s.codigoProceso,s.entidad,s.objeto,s.perfil,s.departamento,
           s.estadoSolicitud,s.usuarioRegistro,s.ciudad,s.modalidad,
           s.sqrNumero].some(v=>(v||'').toLowerCase().includes(q));
  }),[porVariante,busqueda]);

  const todosMarcados=filtradas.length>0&&seleccionados.length===filtradas.length;
  const toggleAll=(c:boolean)=>setSeleccionados(c?filtradas.map(s=>s.id):[]);
  const toggleOne=(id:number,c:boolean)=>setSeleccionados(c?[id]:[]);
  const abrirModal=(s:Solicitud)=>setModalProceso(s);

  const fmtFecha=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
  const fmtFechaCorta=(r:string|null)=>{if(!r)return'—';const d=new Date(r);return isNaN(d.getTime())?r:d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});};
  const fmtV=(v:number|null)=>{if(!v||v===0)return'—';return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);};
  const tipoFromSolicitud=(s:Solicitud)=>{if((s.fuente||'').toLowerCase().includes('secop'))return'Público';if(s.sede==='Público'||s.sede==='Privado')return s.sede;return(s.fuente||'').toLowerCase().includes('manual')?'Manual':'Privado';};
  const sqrDisplay=(s:Solicitud)=>{
    if(s.sqrError)return{label:'Error SQR',bg:'#fef2f2',color:'#dc2626'};
    if(s.sqrNumero)return{label:s.sqrNumero,bg:'#E8F5E9',color:'#15803d'};
    return{label:'Sin SQR',bg:'#f1f5f9',color:'#94a3b8'};
  };

  const exportarExcelSolicitudes=()=>{
    const datos=filtradas.length>0?filtradas:porVariante;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hacer=(XLSX:any)=>{
      const cab=['N°','Estado','SQR','Fecha creación','Tipo proceso','Modalidad','Entidad grupo','Descripción','Cliente','No. proceso','Presupuesto','Ciudad','Plataforma','Usuario registra','Fecha cierre'];
      const filas=datos.map(s=>[
        s.id,
        s.estadoSolicitud||'',
        s.sqrNumero||'',
        s.createdAt?new Date(s.createdAt).toLocaleDateString('es-CO'):'',
        (s.fuente||'').toLowerCase().includes('secop')?'Público':'Privado',
        MMAP_MODALIDAD[s.modalidad]||s.modalidad||'',
        s.perfil||'',
        s.objeto||'',
        s.entidad||'',
        s.codigoProceso||'',
        s.valor||0,
        s.ciudad||s.departamento?.split(':')[0]?.trim()||'',
        s.plataforma||s.aliasFuente||'',
        s.usuarioRegistro||'',
        s.fechaCierre||s.fechaVencimiento?new Date(s.fechaCierre||s.fechaVencimiento||'').toLocaleDateString('es-CO'):'',
      ]);
      const wb=XLSX.utils.book_new();
      const ws=XLSX.utils.aoa_to_sheet([cab,...filas]);
      ws['!cols']=[{wch:6},{wch:14},{wch:14},{wch:18},{wch:12},{wch:22},{wch:14},{wch:50},{wch:30},{wch:18},{wch:16},{wch:14},{wch:14},{wch:20},{wch:14}];
      // Formato moneda en columna Presupuesto (índice 10)
      const range=XLSX.utils.decode_range(ws['!ref']??'A1');
      for(let R=1;R<=range.e.r;R++){const cell=ws[XLSX.utils.encode_cell({r:R,c:10})];if(cell&&cell.t==='n')cell.z='$#,##0';}
      const titulo=cfg.titulo.replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'');
      XLSX.utils.book_append_sheet(wb,ws,cfg.titulo.slice(0,31));
      XLSX.writeFile(wb,`${titulo}_${new Date().toISOString().slice(0,10)}.xlsx`,{bookType:'xlsx',type:'binary'});
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if((window as any).XLSX){hacer((window as any).XLSX);}
    else{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.onload=()=>hacer((window as any).XLSX);document.head.appendChild(s);}
  };

  const COLS=[
    {w:72,label:'N°'},
    {w:120,label:'Estado'},
    {w:52,label:'Ficha'},
    {w:90,label:'SQR'},
    {w:148,label:'Fecha creación'},
    {w:100,label:'Tipo proceso'},
    {w:148,label:'Modalidad'},
    {w:120,label:'Entidad grupo'},
    {w:248,label:'Descripción'},
    {w:170,label:'Cliente'},
    {w:135,label:'No. proceso'},
    {w:140,label:'Presupuesto'},
    {w:104,label:'Ciudad'},
    {w:104,label:'Plataforma'},
    {w:152,label:'Usuario registra'},
    {w:114,label:'Fecha cierre'},
  ];

  if(cargando)return<div className="content"><div className="module-status">Cargando solicitudes…</div></div>;
  if(error)return<div className="content"><div className="module-status error">{error}</div></div>;

  return(<>
    {modalCrear&&<ModalCrearSolicitud sesion={sesion} onClose={()=>setModalCrear(false)} onCreada={()=>{setModalCrear(false);cargar();}}/>}
    {modalEditar&&<ModalEditarSolicitud sol={modalEditar} sesion={sesion} onClose={()=>setModalEditar(null)} onGuardado={(updated)=>{setSolicitudes(prev=>prev.map(s=>s.id===updated.id?updated:s));setModalEditar(null);setSeleccionados([]);}}/>}
    {modalProceso&&<ModalProceso sol={modalProceso} onClose={()=>setModalProceso(null)} onGuardado={(updated)=>{setSolicitudes(prev=>prev.map(s=>s.id===updated.id?updated:s));setModalProceso(null);}}/>}
    {modalEliminar&&<ModalConfirmarEliminarSolicitud solicitudes={solicitudes.filter(s=>seleccionados.includes(s.id))} onClose={()=>setModalEliminar(false)} onEliminado={()=>{setSeleccionados([]);cargar();}} sesion={sesion}/>}
    <div className="content">
      <div className="page-header">
        <div className="page-title"><IcoSolicitudes/><span>{cfg.titulo} : {filtradas.length} / {porVariante.length}</span></div>
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
          <table>
            <thead>
              <tr>
                <th style={{width:36}}><div className="th-top"><input type="checkbox" className="cbx" checked={todosMarcados} onChange={e=>toggleAll(e.target.checked)}/></div></th>
                {COLS.map(({w,label})=><th key={label} style={{minWidth:w}}><div className="th-top">{label}</div></th>)}
              </tr>
              <tr><th/>{COLS.map(({label})=><th key={label}><div style={{padding:'0 10px 5px',color:'#d1d5db',fontSize:11}}>≡</div></th>)}</tr>
            </thead>
            <tbody>
              {filtradas.length===0
                ?<tr><td colSpan={COLS.length+1} style={{textAlign:'center',color:'#6b7280',padding:'36px 10px',fontSize:13}}>
                  {porVariante.length===0?cfg.emptyMsg:'Sin resultados.'}
                </td></tr>
                :filtradas.map(s=>{
                  const ebc=estadoSolicitudColor(s.estadoSolicitud||'');
                  const pc=s.perfil?perfilColor(s.perfil):null;
                  const tipoP=tipoFromSolicitud(s);
                  const sqr=sqrDisplay(s);
                  return(
                    <tr key={s.id} onDoubleClick={()=>abrirModal(s)} style={{cursor:'default'}}>
                      <td className="center"><input type="checkbox" className="cbx" checked={seleccionados.includes(s.id)} onChange={e=>toggleOne(s.id,e.target.checked)}/></td>
                      <td style={{fontWeight:700,color:'#374151',fontSize:13}}>{s.id}</td>
                      <td><span className="badge" style={{background:ebc.bg,color:ebc.color,fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:600,whiteSpace:'nowrap'}}>{s.estadoSolicitud}</span></td>
                      <td className="center">
                        <button onClick={e=>{e.stopPropagation();abrirModal(s);}} title="Ver ficha detallada"
                          style={{width:34,height:34,borderRadius:10,border:'1.5px solid #d1d5db',background:'white',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#1a5ea8',transition:'all .15s'}}
                          onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background='#EAF2FB';(e.currentTarget as HTMLButtonElement).style.borderColor='#1a5ea8';}}
                          onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background='white';(e.currentTarget as HTMLButtonElement).style.borderColor='#d1d5db';}}>
                          <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{width:17,height:17}}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        </button>
                      </td>
                      <td><span style={{display:'inline-flex',alignItems:'center',fontSize:10.5,fontWeight:700,padding:'3px 9px',borderRadius:20,background:sqr.bg,color:sqr.color,whiteSpace:'nowrap',fontFamily:'monospace',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}} title={sqr.label}>{sqr.label}</span></td>
                      <td style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>{fmtFecha(s.createdAt)}</td>
                      <td><span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:tipoP==='Público'?'#EAF2FB':tipoP==='Privado'?'#F3E5F5':'#F1F5F9',color:tipoP==='Público'?'#1E5799':tipoP==='Privado'?'#4A148C':'#64748b',whiteSpace:'nowrap'}}>{tipoP}</span></td>
                      <td style={{fontSize:12,color:'#374151'}}>{MMAP_MODALIDAD[s.modalidad]||s.modalidad||'—'}</td>
                      <td>{pc?<span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:pc.bg,color:pc.color,whiteSpace:'nowrap'}}>{pc.label}</span>:<span style={{fontSize:12,color:'#374151'}}>—</span>}</td>
                      <td style={{maxWidth:248}} title={s.objeto||''}><div style={{fontSize:12,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:248}}>{s.objeto||'—'}</div></td>
                      <td style={{fontSize:12,fontWeight:500,color:'#1e293b'}}>{s.entidad||'—'}</td>
                      <td style={{fontFamily:'monospace',fontSize:11,color:'#475569'}}>{s.codigoProceso||'—'}</td>
                      <td style={{fontSize:12,fontWeight:600,color:'#15803d',whiteSpace:'nowrap'}}>{fmtV(s.valor)}</td>
                      <td style={{fontSize:12,color:'#64748b'}}>{s.ciudad||s.departamento?.split(':')[0]?.trim()||'—'}</td>
                      <td style={{fontSize:11,color:'#64748b'}}>{s.plataforma||s.aliasFuente||'—'}</td>
                      <td style={{fontSize:11,color:'#64748b'}}>{s.usuarioRegistro||'—'}</td>
                      <td style={{fontSize:11,color:'#64748b',whiteSpace:'nowrap'}}>{fmtFechaCorta(s.fechaCierre||s.fechaVencimiento)}</td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>
        <div className="pagination-bar">
          <span>{filtradas.length>0?`1 - ${filtradas.length} de ${solicitudes.length}`:`0 de ${solicitudes.length}`}</span>
          {solicitudes.length>0&&<div className="pages"><button className="page-btn active">1</button></div>}
        </div>
      </div>
    </div>
  </>);
}

/* ── Wrappers de variante — reutilizan la base sin duplicar código ── */
function ModuloSolicitudesAbiertas({sesion}:{sesion:Sesion}){return<ModuloSolicitudesAbiertasBase sesion={sesion} variante="TODAS"/>;}
function ModuloSolicitudesRechazadas({sesion}:{sesion:Sesion}){return<ModuloSolicitudesAbiertasBase sesion={sesion} variante="RECHAZADA"/>;}
function ModuloSolicitudesComercial({sesion}:{sesion:Sesion}){return<ModuloSolicitudesAbiertasBase sesion={sesion} variante="COMERCIAL"/>;}
function ModuloSolicitudesEspecializada({sesion}:{sesion:Sesion}){return<ModuloSolicitudesAbiertasBase sesion={sesion} variante="ESPECIALIZADA"/>;}

/* ══════════════════════════════════════════════════════════════
   MÓDULO SOLICITUDES ELIMINADAS
══════════════════════════════════════════════════════════════ */
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
                  <td style={{fontSize:12,fontWeight:600,color:'#15803d',whiteSpace:'nowrap'}}>{s.valor?new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(s.valor):'—'}</td>
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

/* ══════════════════════════════════════════════════════════════
   MÓDULO EXÁMENES MÉDICOS
══════════════════════════════════════════════════════════════ */
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

  useEffect(()=>{fetchTodos(1);},[]);// eslint-disable-line
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hacer=(XLSX:any)=>{const cab=['Grupo','Cód. examen','NIT proveedor','Cód. municipio','Ciudad','Examen','Valor'];const filas=todos.map(r=>[String(r.cod_grupo_exam??''),String(r.cod_examen??''),String(r.nit_proveedor??''),String(r.codmun??''),String(r.ciudad??''),String(r.descripcion??''),Number(r.vlr_costo)||0]);const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([cab,...filas]);const range=XLSX.utils.decode_range(ws['!ref']??'A1');for(let R=1;R<=range.e.r;R++){const cell=ws[XLSX.utils.encode_cell({r:R,c:6})];if(cell&&cell.t==='n')cell.z='$#,##0';}ws['!cols']=[{wch:12},{wch:14},{wch:16},{wch:12},{wch:18},{wch:50},{wch:16}];XLSX.utils.book_append_sheet(wb,ws,'Exámenes médicos');XLSX.writeFile(wb,`examenes_medicos_${new Date().toISOString().slice(0,10)}.xlsx`,{bookType:'xlsx',type:'binary'});};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if((window as any).XLSX){hacer((window as any).XLSX);}else{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>hacer((window as any).XLSX);document.head.appendChild(s);} // eslint-disable-line
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
              :rowsFiltrados.map((row,i)=>{const selec=seleccionados.has(i);const bg=badgeGrupo(String(row.cod_grupo_exam||''));return(<tr key={i} style={{background:selec?'#f0f7ff':'white',cursor:'default'}} onMouseOver={e=>{if(!selec)(e.currentTarget as HTMLTableRowElement).style.background='#f8fafc';}} onMouseOut={e=>{(e.currentTarget as HTMLTableRowElement).style.background=selec?'#f0f7ff':'white';}}><td className="center"><input type="checkbox" className="cbx" checked={selec} onChange={e=>toggleOne(i,e.target.checked)}/></td><td><span style={{display:'inline-flex',alignItems:'center',height:24,padding:'0 10px',borderRadius:20,fontSize:11,fontWeight:700,background:bg.bg,color:bg.color,whiteSpace:'nowrap'}}>{String(row.cod_grupo_exam||'—')}</span></td><td><span style={{fontSize:11,fontFamily:'monospace',fontWeight:700,padding:'3px 10px',borderRadius:6,background:'#0f172a',color:'white',whiteSpace:'nowrap',letterSpacing:'0.03em'}}>{String(row.cod_examen||'—')}</span></td><td style={{fontSize:12,color:'#64748b',fontFamily:'monospace'}}>{String(row.nit_proveedor||'—')}</td><td style={{fontSize:12,color:'#64748b',textAlign:'center' as const}}>{String(row.codmun||'—')}</td><td style={{fontSize:12,fontWeight:500,color:'#1e293b'}}>{String(row.ciudad||'—')}</td><td style={{maxWidth:320}} title={String(row.descripcion||'')}><div style={{fontSize:12,color:'#374151',lineHeight:1.45,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const,overflow:'hidden'}}>{String(row.descripcion||'—')}</div></td><td style={{fontSize:12.5,fontWeight:700,color:'#15803d',whiteSpace:'nowrap',textAlign:'right' as const,paddingRight:16}}>{fmtCOP(row.vlr_costo)}</td></tr>);})}
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

/* ══════════════════════════════════════════════════════════════
   USUARIOS ELIMINADOS
══════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════
   MÓDULO PROCESOS NUEVOS
══════════════════════════════════════════════════════════════ */
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

function ModuloProcesoNuevos({sesion,onModuleChange}:{sesion:Sesion;onModuleChange:(m:string)=>void}){
  const [procesos,setProcesos]=useState<ProcesoNuevoItem[]>([]);
  const [total,setTotal]=useState(0);const[totalPages,setTotalPages]=useState(1);
  const [pagina,setPagina]=useState(1);
  const [cargando,setCargando]=useState(true);
  const [error,setError]=useState('');
  const [busqueda,setBusqueda]=useState('');
  const [filtro,setFiltro]=useState<'hoy'|'ayer'|'semana'|'rango'>('hoy');
  const [desde,setDesde]=useState('');
  const [hasta,setHasta]=useState('');
  const [detalle,setDetalle]=useState<ProcesoNuevoItem|null>(null);
  const [gestionando,setGestionando]=useState(false);
  const [errorGestion,setErrorGestion]=useState('');
  const LIMIT=30;

  const cargar=useCallback(async(pag:number)=>{
    setCargando(true);setError('');
    try{
      const params=new URLSearchParams({filtro,page:String(pag),limit:String(LIMIT)});
      if(filtro==='rango'&&desde)params.set('desde',desde);
      if(filtro==='rango'&&hasta)params.set('hasta',hasta);
      const res=await fetch(`/api/procesos/nuevos?${params}`);
      const data=await res.json();
      if(!res.ok||!data.ok){setError(data.error??'Error al cargar.');return;}
      setProcesos(data.procesos??[]);setTotal(data.total??0);setTotalPages(data.totalPages??1);setPagina(data.page??pag);
    }catch{setError('No se pudo conectar.');}finally{setCargando(false);}
  },[filtro,desde,hasta]);

  useEffect(()=>{cargar(1);},[cargar]);

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
      <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setDetalle(null);}}>
        <div style={{background:'white',borderRadius:12,width:'94vw',maxWidth:780,maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(15,32,64,.2)',overflow:'hidden',border:'1px solid #e2e8f0'}}>
          <div style={{background:'linear-gradient(135deg,#0d2d5e 0%,#1a5ea8 100%)',padding:'16px 22px',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5,flexWrap:'wrap'}}>
                  <span style={{fontSize:10,fontWeight:700,color:'rgba(255,255,255,.6)',letterSpacing:'0.07em'}}>PROCESO NUEVO DETECTADO</span>
                  {detalle.aliasFuente&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:6,background:'rgba(255,255,255,.15)',color:'white',fontWeight:600}}>{portalC(detalle.aliasFuente,detalle.fuente||'').label}</span>}
                  {detalle.perfil&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:perfilC(detalle.perfil).bg,color:perfilC(detalle.perfil).color,fontWeight:600}}>{perfilC(detalle.perfil).label}</span>}
                </div>
                <div style={{fontSize:15,fontWeight:700,color:'white',lineHeight:1.3,marginBottom:3}}>{detalle.entidad||'Sin entidad'}</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,.65)',fontFamily:'monospace'}}>{detalle.codigoProceso||''}</div>
              </div>
              <button onClick={()=>setDetalle(null)} style={{width:28,height:28,borderRadius:'50%',border:'1px solid rgba(255,255,255,.3)',background:'rgba(255,255,255,.1)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'white',flexShrink:0}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <div style={{background:'#EAF2FB',borderBottom:'1px solid #D0E4F3',padding:'10px 22px',flexShrink:0,display:'flex',alignItems:'center',gap:10}}>
            <svg fill="none" stroke="#1E5799" strokeWidth={2} viewBox="0 0 24 24" style={{width:16,height:16,flexShrink:0}}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            <span style={{fontSize:12.5,color:'#1E5799',fontWeight:500}}>Detectado el <strong>{fmtFecha(detalle.fechaDeteccion)}</strong> — primera vez en Licycolba</span>
          </div>
          <div style={{overflowY:'auto',flex:1,padding:'16px 22px',display:'flex',flexDirection:'column',gap:12}}>
            {detalle.objeto&&(
              <div style={{background:'#FAFCFF',border:'1px solid #D0E4F3',borderRadius:8,padding:'12px 14px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#1E5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:5}}>Objeto del proceso</div>
                <p style={{margin:0,fontSize:13,color:'#1e293b',lineHeight:1.65}}>{detalle.objeto}</p>
              </div>
            )}
            <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 14px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1E5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',paddingBottom:8,marginBottom:8,borderBottom:'1px solid #f1f5f9'}}>Información general</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',columnGap:28}}>
                {[
                  {label:'Entidad',value:<strong style={{fontWeight:600}}>{detalle.entidad||'—'}</strong>},
                  {label:'Número del proceso',value:<span style={{fontFamily:'monospace'}}>{detalle.codigoProceso||'—'}</span>},
                  {label:'Modalidad',value:MMAP_MODALIDAD[detalle.modalidad||'']||detalle.modalidad||'—'},
                  {label:'Fuente / portal',value:detalle.fuente||'—'},
                  {label:'Estado fuente',value:detalle.estadoFuente||'—'},
                  ...(detalle.departamento?[{label:'Localización',value:detalle.departamento}]:[]),
                  ...(detalle.valor?[{label:'Presupuesto oficial',value:<span style={{fontWeight:700,color:'#15803d'}}>{fmtV(detalle.valor)}</span>}]:[]),
                  ...(detalle.perfil?[{label:'Perfil',value:<span style={{padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:perfilC(detalle.perfil).bg,color:perfilC(detalle.perfil).color}}>{perfilC(detalle.perfil).label}</span>}]:[]),
                  {label:'Fecha publicación fuente',value:fmtFechaCorta(detalle.fechaPublicacion)},
                  {label:'Fecha vencimiento',value:<span style={{color:'#dc2626',fontWeight:600}}>{fmtFechaCorta(detalle.fechaVencimiento)}</span>},
                  {label:'Detectado por Licycolba',value:<span style={{color:'#1E5799',fontWeight:600}}>{fmtFecha(detalle.fechaDeteccion)}</span>},
                ].map(({label,value},i)=>(
                  <div key={i} style={{padding:'8px 0',borderBottom:'1px solid #f8fafc'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:3}}>{label}</div>
                    <div style={{fontSize:12.5,color:'#1e293b'}}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            {(detalle.linkSecop||detalle.linkDetalle||detalle.linkSecopReg)&&(
              <div style={{background:'white',border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 14px'}}>
                <div style={{fontSize:11,fontWeight:700,color:'#1E5799',textTransform:'uppercase' as const,letterSpacing:'0.07em',paddingBottom:8,marginBottom:8,borderBottom:'1px solid #f1f5f9'}}>Fuentes y enlaces</div>
                {[{label:portalColor(detalle.aliasFuente||'',detalle.fuente||'').label,url:detalle.linkSecop},{label:'Registro',url:detalle.linkSecopReg},{label:'Detalle',url:detalle.linkDetalle}].filter(f=>f.url).map((f,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:i>0?'7px 0 0':'0'}}>
                    <span style={{fontSize:11,fontWeight:600,color:'#475569',flexShrink:0,minWidth:60}}>{f.label}</span>
                    <a href={f.url!} target="_blank" rel="noopener noreferrer" style={{fontSize:11.5,color:'#1E5799',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{f.url}</a>
                    <CopiarLinkBtn url={f.url!}/>
                  </div>
                ))}
              </div>
            )}
            {errorGestion&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',color:'#dc2626',fontSize:12}}>⚠️ {errorGestion}</div>}
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:8,padding:'12px 22px',borderTop:'1px solid #e2e8f0',background:'#FAFCFF',flexShrink:0}}>
            {(detalle.linkSecop||detalle.linkDetalle)&&(
              <a href={detalle.linkSecop||detalle.linkDetalle||''} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:5,height:34,padding:'0 14px',borderRadius:8,border:'1px solid #D0E4F3',background:'white',color:'#1E5799',fontSize:12,fontWeight:500,textDecoration:'none'}}>
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Abrir en portal
              </a>
            )}
            <button onClick={()=>setDetalle(null)} style={{height:34,padding:'0 16px',borderRadius:8,border:'1px solid #e2e8f0',background:'white',color:'#374151',fontSize:12,fontFamily:'var(--font)',cursor:'pointer'}}>Cerrar</button>
            <button onClick={()=>handleGestionar(detalle)} disabled={gestionando} style={{display:'inline-flex',alignItems:'center',gap:6,height:34,padding:'0 18px',borderRadius:8,background:gestionando?'#6b93c4':'#1E5799',color:'white',border:'none',fontSize:12,fontWeight:600,fontFamily:'var(--font)',cursor:gestionando?'not-allowed':'pointer'}}>
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{width:13,height:13}}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              {gestionando?'Creando solicitud…':'Gestionar proceso'}
            </button>
          </div>
        </div>
      </div>
    )}

    <div className="content">
      <div className="page-header">
        <div className="page-title"><IcoBusqueda/><span>Procesos nuevos : {filtrados.length} / {total}</span></div>
        <div className="page-actions">
          <input type="text" className="search-box" placeholder="Buscar…" value={busqueda} onChange={e=>setBusqueda(e.target.value)} disabled={cargando}/>
          <button className="icon-btn" title="Actualizar" onClick={()=>cargar(1)} disabled={cargando}><IcoRefresh/></button>
        </div>
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
                    {[{w:148,label:'Fecha detección'},{w:80,label:'Fuente'},{w:130,label:'Código proceso'},{w:200,label:'Entidad / Cliente'},{w:300,label:'Objeto'},{w:140,label:'Modalidad'},{w:110,label:'Perfil'},{w:160,label:'Departamento'},{w:130,label:'Ppto. oficial'},{w:110,label:'F. publicación'},{w:90,label:'Acciones'}].map(({w,label})=>(
                      <th key={label} style={{minWidth:w}}><div className="th-top">{label}</div></th>
                    ))}
                  </tr>
                  <tr>{Array.from({length:11}).map((_,i)=><th key={i}><div style={{padding:'0 10px 5px',color:'#d1d5db',fontSize:11}}>≡</div></th>)}</tr>
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
                        <td><span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:28,height:28,borderRadius:'50%',background:port.bg,color:port.color,fontSize:10,fontWeight:700,flexShrink:0}}>{port.label}</span></td>
                        <td style={{fontFamily:'monospace',fontSize:11,color:'#475569'}}>{p.codigoProceso||'—'}</td>
                        <td style={{fontSize:12,fontWeight:500,color:'#1e293b'}}>{p.entidad||'—'}</td>
                        <td style={{maxWidth:300}}><div style={{fontSize:12,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:300}} title={p.objeto||''}>{p.objeto||'—'}</div></td>
                        <td style={{fontSize:12,color:'#374151'}}>{MMAP_MODALIDAD[p.modalidad||'']||p.modalidad||'—'}</td>
                        <td>{pc2?<span style={{fontSize:11,fontWeight:600,padding:'3px 10px',borderRadius:20,background:pc2.bg,color:pc2.color,whiteSpace:'nowrap'}}>{pc2.label}</span>:<span style={{color:'#94a3b8'}}>—</span>}</td>
                        <td style={{fontSize:12,color:'#64748b'}}>{p.departamento?.split(':')[0]?.trim()||'—'}</td>
                        <td style={{fontSize:12,fontWeight:600,color:'#15803d',whiteSpace:'nowrap'}}>{fmtV(p.valor)}</td>
                        <td style={{fontSize:11,color:'#64748b',whiteSpace:'nowrap'}}>{fmtFechaCorta(p.fechaPublicacion)}</td>
                        <td style={{textAlign:'center' as const}}>
                          <button onClick={()=>setDetalle(p)} title="Ver detalle y gestionar"
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

function Placeholder({nombre}:{nombre:string}){return<div className="content"><div style={{background:'white',border:'1px solid #e5e7eb',borderRadius:8,padding:22}}><h2 style={{margin:'0 0 8px',fontSize:18,color:'#1f2937'}}>{nombre}</h2><p style={{margin:0,color:'#6b7280',fontSize:13}}>Módulo en construcción.</p></div></div>;}

/* ══════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════ */
export default function LicycolbaPage(){
  const [sesionCargada,setSesionCargada]=useState(false);const[sesion,setSesion]=useState<Sesion|null>(null);
  const [collapsed,setCollapsed]=useState(false);const[activeModule,setActiveModule]=useState('procesosNuevos');const[openAccordion,setOpenAccordion]=useState<string|null>('busqueda');
  useEffect(()=>{const raw=sessionStorage.getItem('licycolba_sesion');if(raw){try{setSesion(JSON.parse(raw));}catch{setSesion(null);}}setSesionCargada(true);},[]);
  const borrarSesion=()=>{sessionStorage.removeItem('licycolba_sesion');setSesion(null);};
  const handleLogin=(s:Sesion)=>{sessionStorage.setItem('licycolba_sesion',JSON.stringify(s));setSesion(s);};
  const handleSesionActualizada=(s:Sesion)=>{sessionStorage.setItem('licycolba_sesion',JSON.stringify(s));setSesion(s);};
  const handleAccordionToggle=(key:string)=>{setOpenAccordion(prev=>prev===key?null:key);};
  if(!sesionCargada)return null;
  if(!sesion)return<PantallaLogin onLogin={handleLogin}/>;
  const renderContent=()=>{
    switch(activeModule){
      case 'procesosNuevos':        return<ModuloProcesoNuevos sesion={sesion} onModuleChange={setActiveModule}/>;
      case 'busquedaFinal':         return<ModuloBusquedaFinal onModuleChange={setActiveModule} sesion={sesion}/>
      case 'solicitudesAbiertas':   return<ModuloSolicitudesAbiertas sesion={sesion}/>;
      case 'solicitudesComercial':   return<ModuloSolicitudesComercial sesion={sesion}/>;
      case 'solicitudesEspecializada': return<ModuloSolicitudesEspecializada sesion={sesion}/>;
      case 'solicitudesRechazadas': return<ModuloSolicitudesRechazadas sesion={sesion}/>
      case 'solicitudesEliminadas': return<ModuloSolicitudesEliminadas/>;
      case 'solicitudesTodas':      return<Placeholder nombre="Todas las solicitudes"/>;
      case 'usuarios':              return<ModuloUsuarios sesion={sesion} onSesionActualizada={handleSesionActualizada}/>;
      case 'usuariosEliminados':    return<ModuloUsuariosEliminados/>;
      case 'examenesMedicos':       return<ModuloExamenesMedicos/>;
      case 'dashboard':             return<Placeholder nombre="Dashboard"/>;
      case 'trm':                   return<Placeholder nombre="TRM — Tasa de Cambio"/>;
      default:                      return<Placeholder nombre={activeModule}/>;
    }
  };
  return(<div className="app"><Sidebar collapsed={collapsed} onToggle={()=>setCollapsed(c=>!c)} activeModule={activeModule} onModuleChange={setActiveModule} openAccordion={openAccordion} onAccordionToggle={handleAccordionToggle} sesion={sesion} onLogout={borrarSesion}/><main className="main">{renderContent()}</main></div>);
}