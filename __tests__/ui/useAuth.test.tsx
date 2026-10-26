// Testes de src/hooks/useAuth.ts: observa a sessão do Supabase Auth e liga/desliga a sincronização.
//
// observarSessao é mockado guardando o callback, para o teste emitir Usuario | null quando quiser.
// O hook deve repassar o usuário para definirUsuarioSync (que já dispara a sincronização completa)
// e nunca chamar sincronizarTudo diretamente.

import { act, renderHook } from '@testing-library/react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { observarSessao } from '../../src/services/auth';
import { definirUsuarioSync, sincronizarTudo } from '../../src/services/sync';
import type { Usuario } from '../../src/types';

jest.mock('../../src/services/auth', () => ({
  observarSessao: jest.fn(),
  entrar: jest.fn(),
  cadastrar: jest.fn(),
  recuperarSenha: jest.fn(),
  sair: jest.fn(),
}));

jest.mock('../../src/services/sync', () => ({
  definirUsuarioSync: jest.fn(),
  sincronizarTudo: jest.fn(),
  observarEstadoSync: jest.fn(),
  obterEstadoSync: jest.fn(),
  agendarSync: jest.fn(),
}));

const observarSessaoMock = jest.mocked(observarSessao);
const definirUsuarioSyncMock = jest.mocked(definirUsuarioSync);
const sincronizarTudoMock = jest.mocked(sincronizarTudo);

const JOAO: Usuario = { id: 'user-123', email: 'joao@exemplo.com', nome: 'João' };
const MARIA: Usuario = { id: 'user-456', email: 'maria@exemplo.com', nome: null };

let callbackSessao: ((usuario: Usuario | null) => void) | null;
const cancelarObservacao = jest.fn();

/** Simula o Supabase Auth informando a sessão atual (login, logout, refresh). */
async function emitirSessao(usuario: Usuario | null) {
  await act(async () => {
    callbackSessao?.(usuario);
  });
}

beforeEach(() => {
  callbackSessao = null;
  cancelarObservacao.mockClear();
  definirUsuarioSyncMock.mockReset();
  sincronizarTudoMock.mockReset();
  observarSessaoMock.mockReset().mockImplementation((cb) => {
    callbackSessao = cb;
    return cancelarObservacao;
  });
});

describe('useAuth', () => {
  it('começa sem usuário e carregando a sessão', async () => {
    const { result } = await renderHook(() => useAuth());

    expect(result.current).toEqual({ usuario: null, carregandoSessao: true });
    expect(observarSessaoMock).toHaveBeenCalledTimes(1);
    expect(observarSessaoMock).toHaveBeenCalledWith(expect.any(Function));
    expect(definirUsuarioSyncMock).not.toHaveBeenCalled();
  });

  it('sessão com usuário: expõe o usuário, encerra o carregamento e liga a sync com o id', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitirSessao(JOAO);

    expect(result.current.usuario).toBe(JOAO);
    expect(result.current.carregandoSessao).toBe(false);
    expect(definirUsuarioSyncMock).toHaveBeenCalledTimes(1);
    expect(definirUsuarioSyncMock).toHaveBeenCalledWith('user-123');
  });

  it('não chama sincronizarTudo diretamente (definirUsuarioSync já dispara a sincronização)', async () => {
    await renderHook(() => useAuth());

    await emitirSessao(JOAO);
    await emitirSessao(JOAO);
    await emitirSessao(null);
    await emitirSessao(MARIA);

    expect(sincronizarTudoMock).not.toHaveBeenCalled();
  });

  it('sessão vazia: sem usuário, carregamento encerrado e sync desligada (null)', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitirSessao(null);

    expect(result.current).toEqual({ usuario: null, carregandoSessao: false });
    expect(definirUsuarioSyncMock).toHaveBeenCalledTimes(1);
    expect(definirUsuarioSyncMock).toHaveBeenCalledWith(null);
  });

  it('logout depois do login desliga a sync', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitirSessao(JOAO);
    await emitirSessao(null);

    expect(result.current.usuario).toBeNull();
    expect(result.current.carregandoSessao).toBe(false);
    expect(definirUsuarioSyncMock.mock.calls).toEqual([['user-123'], [null]]);
  });

  it('troca de conta repassa o novo id', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitirSessao(JOAO);
    await emitirSessao(MARIA);

    expect(result.current.usuario).toBe(MARIA);
    expect(definirUsuarioSyncMock.mock.calls).toEqual([['user-123'], ['user-456']]);
  });

  it('reemissão do mesmo usuário (ex.: token renovado) repassa o mesmo id; o serviço de sync ignora', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitirSessao(JOAO);
    await emitirSessao({ ...JOAO });

    expect(result.current.usuario).toEqual(JOAO);
    expect(definirUsuarioSyncMock.mock.calls).toEqual([['user-123'], ['user-123']]);
  });

  it('não volta a "carregando" depois da primeira emissão', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitirSessao(null);
    await emitirSessao(JOAO);
    await emitirSessao(null);

    expect(result.current.carregandoSessao).toBe(false);
  });

  it('observa a sessão uma única vez, mesmo com novas renderizações', async () => {
    const { rerender } = await renderHook(() => useAuth());

    await rerender(undefined);
    await emitirSessao(JOAO);
    await rerender(undefined);

    expect(observarSessaoMock).toHaveBeenCalledTimes(1);
  });

  it('cancela a observação ao desmontar', async () => {
    const { unmount } = await renderHook(() => useAuth());
    expect(cancelarObservacao).not.toHaveBeenCalled();

    await unmount();

    expect(cancelarObservacao).toHaveBeenCalledTimes(1);
  });
});
