import { act, renderHook } from '@testing-library/react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { observarSessao } from '../../src/services/auth';
import { definirUsuarioSync, sincronizarTudo } from '../../src/services/sync';
import { Usuario } from '../../src/types';

jest.mock('../../src/services/auth', () => ({ observarSessao: jest.fn() }));
jest.mock('../../src/services/sync', () => ({
  definirUsuarioSync: jest.fn(),
  sincronizarTudo: jest.fn(),
}));

const ANA: Usuario = { id: 'u-ana', email: 'ana@exemplo.com', nome: 'Ana' };
const BIA: Usuario = { id: 'u-bia', email: 'bia@exemplo.com', nome: null };

let emitirSessao: (usuario: Usuario | null) => void;
const cancelarObservacao = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(observarSessao).mockImplementation((cb) => {
    emitirSessao = cb;
    return cancelarObservacao;
  });
});

async function emitir(usuario: Usuario | null) {
  await act(async () => {
    emitirSessao(usuario);
  });
}

describe('useAuth', () => {
  it('começa carregando a sessão, sem usuário, e assina observarSessao uma vez', async () => {
    const { result } = await renderHook(() => useAuth());

    expect(result.current).toEqual({ usuario: null, carregandoSessao: true });
    expect(observarSessao).toHaveBeenCalledTimes(1);
    expect(observarSessao).toHaveBeenCalledWith(expect.any(Function));
    expect(definirUsuarioSync).not.toHaveBeenCalled();
  });

  it('emissão de usuário: expõe o usuário, encerra o carregamento e passa o id para o sync', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitir(ANA);

    expect(result.current).toEqual({ usuario: ANA, carregandoSessao: false });
    expect(definirUsuarioSync).toHaveBeenCalledTimes(1);
    expect(definirUsuarioSync).toHaveBeenCalledWith('u-ana');
  });

  // Regressão: o hook chamava sincronizarTudo além de definirUsuarioSync (que já sincroniza ao trocar
  // de usuário), e cada login rodava duas sincronizações completas.
  it('não chama sincronizarTudo diretamente: definirUsuarioSync já dispara a sincronização', async () => {
    await renderHook(() => useAuth());

    await emitir(ANA);
    await emitir({ ...ANA, nome: 'Ana Maria' });
    await emitir(BIA);

    expect(sincronizarTudo).not.toHaveBeenCalled();
    expect(jest.mocked(definirUsuarioSync).mock.calls).toEqual([['u-ana'], ['u-ana'], ['u-bia']]);
  });

  it('troca de usuário expõe o novo usuário', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitir(ANA);
    await emitir(BIA);

    expect(result.current.usuario).toEqual(BIA);
    expect(definirUsuarioSync).toHaveBeenLastCalledWith('u-bia');
  });

  it('emissão null (sem sessão): encerra o carregamento e desliga a sincronização', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitir(null);

    expect(result.current).toEqual({ usuario: null, carregandoSessao: false });
    expect(definirUsuarioSync).toHaveBeenCalledTimes(1);
    expect(definirUsuarioSync).toHaveBeenCalledWith(null);
  });

  it('logout: emissão null depois de logado limpa o usuário e passa null para o sync', async () => {
    const { result } = await renderHook(() => useAuth());

    await emitir(ANA);
    await emitir(null);

    expect(result.current).toEqual({ usuario: null, carregandoSessao: false });
    expect(jest.mocked(definirUsuarioSync).mock.calls).toEqual([['u-ana'], [null]]);
  });

  it('logout seguido de novo login do mesmo usuário passa o id de novo para o sync', async () => {
    await renderHook(() => useAuth());

    await emitir(ANA);
    await emitir(null);
    await emitir(ANA);

    expect(jest.mocked(definirUsuarioSync).mock.calls).toEqual([['u-ana'], [null], ['u-ana']]);
  });

  it('re-renderizações não criam novas assinaturas', async () => {
    const { rerender } = await renderHook(() => useAuth());

    await rerender(undefined);
    await rerender(undefined);

    expect(observarSessao).toHaveBeenCalledTimes(1);
    expect(cancelarObservacao).not.toHaveBeenCalled();
  });

  it('cancela a observação da sessão ao desmontar', async () => {
    const { unmount } = await renderHook(() => useAuth());

    await unmount();

    expect(cancelarObservacao).toHaveBeenCalledTimes(1);
  });
});
