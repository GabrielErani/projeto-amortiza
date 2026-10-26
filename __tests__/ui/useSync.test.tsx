// Testes de src/hooks/useSync.ts: estado da sincronização exposto para a UI.
// O serviço de sync é mockado com um observável simples que imita o real
// (observarEstadoSync emite o estado atual na hora e devolve a função de cancelar).

import { act, renderHook } from '@testing-library/react-native';
import { useSync } from '../../src/hooks/useSync';
import { observarEstadoSync, obterEstadoSync } from '../../src/services/sync';
import type { EstadoSync } from '../../src/types';

jest.mock('../../src/services/sync', () => ({
  obterEstadoSync: jest.fn(),
  observarEstadoSync: jest.fn(),
  sincronizarTudo: jest.fn(),
  definirUsuarioSync: jest.fn(),
  agendarSync: jest.fn(),
}));

const obterEstadoSyncMock = jest.mocked(obterEstadoSync);
const observarEstadoSyncMock = jest.mocked(observarEstadoSync);

const SEM_CONTA: EstadoSync = { status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' };

let estadoAtual: EstadoSync;
let observadores: Array<(e: EstadoSync) => void>;
const cancelarObservacao = jest.fn();

/** Emite um novo estado para todos os observadores (como o emitir() do serviço). */
async function emitir(estado: EstadoSync) {
  await act(async () => {
    estadoAtual = estado;
    observadores.forEach((cb) => cb(estado));
  });
}

beforeEach(() => {
  estadoAtual = SEM_CONTA;
  observadores = [];
  cancelarObservacao.mockClear();
  obterEstadoSyncMock.mockReset().mockImplementation(() => estadoAtual);
  observarEstadoSyncMock.mockReset().mockImplementation((cb) => {
    observadores.push(cb);
    cb(estadoAtual);
    return () => {
      cancelarObservacao();
      observadores = observadores.filter((o) => o !== cb);
    };
  });
});

describe('useSync', () => {
  it('começa com o estado atual do serviço', async () => {
    estadoAtual = { status: 'ok', ultimaSync: '2026-10-21T13:00:00.000Z', mensagem: 'Sincronizado com a nuvem.' };

    const { result } = await renderHook(() => useSync());

    expect(result.current).toBe(estadoAtual);
    expect(obterEstadoSyncMock).toHaveBeenCalled();
  });

  it('assina as mudanças ao montar', async () => {
    await renderHook(() => useSync());

    expect(observarEstadoSyncMock).toHaveBeenCalledTimes(1);
    expect(observarEstadoSyncMock).toHaveBeenCalledWith(expect.any(Function));
    expect(observadores).toHaveLength(1);
  });

  it('usa o estado emitido na assinatura quando ele difere do lido no início', async () => {
    const emitidoNaAssinatura: EstadoSync = { status: 'sincronizando', mensagem: 'Sincronizando...' };
    observarEstadoSyncMock.mockImplementationOnce((cb) => {
      observadores.push(cb);
      cb(emitidoNaAssinatura);
      return cancelarObservacao;
    });

    const { result } = await renderHook(() => useSync());

    expect(result.current).toBe(emitidoNaAssinatura);
  });

  it('reflete cada estado emitido depois', async () => {
    const { result } = await renderHook(() => useSync());

    const sincronizando: EstadoSync = { status: 'sincronizando', mensagem: 'Sincronizando...' };
    await emitir(sincronizando);
    expect(result.current).toBe(sincronizando);

    const ok: EstadoSync = { status: 'ok', ultimaSync: '2026-10-21T13:05:00.000Z', mensagem: 'Sincronizado com a nuvem.' };
    await emitir(ok);
    expect(result.current).toEqual(ok);

    const offline: EstadoSync = {
      status: 'offline',
      ultimaSync: ok.ultimaSync,
      mensagem: 'Sem conexão. Dados salvos no aparelho.',
    };
    await emitir(offline);
    expect(result.current).toEqual(offline);

    const erro: EstadoSync = { status: 'erro', mensagem: 'Sessão expirada. Entre novamente.' };
    await emitir(erro);
    expect(result.current).toEqual(erro);
  });

  it('não assina de novo a cada renderização', async () => {
    const { rerender } = await renderHook(() => useSync());

    await rerender(undefined);
    await emitir({ status: 'sincronizando' });
    await rerender(undefined);

    expect(observarEstadoSyncMock).toHaveBeenCalledTimes(1);
    expect(observadores).toHaveLength(1);
  });

  it('cancela a assinatura ao desmontar', async () => {
    const { unmount } = await renderHook(() => useSync());
    expect(cancelarObservacao).not.toHaveBeenCalled();

    await unmount();

    expect(cancelarObservacao).toHaveBeenCalledTimes(1);
    expect(observadores).toHaveLength(0);
  });

  it('cada componente montado tem a sua própria assinatura', async () => {
    const primeiro = await renderHook(() => useSync());
    const segundo = await renderHook(() => useSync());

    await emitir({ status: 'offline', mensagem: 'Sem conexão. Dados salvos no aparelho.' });

    expect(observadores).toHaveLength(2);
    expect(primeiro.result.current.status).toBe('offline');
    expect(segundo.result.current.status).toBe('offline');
  });
});
