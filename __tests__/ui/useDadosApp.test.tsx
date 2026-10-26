// Testes de src/hooks/useDadosApp.ts: dados do aparelho, regras de negócio e estado dos modais.
//
// - storage é um "banco" em memória controlado por teste (o carregarGanhosLocais devolve o próprio
//   objeto, como o cache do storage real);
// - sync é um observável simples (observarEstadoSync emite na hora, como o real);
// - OCR e expo-image-picker são mocks;
// - o relógio é fixo em quarta-feira, 21/10/2026 10:00 (semana de 19 a 25/10; mês com 5 semanas).

import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { act, renderHook } from '@testing-library/react-native';
import { useDadosApp } from '../../src/hooks/useDadosApp';
import { processarOCRLocal } from '../../src/services/ocr';
import * as storage from '../../src/services/storage';
import { observarEstadoSync, obterEstadoSync, sincronizarTudo } from '../../src/services/sync';
import type { DividaItem, EstadoSync, RegistroGanhoLocal, ResultadoOCR, ResultadoServico } from '../../src/types';
import { calcularAmortizacaoPorFases } from '../../src/utils/amortizacao';
import { gerarEstruturaSemana, gerarSemanasDoMes, somarGanhosDoMes } from '../../src/utils/datas';
import { montarHistoricoGanhos } from '../../src/utils/historico';

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

jest.mock('../../src/services/sync', () => ({
  observarEstadoSync: jest.fn(),
  obterEstadoSync: jest.fn(),
  sincronizarTudo: jest.fn(),
  definirUsuarioSync: jest.fn(),
  agendarSync: jest.fn(),
}));

jest.mock('../../src/services/ocr', () => ({ processarOCRLocal: jest.fn() }));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const storageMock = jest.mocked(storage);
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
const obterEstadoSyncMock = jest.mocked(obterEstadoSync);
const observarEstadoSyncMock = jest.mocked(observarEstadoSync);
const sincronizarTudoMock = jest.mocked(sincronizarTudo);
const processarOCRLocalMock = jest.mocked(processarOCRLocal);
const pedirPermissaoMock = jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync);
const abrirGaleriaMock = jest.mocked(ImagePicker.launchImageLibraryAsync);

// ─── Constantes e auxiliares ──────────────────────────────────────────────────

const HOJE = new Date(2026, 9, 21, 10, 0); // quarta-feira
const USUARIO_ID = 'user-123';
const IDX_SEG = 0;
const IDX_QUA = 2; // hoje
const IDX_QUI = 3;
const IDX_SEMANA_ATUAL = 3; // "Sem 4 (19–25 out)"
const SEM_CONTA: EstadoSync = { status: 'sem_conta', mensagem: 'Entre para sincronizar na nuvem.' };
const SYNC_OK: ResultadoServico<{ enviados: number; recebidos: number }> = {
  success: true,
  data: { enviados: 0, recebidos: 0 },
};
const URI_PRINT = 'file:///cache/print-do-app.png';
const TITULO_GANHO = '✅ Ganho Registrado!';

function adiado<T>() {
  let resolver!: (valor: T) => void;
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<T>((resolve, reject) => {
    resolver = resolve;
    rejeitar = reject;
  });
  return { promessa, resolver, rejeitar };
}

function ganho(dataISO: string, valor: number, extra: Partial<RegistroGanhoLocal> = {}): RegistroGanhoLocal {
  return {
    dataISO,
    valor,
    metaDoDia: 100,
    percentual: Math.min(100, valor),
    descricao: 'Ganho',
    atualizadoEm: '2026-10-20T12:00:00.000Z',
    ...extra,
  };
}

const mapaDe = (...registros: RegistroGanhoLocal[]) =>
  Object.fromEntries(registros.map((r) => [r.dataISO, r])) as Record<string, RegistroGanhoLocal>;

function divida(id: string, descricao: string, valor: number, tipo: DividaItem['tipo']): DividaItem {
  return { id, descricao, valor, tipo, dataLancamento: '2026-10-01' };
}

/** Semana esperada: estrutura real + cascata real, com os ganhos do mapa. */
function semanaEsperada(ganhos: Record<string, RegistroGanhoLocal>, meta = 100, hoje = HOJE) {
  const estrutura = gerarEstruturaSemana(hoje).map((d) =>
    ganhos[d.dataISO] ? { ...d, valor: ganhos[d.dataISO].valor, temRegistro: true } : d
  );
  return calcularAmortizacaoPorFases(estrutura, meta);
}

const permissao = (granted: boolean) =>
  ({ granted, status: granted ? 'granted' : 'denied', expires: 'never', canAskAgain: true }) as unknown as Awaited<
    ReturnType<typeof ImagePicker.requestMediaLibraryPermissionsAsync>
  >;

const resultadoGaleria = (canceled: boolean) =>
  (canceled
    ? { canceled: true, assets: null }
    : { canceled: false, assets: [{ uri: URI_PRINT, width: 1080, height: 2340 }] }) as unknown as Awaited<
    ReturnType<typeof ImagePicker.launchImageLibraryAsync>
  >;

const resultadoOCR = (valor: number | null): ResultadoOCR => ({
  textoBruto: valor === null ? 'sem números' : `Ganhos R$ ${valor}`,
  valorMetaExtrado: valor,
  percentualExtraido: null,
});

// ─── "Banco" do aparelho e observável de sync ─────────────────────────────────

let bancoGanhos: Record<string, RegistroGanhoLocal>;
let bancoMeta: number | null;
let bancoDividas: DividaItem[];
let estadoSyncAtual: EstadoSync;
let observadoresSync: Array<(e: EstadoSync) => void>;
let alerta: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers({ now: HOJE, advanceTimers: true });
  alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  bancoGanhos = {};
  bancoMeta = null;
  bancoDividas = [];
  // Não use Object.values(storageMock): o namespace importado também tem a chave "default"
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

  processarOCRLocalMock.mockReset().mockResolvedValue(resultadoOCR(1234.5));
  pedirPermissaoMock.mockReset().mockResolvedValue(permissao(true));
  abrirGaleriaMock.mockReset().mockResolvedValue(resultadoGaleria(false));
});

afterEach(() => {
  alerta.mockRestore();
  jest.useRealTimers();
});

async function renderizarHook(usuarioId: string | null = USUARIO_ID) {
  return renderHook((id: string | null) => useDadosApp(id), { initialProps: usuarioId });
}

/** Executa uma ação do hook dentro de act e espera a promessa dela (se houver). */
async function executar(acao: () => unknown) {
  await act(async () => {
    await acao();
  });
}

async function emitirSync(estado: EstadoSync) {
  await act(async () => {
    estadoSyncAtual = estado;
    observadoresSync.forEach((cb) => cb(estado));
  });
}

/** Abre o lançamento para o dia, digita o valor e salva no modo pedido. */
async function lancarGanho(
  result: { current: ReturnType<typeof useDadosApp> },
  idx: number,
  valor: string,
  modo: 'somar' | 'substituir'
) {
  await executar(() => result.current.abrirModalParaDia(idx));
  await executar(() => result.current.modalLancarGanho.onAlterarValor(valor));
  await executar(() => result.current.modalLancarGanho.onSalvar(modo));
}

// ─── Carga inicial ────────────────────────────────────────────────────────────

describe('carga inicial', () => {
  it('antes de o aparelho responder, mostra a semana atual vazia com a meta padrão', async () => {
    const meta = adiado<number>();
    storageMock.carregarMetaBaseLocal.mockImplementationOnce(() => meta.promessa);

    const { result } = await renderizarHook();

    expect(result.current.diasSemana).toEqual(semanaEsperada({}));
    expect(result.current.diasSemana.map((d) => d.dataISO)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(result.current.diasSemana.findIndex((d) => d.isHoje)).toBe(IDX_QUA);
    expect(result.current.metaDiariaBase).toBe(100);
    expect(result.current.dividas).toEqual([]);
    expect(result.current.historico).toEqual([]);
    expect(result.current.totalSemana).toBe(0);
    expect(result.current.totalCobertoSemana).toBe(0);
    expect(result.current.diasAmortizadosCompletos).toBe(0);
    expect(result.current.totalMes).toBe(0);
    expect(result.current.semanasMes).toEqual(gerarSemanasDoMes(HOJE, {}));
    expect(result.current.semanaMesSelecionadaIdx).toBe(IDX_SEMANA_ATUAL);
    expect(result.current.diaSelecionadoIdx).toBe(IDX_QUA);
    expect(result.current.atualizando).toBe(false);
    expect(result.current.estadoSync).toBe(SEM_CONTA);
    expect(result.current.modalMetaBase.valor).toBe('100');
    expect(result.current.modalDivida.visivel).toBe(false);
    expect(result.current.modalMetaBase.visivel).toBe(false);
    expect(result.current.modalEscolhaFAB.visivel).toBe(false);
    expect(result.current.modalLancarGanho.visivel).toBe(false);

    await act(async () => meta.resolver(100));
  });

  it('lê meta base, dívidas e ganhos do aparelho e aplica a cascata com a meta salva', async () => {
    bancoMeta = 120;
    bancoDividas = [divida('m1', 'Seguro', 1500, 'mensal')];
    bancoGanhos = mapaDe(ganho('2026-10-19', 250), ganho('2026-10-22', 30));

    const { result } = await renderizarHook();

    expect(storageMock.carregarMetaBaseLocal).toHaveBeenCalledWith(100);
    expect(storageMock.carregarDividasLocais).toHaveBeenCalledTimes(1);
    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(1);
    expect(result.current.metaDiariaBase).toBe(120);
    expect(result.current.modalMetaBase.valor).toBe('120');
    expect(result.current.dividas).toEqual(bancoDividas);
    expect(result.current.diasSemana).toEqual(semanaEsperada(bancoGanhos, 120));
    // Seg 250 com meta 120: Seg 100%, Ter 100% (adiantada), Qua 8% (sobra 10); Qui 30 próprio = 25%
    expect(result.current.diasSemana.map((d) => d.percentual)).toEqual([100, 100, 8, 25, 0, 0, 0]);
    expect(result.current.diasSemana[1].detalheAmortizacao).toBe('100% ✓ (Amortizado por Seg)');
    expect(result.current.totalSemana).toBe(280);
    expect(result.current.totalCobertoSemana).toBe(280);
    expect(result.current.diasAmortizadosCompletos).toBe(2);
  });

  it('semanas do mês somam as semanas inteiras e o total do mês só os dias do mês', async () => {
    bancoGanhos = mapaDe(
      ganho('2026-09-30', 40), // semana 1, mas é setembro
      ganho('2026-10-02', 60),
      ganho('2026-10-21', 150),
      ganho('2026-11-01', 70) // semana 5, mas é novembro
    );

    const { result } = await renderizarHook();

    expect(result.current.semanasMes).toEqual(gerarSemanasDoMes(HOJE, bancoGanhos));
    expect(result.current.semanasMes.map((s) => s.totalGanhos)).toEqual([100, 0, 0, 150, 70]);
    expect(result.current.totalMes).toBe(somarGanhosDoMes(HOJE, bancoGanhos));
    expect(result.current.totalMes).toBe(210);
  });

  it(`histórico do mais recente para o mais antigo, limitado a 30 registros`, async () => {
    const registros = Array.from({ length: 35 }, (_, i) => {
      const data = new Date(2026, 8, 15 + i); // 15/09 a 19/10
      const iso = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
      return ganho(iso, 50 + i, { descricao: undefined });
    });
    bancoGanhos = mapaDe(...registros);

    const { result } = await renderizarHook();

    expect(result.current.historico).toEqual(montarHistoricoGanhos(bancoGanhos));
    expect(result.current.historico).toHaveLength(30);
    expect(result.current.historico[0].dataISO).toBe('2026-10-19');
    expect(result.current.historico[0].descricao).toBe('Ganho Seg');
    expect(result.current.historico[29].dataISO).toBe('2026-09-20');
  });

  it('copia o mapa de ganhos (não compartilha o objeto de cache do storage)', async () => {
    bancoGanhos = mapaDe(ganho('2026-10-19', 100));
    const { result, rerender } = await renderizarHook();

    // O storage real muta o próprio cache a cada gravação
    bancoGanhos['2026-10-20'] = ganho('2026-10-20', 999);
    await rerender(USUARIO_ID);

    expect(result.current.historico.map((r) => r.dataISO)).toEqual(['2026-10-19']);
    expect(result.current.totalSemana).toBe(100);
  });

  it('desmontar antes de terminar a carga não gera erro', async () => {
    const meta = adiado<number>();
    storageMock.carregarMetaBaseLocal.mockImplementationOnce(() => meta.promessa);
    const erroConsole = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = await renderizarHook();
    await unmount();
    await act(async () => meta.resolver(150));

    expect(erroConsole).not.toHaveBeenCalled();
    erroConsole.mockRestore();
  });
});

// ─── Lançamento de ganho ──────────────────────────────────────────────────────

describe('lançamento de ganho', () => {
  it('abrirModalParaDia abre o formulário limpo para o dia pedido', async () => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirModalParaDia(IDX_SEG));
    await executar(() => result.current.modalLancarGanho.onAlterarValor('80'));
    await executar(() => result.current.modalLancarGanho.onFechar());
    expect(result.current.modalLancarGanho.visivel).toBe(false);

    await executar(() => result.current.abrirModalParaDia(IDX_QUI));

    expect(result.current.modalLancarGanho).toMatchObject({
      visivel: true,
      diaLancamentoIdx: IDX_QUI,
      valorDigitado: '',
      salvando: false,
      analisandoOCR: false,
      ocrConfirmacaoPronta: false,
    });
    expect(result.current.modalLancarGanho.diasSemana).toBe(result.current.diasSemana);
  });

  it('trocar o dia no formulário limpa o valor digitado', async () => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirModalParaDia(IDX_QUA));
    await executar(() => result.current.modalLancarGanho.onAlterarValor('150'));
    expect(result.current.modalLancarGanho.valorDigitado).toBe('150');

    await executar(() => result.current.modalLancarGanho.onSelecionarDia(5));

    expect(result.current.modalLancarGanho.diaLancamentoIdx).toBe(5);
    expect(result.current.modalLancarGanho.valorDigitado).toBe('');
  });

  it('somar em um dia sem ganho grava o registro completo, fecha o modal e avisa o excedente', async () => {
    const { result } = await renderizarHook();

    await lancarGanho(result, IDX_QUA, '150', 'somar');

    expect(storageMock.salvarGanhoLocalmente).toHaveBeenCalledTimes(1);
    const [registro] = storageMock.salvarGanhoLocalmente.mock.calls[0];
    expect(registro).toEqual({
      dataISO: '2026-10-21',
      valor: 150,
      metaDoDia: 100,
      percentual: 100,
      descricao: 'Ganho Qua',
      atualizadoEm: expect.any(String),
    });
    expect(Date.parse(registro.atualizadoEm) - HOJE.getTime()).toBeGreaterThanOrEqual(0);
    expect(Date.parse(registro.atualizadoEm) - HOJE.getTime()).toBeLessThan(60_000);
    // relê o aparelho depois de gravar
    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(2);
    expect(result.current.modalLancarGanho.visivel).toBe(false);
    expect(result.current.modalLancarGanho.salvando).toBe(false);
    expect(result.current.diaSelecionadoIdx).toBe(IDX_QUA);
    expect(result.current.diasSemana[IDX_QUA]).toMatchObject({ valor: 150, percentual: 100, temRegistro: true });
    expect(result.current.diasSemana[IDX_QUI]).toMatchObject({ percentual: 50, detalheAmortizacao: '50% (Amortizado por Qua)' });
    expect(result.current.totalSemana).toBe(150);
    expect(result.current.historico[0]).toMatchObject({ dataISO: '2026-10-21', valor: 150 });
    expect(alerta).toHaveBeenCalledWith(
      TITULO_GANHO,
      'Ganho de Qua atualizado para R$ 150.00.\n\n⚡ Dias adiantados pelo excedente:\nQui (50%)!'
    );
  });

  it('sem excedente, o aviso só confirma o valor', async () => {
    const { result } = await renderizarHook();

    await lancarGanho(result, IDX_QUA, '100', 'somar');

    expect(alerta).toHaveBeenCalledWith(TITULO_GANHO, 'Ganho de Qua atualizado para R$ 100.00.');
  });

  it('somar acumula com o ganho já registrado no dia', async () => {
    bancoGanhos = mapaDe(ganho('2026-10-21', 80));
    const { result } = await renderizarHook();

    await lancarGanho(result, IDX_QUA, '50', 'somar');

    expect(storageMock.salvarGanhoLocalmente.mock.calls[0][0]).toMatchObject({ valor: 130, percentual: 100 });
    expect(result.current.diasSemana[IDX_QUA].valor).toBe(130);
    expect(alerta).toHaveBeenCalledWith(
      TITULO_GANHO,
      'Ganho de Qua atualizado para R$ 130.00.\n\n⚡ Dias adiantados pelo excedente:\nQui (30%)!'
    );
  });

  it('substituir troca o ganho já registrado no dia', async () => {
    bancoGanhos = mapaDe(ganho('2026-10-21', 80));
    const { result } = await renderizarHook();

    await lancarGanho(result, IDX_QUA, '30', 'substituir');

    expect(storageMock.salvarGanhoLocalmente.mock.calls[0][0]).toMatchObject({ valor: 30, percentual: 30 });
    expect(result.current.diasSemana[IDX_QUA].valor).toBe(30);
    expect(alerta).toHaveBeenCalledWith(TITULO_GANHO, 'Ganho de Qua atualizado para R$ 30.00.');
  });

  it('substituir sem valor zera o dia (é a forma de apagar um ganho)', async () => {
    bancoGanhos = mapaDe(ganho('2026-10-21', 80));
    const { result } = await renderizarHook();

    await lancarGanho(result, IDX_QUA, '', 'substituir');

    expect(storageMock.salvarGanhoLocalmente.mock.calls[0][0]).toMatchObject({ valor: 0, percentual: 0 });
    expect(alerta).toHaveBeenCalledWith(TITULO_GANHO, 'Ganho de Qua atualizado para R$ 0.00.');
  });

  it.each(['', '0', 'abc', '-10'])('somar com %j não grava e pede um valor válido', async (valor) => {
    const { result } = await renderizarHook();

    await lancarGanho(result, IDX_QUA, valor, 'somar');

    expect(alerta).toHaveBeenCalledWith('Valor inválido', 'Digite o valor do ganho a adicionar.');
    expect(storageMock.salvarGanhoLocalmente).not.toHaveBeenCalled();
    expect(result.current.modalLancarGanho.visivel).toBe(true);
    expect(result.current.modalLancarGanho.salvando).toBe(false);
  });

  it('entende o valor digitado no formato brasileiro', async () => {
    const { result } = await renderizarHook();

    await lancarGanho(result, IDX_QUA, '1.250,50', 'somar');

    expect(storageMock.salvarGanhoLocalmente.mock.calls[0][0].valor).toBe(1250.5);
  });

  it('recalcula a cascata da semana inteira e lista os dias adiantados pelo lançamento', async () => {
    bancoGanhos = mapaDe(ganho('2026-10-20', 30)); // Ter parcial (30%)
    const { result } = await renderizarHook();
    expect(result.current.diasSemana[1].detalheAmortizacao).toBe('30% (Faltam R$ 70)');

    await lancarGanho(result, IDX_SEG, '250', 'somar');

    // Seg 250: sobra 150 → Ter (30 + 150) completa e sobra 80 → Qua 80%
    expect(result.current.diasSemana.map((d) => d.percentual)).toEqual([100, 100, 80, 0, 0, 0, 0]);
    expect(result.current.diasAmortizadosCompletos).toBe(2);
    expect(alerta).toHaveBeenCalledWith(
      TITULO_GANHO,
      'Ganho de Seg atualizado para R$ 250.00.\n\n⚡ Dias adiantados pelo excedente:\nTer (100%), Qua (80%)!'
    );
  });

  it('o aviso lista só os dias "Amortizado por <dia lançado>"', async () => {
    // Seg 300 já cobre Ter e Qua (por Seg); Sáb tem ganho próprio que bate a meta
    bancoGanhos = mapaDe(ganho('2026-10-19', 300), ganho('2026-10-24', 100));
    const { result } = await renderizarHook();

    await lancarGanho(result, IDX_QUI, '250', 'somar');

    // Qui sobra 150 → Sex 100% (por Qui) e sobra 50 → Sáb atinge sozinho e vira a origem → Dom 50% (por Sáb)
    expect(result.current.diasSemana.map((d) => d.detalheAmortizacao)).toEqual([
      '100% ✓',
      '100% ✓ (Amortizado por Seg)',
      '100% ✓ (Amortizado por Seg)',
      '100% ✓',
      '100% ✓ (Amortizado por Qui)',
      '100% ✓',
      '50% (Amortizado por Sáb)',
    ]);
    expect(alerta).toHaveBeenCalledWith(
      TITULO_GANHO,
      'Ganho de Qui atualizado para R$ 250.00.\n\n⚡ Dias adiantados pelo excedente:\nSex (100%)!'
    );
  });

  it('atualiza a tela na hora (otimista) e só fecha o modal depois de gravar', async () => {
    const gravacao = adiado<void>();
    storageMock.salvarGanhoLocalmente.mockImplementationOnce(async (registro) => {
      await gravacao.promessa;
      bancoGanhos[registro.dataISO] = registro;
    });
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirModalParaDia(IDX_QUA));
    await executar(() => result.current.modalLancarGanho.onAlterarValor('150'));

    let salvamento!: Promise<void>;
    await act(async () => {
      salvamento = result.current.modalLancarGanho.onSalvar('somar') as unknown as Promise<void>;
    });

    expect(result.current.modalLancarGanho.salvando).toBe(true);
    expect(result.current.modalLancarGanho.visivel).toBe(true);
    expect(result.current.diasSemana[IDX_QUA].valor).toBe(150);
    expect(result.current.diaSelecionadoIdx).toBe(IDX_QUA);
    expect(result.current.historico[0]).toMatchObject({ dataISO: '2026-10-21', valor: 150 });
    expect(alerta).not.toHaveBeenCalled();

    await act(async () => {
      gravacao.resolver();
      await salvamento;
    });

    expect(result.current.modalLancarGanho.salvando).toBe(false);
    expect(result.current.modalLancarGanho.visivel).toBe(false);
    expect(alerta).toHaveBeenCalledWith(TITULO_GANHO, expect.stringContaining('R$ 150.00'));
  });

  it.each([
    [new Error('Disco cheio'), 'Disco cheio'],
    [{}, 'Falha ao registrar ganho.'],
    [null, 'Falha ao registrar ganho.'],
  ])('falha ao gravar (%p): avisa "%s", mantém o modal aberto e libera o botão', async (erro, mensagem) => {
    storageMock.salvarGanhoLocalmente.mockRejectedValueOnce(erro);
    const { result } = await renderizarHook();

    await lancarGanho(result, IDX_QUA, '150', 'somar');

    expect(alerta).toHaveBeenCalledWith('Erro ao Salvar', mensagem);
    expect(alerta).not.toHaveBeenCalledWith(TITULO_GANHO, expect.anything());
    expect(result.current.modalLancarGanho.visivel).toBe(true);
    expect(result.current.modalLancarGanho.salvando).toBe(false);
  });

  it('onFechar fecha o lançamento sem gravar', async () => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirModalParaDia(IDX_QUA));

    await executar(() => result.current.modalLancarGanho.onFechar());

    expect(result.current.modalLancarGanho.visivel).toBe(false);
    expect(storageMock.salvarGanhoLocalmente).not.toHaveBeenCalled();
  });

  it('setDiaSelecionadoIdx troca o dia em destaque no dashboard', async () => {
    const { result } = await renderizarHook();

    await executar(() => result.current.setDiaSelecionadoIdx(5));

    expect(result.current.diaSelecionadoIdx).toBe(5);
  });

  it(
    'ao abrir o app, o dia selecionado é hoje (quarta, índice 2) e o FAB lança para hoje',
    async () => {
      // Regressão: começava na segunda-feira (índice 0) desde o commit a3764d3.
      const { result } = await renderizarHook();

      expect(result.current.diaSelecionadoIdx).toBe(IDX_QUA);

      await executar(() => result.current.abrirEscolhaFAB());
      await executar(() => result.current.modalEscolhaFAB.onDigitarManual());
      expect(result.current.modalLancarGanho.diaLancamentoIdx).toBe(IDX_QUA);
    }
  );
});

// ─── Meta base ────────────────────────────────────────────────────────────────

describe('meta diária base', () => {
  it('abrirMetaBase abre o modal com a meta atual (descartando o que foi digitado antes)', async () => {
    bancoMeta = 120;
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirMetaBase());
    await executar(() => result.current.modalMetaBase.onAlterarValor('999'));
    await executar(() => result.current.modalMetaBase.onFechar());

    await executar(() => result.current.abrirMetaBase());

    expect(result.current.modalMetaBase.visivel).toBe(true);
    expect(result.current.modalMetaBase.valor).toBe('120');
  });

  it('salvar uma meta válida grava, recalcula a semana, fecha o modal e avisa', async () => {
    bancoGanhos = mapaDe(ganho('2026-10-19', 250));
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirMetaBase());
    await executar(() => result.current.modalMetaBase.onAlterarValor('150'));

    await executar(() => result.current.modalMetaBase.onSalvar());

    expect(storageMock.salvarMetaBaseLocal).toHaveBeenCalledWith(150);
    expect(result.current.metaDiariaBase).toBe(150);
    expect(result.current.diasSemana).toEqual(semanaEsperada(bancoGanhos, 150));
    // Seg 250 com meta 150: Seg 100% e Ter 67% (sobra 100)
    expect(result.current.diasSemana.map((d) => d.percentual)).toEqual([100, 67, 0, 0, 0, 0, 0]);
    expect(result.current.diasAmortizadosCompletos).toBe(1);
    expect(result.current.modalMetaBase.visivel).toBe(false);
    expect(alerta).toHaveBeenCalledWith('Meta Base Atualizada!', 'Sua meta diária base agora é de R$ 150.00.');
  });

  it('entende a meta no formato brasileiro', async () => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirMetaBase());
    await executar(() => result.current.modalMetaBase.onAlterarValor('1.250,50'));

    await executar(() => result.current.modalMetaBase.onSalvar());

    expect(storageMock.salvarMetaBaseLocal).toHaveBeenCalledWith(1250.5);
    expect(alerta).toHaveBeenCalledWith('Meta Base Atualizada!', 'Sua meta diária base agora é de R$ 1250.50.');
  });

  it.each(['0', '', 'abc', '-50'])('meta %j é recusada sem gravar', async (valor) => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirMetaBase());
    await executar(() => result.current.modalMetaBase.onAlterarValor(valor));

    await executar(() => result.current.modalMetaBase.onSalvar());

    expect(alerta).toHaveBeenCalledWith('Valor Inválido', 'A meta diária precisa ser maior que zero.');
    expect(storageMock.salvarMetaBaseLocal).not.toHaveBeenCalled();
    expect(result.current.metaDiariaBase).toBe(100);
    expect(result.current.modalMetaBase.visivel).toBe(true);
  });
});

// ─── Dívidas ──────────────────────────────────────────────────────────────────

describe('dívidas', () => {
  it.each<DividaItem['tipo']>(['diaria', 'mensal', 'imprevista'])(
    'abrirNovaDivida("%s") abre o formulário limpo, com frequência anual',
    async (tipo) => {
      const { result } = await renderizarHook();

      await executar(() => result.current.abrirNovaDivida(tipo));

      expect(result.current.modalDivida).toMatchObject({
        visivel: true,
        tipo,
        frequencia: 'anual',
        descricao: '',
        valor: '',
      });
    }
  );

  it('os campos acompanham o que é digitado e reabrir descarta tudo', async () => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirNovaDivida('imprevista'));
    await executar(() => result.current.modalDivida.onAlterarDescricao('Pneu'));
    await executar(() => result.current.modalDivida.onAlterarValor('690'));
    await executar(() => result.current.modalDivida.onAlterarFrequencia('mensal'));
    expect(result.current.modalDivida).toMatchObject({ descricao: 'Pneu', valor: '690', frequencia: 'mensal' });

    await executar(() => result.current.modalDivida.onFechar());
    expect(result.current.modalDivida.visivel).toBe(false);
    await executar(() => result.current.abrirNovaDivida('diaria'));

    expect(result.current.modalDivida).toMatchObject({ tipo: 'diaria', descricao: '', valor: '', frequencia: 'anual' });
  });

  it('salvar uma dívida diária grava os dados normalizados, atualiza a lista e avisa', async () => {
    bancoDividas = [divida('antiga', 'Seguro', 1500, 'mensal')];
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirNovaDivida('diaria'));
    await executar(() => result.current.modalDivida.onAlterarDescricao('  Combustível  '));
    await executar(() => result.current.modalDivida.onAlterarValor('45,50'));

    await executar(() => result.current.modalDivida.onSalvar());

    expect(storageMock.salvarDividaLocal).toHaveBeenCalledTimes(1);
    expect(storageMock.salvarDividaLocal).toHaveBeenCalledWith({
      id: expect.stringMatching(/^\d+$/),
      descricao: 'Combustível',
      valor: 45.5,
      tipo: 'diaria',
      frequenciaImprevisto: undefined,
      dataLancamento: '2026-10-21',
    });
    expect(result.current.dividas.map((d) => d.descricao)).toEqual(['Seguro', 'Combustível']);
    expect(result.current.modalDivida.visivel).toBe(false);
    expect(alerta).toHaveBeenCalledWith(
      'Dívida Registrada!',
      'A dívida anual projetada foi recalculada automaticamente.'
    );
  });

  it('dívida imprevista grava a frequência escolhida', async () => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirNovaDivida('imprevista'));
    await executar(() => result.current.modalDivida.onAlterarDescricao('Multa'));
    await executar(() => result.current.modalDivida.onAlterarValor('120'));
    await executar(() => result.current.modalDivida.onAlterarFrequencia('mensal'));

    await executar(() => result.current.modalDivida.onSalvar());

    expect(storageMock.salvarDividaLocal.mock.calls[0][0]).toMatchObject({
      tipo: 'imprevista',
      frequenciaImprevisto: 'mensal',
      valor: 120,
    });
  });

  it('dívidas diárias e mensais não guardam frequência, mesmo se ela foi alterada', async () => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirNovaDivida('mensal'));
    await executar(() => result.current.modalDivida.onAlterarFrequencia('diaria'));
    await executar(() => result.current.modalDivida.onAlterarDescricao('Aluguel'));
    await executar(() => result.current.modalDivida.onAlterarValor('900'));

    await executar(() => result.current.modalDivida.onSalvar());

    expect(storageMock.salvarDividaLocal.mock.calls[0][0].frequenciaImprevisto).toBeUndefined();
  });

  it.each(['', '0', 'abc', '-5'])('valor %j é recusado (antes de olhar a descrição)', async (valor) => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirNovaDivida('diaria'));
    await executar(() => result.current.modalDivida.onAlterarValor(valor));

    await executar(() => result.current.modalDivida.onSalvar());

    expect(alerta).toHaveBeenCalledTimes(1);
    expect(alerta).toHaveBeenCalledWith('Valor inválido', 'Informe um valor de dívida maior que zero.');
    expect(storageMock.salvarDividaLocal).not.toHaveBeenCalled();
    expect(result.current.modalDivida.visivel).toBe(true);
  });

  it.each(['', '   '])('descrição %j é recusada', async (descricao) => {
    const { result } = await renderizarHook();
    await executar(() => result.current.abrirNovaDivida('diaria'));
    await executar(() => result.current.modalDivida.onAlterarValor('20'));
    await executar(() => result.current.modalDivida.onAlterarDescricao(descricao));

    await executar(() => result.current.modalDivida.onSalvar());

    expect(alerta).toHaveBeenCalledWith(
      'Descrição necessária',
      'Informe o nome ou categoria da dívida (ex: Combustível, Parcela).'
    );
    expect(storageMock.salvarDividaLocal).not.toHaveBeenCalled();
  });

  it('excluirDivida pede confirmação antes de remover', async () => {
    bancoDividas = [divida('m1', 'Seguro', 1500, 'mensal')];
    const { result } = await renderizarHook();

    await executar(() => result.current.excluirDivida('m1', 'Seguro'));

    expect(alerta).toHaveBeenCalledWith('Remover Dívida', 'Deseja excluir "Seguro" da sua carteira?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: expect.any(Function) },
    ]);
    expect(storageMock.removerDividaLocal).not.toHaveBeenCalled();
    expect(result.current.dividas).toHaveLength(1);
  });

  it('confirmar a exclusão remove do aparelho e atualiza a lista', async () => {
    bancoDividas = [divida('d1', 'Combustível', 20, 'diaria'), divida('m1', 'Seguro', 1500, 'mensal')];
    const { result } = await renderizarHook();
    await executar(() => result.current.excluirDivida('m1', 'Seguro'));
    const botoes = alerta.mock.calls[0][2] as Array<{ text: string; onPress?: () => Promise<void> }>;

    await executar(() => botoes.find((b) => b.text === 'Excluir')?.onPress?.());

    expect(storageMock.removerDividaLocal).toHaveBeenCalledWith('m1');
    expect(result.current.dividas.map((d) => d.id)).toEqual(['d1']);
  });

  it('"Cancelar" na confirmação não remove nada', async () => {
    bancoDividas = [divida('m1', 'Seguro', 1500, 'mensal')];
    const { result } = await renderizarHook();
    await executar(() => result.current.excluirDivida('m1', 'Seguro'));
    const botoes = alerta.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;

    await executar(() => botoes.find((b) => b.text === 'Cancelar')?.onPress?.());

    expect(storageMock.removerDividaLocal).not.toHaveBeenCalled();
    expect(result.current.dividas).toHaveLength(1);
  });
});

// ─── Atualização (↻, pull-to-refresh, "Sincronizar Dados") ────────────────────

describe('onRefresh', () => {
  it('logado: marca "atualizando", sincroniza e só então relê o aparelho', async () => {
    const sincronizacao = adiado<ResultadoServico<{ enviados: number; recebidos: number }>>();
    sincronizarTudoMock.mockReturnValueOnce(sincronizacao.promessa);
    const { result } = await renderizarHook(USUARIO_ID);

    let atualizacao!: Promise<void>;
    await act(async () => {
      atualizacao = result.current.onRefresh();
    });

    expect(result.current.atualizando).toBe(true);
    expect(sincronizarTudoMock).toHaveBeenCalledWith(USUARIO_ID);
    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(1); // só a carga inicial

    bancoGanhos = mapaDe(ganho('2026-10-22', 180)); // chegou da nuvem
    await act(async () => {
      sincronizacao.resolver(SYNC_OK);
      await atualizacao;
    });

    expect(result.current.atualizando).toBe(false);
    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(2);
    expect(result.current.diasSemana[IDX_QUI].valor).toBe(180);
  });

  it('sem conta: não sincroniza, só relê o aparelho', async () => {
    const { result } = await renderizarHook(null);
    bancoMeta = 90;

    await executar(() => result.current.onRefresh());

    expect(sincronizarTudoMock).not.toHaveBeenCalled();
    expect(storageMock.carregarMetaBaseLocal).toHaveBeenCalledTimes(2);
    expect(result.current.metaDiariaBase).toBe(90);
    expect(result.current.atualizando).toBe(false);
  });

  it('relê também meta e dívidas', async () => {
    const { result } = await renderizarHook();
    bancoMeta = 200;
    bancoDividas = [divida('d1', 'Combustível', 20, 'diaria')];

    await executar(() => result.current.onRefresh());

    expect(result.current.metaDiariaBase).toBe(200);
    expect(result.current.dividas).toEqual(bancoDividas);
  });

  it('volta a seleção da carteira para a semana atual', async () => {
    const { result } = await renderizarHook();
    await executar(() => result.current.setSemanaMesSelecionadaIdx(0));
    expect(result.current.semanaMesSelecionadaIdx).toBe(0);

    await executar(() => result.current.onRefresh());

    expect(result.current.semanaMesSelecionadaIdx).toBe(IDX_SEMANA_ATUAL);
  });

  it('se a sincronização lançar, "atualizando" volta a false e o erro é propagado', async () => {
    sincronizarTudoMock.mockRejectedValueOnce(new Error('falha inesperada'));
    const { result } = await renderizarHook();

    await act(async () => {
      await expect(result.current.onRefresh()).rejects.toThrow('falha inesperada');
    });

    expect(result.current.atualizando).toBe(false);
  });

  it('quando o dia vira, a semana e a semana atual da carteira avançam', async () => {
    const { result } = await renderizarHook();

    jest.setSystemTime(new Date(2026, 9, 26, 9, 0)); // segunda-feira seguinte
    await executar(() => result.current.onRefresh());

    expect(result.current.diasSemana[0].dataISO).toBe('2026-10-26');
    expect(result.current.diasSemana[6].dataISO).toBe('2026-11-01');
    expect(result.current.diasSemana.findIndex((d) => d.isHoje)).toBe(0);
    expect(result.current.semanaMesSelecionadaIdx).toBe(4); // "Sem 5 (26 out – 1 nov)"
  });

  it('quando o mês vira, semanas e total do mês passam a ser do novo mês', async () => {
    bancoGanhos = mapaDe(ganho('2026-10-21', 150), ganho('2026-11-02', 90));
    const { result } = await renderizarHook();
    expect(result.current.totalMes).toBe(150);

    const novembro = new Date(2026, 10, 2, 9, 0);
    jest.setSystemTime(novembro);
    await executar(() => result.current.onRefresh());

    expect(result.current.semanasMes).toEqual(gerarSemanasDoMes(novembro, bancoGanhos));
    expect(result.current.totalMes).toBe(90);
  });
});

// ─── Recarga após sincronização ───────────────────────────────────────────────

describe('recarga após sincronização', () => {
  const OK_T1: EstadoSync = { status: 'ok', ultimaSync: '2026-10-21T13:01:00.000Z', mensagem: 'Sincronizado com a nuvem.' };

  it('expõe o estado da sincronização em estadoSync', async () => {
    const { result } = await renderizarHook();

    await emitirSync({ status: 'sincronizando', mensagem: 'Sincronizando...' });

    expect(result.current.estadoSync).toEqual({ status: 'sincronizando', mensagem: 'Sincronizando...' });
  });

  it('uma sincronização concluída (nova ultimaSync) relê o aparelho', async () => {
    const { result } = await renderizarHook();
    bancoGanhos = mapaDe(ganho('2026-10-20', 110)); // trazido da nuvem pelo sync

    await emitirSync(OK_T1);

    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(2);
    expect(result.current.diasSemana[1].valor).toBe(110);
    expect(result.current.estadoSync).toEqual(OK_T1);
  });

  it('a mesma ultimaSync não relê de novo', async () => {
    await renderizarHook();

    await emitirSync(OK_T1);
    await emitirSync({ ...OK_T1 });

    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(2);
  });

  it('cada nova ultimaSync relê outra vez', async () => {
    await renderizarHook();

    await emitirSync(OK_T1);
    await emitirSync({ ...OK_T1, ultimaSync: '2026-10-21T13:05:00.000Z' });

    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(3);
  });

  it.each<EstadoSync>([
    { status: 'sincronizando', ultimaSync: '2026-10-21T13:01:00.000Z' },
    { status: 'erro', ultimaSync: '2026-10-21T13:01:00.000Z', mensagem: 'Falhou' },
    { status: 'offline', ultimaSync: '2026-10-21T13:01:00.000Z' },
    { status: 'sem_conta', ultimaSync: '2026-10-21T13:01:00.000Z' },
    { status: 'ok' },
  ])('não relê com o estado %j', async (estado) => {
    await renderizarHook();

    await emitirSync(estado);

    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(1);
  });

  it('um estado "ok" que já existia ao montar não provoca recarga extra', async () => {
    estadoSyncAtual = OK_T1;

    await renderizarHook();

    expect(storageMock.carregarGanhosLocais).toHaveBeenCalledTimes(1);
  });
});

// ─── Escolha do FAB e OCR ─────────────────────────────────────────────────────

describe('escolha do FAB e OCR', () => {
  beforeEach(() => {
    // Relógio parado: com advanceTimers o relógio falso anda junto com o real e, sob carga,
    // o setTimeout de 1 s da análise disparava antes da hora (testes intermitentes).
    jest.useFakeTimers({ now: HOJE, advanceTimers: false });
  });

  async function iniciarOCR(result: { current: ReturnType<typeof useDadosApp> }) {
    await executar(() => result.current.abrirEscolhaFAB());
    await executar(() => result.current.modalEscolhaFAB.onEscanearOCR());
  }

  it('abrirEscolhaFAB abre a escolha e onFechar fecha', async () => {
    const { result } = await renderizarHook();

    await executar(() => result.current.abrirEscolhaFAB());
    expect(result.current.modalEscolhaFAB.visivel).toBe(true);

    await executar(() => result.current.modalEscolhaFAB.onFechar());
    expect(result.current.modalEscolhaFAB.visivel).toBe(false);
  });

  it('"Digitar manualmente" fecha a escolha e abre o lançamento para o dia selecionado no dashboard', async () => {
    const { result } = await renderizarHook();
    await executar(() => result.current.setDiaSelecionadoIdx(4));
    await executar(() => result.current.abrirEscolhaFAB());

    await executar(() => result.current.modalEscolhaFAB.onDigitarManual());

    expect(result.current.modalEscolhaFAB.visivel).toBe(false);
    expect(result.current.modalLancarGanho).toMatchObject({ visivel: true, diaLancamentoIdx: 4, valorDigitado: '' });
  });

  it('sem permissão da galeria avisa e não abre nada', async () => {
    pedirPermissaoMock.mockResolvedValueOnce(permissao(false));
    const { result } = await renderizarHook();

    await iniciarOCR(result);

    expect(alerta).toHaveBeenCalledWith('Permissão necessária', 'É preciso permitir acesso às fotos.');
    expect(abrirGaleriaMock).not.toHaveBeenCalled();
    expect(result.current.modalEscolhaFAB.visivel).toBe(false);
    expect(result.current.modalLancarGanho.visivel).toBe(false);
  });

  it('galeria cancelada não abre o lançamento', async () => {
    abrirGaleriaMock.mockResolvedValueOnce(resultadoGaleria(true));
    const { result } = await renderizarHook();

    await iniciarOCR(result);

    expect(processarOCRLocalMock).not.toHaveBeenCalled();
    expect(result.current.modalLancarGanho.visivel).toBe(false);
  });

  it('print escolhido: analisa no aparelho, preenche o valor e mostra a confirmação após 1 s', async () => {
    const { result } = await renderizarHook();

    await iniciarOCR(result);

    expect(abrirGaleriaMock).toHaveBeenCalledWith({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8 });
    expect(processarOCRLocalMock).toHaveBeenCalledWith(URI_PRINT);
    expect(result.current.modalEscolhaFAB.visivel).toBe(false);
    expect(result.current.modalLancarGanho).toMatchObject({
      visivel: true,
      analisandoOCR: true,
      ocrConfirmacaoPronta: false,
      valorExtraidoOCR: 1234.5,
      valorDigitado: '1234.50',
    });

    await act(async () => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current.modalLancarGanho.analisandoOCR).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.modalLancarGanho.analisandoOCR).toBe(false);
    expect(result.current.modalLancarGanho.ocrConfirmacaoPronta).toBe(true);
  });

  it('OCR sem valor encontrado deixa o campo vazio e mostra R$ 0', async () => {
    processarOCRLocalMock.mockResolvedValueOnce(resultadoOCR(null));
    const { result } = await renderizarHook();

    await iniciarOCR(result);

    expect(result.current.modalLancarGanho.valorExtraidoOCR).toBe(0);
    expect(result.current.modalLancarGanho.valorDigitado).toBe('');
  });

  it('falha no OCR encerra a análise e deixa o formulário manual aberto', async () => {
    processarOCRLocalMock.mockRejectedValueOnce(new Error('Falha no reconhecimento óptico de caracteres no dispositivo.'));
    const { result } = await renderizarHook();

    await iniciarOCR(result);

    expect(result.current.modalLancarGanho).toMatchObject({
      visivel: true,
      analisandoOCR: false,
      ocrConfirmacaoPronta: false,
    });
    expect(alerta).not.toHaveBeenCalled();
  });

  it('falha ao pedir a permissão é silenciosa e não abre nada', async () => {
    pedirPermissaoMock.mockRejectedValueOnce(new Error('módulo nativo ausente'));
    const { result } = await renderizarHook();

    await iniciarOCR(result);

    expect(alerta).not.toHaveBeenCalled();
    expect(result.current.modalLancarGanho.visivel).toBe(false);
  });

  it('"Digitar Manualmente" sai da confirmação mantendo o valor lido', async () => {
    const { result } = await renderizarHook();
    await iniciarOCR(result);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await executar(() => result.current.modalLancarGanho.onDigitarManualmente());

    expect(result.current.modalLancarGanho.ocrConfirmacaoPronta).toBe(false);
    expect(result.current.modalLancarGanho.valorDigitado).toBe('1234.50');
  });

  it('confirmar o valor lido grava no dia do lançamento', async () => {
    const { result } = await renderizarHook();
    // O OCR usa o último dia de lançamento escolhido
    await executar(() => result.current.abrirModalParaDia(IDX_QUA));
    await executar(() => result.current.modalLancarGanho.onFechar());
    await iniciarOCR(result);
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await executar(() => result.current.modalLancarGanho.onSalvar('substituir'));

    expect(storageMock.salvarGanhoLocalmente.mock.calls[0][0]).toMatchObject({ dataISO: '2026-10-21', valor: 1234.5 });
    expect(alerta).toHaveBeenCalledWith(TITULO_GANHO, expect.stringMatching(/^Ganho de Qua atualizado para R\$ 1234\.50\./));
  });

  it(
    'fechar a análise do OCR e abrir o lançamento manual antes de 1 s não vira a confirmação do OCR',
    async () => {
      // Regressão: o setTimeout da análise não era cancelado e podia salvar R$ 0 por cima do dia escolhido.
      const { result } = await renderizarHook();
      await iniciarOCR(result);
      await executar(() => result.current.modalLancarGanho.onFechar()); // "voltar" do Android durante a análise
      await executar(() => result.current.abrirModalParaDia(IDX_QUI)); // "+ Inserir" no dashboard
      expect(result.current.modalLancarGanho.ocrConfirmacaoPronta).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(1000); // o timer da análise já foi cancelado ao fechar
      });

      expect(result.current.modalLancarGanho.ocrConfirmacaoPronta).toBe(false);
    }
  );
});
