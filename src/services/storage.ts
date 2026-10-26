// Serviço de Armazenamento Local (Offline-First) com Sincronização Supabase
// Documentação AsyncStorage: https://react-native-async-storage.github.io/async-storage/

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { MetaNumerica } from '../types';

const CHAVE_GANHOS = '@amortiza_ganhos_v1';
const CHAVE_META_BASE = '@amortiza_meta_base_v1';

export interface RegistroGanhoLocal {
  dataISO: string;
  valor: number;
  metaDoDia: number;
  percentual: number;
  descricao?: string;
  atualizadoEm: string;
}

/**
 * Salva um ganho no AsyncStorage do celular de forma instantânea e persistente.
 * Mesmo que o app feche, recarregue ou fique offline, o dado JAMAIS se perde.
 */
export async function salvarGanhoLocalmente(registro: RegistroGanhoLocal): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE_GANHOS);
    const mapa: Record<string, RegistroGanhoLocal> = raw ? JSON.parse(raw) : {};

    mapa[registro.dataISO] = registro;
    await AsyncStorage.setItem(CHAVE_GANHOS, JSON.stringify(mapa));

    // Tenta sincronizar em segundo plano com o Supabase
    sincronizarComSupabaseSilencioso(registro);
  } catch (error) {
    console.error('Erro ao salvar localmente no AsyncStorage:', error);
  }
}

/**
 * Carrega todos os ganhos salvos no celular.
 */
export async function carregarGanhosLocais(): Promise<Record<string, RegistroGanhoLocal>> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE_GANHOS);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('Erro ao carregar do AsyncStorage:', error);
    return {};
  }
}

/**
 * Salva a meta base diária no celular (ex: 200, 250).
 */
export async function salvarMetaBaseLocal(metaBase: number): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_META_BASE, metaBase.toString());
  } catch (error) {
    console.error('Erro ao salvar meta base no AsyncStorage:', error);
  }
}

/**
 * Carrega a meta base diária salva no celular.
 */
export async function carregarMetaBaseLocal(padrao: number = 200): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(CHAVE_META_BASE);
    if (val) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return padrao;
  } catch (error) {
    return padrao;
  }
}

/**
 * Sincroniza silenciosamente com o Supabase.
 * Se a tabela ainda não existir no Supabase, não trava e não apaga o dado local!
 */
async function sincronizarComSupabaseSilencioso(registro: RegistroGanhoLocal) {
  try {
    await supabase.from('metas').upsert([
      {
        descricao: registro.descricao || `Ganho ${registro.dataISO}`,
        valor_meta: registro.metaDoDia,
        valor_atingido: registro.valor,
        percentual: registro.percentual,
        data_referencia: registro.dataISO,
      },
    ], { onConflict: 'data_referencia' });
  } catch {
    // Ignora erro de rede ou tabela ausente - dado já está seguro no celular
  }
}
