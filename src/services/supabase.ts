// Serviço de Conexão com o Supabase (cliente + operações remotas tipadas)
// Documentação: https://supabase.com/docs/reference/javascript/initializing
// Padrão React Native (AsyncStorage + AppState): https://supabase.com/docs/guides/auth/quickstarts/react-native

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { DividaItem, RegistroGanhoLocal, ResultadoServico } from '../types';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://prydkwocbaxshbjplfsv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_JdJLR3X9PgDP7VPAONRkRg_466LRnXJ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Mantém o token renovando apenas enquanto o app está em primeiro plano.
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// ─── TRATAMENTO DE ERROS ──────────────────────────────────────────────────────

export const MSG_BANCO_NAO_CONFIGURADO =
  'Banco não configurado: execute supabase/schema.sql no SQL Editor do Supabase.';
export const MSG_OFFLINE = 'Sem conexão com a internet.';
export const MSG_SESSAO_EXPIRADA = 'Sessão expirada. Entre novamente.';

interface ErroSupabaseLike {
  code?: string;
  message?: string;
  status?: number;
}

/** Converte qualquer erro (Supabase ou rede) em mensagem curta em português. */
export function traduzirErroRemoto(err: unknown): string {
  const e = (err || {}) as ErroSupabaseLike & { name?: string };
  const msg = String(e.message || '').toLowerCase();
  const code = String(e.code || '');

  if (code === 'PGRST205' || msg.includes('schema cache') || msg.includes('does not exist')) {
    return MSG_BANCO_NAO_CONFIGURADO;
  }
  if (e.status === 401 || code === 'PGRST301' || msg.includes('jwt') || msg.includes('invalid token')) {
    return MSG_SESSAO_EXPIRADA;
  }
  if (code === '42501' || msg.includes('row-level security')) {
    return 'Permissão negada pelo banco. Verifique se supabase/schema.sql foi executado e se você está logado.';
  }
  if (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('timeout') ||
    msg.includes('tempo limite') ||
    e.name === 'AbortError'
  ) {
    return MSG_OFFLINE;
  }
  return e.message ? String(e.message) : 'Erro inesperado ao acessar a nuvem.';
}

/** Indica se a mensagem traduzida representa ausência de rede. */
export function ehErroOffline(mensagem: string): boolean {
  return mensagem === MSG_OFFLINE;
}

function falha<T>(err: unknown): ResultadoServico<T> {
  return { success: false, error: traduzirErroRemoto(err) };
}

function comTimeout<T>(promessa: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const limite = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tempo limite ao conectar com a nuvem (timeout).')), ms);
  });
  return Promise.race([Promise.resolve(promessa), limite]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// ─── CONEXÃO ──────────────────────────────────────────────────────────────────

/**
 * Verifica se a nuvem está acessível e se o schema foi aplicado.
 * Nunca lança exceção; `online=false` traz o motivo já traduzido.
 */
export async function verificarConexao(): Promise<{ online: boolean; motivo?: string }> {
  try {
    const { error } = await comTimeout(
      supabase.from('configuracoes').select('user_id', { count: 'exact', head: true }),
      8000
    );
    if (error) return { online: false, motivo: traduzirErroRemoto(error) };
    return { online: true };
  } catch (err) {
    return { online: false, motivo: traduzirErroRemoto(err) };
  }
}

// ─── MAPEAMENTO snake_case ↔ app ──────────────────────────────────────────────

interface GanhoRow {
  user_id: string;
  data_referencia: string;
  valor: number | string;
  meta_do_dia: number | string | null;
  percentual: number | string | null;
  descricao: string | null;
  atualizado_em: string;
}

interface DividaRow {
  id: string;
  user_id: string;
  descricao: string;
  valor: number | string;
  tipo: DividaItem['tipo'];
  frequencia_imprevisto: DividaItem['frequenciaImprevisto'] | null;
  data_lancamento: string | null;
  removido: boolean;
  atualizado_em: string;
}

function ganhoParaRow(userId: string, r: RegistroGanhoLocal): GanhoRow {
  return {
    user_id: userId,
    data_referencia: r.dataISO,
    valor: r.valor,
    meta_do_dia: r.metaDoDia,
    percentual: r.percentual,
    descricao: r.descricao ?? null,
    atualizado_em: r.atualizadoEm || new Date().toISOString(),
  };
}

function rowParaGanho(row: GanhoRow): RegistroGanhoLocal {
  return {
    dataISO: row.data_referencia,
    valor: Number(row.valor) || 0,
    metaDoDia: Number(row.meta_do_dia) || 0,
    percentual: Number(row.percentual) || 0,
    descricao: row.descricao ?? undefined,
    atualizadoEm: row.atualizado_em,
  };
}

function dividaParaRow(userId: string, d: DividaItem): DividaRow {
  return {
    id: d.id,
    user_id: userId,
    descricao: d.descricao,
    valor: d.valor,
    tipo: d.tipo,
    frequencia_imprevisto: d.frequenciaImprevisto ?? null,
    data_lancamento: d.dataLancamento || null,
    removido: !!d.removido,
    atualizado_em: d.atualizadoEm || new Date().toISOString(),
  };
}

function rowParaDivida(row: DividaRow): DividaItem {
  return {
    id: row.id,
    descricao: row.descricao,
    valor: Number(row.valor) || 0,
    tipo: row.tipo,
    frequenciaImprevisto: row.frequencia_imprevisto ?? undefined,
    dataLancamento: row.data_lancamento ?? '',
    atualizadoEm: row.atualizado_em,
    removido: !!row.removido,
  };
}

// ─── GANHOS ───────────────────────────────────────────────────────────────────

export async function salvarGanhosRemotos(
  userId: string,
  registros: RegistroGanhoLocal[]
): Promise<ResultadoServico<number>> {
  if (registros.length === 0) return { success: true, data: 0 };
  try {
    const rows = registros.map((r) => ganhoParaRow(userId, r));
    const { error } = await supabase
      .from('ganhos')
      .upsert(rows, { onConflict: 'user_id,data_referencia' });
    if (error) return falha(error);
    return { success: true, data: rows.length };
  } catch (err) {
    return falha(err);
  }
}

export async function buscarGanhosRemotos(
  userId: string
): Promise<ResultadoServico<RegistroGanhoLocal[]>> {
  try {
    const { data, error } = await supabase
      .from('ganhos')
      .select('user_id,data_referencia,valor,meta_do_dia,percentual,descricao,atualizado_em')
      .eq('user_id', userId)
      .order('data_referencia', { ascending: true });
    if (error) return falha(error);
    return { success: true, data: ((data || []) as GanhoRow[]).map(rowParaGanho) };
  } catch (err) {
    return falha(err);
  }
}

// ─── DÍVIDAS ──────────────────────────────────────────────────────────────────

export async function salvarDividasRemotas(
  userId: string,
  dividas: DividaItem[]
): Promise<ResultadoServico<number>> {
  if (dividas.length === 0) return { success: true, data: 0 };
  try {
    const rows = dividas.map((d) => dividaParaRow(userId, d));
    const { error } = await supabase.from('dividas').upsert(rows, { onConflict: 'user_id,id' });
    if (error) return falha(error);
    return { success: true, data: rows.length };
  } catch (err) {
    return falha(err);
  }
}

/** Retorna TODAS as dívidas do usuário, inclusive removidas (tombstones), para o merge. */
export async function buscarDividasRemotas(userId: string): Promise<ResultadoServico<DividaItem[]>> {
  try {
    const { data, error } = await supabase
      .from('dividas')
      .select('id,user_id,descricao,valor,tipo,frequencia_imprevisto,data_lancamento,removido,atualizado_em')
      .eq('user_id', userId);
    if (error) return falha(error);
    return { success: true, data: ((data || []) as DividaRow[]).map(rowParaDivida) };
  } catch (err) {
    return falha(err);
  }
}

// ─── CONFIGURAÇÕES (META BASE) ────────────────────────────────────────────────

export async function salvarMetaBaseRemota(
  userId: string,
  metaBase: number,
  atualizadoEm: string
): Promise<ResultadoServico> {
  try {
    const { error } = await supabase
      .from('configuracoes')
      .upsert({ user_id: userId, meta_base: metaBase, atualizado_em: atualizadoEm }, { onConflict: 'user_id' });
    if (error) return falha(error);
    return { success: true, data: undefined };
  } catch (err) {
    return falha(err);
  }
}

export async function buscarMetaBaseRemota(
  userId: string
): Promise<ResultadoServico<{ metaBase: number; atualizadoEm: string } | null>> {
  try {
    const { data, error } = await supabase
      .from('configuracoes')
      .select('meta_base,atualizado_em')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return falha(error);
    if (!data) return { success: true, data: null };
    return {
      success: true,
      data: { metaBase: Number(data.meta_base) || 100, atualizadoEm: String(data.atualizado_em) },
    };
  } catch (err) {
    return falha(err);
  }
}
