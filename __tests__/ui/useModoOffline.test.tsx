// Testes de src/hooks/useModoOffline.ts: preferência "Continuar sem conta" persistida no aparelho.
//
// Usa o mock oficial do AsyncStorage (aplicado em jest.setup.js). Falhas são simuladas com
// mockImplementationOnce/mockRejectedValueOnce; no afterEach as implementações originais do mock
// são restauradas (mockReset apagaria a implementação do mock oficial).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { CHAVE_MODO_OFFLINE, useModoOffline } from '../../src/hooks/useModoOffline';

const storageMock = jest.mocked(AsyncStorage);

// Implementações do mock oficial, guardadas antes de qualquer teste mexer nelas
const originais = {
  getItem: storageMock.getItem.getMockImplementation(),
  setItem: storageMock.setItem.getMockImplementation(),
  removeItem: storageMock.removeItem.getMockImplementation(),
};

function adiado<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

const lerFlag = () => AsyncStorage.getItem(CHAVE_MODO_OFFLINE);

beforeEach(async () => {
  await AsyncStorage.clear();
  storageMock.getItem.mockClear();
  storageMock.setItem.mockClear();
  storageMock.removeItem.mockClear();
});

afterEach(() => {
  // Descarta implementações "Once" não consumidas e volta ao comportamento do mock oficial
  storageMock.getItem.mockReset().mockImplementation(originais.getItem!);
  storageMock.setItem.mockReset().mockImplementation(originais.setItem!);
  storageMock.removeItem.mockReset().mockImplementation(originais.removeItem!);
});

describe('CHAVE_MODO_OFFLINE', () => {
  it('usa uma chave versionada própria no AsyncStorage', () => {
    expect(CHAVE_MODO_OFFLINE).toBe('@amortiza_modo_offline_v1');
  });
});

describe('useModoOffline', () => {
  it('fica null enquanto a flag é lida (o App mostra o splash)', async () => {
    const leitura = adiado<string | null>();
    storageMock.getItem.mockImplementationOnce(() => leitura.promessa);

    const { result } = await renderHook(() => useModoOffline());

    expect(result.current.modoOffline).toBeNull();
    expect(storageMock.getItem).toHaveBeenCalledWith(CHAVE_MODO_OFFLINE);

    await act(async () => leitura.resolver('1'));
    expect(result.current.modoOffline).toBe(true);
  });

  it('flag "1" salva: modo sem conta ativo', async () => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');

    const { result } = await renderHook(() => useModoOffline());

    expect(result.current.modoOffline).toBe(true);
  });

  it('sem flag salva: modo sem conta desativado', async () => {
    const { result } = await renderHook(() => useModoOffline());

    expect(result.current.modoOffline).toBe(false);
  });

  it.each(['0', 'true', '', 'sim', ' 1'])('qualquer valor diferente de "1" (%j) conta como desativado', async (valor) => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, valor);

    const { result } = await renderHook(() => useModoOffline());

    expect(result.current.modoOffline).toBe(false);
  });

  it('falha na leitura não trava o app: considera desativado', async () => {
    storageMock.getItem.mockRejectedValueOnce(new Error('AsyncStorage indisponível'));

    const { result } = await renderHook(() => useModoOffline());

    expect(result.current.modoOffline).toBe(false);
  });

  it('ativarModoOffline liga o modo e grava "1"', async () => {
    const { result } = await renderHook(() => useModoOffline());

    await act(() => result.current.ativarModoOffline());

    expect(result.current.modoOffline).toBe(true);
    expect(storageMock.setItem).toHaveBeenCalledWith(CHAVE_MODO_OFFLINE, '1');
    await expect(lerFlag()).resolves.toBe('1');
  });

  it('ativarModoOffline atualiza o estado antes de terminar de gravar', async () => {
    const gravacao = adiado<void>();
    storageMock.setItem.mockImplementationOnce(() => gravacao.promessa);
    const { result } = await renderHook(() => useModoOffline());

    let ativacao!: Promise<void>;
    await act(async () => {
      ativacao = result.current.ativarModoOffline();
    });
    expect(result.current.modoOffline).toBe(true);

    await act(async () => {
      gravacao.resolver();
      await ativacao;
    });
  });

  it('se a gravação falhar, o modo fica ativo só em memória e nada é lançado', async () => {
    storageMock.setItem.mockRejectedValueOnce(new Error('Disco cheio'));
    const { result } = await renderHook(() => useModoOffline());

    // Se a promessa rejeitasse, o act rejeitaria e o teste falharia aqui
    await act(() => result.current.ativarModoOffline());

    expect(result.current.modoOffline).toBe(true);
    await expect(lerFlag()).resolves.toBeNull();
  });

  it('desativarModoOffline desliga o modo e remove a flag', async () => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    const { result } = await renderHook(() => useModoOffline());
    expect(result.current.modoOffline).toBe(true);

    await act(() => result.current.desativarModoOffline());

    expect(result.current.modoOffline).toBe(false);
    expect(storageMock.removeItem).toHaveBeenCalledWith(CHAVE_MODO_OFFLINE);
    await expect(lerFlag()).resolves.toBeNull();
  });

  it('se a remoção falhar, o modo fica desativado em memória e nada é lançado', async () => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    storageMock.removeItem.mockRejectedValueOnce(new Error('Falha de E/S'));
    const { result } = await renderHook(() => useModoOffline());

    await act(() => result.current.desativarModoOffline());

    expect(result.current.modoOffline).toBe(false);
    await expect(lerFlag()).resolves.toBe('1');
  });

  it('a preferência sobrevive a uma nova montagem (app reaberto)', async () => {
    const primeira = await renderHook(() => useModoOffline());
    await act(() => primeira.result.current.ativarModoOffline());
    await primeira.unmount();

    const segunda = await renderHook(() => useModoOffline());

    expect(segunda.result.current.modoOffline).toBe(true);
  });

  it('ativar e desativar mantêm a mesma referência entre renderizações', async () => {
    const { result, rerender } = await renderHook(() => useModoOffline());
    const { ativarModoOffline, desativarModoOffline } = result.current;

    await act(() => result.current.ativarModoOffline());
    await rerender(undefined);

    expect(result.current.ativarModoOffline).toBe(ativarModoOffline);
    expect(result.current.desativarModoOffline).toBe(desativarModoOffline);
  });

  it('desmontar antes de a leitura terminar não gera erro', async () => {
    const leitura = adiado<string | null>();
    storageMock.getItem.mockImplementationOnce(() => leitura.promessa);
    const erroConsole = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result, unmount } = await renderHook(() => useModoOffline());
    await unmount();
    await act(async () => leitura.resolver('1'));

    expect(result.current.modoOffline).toBeNull();
    expect(erroConsole).not.toHaveBeenCalled();
    erroConsole.mockRestore();
  });
});
