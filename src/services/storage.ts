// Serviço de Armazenamento Local Defensivo (Offline-First) com Fallback
// Documentação AsyncStorage: https://react-native-async-storage.github.io/async-storage/

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { DividaItem } from '../types';

const CHAVE_GANHOS = '@amortiza_ganhos_v1';
const CHAVE_META_BASE = '@amortiza_meta_base_v1';
const CHAVE_DIVIDAS = '@amortiza_dividas_v1';

export interface RegistroGanhoLocal {
  dataISO: string;
  valor: number;
  metaDoDia: number;
  percentual: number;
  descricao?: string;
  atualizadoEm: string;
}

let cacheMemoriaGanhos: Record<string, RegistroGanhoLocal> = {};
let cacheMemoriaMetaBase: number = 100;
let cacheMemoriaDividas: DividaItem[] = [];

// ─── GANHOS ──────────────────────────────────────────────────────────────────
export async function salvarGanhoLocalmente(registro: RegistroGanhoLocal): Promise<void> {
  cacheMemoriaGanhos[registro.dataISO] = registro;

  try {
    const raw = await AsyncStorage.getItem(CHAVE_GANHOS);
    const mapa: Record<string, RegistroGanhoLocal> = raw ? JSON.parse(raw) : {};
    mapa[registro.dataISO] = registro;
    await AsyncStorage.setItem(CHAVE_GANHOS, JSON.stringify(mapa));
  } catch {
    // Mantém no cache de memória
  }

  sincronizarComSupabaseSilencioso(registro);
}

export async function carregarGanhosLocais(): Promise<Record<string, RegistroGanhoLocal>> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE_GANHOS);
    if (raw) {
      const mapa = JSON.parse(raw);
      cacheMemoriaGanhos = { ...cacheMemoriaGanhos, ...mapa };
      return cacheMemoriaGanhos;
    }
  } catch {
    // Retorna cache em memória
  }
  return cacheMemoriaGanhos;
}

// ─── META BASE ───────────────────────────────────────────────────────────────
export async function salvarMetaBaseLocal(metaBase: number): Promise<void> {
  cacheMemoriaMetaBase = metaBase;
  try {
    await AsyncStorage.setItem(CHAVE_META_BASE, metaBase.toString());
  } catch {
    // Mantém no cache
  }
}

export async function carregarMetaBaseLocal(padrao: number = 100): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(CHAVE_META_BASE);
    if (val) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) {
        cacheMemoriaMetaBase = parsed;
        return parsed;
      }
    }
  } catch {
    // Retorna cache
  }
  return cacheMemoriaMetaBase || padrao;
}

// ─── DÍVIDAS E CONTROLE MACRO (CARTEIRA) ─────────────────────────────────────
export async function salvarDividaLocal(divida: DividaItem): Promise<DividaItem[]> {
  const index = cacheMemoriaDividas.findIndex(d => d.id === divida.id);
  if (index >= 0) {
    cacheMemoriaDividas[index] = divida;
  } else {
    cacheMemoriaDividas.push(divida);
  }

  try {
    await AsyncStorage.setItem(CHAVE_DIVIDAS, JSON.stringify(cacheMemoriaDividas));
  } catch {
    // Mantém no cache
  }

  return [...cacheMemoriaDividas];
}

export async function removerDividaLocal(id: string): Promise<DividaItem[]> {
  cacheMemoriaDividas = cacheMemoriaDividas.filter(d => d.id !== id);
  try {
    await AsyncStorage.setItem(CHAVE_DIVIDAS, JSON.stringify(cacheMemoriaDividas));
  } catch {
    // Mantém no cache
  }
  return [...cacheMemoriaDividas];
}

export async function carregarDividasLocais(): Promise<DividaItem[]> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE_DIVIDAS);
    if (raw) {
      const lista: DividaItem[] = JSON.parse(raw);
      cacheMemoriaDividas = lista;
      return lista;
    }
  } catch {
    // Retorna cache
  }
  return cacheMemoriaDividas;
}

// ─── SUPABASE SILENCIOSO ──────────────────────────────────────────────────────
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
    // Silencioso
  }
}
