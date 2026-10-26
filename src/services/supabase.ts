// Serviço de Conexão com o Supabase
// Documentação Oficial Supabase Client: https://supabase.com/docs/reference/javascript/initializing

import { createClient } from '@supabase/supabase-js';
import { MetaNumerica } from '../types';

// Credenciais Reais do Projeto Supabase (do arquivo .env.local)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://prydkwocbaxshbjplfsv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_JdJLR3X9PgDP7VPAONRkRg_466LRnXJ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

/**
 * Salva (ou atualiza via upsert) um ganho do dia na tabela 'metas' do Supabase.
 * O campo `data_referencia` (YYYY-MM-DD) é usado como chave única por dia.
 */
export async function salvarMetaSupabase(meta: MetaNumerica): Promise<{ success: boolean; data?: MetaNumerica[]; error?: string }> {
  try {
    const payload: Record<string, any> = {
      descricao: meta.descricao,
      valor_meta: meta.valor_meta,
      valor_atingido: meta.valor_atingido,
      percentual: meta.percentual,
    };

    if (meta.data_referencia) {
      payload.data_referencia = meta.data_referencia;
    }

    const { data, error } = await supabase
      .from('metas')
      .upsert([payload], { onConflict: 'data_referencia' })
      .select();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as MetaNumerica[] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro inesperado ao salvar meta no Supabase.' };
  }
}

/**
 * Busca os registros de metas para um intervalo de datas (semana atual).
 */
export async function buscarMetasPorSemana(dataInicio: string, dataFim: string): Promise<{ success: boolean; data?: MetaNumerica[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('metas')
      .select('*')
      .gte('data_referencia', dataInicio)
      .lte('data_referencia', dataFim)
      .order('data_referencia', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as MetaNumerica[] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao carregar metas da semana.' };
  }
}

/**
 * Busca todos os registros históricos.
 */
export async function buscarMetasSupabase(): Promise<{ success: boolean; data?: MetaNumerica[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('metas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as MetaNumerica[] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao carregar metas do Supabase.' };
  }
}
