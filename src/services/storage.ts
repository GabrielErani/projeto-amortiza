// Serviço de Armazenamento Local Defensivo (Offline-First) com Fallback em memória
// Documentação AsyncStorage: https://react-native-async-storage.github.io/async-storage/
//
// Este módulo é a fonte da verdade do app. Toda gravação dispara agendarSync(),
// que envia as mudanças para a nuvem quando há usuário logado e conexão.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DividaItem, EstadoSync, RegistroGanhoLocal } from '../types';
import { agendarSync } from './sync';

export type { RegistroGanhoLocal } from '../types';

const CHAVE_GANHOS = '@amortiza_ganhos_v1';
const CHAVE_META_BASE = '@amortiza_meta_base_v1';
const CHAVE_META_BASE_ATUALIZADA_EM = '@amortiza_meta_base_atualizada_em_v1';
const CHAVE_DIVIDAS = '@amortiza_dividas_v1';
const CHAVE_ESTADO_SYNC = '@amortiza_estado_sync_v1';
const CHAVE_ULTIMO_USUARIO = '@amortiza_ultimo_usuario_v1';

const META_BASE_PADRAO = 100;

// Os caches em memória são sempre iguais ou mais novos que o disco (toda gravação
// passa por eles). Por isso, ao ler, o que está em memória prevalece: se uma
// escrita no AsyncStorage falhar (ex.: disco cheio), o valor novo não é perdido.
let cacheMemoriaGanhos: Record<string, RegistroGanhoLocal> = {};
let cacheMemoriaMetaBase: number | null = null;
let cacheMemoriaMetaBaseAtualizadaEm: string | null = null;
let cacheMemoriaDividas: DividaItem[] = []; // inclui tombstones (removido=true)
let cacheMemoriaEstadoSync: EstadoSync | null = null;
let cacheMemoriaUltimoUsuario: string | null = null;

async function lerJSON<T>(chave: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function gravarJSON(chave: string, valor: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Mantém apenas no cache de memória
  }
}

// ─── GANHOS ──────────────────────────────────────────────────────────────────

export async function salvarGanhoLocalmente(registro: RegistroGanhoLocal): Promise<void> {
  const completo: RegistroGanhoLocal = {
    ...registro,
    atualizadoEm: registro.atualizadoEm || new Date().toISOString(),
  };
  cacheMemoriaGanhos[completo.dataISO] = completo;

  // Mescla com o disco (para não perder dias gravados antes de o app abrir) e regrava tudo.
  await carregarGanhosLocais();
  await gravarJSON(CHAVE_GANHOS, cacheMemoriaGanhos);

  agendarSync();
}

export async function carregarGanhosLocais(): Promise<Record<string, RegistroGanhoLocal>> {
  const mapa = await lerJSON<Record<string, RegistroGanhoLocal>>(CHAVE_GANHOS);
  if (mapa) {
    cacheMemoriaGanhos = { ...mapa, ...cacheMemoriaGanhos };
  }
  return cacheMemoriaGanhos;
}

/** Substitui o mapa inteiro de ganhos (usado pelo sync após o merge). Não agenda sync. */
export async function substituirGanhosLocais(mapa: Record<string, RegistroGanhoLocal>): Promise<void> {
  cacheMemoriaGanhos = { ...mapa };
  await gravarJSON(CHAVE_GANHOS, cacheMemoriaGanhos);
}

// ─── META BASE ───────────────────────────────────────────────────────────────

export async function salvarMetaBaseLocal(metaBase: number): Promise<void> {
  await gravarMetaBaseLocal(metaBase, new Date().toISOString());
  agendarSync();
}

/** Grava meta base com timestamp explícito (usado pelo sync). Não agenda sync. */
export async function gravarMetaBaseLocal(metaBase: number, atualizadoEm: string): Promise<void> {
  cacheMemoriaMetaBase = metaBase;
  cacheMemoriaMetaBaseAtualizadaEm = atualizadoEm;
  try {
    await AsyncStorage.multiSet([
      [CHAVE_META_BASE, metaBase.toString()],
      [CHAVE_META_BASE_ATUALIZADA_EM, atualizadoEm],
    ]);
  } catch {
    // Mantém no cache
  }
}

export async function carregarMetaBaseLocal(padrao: number = META_BASE_PADRAO): Promise<number> {
  if (cacheMemoriaMetaBase !== null) return cacheMemoriaMetaBase;
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
    // Retorna o padrão
  }
  return padrao;
}

/** Retorna a meta base e quando foi alterada (null se nunca foi alterada pelo usuário). */
export async function carregarMetaBaseComData(): Promise<{ metaBase: number; atualizadoEm: string | null }> {
  const metaBase = await carregarMetaBaseLocal();
  try {
    const em = await AsyncStorage.getItem(CHAVE_META_BASE_ATUALIZADA_EM);
    cacheMemoriaMetaBaseAtualizadaEm = em || cacheMemoriaMetaBaseAtualizadaEm;
  } catch {
    // Retorna cache
  }
  return { metaBase, atualizadoEm: cacheMemoriaMetaBaseAtualizadaEm };
}

// ─── DÍVIDAS E CONTROLE MACRO (CARTEIRA) ─────────────────────────────────────

async function carregarDividasComTombstones(): Promise<DividaItem[]> {
  const lista = await lerJSON<DividaItem[]>(CHAVE_DIVIDAS);
  if (lista) {
    // Disco primeiro, memória por cima: itens só em memória (escrita que falhou) são preservados.
    const porId = new Map<string, DividaItem>(lista.map((d) => [d.id, d]));
    for (const d of cacheMemoriaDividas) porId.set(d.id, d);
    cacheMemoriaDividas = Array.from(porId.values());
  }
  return cacheMemoriaDividas;
}

function apenasAtivas(lista: DividaItem[]): DividaItem[] {
  return lista.filter((d) => !d.removido);
}

export async function salvarDividaLocal(divida: DividaItem): Promise<DividaItem[]> {
  await carregarDividasComTombstones();

  const completa: DividaItem = {
    ...divida,
    removido: false,
    atualizadoEm: divida.atualizadoEm || new Date().toISOString(),
  };

  const index = cacheMemoriaDividas.findIndex((d) => d.id === completa.id);
  if (index >= 0) {
    cacheMemoriaDividas[index] = completa;
  } else {
    cacheMemoriaDividas.push(completa);
  }

  await gravarJSON(CHAVE_DIVIDAS, cacheMemoriaDividas);
  agendarSync();
  return apenasAtivas(cacheMemoriaDividas);
}

/** Soft delete: mantém um tombstone para que a exclusão sincronize entre dispositivos. */
export async function removerDividaLocal(id: string): Promise<DividaItem[]> {
  await carregarDividasComTombstones();

  const agora = new Date().toISOString();
  cacheMemoriaDividas = cacheMemoriaDividas.map((d) =>
    d.id === id ? { ...d, removido: true, atualizadoEm: agora } : d
  );

  await gravarJSON(CHAVE_DIVIDAS, cacheMemoriaDividas);
  agendarSync();
  return apenasAtivas(cacheMemoriaDividas);
}

export async function carregarDividasLocais(): Promise<DividaItem[]> {
  return apenasAtivas(await carregarDividasComTombstones());
}

/** Lista completa (com tombstones) para o merge do sync. */
export async function carregarDividasLocaisComRemovidas(): Promise<DividaItem[]> {
  return [...(await carregarDividasComTombstones())];
}

/** Substitui a lista inteira de dívidas, tombstones inclusos (usado pelo sync). Não agenda sync. */
export async function substituirDividasLocais(lista: DividaItem[]): Promise<void> {
  cacheMemoriaDividas = [...lista];
  await gravarJSON(CHAVE_DIVIDAS, cacheMemoriaDividas);
}

// ─── ESTADO DE SINCRONIZAÇÃO ─────────────────────────────────────────────────

export async function salvarEstadoSyncPersistido(estado: EstadoSync): Promise<void> {
  cacheMemoriaEstadoSync = estado;
  await gravarJSON(CHAVE_ESTADO_SYNC, estado);
}

export async function carregarEstadoSyncPersistido(): Promise<EstadoSync | null> {
  const estado = await lerJSON<EstadoSync>(CHAVE_ESTADO_SYNC);
  if (estado) cacheMemoriaEstadoSync = estado;
  return cacheMemoriaEstadoSync;
}

// ─── ÚLTIMO USUÁRIO DO APARELHO ──────────────────────────────────────────────
// Não é apagado em limparDadosLocais: serve para detectar que OUTRA conta entrou
// depois de uma sessão que terminou sem passar pelo "Sair" (token expirado/revogado).

export async function carregarUltimoUsuarioId(): Promise<string | null> {
  try {
    const id = await AsyncStorage.getItem(CHAVE_ULTIMO_USUARIO);
    if (id) cacheMemoriaUltimoUsuario = id;
  } catch {
    // Retorna cache
  }
  return cacheMemoriaUltimoUsuario;
}

export async function salvarUltimoUsuarioId(id: string): Promise<void> {
  cacheMemoriaUltimoUsuario = id;
  try {
    await AsyncStorage.setItem(CHAVE_ULTIMO_USUARIO, id);
  } catch {
    // Mantém no cache
  }
}

// ─── LIMPEZA (LOGOUT) ────────────────────────────────────────────────────────

/** Apaga todos os dados locais do app (ganhos, dívidas, meta base, estado de sync). */
export async function limparDadosLocais(): Promise<void> {
  cacheMemoriaGanhos = {};
  cacheMemoriaMetaBase = null;
  cacheMemoriaMetaBaseAtualizadaEm = null;
  cacheMemoriaDividas = [];
  cacheMemoriaEstadoSync = null;
  try {
    await AsyncStorage.multiRemove([
      CHAVE_GANHOS,
      CHAVE_META_BASE,
      CHAVE_META_BASE_ATUALIZADA_EM,
      CHAVE_DIVIDAS,
      CHAVE_ESTADO_SYNC,
    ]);
  } catch {
    // Cache já foi limpo
  }
}
