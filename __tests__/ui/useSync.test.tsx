import { act, renderHook } from '@testing-library/react-native';
import { useSync } from '../../src/hooks/useSync';
import { obterEstadoSync, observarEstadoSync } from '../../src/services/sync';
import { EstadoSync } from '../../src/types';

jest.mock('../../src/services/sync', () => ({
  obterEstadoSync: jest.fn(),
  observarEstadoSync: jest.fn(),
}));

const SEM_CONTA: EstadoSync = { status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' };
const SINCRONIZANDO: EstadoSync = { status: 'sincronizando', mensagem: 'Sincronizando...' };
const OK: EstadoSync = { status: 'ok', ultimaSync: '2026-10-21T13:00:00.000Z', mensagem: 'Sincronizado com a nuvem.' };
const OFFLINE: EstadoSync = { status: 'offline', ultimaSync: OK.ultimaSync, mensagem: 'Sem conexão. Dados salvos no aparelho.' };

let emitirEstado: (e: EstadoSync) => void;
const cancelarObservacao = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(obterEstadoSync).mockReturnValue(SEM_CONTA);
  jest.mocked(observarEstadoSync).mockImplementation((cb) => {
    emitirEstado = cb;
    return cancelarObservacao;
  });
});

async function emitir(estado: EstadoSync) {
  await act(async () => {
    emitirEstado(estado);
  });
}

describe('useSync', () => {
  it('estado inicial vem de obterEstadoSync', async () => {
    const { result } = await renderHook(() => useSync());

    expect(result.current).toEqual(SEM_CONTA);
    expect(obterEstadoSync).toHaveBeenCalled();
  });

  it('assina observarEstadoSync uma única vez, mesmo com re-renderizações', async () => {
    const { rerender } = await renderHook(() => useSync());

    await rerender(undefined);
    await rerender(undefined);

    expect(observarEstadoSync).toHaveBeenCalledTimes(1);
    expect(observarEstadoSync).toHaveBeenCalledWith(expect.any(Function));
  });

  it('reflete cada estado emitido', async () => {
    const { result } = await renderHook(() => useSync());

    await emitir(SINCRONIZANDO);
    expect(result.current).toEqual(SINCRONIZANDO);

    await emitir(OK);
    expect(result.current).toEqual(OK);

    await emitir(OFFLINE);
    expect(result.current).toEqual(OFFLINE);
  });

  it('se o serviço emite imediatamente ao assinar (como o real), já começa com esse estado', async () => {
    jest.mocked(observarEstadoSync).mockImplementation((cb) => {
      cb(OK);
      return cancelarObservacao;
    });

    const { result } = await renderHook(() => useSync());

    expect(result.current).toEqual(OK);
  });

  it('cancela a assinatura ao desmontar', async () => {
    const { unmount } = await renderHook(() => useSync());

    await unmount();

    expect(cancelarObservacao).toHaveBeenCalledTimes(1);
  });
});
