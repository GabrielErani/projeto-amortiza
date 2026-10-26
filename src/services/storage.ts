// Serviço de Armazenamento Local Defensivo (Offline-First) com Fallback
// Documentação AsyncStorage: https://react-native-async-storage.github.io/async-storage/

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

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

// Cache em memória de emergência caso qualquer módulo nativo esteja indisponível
let cacheMemoriaGanhos: Record<string, RegistroGanhoLocal> = {};
let cacheMemoriaMetaBase: number = 200;

/**
 * Salva um ganho no armazenamento local do celular.
 */
export async function salvarGanhoLocalmente(registro: RegistroGanhoLocal): Promise<void> {
  // 1. Grava no cache de memória instantâneo
  cacheMemoriaGanhos[registro.dataISO] = registro;

  // 2. Grava no AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(CHAVE_GANHOS);
    const mapa: Record<string, RegistroGanhoLocal> = raw ? JSON.parse(raw) : {};
    mapa[registro.dataISO] = registro;
    await AsyncStorage.setItem(CHAVE_GANHOS, JSON.stringify(mapa));
  } catch (err: any) {
    // Se o AsyncStorage falhar por questão de módulo nativo, o cache em memória sustenta a sessão
  }

  // 3. Tenta sincronizar em segundo plano com o Supabase
  sincronizarComSupabaseSilencioso(registro);
}

/**
 * Carrega todos os ganhos salvos no celular.
 */
export async function carregarGanhosLocais(): Promise<Record<string, RegistroGanhoLocal>> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE_GANHOS);
    if (raw) {
      const mapa = JSON.parse(raw);
      cacheMemoriaGanhos = { ...cacheMemoriaGanhos, ...mapa };
      return cacheMemoriaGanhos;
    }
  } catch (err: any) {
    // Retorna cache de memória em caso de falha do módulo nativo
  }
  return cacheMemoriaGanhos;
}

/**
 * Salva a meta base diária no celular (ex: 200, 250).
 */
export async function salvarMetaBaseLocal(metaBase: number): Promise<void> {
  cacheMemoriaMetaBase = metaBase;
  try {
    await AsyncStorage.setItem(CHAVE_META_BASE, metaBase.toString());
  } catch (err: any) {
    // Mantém no cache de memória
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
      if (!isNaN(parsed) && parsed > 0) {
        cacheMemoriaMetaBase = parsed;
        return parsed;
      }
    }
  } catch (err: any) {
    // Retorna cache em caso de erro
  }
  return cacheMemoriaMetaBase || padrao;
}

/**
 * Sincroniza silenciosamente com o Supabase.
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
    // Silencioso - dados já estão protegidos localmente
  }
}
