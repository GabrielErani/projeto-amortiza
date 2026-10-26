// Serviço de Sincronização Offline-First com a nuvem (Supabase)
//
// Estratégia: merge bidirecional "last-write-wins" por atualizadoEm.
//  - Ganhos: chave dataISO.
//  - Dívidas: chave id, respeitando tombstones (removido=true).
//  - Meta base: valor único por usuário.
// O resultado mesclado é gravado localmente e o que for mais novo no aparelho
// é enviado para a nuvem. Nada aqui lança exceção.

import { DividaItem, EstadoSync, RegistroGanhoLocal, ResultadoServico } from '../types';
import {
  buscarDividasRemotas,
  buscarGanhosRemotos,
  buscarMetaBaseRemota,
  ehErroOffline,
  salvarDividasRemotas,
  salvarGanhosRemotos,
  salvarMetaBaseRemota,
  verificarConexao,
} from './supabase';
import {
  carregarDividasLocaisComRemovidas,
  carregarEstadoSyncPersistido,
  carregarGanhosLocais,
  carregarMetaBaseComData,
  gravarMetaBaseLocal,
  salvarEstadoSyncPersistido,
  substituirDividasLocais,
  substituirGanhosLocais,
} from './storage';

const DEBOUNCE_MS = 2000;

let usuarioAtualId: string | null = null;
let estadoAtual: EstadoSync = { status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' };
let observadores: Array<(e: EstadoSync) => void> = [];
let timerDebounce: ReturnType<typeof setTimeout> | null = null;
let syncEmAndamento: Promise<ResultadoServico<{ enviados: number; recebidos: number }>> | null = null;
let syncPendenteAposAtual = false;
let estadoRestaurado = false;
// Incrementa a cada troca de usuário: uma sincronização iniciada em uma geração
// anterior é descartada antes de gravar qualquer coisa (evita vazar dados entre contas).
let geracaoUsuario = 0;

// ─── ESTADO OBSERVÁVEL ────────────────────────────────────────────────────────

function emitir(novo: EstadoSync) {
  estadoAtual = novo;
  observadores.forEach((cb) => {
    try {
      cb(estadoAtual);
    } catch {
      // Observador com erro não derruba os demais
    }
  });
}

export function obterEstadoSync(): EstadoSync {
  return estadoAtual;
}

/** Emite imediatamente o estado atual e retorna função para cancelar a observação. */
export function observarEstadoSync(cb: (e: EstadoSync) => void): () => void {
  observadores.push(cb);
  try {
    cb(estadoAtual);
  } catch {
    // Observador com erro não impede o registro nem derruba quem chamou
  }
  return () => {
    observadores = observadores.filter((o) => o !== cb);
  };
}

/** Define (ou remove, com null) o usuário logado. Ao definir, dispara uma sincronização. */
export function definirUsuarioSync(userId: string | null) {
  const mudou = usuarioAtualId !== userId;
  usuarioAtualId = userId;
  if (mudou) geracaoUsuario++;

  if (!userId) {
    if (timerDebounce) {
      clearTimeout(timerDebounce);
      timerDebounce = null;
    }
    syncPendenteAposAtual = false;
    emitir({ status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' });
    return;
  }

  if (mudou) {
    restaurarEstadoPersistido().finally(() => {
      void sincronizarTudo(userId);
    });
  }
}

async function restaurarEstadoPersistido() {
  if (estadoRestaurado) return;
  estadoRestaurado = true;
  const salvo = await carregarEstadoSyncPersistido();
  if (salvo?.ultimaSync) {
    emitir({ ...estadoAtual, ultimaSync: salvo.ultimaSync });
  }
}

/** Agenda uma sincronização com debounce. No-op sem usuário logado. */
export function agendarSync() {
  if (!usuarioAtualId) return;
  if (timerDebounce) clearTimeout(timerDebounce);
  timerDebounce = setTimeout(() => {
    timerDebounce = null;
    if (usuarioAtualId) void sincronizarTudo(usuarioAtualId);
  }, DEBOUNCE_MS);
}

// ─── MERGE ────────────────────────────────────────────────────────────────────

function maisNovo(a?: string, b?: string): boolean {
  // true se "a" é estritamente mais novo que "b" (ausência conta como mais antigo)
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  return ta > tb;
}

function mesclarGanhos(
  locais: Record<string, RegistroGanhoLocal>,
  remotos: RegistroGanhoLocal[]
): { mesclado: Record<string, RegistroGanhoLocal>; paraEnviar: RegistroGanhoLocal[]; recebidos: number } {
  const mesclado: Record<string, RegistroGanhoLocal> = { ...locais };
  const mapaRemoto = new Map(remotos.map((r) => [r.dataISO, r]));
  const paraEnviar: RegistroGanhoLocal[] = [];
  let recebidos = 0;

  for (const remoto of remotos) {
    const local = mesclado[remoto.dataISO];
    if (!local || maisNovo(remoto.atualizadoEm, local.atualizadoEm)) {
      mesclado[remoto.dataISO] = remoto;
      recebidos++;
    }
  }

  for (const local of Object.values(locais)) {
    const remoto = mapaRemoto.get(local.dataISO);
    if (!remoto || maisNovo(local.atualizadoEm, remoto.atualizadoEm)) {
      paraEnviar.push(local);
    }
  }

  return { mesclado, paraEnviar, recebidos };
}

function mesclarDividas(
  locais: DividaItem[],
  remotas: DividaItem[]
): { mesclado: DividaItem[]; paraEnviar: DividaItem[]; recebidos: number } {
  const mapa = new Map<string, DividaItem>(locais.map((d) => [d.id, d]));
  const mapaRemoto = new Map(remotas.map((d) => [d.id, d]));
  const paraEnviar: DividaItem[] = [];
  let recebidos = 0;

  for (const remota of remotas) {
    const local = mapa.get(remota.id);
    if (!local || maisNovo(remota.atualizadoEm, local.atualizadoEm)) {
      mapa.set(remota.id, remota);
      recebidos++;
    }
  }

  for (const local of locais) {
    const remota = mapaRemoto.get(local.id);
    if (!remota || maisNovo(local.atualizadoEm, remota.atualizadoEm)) {
      paraEnviar.push(local);
    }
  }

  return { mesclado: Array.from(mapa.values()), paraEnviar, recebidos };
}

// ─── SINCRONIZAÇÃO COMPLETA ───────────────────────────────────────────────────

/**
 * Sincroniza ganhos, dívidas e meta base com a nuvem. Execuções concorrentes
 * aguardam a atual e, se necessário, uma nova rodada é feita em seguida.
 */
export async function sincronizarTudo(
  userId: string
): Promise<ResultadoServico<{ enviados: number; recebidos: number }>> {
  if (syncEmAndamento) {
    syncPendenteAposAtual = true;
    return syncEmAndamento;
  }

  syncEmAndamento = executarSync(userId).finally(() => {
    syncEmAndamento = null;
    if (syncPendenteAposAtual && usuarioAtualId) {
      syncPendenteAposAtual = false;
      void sincronizarTudo(usuarioAtualId);
    }
  });

  return syncEmAndamento;
}

const MSG_CANCELADA = 'Sincronização cancelada: o usuário mudou.';

async function executarSync(
  userId: string
): Promise<ResultadoServico<{ enviados: number; recebidos: number }>> {
  const geracao = geracaoUsuario;
  // Verdadeiro se o usuário saiu ou trocou (definirUsuarioSync) desde o início desta rodada.
  const cancelada = () => geracao !== geracaoUsuario;
  const cancelar = (): ResultadoServico<{ enviados: number; recebidos: number }> => ({
    success: false,
    error: MSG_CANCELADA,
  });

  emitir({ ...estadoAtual, status: 'sincronizando', mensagem: 'Sincronizando...' });

  const conexao = await verificarConexao();
  if (cancelada()) return cancelar();
  if (!conexao.online) {
    return registrarFalha(conexao.motivo || 'Nuvem indisponível.');
  }

  let enviados = 0;
  let recebidos = 0;

  // 1) Ganhos
  const ganhosLocais = await carregarGanhosLocais();
  const ganhosRemotos = await buscarGanhosRemotos(userId);
  if (cancelada()) return cancelar();
  if (!ganhosRemotos.success) return registrarFalha(ganhosRemotos.error);

  const mg = mesclarGanhos(ganhosLocais, ganhosRemotos.data);
  if (mg.recebidos > 0) await substituirGanhosLocais(mg.mesclado);
  if (mg.paraEnviar.length > 0) {
    const envio = await salvarGanhosRemotos(userId, mg.paraEnviar);
    if (cancelada()) return cancelar();
    if (!envio.success) return registrarFalha(envio.error);
    enviados += envio.data;
  }
  recebidos += mg.recebidos;

  // 2) Dívidas (com tombstones)
  const dividasLocais = await carregarDividasLocaisComRemovidas();
  const dividasRemotas = await buscarDividasRemotas(userId);
  if (cancelada()) return cancelar();
  if (!dividasRemotas.success) return registrarFalha(dividasRemotas.error);

  const md = mesclarDividas(dividasLocais, dividasRemotas.data);
  if (md.recebidos > 0) await substituirDividasLocais(md.mesclado);
  if (md.paraEnviar.length > 0) {
    const envio = await salvarDividasRemotas(userId, md.paraEnviar);
    if (cancelada()) return cancelar();
    if (!envio.success) return registrarFalha(envio.error);
    enviados += envio.data;
  }
  recebidos += md.recebidos;

  // 3) Meta base
  const metaLocal = await carregarMetaBaseComData();
  const metaRemota = await buscarMetaBaseRemota(userId);
  if (cancelada()) return cancelar();
  if (!metaRemota.success) return registrarFalha(metaRemota.error);

  if (metaRemota.data && maisNovo(metaRemota.data.atualizadoEm, metaLocal.atualizadoEm || undefined)) {
    await gravarMetaBaseLocal(metaRemota.data.metaBase, metaRemota.data.atualizadoEm);
    recebidos++;
  } else if (metaLocal.atualizadoEm && (!metaRemota.data || maisNovo(metaLocal.atualizadoEm, metaRemota.data.atualizadoEm))) {
    const envio = await salvarMetaBaseRemota(userId, metaLocal.metaBase, metaLocal.atualizadoEm);
    if (cancelada()) return cancelar();
    if (!envio.success) return registrarFalha(envio.error);
    enviados++;
  }

  if (cancelada()) return cancelar();
  const agora = new Date().toISOString();
  const estadoOk: EstadoSync = { status: 'ok', ultimaSync: agora, mensagem: 'Sincronizado com a nuvem.' };
  await salvarEstadoSyncPersistido(estadoOk);
  emitir(estadoOk);

  return { success: true, data: { enviados, recebidos } };
}

function registrarFalha(mensagem: string): ResultadoServico<{ enviados: number; recebidos: number }> {
  const offline = ehErroOffline(mensagem);
  emitir({
    status: offline ? 'offline' : 'erro',
    ultimaSync: estadoAtual.ultimaSync,
    mensagem: offline ? 'Sem conexão. Dados salvos no aparelho.' : mensagem,
  });
  return { success: false, error: mensagem };
}
