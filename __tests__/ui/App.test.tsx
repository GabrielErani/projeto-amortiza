// Integração leve do App: gate de sessão (splash → AuthScreen / app principal) e alguns fluxos.
import React from 'react';
import { Alert, AlertButton } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import App from '../../App';
import { observarSessao, sair } from '../../src/services/auth';
import { definirUsuarioSync, obterEstadoSync, observarEstadoSync, sincronizarTudo } from '../../src/services/sync';
import {
  carregarDividasLocais,
  carregarGanhosLocais,
  carregarMetaBaseLocal,
  limparDadosLocais,
  removerDividaLocal,
  salvarDividaLocal,
  salvarGanhoLocalmente,
  salvarMetaBaseLocal,
} from '../../src/services/storage';
import { processarOCRLocal } from '../../src/services/ocr';
import { DividaItem, EstadoSync, RegistroGanhoLocal, Usuario } from '../../src/types';

// Sem insets nativos o SafeAreaProvider real não renderiza os filhos; usamos o mock oficial da lib.
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../../src/services/auth', () => ({
  observarSessao: jest.fn(),
  sair: jest.fn(),
  entrar: jest.fn(),
  cadastrar: jest.fn(),
  recuperarSenha: jest.fn(),
}));
jest.mock('../../src/services/sync', () => ({
  definirUsuarioSync: jest.fn(),
  sincronizarTudo: jest.fn(),
  obterEstadoSync: jest.fn(),
  observarEstadoSync: jest.fn(),
  agendarSync: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  carregarDividasLocais: jest.fn(),
  carregarGanhosLocais: jest.fn(),
  carregarMetaBaseLocal: jest.fn(),
  limparDadosLocais: jest.fn(),
  removerDividaLocal: jest.fn(),
  salvarDividaLocal: jest.fn(),
  salvarGanhoLocalmente: jest.fn(),
  salvarMetaBaseLocal: jest.fn(),
}));
jest.mock('../../src/services/ocr', () => ({ processarOCRLocal: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const CHAVE_MODO_OFFLINE = '@amortiza_modo_offline_v1';
// Quarta-feira, 21/10/2026 → semana de 19 a 25 de outubro.
const AGORA = new Date(2026, 9, 21, 10, 0);
const GABRIEL: Usuario = { id: 'u1', email: 'gabriel@exemplo.com', nome: 'Gabriel' };
const SEM_CONTA: EstadoSync = { status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' };
const COMBUSTIVEL: DividaItem = { id: 'd1', descricao: 'Combustível', valor: 30, tipo: 'diaria', dataLancamento: '2026-10-01' };

type Permissao = Awaited<ReturnType<typeof ImagePicker.requestMediaLibraryPermissionsAsync>>;
type ResultadoPicker = Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
const PERMISSAO_CONCEDIDA = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' } as Permissao;
const PERMISSAO_NEGADA = { granted: false, status: 'denied', canAskAgain: true, expires: 'never' } as Permissao;
const PRINT_ESCOLHIDO = { canceled: false, assets: [{ uri: 'file:///print.png', width: 1080, height: 1920 }] } as ResultadoPicker;

function registro(dataISO: string, valor: number): RegistroGanhoLocal {
  return { dataISO, valor, metaDoDia: 100, percentual: Math.min(100, valor), atualizadoEm: '2026-10-20T12:00:00.000Z' };
}

let emitirSessao: (u: Usuario | null) => void = () => {
  throw new Error('observarSessao ainda não foi assinado');
};
const cancelarSessao = jest.fn();

async function emitir(usuario: Usuario | null) {
  await act(async () => {
    emitirSessao(usuario);
  });
}

// getItem do mock oficial do AsyncStorage já é um jest.fn: jest.spyOn devolveria o próprio mock (sem como
// restaurar). Guardamos a implementação real para recolocá-la depois de cada teste.
const getItemReal = jest.mocked(AsyncStorage.getItem).getMockImplementation()!;

const indicadoresDeCarregamento = () =>
  screen.container.queryAll((el) => el.type === 'ActivityIndicator');

// Modal visível no momento (modais fechados não renderizam o host "Modal").
function modalAberto() {
  const modais = screen.container.queryAll((el) => el.type === 'Modal');
  expect(modais).toHaveLength(1);
  return within(modais[0]);
}

function botoesDoAlerta(alerta: jest.SpyInstance, chamada = 0): AlertButton[] {
  return alerta.mock.calls[chamada][2] as AlertButton[];
}

beforeEach(async () => {
  jest.useFakeTimers({ now: AGORA, advanceTimers: true });
  jest.clearAllMocks();
  await AsyncStorage.clear();

  jest.mocked(observarSessao).mockImplementation((cb) => {
    emitirSessao = cb;
    return cancelarSessao;
  });
  jest.mocked(sair).mockResolvedValue(undefined);
  jest.mocked(obterEstadoSync).mockReturnValue(SEM_CONTA);
  jest.mocked(observarEstadoSync).mockImplementation(() => jest.fn());
  jest.mocked(sincronizarTudo).mockResolvedValue({ success: true, data: { enviados: 0, recebidos: 0 } });
  jest.mocked(carregarMetaBaseLocal).mockImplementation(async (padrao = 100) => padrao);
  jest.mocked(carregarGanhosLocais).mockResolvedValue({});
  jest.mocked(carregarDividasLocais).mockResolvedValue([]);
  jest.mocked(salvarGanhoLocalmente).mockResolvedValue(undefined);
  jest.mocked(limparDadosLocais).mockResolvedValue(undefined);
  jest.mocked(removerDividaLocal).mockResolvedValue([]);
  jest.mocked(salvarDividaLocal).mockImplementation(async (d) => [d]);
  jest.mocked(salvarMetaBaseLocal).mockResolvedValue(undefined);
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(PERMISSAO_CONCEDIDA);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(PRINT_ESCOLHIDO);
  jest.mocked(processarOCRLocal).mockResolvedValue({ textoBruto: 'Ganhos R$ 250,00', valorMetaExtrado: 250, percentualExtraido: null });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(AsyncStorage.getItem).mockReset().mockImplementation(getItemReal);
  jest.useRealTimers();
});

describe('App — gate de sessão', () => {
  it('enquanto a sessão carrega, mostra o splash (sem AuthScreen e sem o app)', async () => {
    await render(<App />);

    expect(screen.getByText('Amortiza')).toBeOnTheScreen();
    expect(indicadoresDeCarregamento()).toHaveLength(1);
    expect(screen.queryByText('Suas metas da semana, no seu ritmo.')).not.toBeOnTheScreen();
    expect(screen.queryByText('Continuar sem conta')).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab')).not.toBeOnTheScreen();
    expect(observarSessao).toHaveBeenCalledTimes(1);
  });

  it('mantém o splash enquanto a preferência de modo offline ainda não foi lida', async () => {
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise<string | null>(() => {}));
    await render(<App />);

    await emitir(null);

    expect(screen.getByText('Amortiza')).toBeOnTheScreen();
    expect(screen.queryByText('Continuar sem conta')).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab')).not.toBeOnTheScreen();
  });

  it('sessão nula e sem a flag offline: mostra a AuthScreen', async () => {
    await render(<App />);

    await emitir(null);

    expect(screen.getByText('Suas metas da semana, no seu ritmo.')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Entrar' })).toBeSelected();
    expect(screen.getByText('Continuar sem conta')).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Semana' })).not.toBeOnTheScreen();
    expect(definirUsuarioSync).toHaveBeenCalledWith(null);
  });

  it('"Continuar sem conta" abre o app principal e persiste a flag offline', async () => {
    await render(<App />);
    await emitir(null);

    await fireEvent.press(screen.getByText('Continuar sem conta'));

    expect(await screen.findByRole('tab', { name: 'Semana' })).toBeSelected();
    expect(screen.getByRole('header', { name: 'Semana' })).toBeOnTheScreen();
    expect(screen.getByText('Ganho total da semana')).toBeOnTheScreen();
    expect(screen.getByText('19 – 25 out')).toBeOnTheScreen();
    expect(screen.queryByText('Continuar sem conta')).not.toBeOnTheScreen();
    expect(await AsyncStorage.getItem(CHAVE_MODO_OFFLINE)).toBe('1');
    // Sem conta: chip de sync "Sem conta" e avatar neutro.
    expect(screen.getByRole('button', { name: 'Sem conta' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Conta')).toHaveTextContent('•');
  });

  it('com a flag offline já salva, abre direto o app principal', async () => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    await render(<App />);

    await emitir(null);

    expect(await screen.findByRole('tab', { name: 'Semana' })).toBeOnTheScreen();
    expect(screen.queryByText('Continuar sem conta')).not.toBeOnTheScreen();
  });

  it('flag offline com valor diferente de "1" é ignorada', async () => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '0');
    await render(<App />);

    await emitir(null);

    expect(screen.getByText('Continuar sem conta')).toBeOnTheScreen();
  });

  it('sessão com usuário: abre direto o app principal e liga a sincronização', async () => {
    await render(<App />);

    await emitir(GABRIEL);

    expect(await screen.findByRole('tab', { name: 'Semana' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Conta')).toHaveTextContent('G');
    expect(screen.queryByText('Continuar sem conta')).not.toBeOnTheScreen();
    expect(definirUsuarioSync).toHaveBeenCalledWith('u1');
    // definirUsuarioSync já dispara a sincronização; o App não chama sincronizarTudo de novo no login.
    expect(sincronizarTudo).not.toHaveBeenCalled();
  });

  it('ao emitir logout (sessão nula), o gate volta para a AuthScreen', async () => {
    await render(<App />);
    await emitir(GABRIEL);
    await screen.findByRole('tab', { name: 'Semana' });

    await emitir(null);

    expect(await screen.findByText('Continuar sem conta')).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Semana' })).not.toBeOnTheScreen();
    expect(definirUsuarioSync).toHaveBeenLastCalledWith(null);
  });

  it('logout volta para a AuthScreen mesmo se a flag offline estava salva', async () => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    await render(<App />);
    await emitir(GABRIEL);
    await screen.findByRole('tab', { name: 'Semana' });

    await emitir(null);

    expect(await screen.findByText('Continuar sem conta')).toBeOnTheScreen();
  });

  it('"Sair da conta" pede confirmação; ao confirmar, sai, limpa os dados locais e remove a flag', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    await render(<App />);
    await emitir(GABRIEL);

    await fireEvent.press(await screen.findByLabelText('Conta'));
    await fireEvent.press(screen.getByRole('button', { name: 'Sair da conta' }));

    expect(alerta).toHaveBeenCalledWith(
      'Sair da conta',
      'Seus dados ficam salvos na nuvem e serão removidos deste aparelho.',
      expect.any(Array),
    );
    const botoes = botoesDoAlerta(alerta);
    expect(botoes.map((b) => b.text)).toEqual(['Cancelar', 'Sair']);
    expect(sair).not.toHaveBeenCalled();

    await act(async () => {
      await botoes[1].onPress?.();
    });

    expect(sair).toHaveBeenCalledTimes(1);
    expect(limparDadosLocais).toHaveBeenCalledTimes(1);
    // Sincroniza antes de sair, para não apagar do aparelho o que ainda não foi para a nuvem.
    expect(sincronizarTudo).toHaveBeenCalledWith('u1');
    expect(jest.mocked(sincronizarTudo).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(sair).mock.invocationCallOrder[0]);
    expect(jest.mocked(sair).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(limparDadosLocais).mock.invocationCallOrder[0]);
    expect(await AsyncStorage.getItem(CHAVE_MODO_OFFLINE)).toBeNull();

    // Após o signOut o Supabase emite a sessão nula.
    await emitir(null);
    expect(await screen.findByText('Continuar sem conta')).toBeOnTheScreen();
  });

  it('se a sincronização antes de sair falhar, avisa e só sai com "Sair mesmo assim"', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(sincronizarTudo).mockResolvedValue({ success: false, error: 'Sem conexão. Dados salvos no aparelho.' });
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    await render(<App />);
    await emitir(GABRIEL);

    await fireEvent.press(await screen.findByLabelText('Conta'));
    await fireEvent.press(screen.getByRole('button', { name: 'Sair da conta' }));
    await act(async () => {
      await botoesDoAlerta(alerta)[1].onPress?.(); // "Sair"
    });

    // Nada foi apagado: o App pede uma segunda confirmação explicando o risco.
    expect(sair).not.toHaveBeenCalled();
    expect(limparDadosLocais).not.toHaveBeenCalled();
    expect(alerta).toHaveBeenLastCalledWith(
      'Não foi possível sincronizar',
      expect.stringContaining('Sem conexão. Dados salvos no aparelho.'),
      expect.any(Array),
    );
    const segundaConfirmacao = botoesDoAlerta(alerta, 1);
    expect(segundaConfirmacao.map((btn) => btn.text)).toEqual(['Cancelar', 'Sair mesmo assim']);

    await act(async () => {
      await segundaConfirmacao[1].onPress?.();
    });

    expect(sair).toHaveBeenCalledTimes(1);
    expect(limparDadosLocais).toHaveBeenCalledTimes(1);
    expect(sincronizarTudo).toHaveBeenCalledTimes(1); // "Sair mesmo assim" não tenta sincronizar de novo
  });

  it('no modo offline, "Entrar ou criar conta" abre a AuthScreen com "Voltar"', async () => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    await render(<App />);
    await emitir(null);

    await fireEvent.press(await screen.findByLabelText('Conta'));
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar ou criar conta' }));

    expect(screen.getByRole('tab', { name: 'Entrar' })).toBeOnTheScreen();
    expect(screen.queryByText('Continuar sem conta')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Voltar'));

    expect(await screen.findByRole('tab', { name: 'Semana' })).toBeOnTheScreen();
  });

  it('no modo offline, tocar no indicador de sync abre o login; ao logar, volta ao app', async () => {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    await render(<App />);
    await emitir(null);

    await fireEvent.press(await screen.findByRole('button', { name: 'Sem conta' }));
    expect(screen.getByText('Voltar')).toBeOnTheScreen();

    await emitir(GABRIEL);

    expect(await screen.findByRole('tab', { name: 'Semana' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Conta')).toHaveTextContent('G');
  });

  it('logado, "Sincronizar agora" na conta dispara a sincronização do usuário', async () => {
    await render(<App />);
    await emitir(GABRIEL);

    await fireEvent.press(await screen.findByRole('button', { name: 'Conta' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Sincronizar agora' }));

    expect(sincronizarTudo).toHaveBeenCalledTimes(1);
    expect(sincronizarTudo).toHaveBeenCalledWith('u1');
  });

  it('logado, tocar no chip de sync abre a conta (não o login)', async () => {
    jest.mocked(obterEstadoSync).mockReturnValue({ status: 'ok', ultimaSync: '2026-10-21T12:00:00.000Z' });
    await render(<App />);
    await emitir(GABRIEL);

    await fireEvent.press(await screen.findByRole('button', { name: 'Sincronizado' }));

    expect(screen.getByRole('button', { name: 'Sair da conta' })).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Entrar' })).not.toBeOnTheScreen();
  });

  it('cancela a observação da sessão ao desmontar', async () => {
    await render(<App />);

    await screen.unmount();

    expect(cancelarSessao).toHaveBeenCalledTimes(1);
  });
});

describe('App — fluxos principais (integração leve)', () => {
  async function abrirAppOffline() {
    await AsyncStorage.setItem(CHAVE_MODO_OFFLINE, '1');
    await render(<App />);
    await emitir(null);
    await screen.findByRole('tab', { name: 'Semana' });
  }

  it('trocar para a aba Carteira mostra a carteira e o mês no cabeçalho', async () => {
    await abrirAppOffline();

    await fireEvent.press(screen.getByRole('tab', { name: 'Carteira' }));

    expect(screen.getByRole('tab', { name: 'Carteira' })).toBeSelected();
    expect(screen.getByRole('header', { name: 'Carteira' })).toBeOnTheScreen();
    expect(screen.getByText('outubro de 2026')).toBeOnTheScreen();
    expect(screen.getByText('Dívidas')).toBeOnTheScreen();
    expect(screen.queryByText('Ganho total da semana')).not.toBeOnTheScreen();
  });

  it('o botão "+" abre direto o lançamento do dia selecionado (sem folha "Adicionar ganho")', async () => {
    await abrirAppOffline();

    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar ganho' }));

    const modal = modalAberto();
    expect(modal.getByText('Lançar ganho')).toBeOnTheScreen();
    expect(modal.getByText('Quarta, 21 out · hoje')).toBeOnTheScreen();
    expect(modal.getByText('Já registrado: R$ 0,00')).toBeOnTheScreen();
    expect(modal.getByRole('button', { name: 'Qua' })).toBeSelected();
    expect(modal.getByRole('button', { name: 'Escanear print (OCR)' })).toBeOnTheScreen();
    expect(screen.queryByText('Adicionar ganho')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Digitar ganho' })).not.toBeOnTheScreen();
  });

  it('o "+" usa o dia selecionado no gráfico', async () => {
    await abrirAppOffline();

    await fireEvent.press(screen.getByRole('button', { name: 'Sexta-feira, 23 de out, 0% da meta' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar ganho' }));

    expect(modalAberto().getByRole('button', { name: 'Sex' })).toBeSelected();
    expect(modalAberto().getByText('Sexta, 23 out')).toBeOnTheScreen();
  });

  it('lançar ganho salva localmente, recalcula a semana e confirma no Alert', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await abrirAppOffline();

    await fireEvent.press(screen.getByRole('button', { name: 'Lançar ganho' }));
    await fireEvent.changeText(screen.getByLabelText('Valor do ganho'), '150');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar R$ 150,00' }));

    expect(salvarGanhoLocalmente).toHaveBeenCalledTimes(1);
    expect(salvarGanhoLocalmente).toHaveBeenCalledWith(
      expect.objectContaining({ dataISO: '2026-10-21', valor: 150, metaDoDia: 100, percentual: 100, descricao: 'Ganho Qua' }),
    );
    expect(alerta).toHaveBeenCalledWith('Qua: R$ 150,00', 'Excedente adiantou: Qui 50%.');
    expect(screen.queryByLabelText('Valor do ganho')).not.toBeOnTheScreen();
    // Total da semana (hero) e card do dia selecionado (Qua) mostram o novo valor.
    expect(screen.getAllByText('R$ 150,00')).toHaveLength(2);
    expect(screen.getByText('Meta R$ 700 · 1/7 dias cobertos')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Quinta-feira, 22 de out, 50% da meta' })).toBeOnTheScreen();
  });

  // BUG documentado (ver relatório): a mensagem lista todo dia posterior com percentual > 0, inclusive
  // dias cobertos pelo próprio ganho. Aqui Seg bate a meta exata (sem excedente) e Ter já tinha R$ 100.
  it('"Excedente adiantou" não lista dias cobertos pelo próprio ganho', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(carregarGanhosLocais).mockResolvedValue({ '2026-10-20': registro('2026-10-20', 100) });
    await abrirAppOffline();
    await screen.findByRole('button', { name: 'Terça-feira, 20 de out, 100% da meta' });

    await fireEvent.press(screen.getByRole('button', { name: 'Segunda-feira, 19 de out, 0% da meta' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Lançar ganho' }));
    await fireEvent.changeText(screen.getByLabelText('Valor do ganho'), '100');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar R$ 100,00' }));

    expect(alerta).toHaveBeenCalledWith('Seg: R$ 100,00', 'Ganho registrado.');
  });

  it('excluir dívida na Carteira pede confirmação no Alert e remove ao confirmar', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.mocked(carregarDividasLocais).mockResolvedValue([COMBUSTIVEL]);
    await abrirAppOffline();
    await fireEvent.press(screen.getByRole('tab', { name: 'Carteira' }));

    await fireEvent.press(await screen.findByLabelText('Excluir Combustível'));

    expect(alerta).toHaveBeenCalledWith('Remover', 'Excluir "Combustível"?', expect.any(Array));
    expect(removerDividaLocal).not.toHaveBeenCalled();

    const excluir = botoesDoAlerta(alerta).find((b) => b.text === 'Excluir');
    await act(async () => {
      await excluir?.onPress?.();
    });

    expect(removerDividaLocal).toHaveBeenCalledWith('d1');
    expect(screen.queryByText('Combustível')).not.toBeOnTheScreen();
    expect(screen.getByText('Ex.: combustível, almoço.')).toBeOnTheScreen();
  });

  it('nova dívida imprevista pela Carteira é gravada com tipo, frequência e data de hoje', async () => {
    await abrirAppOffline();
    await fireEvent.press(screen.getByRole('tab', { name: 'Carteira' }));

    // Terceiro "+ Adicionar" = seção Imprevistos.
    await fireEvent.press(screen.getAllByRole('button', { name: '+ Adicionar' })[2]);
    expect(screen.getByText('Imprevisto')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mensal' }));
    await fireEvent.changeText(screen.getByPlaceholderText('Ex.: Manutenção do pneu'), 'Lavagem');
    await fireEvent.changeText(screen.getByPlaceholderText('0,00'), '50');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    expect(salvarDividaLocal).toHaveBeenCalledWith(
      expect.objectContaining({ descricao: 'Lavagem', valor: 50, tipo: 'imprevista', frequenciaImprevisto: 'mensal', dataLancamento: '2026-10-21' }),
    );
    expect(screen.queryByText('Imprevisto')).not.toBeOnTheScreen();
    expect(screen.getByText('Lavagem')).toBeOnTheScreen();
    expect(screen.getByText('Mensal · R$ 600/ano')).toBeOnTheScreen();
  });

  it('nova dívida diária não leva frequência de imprevisto', async () => {
    await abrirAppOffline();
    await fireEvent.press(screen.getByRole('tab', { name: 'Carteira' }));

    await fireEvent.press(screen.getAllByRole('button', { name: '+ Adicionar' })[0]);
    await fireEvent.changeText(screen.getByPlaceholderText('Ex.: Combustível, almoço'), 'Combustível');
    await fireEvent.changeText(screen.getByPlaceholderText('0,00'), '30');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    expect(salvarDividaLocal).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'diaria', frequenciaImprevisto: undefined }));
    expect(screen.getByText('Combustível')).toBeOnTheScreen();
    expect(screen.getByText('R$ 10.950/ano')).toBeOnTheScreen();
  });

  it('tocar na linha da meta abre a meta diária, grava e recalcula a meta semanal', async () => {
    await abrirAppOffline();

    await fireEvent.press(screen.getByRole('button', { name: 'Meta R$ 700 · 0/7 dias cobertos' }));
    expect(screen.getByText('Quanto você quer fazer por dia?')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByPlaceholderText('100'), '150');
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    expect(salvarMetaBaseLocal).toHaveBeenCalledWith(150);
    expect(screen.queryByText('Quanto você quer fazer por dia?')).not.toBeOnTheScreen();
    expect(screen.getByText('Meta R$ 1.050 · 0/7 dias cobertos')).toBeOnTheScreen();
  });

  describe('OCR do print', () => {
    // O "+" abre o lançamento; o OCR é a ação secundária dentro dele.
    async function escanearPrint() {
      await fireEvent.press(screen.getByRole('button', { name: 'Adicionar ganho' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Escanear print (OCR)' }));
    }

    it('sem permissão de fotos, avisa no Alert e não abre a galeria', async () => {
      const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue(PERMISSAO_NEGADA);
      await abrirAppOffline();

      await escanearPrint();

      expect(alerta).toHaveBeenCalledWith('Permissão necessária', 'Permita o acesso às fotos para ler o print.');
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
      expect(processarOCRLocal).not.toHaveBeenCalled();
      expect(screen.queryByText('Valor encontrado')).not.toBeOnTheScreen();
      // O formulário manual continua aberto.
      expect(screen.getByLabelText('Valor do ganho')).toBeOnTheScreen();
    });

    it('seleção cancelada não roda o OCR e mantém o formulário manual', async () => {
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null } as ResultadoPicker);
      await abrirAppOffline();

      await escanearPrint();

      expect(processarOCRLocal).not.toHaveBeenCalled();
      expect(screen.queryByText('Valor encontrado')).not.toBeOnTheScreen();
      expect(screen.queryByText('Lendo o print…')).not.toBeOnTheScreen();
      expect(screen.getByLabelText('Valor do ganho')).toHaveDisplayValue('');
    });

    it('valor lido no print abre a confirmação e "Confirmar e salvar" grava esse valor', async () => {
      const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await abrirAppOffline();

      await escanearPrint();

      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 0.8 });
      expect(processarOCRLocal).toHaveBeenCalledWith('file:///print.png');
      expect(screen.getByText('Valor encontrado')).toBeOnTheScreen();
      expect(screen.getByText('para Quarta, 21 out · hoje')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Confirmar e salvar' }));

      expect(salvarGanhoLocalmente).toHaveBeenCalledWith(expect.objectContaining({ dataISO: '2026-10-21', valor: 250, percentual: 100 }));
      expect(alerta).toHaveBeenCalledWith('Qua: R$ 250,00', 'Excedente adiantou: Qui 100%, Sex 50%.');
    });

    it('o print vale para o dia escolhido no formulário (não para o dia do gráfico)', async () => {
      jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await abrirAppOffline();

      await fireEvent.press(screen.getByRole('button', { name: 'Adicionar ganho' }));
      await fireEvent.press(modalAberto().getByRole('button', { name: 'Sex' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Escanear print (OCR)' }));

      expect(screen.getByText('para Sexta, 23 out')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Confirmar e salvar' }));
      expect(salvarGanhoLocalmente).toHaveBeenCalledWith(expect.objectContaining({ dataISO: '2026-10-23', valor: 250 }));
    });

    it('"Digitar manualmente" volta ao formulário com o valor lido já preenchido', async () => {
      await abrirAppOffline();
      await escanearPrint();

      await fireEvent.press(screen.getByRole('button', { name: 'Digitar manualmente' }));

      expect(modalAberto().getByText('Lançar ganho')).toBeOnTheScreen();
      expect(screen.getByLabelText('Valor do ganho')).toHaveDisplayValue('250,00');
      expect(screen.getByRole('button', { name: 'Salvar R$ 250,00' })).toBeEnabled();
    });

    it('print sem valor reconhecível cai no formulário manual vazio', async () => {
      jest.mocked(processarOCRLocal).mockResolvedValue({ textoBruto: 'sem números', valorMetaExtrado: null, percentualExtraido: null });
      await abrirAppOffline();

      await escanearPrint();

      expect(screen.queryByText('Valor encontrado')).not.toBeOnTheScreen();
      expect(modalAberto().getByText('Lançar ganho')).toBeOnTheScreen();
      expect(screen.getByLabelText('Valor do ganho')).toHaveDisplayValue('');
    });
  });
});
