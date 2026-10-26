// Teste de integração leve do App.tsx: portão de autenticação (splash → AuthScreen → app),
// modo "sem conta", seção Conta do drawer (entrar / sair), troca de abas, lançamento de ganho
// pelo fluxo completo, meta, dívidas, histórico e atualização.
//
// Mocks: auth (observarSessao guarda o callback para o teste emitir a sessão), sync (observável simples),
// storage ("banco" em memória), OCR e expo-image-picker. A flag do modo sem conta usa o mock oficial
// do AsyncStorage. Relógio fixo em quarta-feira, 21/10/2026 10:00.

import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import App from '../../App';
import { CHAVE_MODO_OFFLINE } from '../../src/hooks/useModoOffline';
import { cadastrar, entrar, observarSessao, recuperarSenha, sair } from '../../src/services/auth';
import * as storage from '../../src/services/storage';
import { definirUsuarioSync, observarEstadoSync, obterEstadoSync, sincronizarTudo } from '../../src/services/sync';
import type { DividaItem, EstadoSync, RegistroGanhoLocal, ResultadoServico, Usuario } from '../../src/types';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('../../src/services/auth', () => ({
  observarSessao: jest.fn(),
  entrar: jest.fn(),
  cadastrar: jest.fn(),
  recuperarSenha: jest.fn(),
  sair: jest.fn(),
}));

jest.mock('../../src/services/sync', () => ({
  observarEstadoSync: jest.fn(),
  obterEstadoSync: jest.fn(),
  sincronizarTudo: jest.fn(),
  definirUsuarioSync: jest.fn(),
  agendarSync: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  carregarGanhosLocais: jest.fn(),
  salvarGanhoLocalmente: jest.fn(),
  carregarMetaBaseLocal: jest.fn(),
  salvarMetaBaseLocal: jest.fn(),
  carregarDividasLocais: jest.fn(),
  salvarDividaLocal: jest.fn(),
  removerDividaLocal: jest.fn(),
  limparDadosLocais: jest.fn(),
}));

jest.mock('../../src/services/ocr', () => ({ processarOCRLocal: jest.fn() }));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const observarSessaoMock = jest.mocked(observarSessao);
const entrarMock = jest.mocked(entrar);
const cadastrarMock = jest.mocked(cadastrar);
const recuperarSenhaMock = jest.mocked(recuperarSenha);
const sairMock = jest.mocked(sair);
const storageMock = jest.mocked(storage);
const obterEstadoSyncMock = jest.mocked(obterEstadoSync);
const observarEstadoSyncMock = jest.mocked(observarEstadoSync);
const sincronizarTudoMock = jest.mocked(sincronizarTudo);
const definirUsuarioSyncMock = jest.mocked(definirUsuarioSync);
const asyncStorageMock = jest.mocked(AsyncStorage);

// ─── Constantes ───────────────────────────────────────────────────────────────

const HOJE = new Date(2026, 9, 21, 10, 0); // quarta-feira
const USUARIO: Usuario = { id: 'user-123', email: 'joao@exemplo.com', nome: 'João' };
const SEM_CONTA: EstadoSync = { status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' };
const SYNC_OK: ResultadoServico<{ enviados: number; recebidos: number }> = {
  success: true,
  data: { enviados: 0, recebidos: 0 },
};

const TITULO_SEMANA = 'Amortiza • Semana';
const TITULO_CARTEIRA = 'Amortiza • Carteira';
const CONTINUAR_SEM_CONTA = 'Continuar sem conta';
const ITEM_SAIR = '🚪 Sair da conta';
const ITEM_ENTRAR = '🔐 Entrar ou criar conta';

const FUNCOES_STORAGE = [
  'carregarGanhosLocais',
  'salvarGanhoLocalmente',
  'carregarMetaBaseLocal',
  'salvarMetaBaseLocal',
  'carregarDividasLocais',
  'salvarDividaLocal',
  'removerDividaLocal',
  'limparDadosLocais',
] as const;

const getItemOriginal = asyncStorageMock.getItem.getMockImplementation();

function adiado<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

function ganho(dataISO: string, valor: number, extra: Partial<RegistroGanhoLocal> = {}): RegistroGanhoLocal {
  return {
    dataISO,
    valor,
    metaDoDia: 100,
    percentual: Math.min(100, valor),
    atualizadoEm: '2026-10-20T12:00:00.000Z',
    ...extra,
  };
}

// ─── Estado dos mocks ─────────────────────────────────────────────────────────

let callbackSessao: ((usuario: Usuario | null) => void) | null;
let bancoGanhos: Record<string, RegistroGanhoLocal>;
let bancoMeta: number | null;
let bancoDividas: DividaItem[];
let estadoSyncAtual: EstadoSync;
let observadoresSync: Array<(e: EstadoSync) => void>;
let alerta: jest.SpyInstance;

beforeEach(async () => {
  jest.useFakeTimers({ now: HOJE, advanceTimers: true });
  alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  await AsyncStorage.clear();
  asyncStorageMock.getItem.mockClear();
  asyncStorageMock.setItem.mockClear();
  asyncStorageMock.removeItem.mockClear();

  callbackSessao = null;
  observarSessaoMock.mockReset().mockImplementation((cb) => {
    callbackSessao = cb;
    return () => {
      callbackSessao = null;
    };
  });
  entrarMock.mockReset().mockResolvedValue({ success: true, data: USUARIO });
  cadastrarMock.mockReset().mockResolvedValue({ success: true, data: { precisaConfirmarEmail: false } });
  recuperarSenhaMock.mockReset().mockResolvedValue({ success: true, data: undefined });
  // Como o Supabase: sair() encerra a sessão e o observador recebe null
  sairMock.mockReset().mockImplementation(async () => {
    callbackSessao?.(null);
  });

  bancoGanhos = {};
  bancoMeta = null;
  bancoDividas = [];
  FUNCOES_STORAGE.forEach((nome) => storageMock[nome].mockReset());
  storageMock.carregarGanhosLocais.mockImplementation(async () => bancoGanhos);
  storageMock.salvarGanhoLocalmente.mockImplementation(async (registro) => {
    bancoGanhos[registro.dataISO] = registro;
  });
  storageMock.carregarMetaBaseLocal.mockImplementation(async (padrao) => bancoMeta ?? padrao ?? 100);
  storageMock.salvarMetaBaseLocal.mockImplementation(async (meta) => {
    bancoMeta = meta;
  });
  storageMock.carregarDividasLocais.mockImplementation(async () => [...bancoDividas]);
  storageMock.salvarDividaLocal.mockImplementation(async (nova) => {
    bancoDividas = [...bancoDividas.filter((d) => d.id !== nova.id), nova];
    return [...bancoDividas];
  });
  storageMock.removerDividaLocal.mockImplementation(async (id) => {
    bancoDividas = bancoDividas.filter((d) => d.id !== id);
    return [...bancoDividas];
  });
  storageMock.limparDadosLocais.mockImplementation(async () => {
    bancoGanhos = {};
    bancoMeta = null;
    bancoDividas = [];
  });

  estadoSyncAtual = SEM_CONTA;
  observadoresSync = [];
  obterEstadoSyncMock.mockReset().mockImplementation(() => estadoSyncAtual);
  observarEstadoSyncMock.mockReset().mockImplementation((cb) => {
    observadoresSync.push(cb);
    cb(estadoSyncAtual);
    return () => {
      observadoresSync = observadoresSync.filter((o) => o !== cb);
    };
  });
  sincronizarTudoMock.mockReset().mockResolvedValue(SYNC_OK);
  definirUsuarioSyncMock.mockReset();
});

afterEach(() => {
  // Descarta um getItem "Once" não consumido e volta ao comportamento do mock oficial
  asyncStorageMock.getItem.mockReset().mockImplementation(getItemOriginal!);
  alerta.mockRestore();
  jest.useRealTimers();
});

// ─── Auxiliares ───────────────────────────────────────────────────────────────

/** Simula o Supabase Auth informando a sessão (inicial, login, logout ou expiração). */
async function emitirSessao(usuario: Usuario | null) {
  await act(async () => {
    callbackSessao?.(usuario);
  });
}

async function emitirSync(estado: EstadoSync) {
  await act(async () => {
    estadoSyncAtual = estado;
    observadoresSync.forEach((cb) => cb(estado));
  });
}

async function abrirSemSessao() {
  await render(<App />);
  await emitirSessao(null);
}

async function abrirNoModoSemConta() {
  await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
  await abrirSemSessao();
  expect(await screen.findByText(TITULO_SEMANA)).toBeOnTheScreen();
}

async function abrirLogado() {
  await render(<App />);
  await emitirSessao(USUARIO);
  expect(await screen.findByText(TITULO_SEMANA)).toBeOnTheScreen();
}

const spinners = () => screen.container.queryAll((el) => el.type === 'ActivityIndicator');

/** O único modal aberto no momento (o mock do Modal não renderiza os fechados). */
function modalAberto() {
  const modais = screen.container.queryAll((el) => el.type === 'Modal');
  expect(modais).toHaveLength(1);
  return within(modais[0]);
}

const nenhumModalAberto = () => screen.container.queryAll((el) => el.type === 'Modal').length === 0;

async function abrirMenu() {
  await fireEvent.press(screen.getByText('☰'));
  return modalAberto();
}

/** Botões do último Alert.alert exibido. */
function botoesDoUltimoAlerta(): AlertButton[] {
  const chamadas = alerta.mock.calls;
  return (chamadas[chamadas.length - 1][2] ?? []) as AlertButton[];
}

async function tocarNoBotaoDoAlerta(texto: string) {
  const botao = botoesDoUltimoAlerta().find((b) => b.text === texto);
  expect(botao).toBeDefined();
  await act(async () => {
    botao?.onPress?.();
  });
}

// ─── Portão de autenticação ───────────────────────────────────────────────────

describe('portão de autenticação', () => {
  it('mostra o splash enquanto a sessão salva é lida', async () => {
    await render(<App />);

    expect(screen.getByText('Amortiza')).toBeOnTheScreen();
    expect(spinners()).toHaveLength(1);
    expect(screen.queryByText(CONTINUAR_SEM_CONTA)).not.toBeOnTheScreen();
    expect(screen.queryByText(TITULO_SEMANA)).not.toBeOnTheScreen();
    expect(observarSessaoMock).toHaveBeenCalledTimes(1);
  });

  it('continua no splash enquanto a preferência "sem conta" é lida, mesmo com a sessão resolvida', async () => {
    const leitura = adiado<string | null>();
    asyncStorageMock.getItem.mockImplementationOnce(() => leitura.promessa);

    await abrirSemSessao();

    expect(spinners()).toHaveLength(1);
    expect(screen.queryByText(CONTINUAR_SEM_CONTA)).not.toBeOnTheScreen();

    await act(async () => leitura.resolver(null));
    expect(await screen.findByText(CONTINUAR_SEM_CONTA)).toBeOnTheScreen();
    expect(spinners()).toHaveLength(0);
  });

  it('sem sessão e sem a preferência salva, mostra a AuthScreen sem "Voltar"', async () => {
    await abrirSemSessao();

    expect(await screen.findByText(CONTINUAR_SEM_CONTA)).toBeOnTheScreen();
    expect(screen.getByTestId('auth-botao-principal')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeOnTheScreen();
    expect(screen.queryByText(TITULO_SEMANA)).not.toBeOnTheScreen();
    expect(spinners()).toHaveLength(0);
    expect(definirUsuarioSyncMock).toHaveBeenCalledWith(null);
  });

  it('"Continuar sem conta" grava a preferência e abre o app', async () => {
    await abrirSemSessao();

    await fireEvent.press(await screen.findByText(CONTINUAR_SEM_CONTA));

    expect(await screen.findByText(TITULO_SEMANA)).toBeOnTheScreen();
    expect(screen.getByText('Ganho Total da Semana')).toBeOnTheScreen();
    expect(asyncStorageMock.setItem).toHaveBeenCalledWith(CHAVE_MODO_OFFLINE, '1');
    await expect(AsyncStorage.getItem(CHAVE_MODO_OFFLINE)).resolves.toBe('1');
  });

  it('com a preferência "sem conta" salva, abre direto no app', async () => {
    await abrirNoModoSemConta();

    expect(screen.queryByText(CONTINUAR_SEM_CONTA)).not.toBeOnTheScreen();
    expect(screen.getByText('Histórico de Registros')).toBeOnTheScreen();
  });

  it('com usuário logado, abre direto no app e liga a sincronização desse usuário', async () => {
    await abrirLogado();

    expect(screen.queryByText(CONTINUAR_SEM_CONTA)).not.toBeOnTheScreen();
    expect(definirUsuarioSyncMock).toHaveBeenCalledWith('user-123');
    expect(sincronizarTudoMock).not.toHaveBeenCalled();
  });

  it('entrar pela AuthScreen: quando a sessão chega, troca para o app', async () => {
    await abrirSemSessao();
    await fireEvent.changeText(await screen.findByLabelText('E-mail'), 'joao@exemplo.com');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'segredo1');

    await fireEvent.press(screen.getByTestId('auth-botao-principal'));
    expect(entrarMock).toHaveBeenCalledWith('joao@exemplo.com', 'segredo1');
    await emitirSessao(USUARIO); // o Supabase avisa a nova sessão

    expect(await screen.findByText(TITULO_SEMANA)).toBeOnTheScreen();
    expect(screen.queryByText(CONTINUAR_SEM_CONTA)).not.toBeOnTheScreen();
  });
});

// ─── Drawer: seção Conta ──────────────────────────────────────────────────────

describe('drawer — conta logada', () => {
  it('mostra o e-mail e "Sair da conta" (sem "Entrar ou criar conta")', async () => {
    await abrirLogado();

    const menu = await abrirMenu();

    expect(menu.getByText('Conta')).toBeOnTheScreen();
    expect(menu.getByText('joao@exemplo.com')).toBeOnTheScreen();
    expect(menu.getByText(ITEM_SAIR)).toBeOnTheScreen();
    expect(menu.queryByText(ITEM_ENTRAR)).not.toBeOnTheScreen();
    expect(menu.getByTestId('drawer-status-sync')).toHaveTextContent('Aguardando sincronização');
  });

  it('o rodapé acompanha o estado da sincronização', async () => {
    await abrirLogado();
    const menu = await abrirMenu();

    await emitirSync({ status: 'ok', ultimaSync: new Date(2026, 9, 21, 10, 5).toISOString() });

    expect(menu.getByTestId('drawer-status-sync')).toHaveTextContent('Sincronizado • 10:05');
  });

  it('"Sair da conta" pede confirmação, sem fechar o menu', async () => {
    await abrirLogado();
    const menu = await abrirMenu();

    await fireEvent.press(menu.getByText(ITEM_SAIR));

    expect(alerta).toHaveBeenCalledWith('Sair da conta', 'Seus dados ficam salvos na nuvem.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: expect.any(Function) },
    ]);
    expect(screen.getByText(ITEM_SAIR)).toBeOnTheScreen();
    expect(sairMock).not.toHaveBeenCalled();
  });

  it('"Cancelar" na confirmação mantém a sessão', async () => {
    await abrirLogado();
    const menu = await abrirMenu();
    await fireEvent.press(menu.getByText(ITEM_SAIR));

    await tocarNoBotaoDoAlerta('Cancelar');

    expect(sincronizarTudoMock).not.toHaveBeenCalled();
    expect(sairMock).not.toHaveBeenCalled();
    expect(storageMock.limparDadosLocais).not.toHaveBeenCalled();
    expect(screen.getByText(TITULO_SEMANA)).toBeOnTheScreen();
  });

  it('"Sair": sincroniza, desliga o modo sem conta, encerra a sessão, apaga os dados e volta à AuthScreen', async () => {
    await abrirLogado();
    const menu = await abrirMenu();
    await fireEvent.press(menu.getByText(ITEM_SAIR));

    await tocarNoBotaoDoAlerta('Sair');

    await waitFor(() => expect(storageMock.limparDadosLocais).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(CONTINUAR_SEM_CONTA)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeOnTheScreen();
    expect(screen.queryByText(TITULO_SEMANA)).not.toBeOnTheScreen();

    expect(sincronizarTudoMock).toHaveBeenCalledWith('user-123');
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith(CHAVE_MODO_OFFLINE);
    expect(sairMock).toHaveBeenCalledTimes(1);
    // Ordem: sincroniza → remove a preferência → encerra a sessão → apaga os dados locais
    const ordem = [
      sincronizarTudoMock.mock.invocationCallOrder[0],
      asyncStorageMock.removeItem.mock.invocationCallOrder[0],
      sairMock.mock.invocationCallOrder[0],
      storageMock.limparDadosLocais.mock.invocationCallOrder[0],
    ];
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('se a sincronização falhar ao sair, avisa e só sai com "Sair mesmo assim"', async () => {
    sincronizarTudoMock.mockResolvedValue({ success: false, error: 'Sem conexão com a internet.' });
    await abrirLogado();
    const menu = await abrirMenu();
    await fireEvent.press(menu.getByText(ITEM_SAIR));

    await tocarNoBotaoDoAlerta('Sair');

    await waitFor(() =>
      expect(alerta).toHaveBeenCalledWith(
        'Não foi possível sincronizar',
        'Sem conexão com a internet.\n\nSe sair agora, as alterações que ainda não foram enviadas serão apagadas deste aparelho.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sair mesmo assim', style: 'destructive', onPress: expect.any(Function) },
        ]
      )
    );
    expect(sairMock).not.toHaveBeenCalled();
    expect(storageMock.limparDadosLocais).not.toHaveBeenCalled();
    expect(screen.getByText(TITULO_SEMANA)).toBeOnTheScreen();

    await tocarNoBotaoDoAlerta('Sair mesmo assim');

    await waitFor(() => expect(storageMock.limparDadosLocais).toHaveBeenCalledTimes(1));
    expect(sincronizarTudoMock).toHaveBeenCalledTimes(1); // não tenta sincronizar de novo
    expect(sairMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(CONTINUAR_SEM_CONTA)).toBeOnTheScreen();
  });

  it('"Cancelar" no aviso de falha da sincronização mantém a sessão', async () => {
    sincronizarTudoMock.mockResolvedValue({ success: false, error: 'Sem conexão com a internet.' });
    await abrirLogado();
    const menu = await abrirMenu();
    await fireEvent.press(menu.getByText(ITEM_SAIR));
    await tocarNoBotaoDoAlerta('Sair');
    await waitFor(() => expect(alerta).toHaveBeenCalledTimes(2));

    await tocarNoBotaoDoAlerta('Cancelar');

    expect(sairMock).not.toHaveBeenCalled();
    expect(screen.getByText(TITULO_SEMANA)).toBeOnTheScreen();
  });

  it('sessão encerrada fora do menu volta à AuthScreen sem "Voltar" e remove a preferência sem conta', async () => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1'); // entrou depois de usar sem conta
    await abrirLogado();

    await emitirSessao(null); // ex.: sessão expirada
    // Observação: neste caminho os dados locais não são apagados (só o "Sair" do menu chama limparDadosLocais)

    expect(await screen.findByText(CONTINUAR_SEM_CONTA)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeOnTheScreen();
    await waitFor(() => expect(asyncStorageMock.removeItem).toHaveBeenCalledWith(CHAVE_MODO_OFFLINE));
    await expect(AsyncStorage.getItem(CHAVE_MODO_OFFLINE)).resolves.toBeNull();
  });
});

describe('drawer — sem conta', () => {
  it('oferece "Entrar ou criar conta" e avisa que os dados ficam no aparelho', async () => {
    await abrirNoModoSemConta();

    const menu = await abrirMenu();

    expect(menu.getByText(ITEM_ENTRAR)).toBeOnTheScreen();
    expect(menu.queryByText(ITEM_SAIR)).not.toBeOnTheScreen();
    expect(menu.getByTestId('drawer-status-sync')).toHaveTextContent('Sem conta • dados só neste aparelho');
  });

  it('"Entrar ou criar conta" abre a AuthScreen com "Voltar", que retorna ao app', async () => {
    await abrirNoModoSemConta();
    const menu = await abrirMenu();

    await fireEvent.press(menu.getByText(ITEM_ENTRAR));

    expect(await screen.findByRole('button', { name: 'Voltar' })).toBeOnTheScreen();
    expect(screen.getByText(CONTINUAR_SEM_CONTA)).toBeOnTheScreen();
    expect(screen.queryByText(TITULO_SEMANA)).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

    expect(await screen.findByText(TITULO_SEMANA)).toBeOnTheScreen();
    expect(nenhumModalAberto()).toBe(true); // o menu não reabre
  });

  it('"Continuar sem conta" na AuthScreen aberta pelo menu também volta ao app', async () => {
    await abrirNoModoSemConta();
    const menu = await abrirMenu();
    await fireEvent.press(menu.getByText(ITEM_ENTRAR));

    await fireEvent.press(await screen.findByText(CONTINUAR_SEM_CONTA));

    expect(await screen.findByText(TITULO_SEMANA)).toBeOnTheScreen();
  });

  it('entrar pela AuthScreen aberta no menu leva ao app logado', async () => {
    await abrirNoModoSemConta();
    const menu = await abrirMenu();
    await fireEvent.press(menu.getByText(ITEM_ENTRAR));
    await fireEvent.changeText(await screen.findByLabelText('E-mail'), 'joao@exemplo.com');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'segredo1');

    await fireEvent.press(screen.getByTestId('auth-botao-principal'));
    await emitirSessao(USUARIO);

    expect(await screen.findByText(TITULO_SEMANA)).toBeOnTheScreen();
    const menuLogado = await abrirMenu();
    expect(menuLogado.getByText('joao@exemplo.com')).toBeOnTheScreen();
    expect(menuLogado.getByText(ITEM_SAIR)).toBeOnTheScreen();
  });
});

// ─── App principal ────────────────────────────────────────────────────────────

describe('app principal', () => {
  it('troca de abas pela barra inferior (título e conteúdo)', async () => {
    await abrirNoModoSemConta();
    expect(screen.getByText('Ganho Total da Semana')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Carteira'));

    expect(screen.getByText(TITULO_CARTEIRA)).toBeOnTheScreen();
    expect(screen.getByText('💼 Visão Macro de Ganhos')).toBeOnTheScreen();
    expect(screen.queryByText('Ganho Total da Semana')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Semana'));

    expect(screen.getByText(TITULO_SEMANA)).toBeOnTheScreen();
    expect(screen.queryByText('💼 Visão Macro de Ganhos')).not.toBeOnTheScreen();
  });

  it('troca de telas e abre a meta pelo menu, fechando-o', async () => {
    await abrirNoModoSemConta();

    let menu = await abrirMenu();
    await fireEvent.press(menu.getByText('💼 Carteira & Controle Macro'));
    expect(screen.getByText(TITULO_CARTEIRA)).toBeOnTheScreen();
    expect(nenhumModalAberto()).toBe(true);

    menu = await abrirMenu();
    await fireEvent.press(menu.getByText('📊 Dashboard da Semana'));
    expect(screen.getByText(TITULO_SEMANA)).toBeOnTheScreen();

    menu = await abrirMenu();
    await fireEvent.press(menu.getByText('🎯 Configurar Meta Diária'));
    expect(modalAberto().getByText('Meta Diária Base')).toBeOnTheScreen();
  });

  it('exibe o histórico com os ganhos salvos no aparelho, nas duas abas', async () => {
    bancoGanhos = {
      '2026-10-19': ganho('2026-10-19', 90, { descricao: 'Ganho Seg' }),
      '2026-10-21': ganho('2026-10-21', 150),
    };
    await abrirNoModoSemConta();

    expect(screen.getByText('Histórico de Registros')).toBeOnTheScreen();
    expect(screen.getByText('Ganho Qua')).toBeOnTheScreen();
    expect(screen.getByText('Ganho: R$ 150.00 | Meta: R$ 100.00')).toBeOnTheScreen();
    expect(screen.getByText('📅 21 de outubro de 2026')).toBeOnTheScreen();
    expect(screen.getByText('Ganho Seg')).toBeOnTheScreen();
    expect(screen.getByText('R$ 240,00')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Carteira'));
    expect(screen.getByText('Ganho Qua')).toBeOnTheScreen();
  });

  it('lança um ganho pelo fluxo completo: FAB → digitar → dia → atalho → salvar', async () => {
    await abrirNoModoSemConta();

    await fireEvent.press(screen.getByText('+'));
    const escolha = modalAberto();
    expect(escolha.getByText('Adicionar Ganho')).toBeOnTheScreen();

    await fireEvent.press(escolha.getByText('✍️ Digitar Ganho Manualmente'));
    let lancamento = modalAberto();
    expect(lancamento.getByText('Lançar Ganho')).toBeOnTheScreen();

    await fireEvent.press(lancamento.getByText('Qua'));
    lancamento = modalAberto();
    expect(lancamento.getByText('📅 Quarta-feira, 21 de out (Hoje)')).toBeOnTheScreen();

    await fireEvent.press(lancamento.getByText('+150'));
    expect(lancamento.getByPlaceholderText('0.00')).toHaveDisplayValue('150');

    await fireEvent.press(lancamento.getByText('Salvar Ganho'));

    expect(storageMock.salvarGanhoLocalmente).toHaveBeenCalledWith(
      expect.objectContaining({ dataISO: '2026-10-21', valor: 150, percentual: 100, descricao: 'Ganho Qua' })
    );
    expect(alerta).toHaveBeenCalledWith(
      '✅ Ganho Registrado!',
      'Ganho de Qua atualizado para R$ 150.00.\n\n⚡ Dias adiantados pelo excedente:\nQui (50%)!'
    );
    expect(nenhumModalAberto()).toBe(true);
    // Dashboard: total, dia lançado selecionado e histórico
    expect(screen.getByText('R$ 150,00')).toBeOnTheScreen();
    expect(screen.getByText('Quarta-feira, 21 de out:')).toBeOnTheScreen();
    expect(screen.getByText('Fez R$ 150,00')).toBeOnTheScreen();
    expect(screen.getByText('+ Adicionar')).toBeOnTheScreen();
    expect(screen.getByText('1/7 Dias Pagos')).toBeOnTheScreen();
    expect(screen.getByText('Ganho Qua')).toBeOnTheScreen();

    // Carteira também reflete o ganho
    await fireEvent.press(screen.getByText('Carteira'));
    expect(screen.getByText('1 de 7 metas batidas')).toBeOnTheScreen();
    expect(screen.getByText('Total arrecadado: R$ 150.00')).toBeOnTheScreen();
  });

  it('soma ao ganho do dia pelo botão do dashboard', async () => {
    bancoGanhos = { '2026-10-21': ganho('2026-10-21', 80) };
    await abrirNoModoSemConta();

    await fireEvent.press(screen.getByText('Qua'));
    expect(screen.getByText('Fez R$ 80,00')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('+ Adicionar'));
    const lancamento = modalAberto();
    expect(lancamento.getByText('💡 Já registrado neste dia: R$ 80.00')).toBeOnTheScreen();
    await fireEvent.changeText(lancamento.getByPlaceholderText('0.00'), '50');
    await fireEvent.press(modalAberto().getByText('+ Somar R$ 50.00 (Novo Total: R$ 130.00)'));

    expect(storageMock.salvarGanhoLocalmente).toHaveBeenCalledWith(expect.objectContaining({ valor: 130 }));
    expect(screen.getByText('Fez R$ 130,00')).toBeOnTheScreen();
  });

  it('cancelar o lançamento fecha o modal sem gravar', async () => {
    await abrirNoModoSemConta();
    await fireEvent.press(screen.getByText('+'));
    await fireEvent.press(modalAberto().getByText('✍️ Digitar Ganho Manualmente'));

    await fireEvent.press(modalAberto().getByText('Cancelar'));

    expect(nenhumModalAberto()).toBe(true);
    expect(storageMock.salvarGanhoLocalmente).not.toHaveBeenCalled();
  });

  it('altera a meta diária pelo botão do dashboard', async () => {
    await abrirNoModoSemConta();

    await fireEvent.press(screen.getByText('⚙️ Meta: R$ 100'));
    const modal = modalAberto();
    expect(modal.getByPlaceholderText('Ex: 100.00')).toHaveDisplayValue('100');
    await fireEvent.changeText(modal.getByPlaceholderText('Ex: 100.00'), '150');
    await fireEvent.press(modalAberto().getByText('Salvar Meta'));

    expect(storageMock.salvarMetaBaseLocal).toHaveBeenCalledWith(150);
    expect(alerta).toHaveBeenCalledWith('Meta Base Atualizada!', 'Sua meta diária base agora é de R$ 150.00.');
    expect(screen.getByText('⚙️ Meta: R$ 150')).toBeOnTheScreen();
    expect(screen.getByText('Progresso Semanal (Meta: R$ 1050.00):')).toBeOnTheScreen();
    expect(nenhumModalAberto()).toBe(true);
  });

  it('cadastra e exclui uma dívida pela carteira', async () => {
    await abrirNoModoSemConta();
    await fireEvent.press(screen.getByText('Carteira'));
    expect(screen.getByText('Nenhum gasto diário registrado (ex: combustível, almoço).')).toBeOnTheScreen();

    await fireEvent.press(screen.getAllByText('+ Adicionar')[0]);
    let modal = modalAberto();
    expect(modal.getByText('Cadastrar Gasto Diário')).toBeOnTheScreen();
    await fireEvent.changeText(modal.getByPlaceholderText('Ex: Combustível, Almoço'), 'Combustível');
    await fireEvent.changeText(modalAberto().getByPlaceholderText('0.00'), '20');
    modal = modalAberto();
    await fireEvent.press(modal.getByText('Salvar Dívida'));

    expect(alerta).toHaveBeenCalledWith('Dívida Registrada!', 'A dívida anual projetada foi recalculada automaticamente.');
    expect(screen.getByText('Combustível')).toBeOnTheScreen();
    expect(screen.getByText('R$ 20.00/dia')).toBeOnTheScreen();
    expect(screen.getByText('R$ 7.300,00')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('✕'));
    expect(alerta).toHaveBeenLastCalledWith(
      'Remover Dívida',
      'Deseja excluir "Combustível" da sua carteira?',
      expect.any(Array)
    );
    await tocarNoBotaoDoAlerta('Excluir');

    await waitFor(() => expect(screen.queryByText('Combustível')).not.toBeOnTheScreen());
    expect(storageMock.removerDividaLocal).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Nenhum gasto diário registrado (ex: combustível, almoço).')).toBeOnTheScreen();
  });

  it('logado, o botão ↻ sincroniza e relê o aparelho', async () => {
    await abrirLogado();
    bancoGanhos = { '2026-10-22': ganho('2026-10-22', 180) }; // chegou da nuvem

    await fireEvent.press(screen.getByText('↻'));

    expect(sincronizarTudoMock).toHaveBeenCalledWith('user-123');
    expect(await screen.findByText('R$ 180,00')).toBeOnTheScreen();
  });

  it('sem conta, o botão ↻ só relê o aparelho', async () => {
    await abrirNoModoSemConta();

    await fireEvent.press(screen.getByText('↻'));

    expect(sincronizarTudoMock).not.toHaveBeenCalled();
    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(2);
  });

  it('"Sincronizar Dados" no menu fecha o menu e sincroniza', async () => {
    await abrirLogado();
    const menu = await abrirMenu();

    await fireEvent.press(menu.getByText('🔄 Sincronizar Dados'));

    expect(nenhumModalAberto()).toBe(true);
    await waitFor(() => expect(sincronizarTudoMock).toHaveBeenCalledWith('user-123'));
  });

  it('o pull-to-refresh usa a mesma atualização e mostra o indicador enquanto sincroniza', async () => {
    const sincronizacao = adiado<ResultadoServico<{ enviados: number; recebidos: number }>>();
    sincronizarTudoMock.mockReturnValueOnce(sincronizacao.promessa);
    await abrirLogado();
    const controleDeAtualizacao = () => {
      const [rolagem] = screen.container.queryAll((el) => el.type === 'RCTScrollView');
      return rolagem.props.refreshControl.props as { refreshing: boolean; onRefresh: () => Promise<void> };
    };
    expect(controleDeAtualizacao().refreshing).toBe(false);

    let atualizacao!: Promise<void>;
    await act(async () => {
      atualizacao = controleDeAtualizacao().onRefresh();
    });
    expect(controleDeAtualizacao().refreshing).toBe(true);
    expect(sincronizarTudoMock).toHaveBeenCalledWith('user-123');

    await act(async () => {
      sincronizacao.resolver(SYNC_OK);
      await atualizacao;
    });
    expect(controleDeAtualizacao().refreshing).toBe(false);
  });

  it('uma sincronização concluída em segundo plano atualiza a tela', async () => {
    await abrirLogado();
    bancoGanhos = { '2026-10-19': ganho('2026-10-19', 250) };

    await emitirSync({ status: 'ok', ultimaSync: '2026-10-21T13:10:00.000Z', mensagem: 'Sincronizado com a nuvem.' });

    expect(await screen.findByText('R$ 250,00')).toBeOnTheScreen();
    expect(screen.getByText('2/7 Dias Pagos')).toBeOnTheScreen();
  });
});
