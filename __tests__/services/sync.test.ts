// Testes unitários da sincronização offline-first (src/services/sync.ts).
// As operações remotas (src/services/supabase.ts) são mocks controlados por teste;
// o armazenamento local é o storage.ts real sobre o mock oficial do AsyncStorage.
// O módulo de sync guarda estado (usuário, timer, mutex), então cada teste recarrega tudo.

import type { DividaItem, EstadoSync, RegistroGanhoLocal, ResultadoServico } from '../../src/types';

jest.mock('../../src/services/supabase', () => {
  const MSG_OFFLINE = 'Sem conexão com a internet.';
  return {
    MSG_BANCO_NAO_CONFIGURADO: 'Banco não configurado: execute supabase/schema.sql no SQL Editor do Supabase.',
    MSG_OFFLINE,
    MSG_SESSAO_EXPIRADA: 'Sessão expirada. Entre novamente.',
    supabase: {},
    verificarConexao: jest.fn(),
    salvarGanhosRemotos: jest.fn(),
    buscarGanhosRemotos: jest.fn(),
    salvarDividasRemotas: jest.fn(),
    buscarDividasRemotas: jest.fn(),
    salvarMetaBaseRemota: jest.fn(),
    buscarMetaBaseRemota: jest.fn(),
    traduzirErroRemoto: jest.fn(),
    ehErroOffline: jest.fn((mensagem: string) => mensagem === MSG_OFFLINE),
  };
});

type ModuloSync = typeof import('../../src/services/sync');
type ModuloStorage = typeof import('../../src/services/storage');
type RemotoMock = jest.Mocked<typeof import('../../src/services/supabase')>;
type FuncaoRemota =
  | 'verificarConexao'
  | 'buscarGanhosRemotos'
  | 'salvarGanhosRemotos'
  | 'buscarDividasRemotas'
  | 'salvarDividasRemotas'
  | 'buscarMetaBaseRemota'
  | 'salvarMetaBaseRemota';

const T1 = '2020-01-01T10:00:00.000Z'; // mais antigo
const T2 = '2020-01-02T10:00:00.000Z'; // mais novo
const AGORA = '2026-10-26T12:00:00.000Z';
const MSG_SEM_CONTA = 'Entre para sincronizar na nuvem.';
const MSG_OFFLINE_UI = 'Sem conexão. Dados salvos no aparelho.';

let sync: ModuloSync;
let storage: ModuloStorage;
let remoto: RemotoMock;

/** Deixa todas as promessas pendentes resolverem (só funciona com timers reais). */
const esvaziarFila = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function adiado<T>() {
  let resolver!: (valor: T) => void;
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

function registrarEstados(): EstadoSync[] {
  const estados: EstadoSync[] = [];
  sync.observarEstadoSync((e) => estados.push(e));
  return estados;
}

const statusDe = (estados: EstadoSync[]) => estados.map((e) => e.status);

function ganho(dataISO: string, valor: number, atualizadoEm: string): RegistroGanhoLocal {
  return { dataISO, valor, metaDoDia: 100, percentual: Math.min(100, valor), atualizadoEm };
}

function divida(id: string, atualizadoEm: string | undefined, extra: Partial<DividaItem> = {}): DividaItem {
  return {
    id,
    descricao: `Dívida ${id}`,
    valor: 50,
    tipo: 'mensal',
    dataLancamento: '2020-01-01',
    atualizadoEm,
    ...extra,
  };
}

beforeEach(async () => {
  jest.useRealTimers();
  jest.resetModules();
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();

  remoto = require('../../src/services/supabase');
  sync = require('../../src/services/sync');
  storage = require('../../src/services/storage');

  // Nuvem online e vazia, aceitando tudo o que for enviado.
  remoto.verificarConexao.mockResolvedValue({ online: true });
  remoto.buscarGanhosRemotos.mockResolvedValue({ success: true, data: [] });
  remoto.salvarGanhosRemotos.mockImplementation(async (_userId, registros) => ({
    success: true,
    data: registros.length,
  }));
  remoto.buscarDividasRemotas.mockResolvedValue({ success: true, data: [] });
  remoto.salvarDividasRemotas.mockImplementation(async (_userId, dividas) => ({
    success: true,
    data: dividas.length,
  }));
  remoto.buscarMetaBaseRemota.mockResolvedValue({ success: true, data: null });
  remoto.salvarMetaBaseRemota.mockResolvedValue({ success: true, data: undefined });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('obterEstadoSync', () => {
  it('começa como sem_conta pedindo para entrar', () => {
    expect(sync.obterEstadoSync()).toEqual({ status: 'sem_conta', mensagem: MSG_SEM_CONTA });
  });

  it('reflete o último estado emitido', async () => {
    await sync.sincronizarTudo('u1');
    expect(sync.obterEstadoSync()).toMatchObject({ status: 'ok', mensagem: 'Sincronizado com a nuvem.' });
  });
});

describe('observarEstadoSync', () => {
  it('emite o estado atual imediatamente ao se inscrever', () => {
    const cb = jest.fn();
    sync.observarEstadoSync(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ status: 'sem_conta', mensagem: MSG_SEM_CONTA });
  });

  it('notifica as mudanças seguintes até a observação ser cancelada', async () => {
    const cb = jest.fn();
    const cancelar = sync.observarEstadoSync(cb);
    await sync.sincronizarTudo('u1');
    expect(cb.mock.calls.map(([e]) => e.status)).toEqual(['sem_conta', 'sincronizando', 'ok']);

    cancelar();
    cb.mockClear();
    await sync.sincronizarTudo('u1');
    expect(cb).not.toHaveBeenCalled();
  });

  it('um observador que lança erro não impede os demais de serem notificados', async () => {
    let primeiraEmissao = true;
    const problematico = jest.fn(() => {
      if (primeiraEmissao) {
        primeiraEmissao = false;
        return;
      }
      throw new Error('falha no observador');
    });
    const saudavel = jest.fn();
    sync.observarEstadoSync(problematico);
    sync.observarEstadoSync(saudavel);

    await expect(sync.sincronizarTudo('u1')).resolves.toMatchObject({ success: true });
    expect(saudavel.mock.calls.map(([e]) => e.status)).toEqual(['sem_conta', 'sincronizando', 'ok']);
  });
});

describe('definirUsuarioSync', () => {
  it('com null emite o estado sem_conta (descartando a ultimaSync)', async () => {
    await sync.sincronizarTudo('u1');
    expect(sync.obterEstadoSync().status).toBe('ok');

    sync.definirUsuarioSync(null);

    expect(sync.obterEstadoSync()).toEqual({ status: 'sem_conta', mensagem: MSG_SEM_CONTA });
  });

  it('ao definir um usuário dispara a sincronização para esse usuário', async () => {
    sync.definirUsuarioSync('u1');
    await esvaziarFila();

    expect(remoto.verificarConexao).toHaveBeenCalledTimes(1);
    expect(remoto.buscarGanhosRemotos).toHaveBeenCalledWith('u1');
    expect(remoto.buscarDividasRemotas).toHaveBeenCalledWith('u1');
    expect(remoto.buscarMetaBaseRemota).toHaveBeenCalledWith('u1');
    expect(sync.obterEstadoSync().status).toBe('ok');
  });

  it('restaura a ultimaSync persistida antes de começar a sincronizar', async () => {
    jest.useFakeTimers({ now: new Date(AGORA) });
    await storage.salvarEstadoSyncPersistido({ status: 'ok', ultimaSync: T1 });
    const estados = registrarEstados();

    sync.definirUsuarioSync('u1');
    await jest.advanceTimersByTimeAsync(0);

    expect(estados).toEqual([
      { status: 'sem_conta', mensagem: MSG_SEM_CONTA },
      { status: 'sem_conta', mensagem: MSG_SEM_CONTA, ultimaSync: T1 },
      { status: 'sincronizando', mensagem: 'Sincronizando...', ultimaSync: T1 },
      { status: 'ok', mensagem: 'Sincronizado com a nuvem.', ultimaSync: AGORA },
    ]);
  });

  it('não sincroniza de novo quando o mesmo usuário é definido outra vez', async () => {
    sync.definirUsuarioSync('u1');
    await esvaziarFila();
    sync.definirUsuarioSync('u1');
    await esvaziarFila();

    expect(remoto.verificarConexao).toHaveBeenCalledTimes(1);
  });

  it('ao trocar de usuário sincroniza com o novo id', async () => {
    sync.definirUsuarioSync('u1');
    await esvaziarFila();
    sync.definirUsuarioSync('u2');
    await esvaziarFila();

    expect(remoto.buscarGanhosRemotos.mock.calls).toEqual([['u1'], ['u2']]);
  });
});

describe('sincronizarTudo', () => {
  it('sem dados locais nem remotos termina ok sem enviar nada', async () => {
    await expect(sync.sincronizarTudo('u1')).resolves.toEqual({
      success: true,
      data: { enviados: 0, recebidos: 0 },
    });
    expect(remoto.salvarGanhosRemotos).not.toHaveBeenCalled();
    expect(remoto.salvarDividasRemotas).not.toHaveBeenCalled();
    expect(remoto.salvarMetaBaseRemota).not.toHaveBeenCalled();
  });

  describe('ganhos (last-write-wins por dataISO)', () => {
    it('local mais novo vence: é enviado e o valor local é mantido', async () => {
      await storage.substituirGanhosLocais({ '2020-01-10': ganho('2020-01-10', 200, T2) });
      remoto.buscarGanhosRemotos.mockResolvedValue({ success: true, data: [ganho('2020-01-10', 100, T1)] });

      const resultado = await sync.sincronizarTudo('u1');

      expect(remoto.salvarGanhosRemotos).toHaveBeenCalledWith('u1', [ganho('2020-01-10', 200, T2)]);
      expect((await storage.carregarGanhosLocais())['2020-01-10']).toEqual(ganho('2020-01-10', 200, T2));
      expect(resultado).toEqual({ success: true, data: { enviados: 1, recebidos: 0 } });
    });

    it('remoto mais novo vence: é gravado localmente e não é reenviado', async () => {
      await storage.substituirGanhosLocais({ '2020-01-10': ganho('2020-01-10', 100, T1) });
      remoto.buscarGanhosRemotos.mockResolvedValue({ success: true, data: [ganho('2020-01-10', 300, T2)] });

      const resultado = await sync.sincronizarTudo('u1');

      expect((await storage.carregarGanhosLocais())['2020-01-10']).toEqual(ganho('2020-01-10', 300, T2));
      expect(remoto.salvarGanhosRemotos).not.toHaveBeenCalled();
      expect(resultado).toEqual({ success: true, data: { enviados: 0, recebidos: 1 } });
    });

    it('mescla dias diferentes nos dois sentidos', async () => {
      await storage.substituirGanhosLocais({ '2020-01-10': ganho('2020-01-10', 100, T1) });
      remoto.buscarGanhosRemotos.mockResolvedValue({ success: true, data: [ganho('2020-01-11', 70, T1)] });

      const resultado = await sync.sincronizarTudo('u1');

      expect(await storage.carregarGanhosLocais()).toEqual({
        '2020-01-10': ganho('2020-01-10', 100, T1),
        '2020-01-11': ganho('2020-01-11', 70, T1),
      });
      expect(remoto.salvarGanhosRemotos).toHaveBeenCalledWith('u1', [ganho('2020-01-10', 100, T1)]);
      expect(resultado).toEqual({ success: true, data: { enviados: 1, recebidos: 1 } });
    });

    it('ganho local sem atualizadoEm perde para o remoto datado', async () => {
      await storage.substituirGanhosLocais({ '2020-01-10': ganho('2020-01-10', 50, '') });
      remoto.buscarGanhosRemotos.mockResolvedValue({ success: true, data: [ganho('2020-01-10', 80, T1)] });

      const resultado = await sync.sincronizarTudo('u1');

      expect((await storage.carregarGanhosLocais())['2020-01-10'].valor).toBe(80);
      expect(remoto.salvarGanhosRemotos).not.toHaveBeenCalled();
      expect(resultado).toEqual({ success: true, data: { enviados: 0, recebidos: 1 } });
    });

    it('ganho remoto sem atualizadoEm perde para o local datado, que é reenviado', async () => {
      await storage.substituirGanhosLocais({ '2020-01-10': ganho('2020-01-10', 50, T1) });
      remoto.buscarGanhosRemotos.mockResolvedValue({ success: true, data: [ganho('2020-01-10', 80, '')] });

      const resultado = await sync.sincronizarTudo('u1');

      expect((await storage.carregarGanhosLocais())['2020-01-10'].valor).toBe(50);
      expect(remoto.salvarGanhosRemotos).toHaveBeenCalledWith('u1', [ganho('2020-01-10', 50, T1)]);
      expect(resultado).toEqual({ success: true, data: { enviados: 1, recebidos: 0 } });
    });

    it('com o mesmo atualizadoEm nada é recebido nem enviado', async () => {
      await storage.substituirGanhosLocais({ '2020-01-10': ganho('2020-01-10', 50, T1) });
      remoto.buscarGanhosRemotos.mockResolvedValue({ success: true, data: [ganho('2020-01-10', 80, T1)] });

      const resultado = await sync.sincronizarTudo('u1');

      expect((await storage.carregarGanhosLocais())['2020-01-10'].valor).toBe(50);
      expect(remoto.salvarGanhosRemotos).not.toHaveBeenCalled();
      expect(resultado).toEqual({ success: true, data: { enviados: 0, recebidos: 0 } });
    });
  });

  describe('dívidas (last-write-wins por id, com tombstones)', () => {
    it('local mais nova vence: é enviada e mantida', async () => {
      await storage.substituirDividasLocais([divida('d1', T2, { valor: 99 })]);
      remoto.buscarDividasRemotas.mockResolvedValue({ success: true, data: [divida('d1', T1, { valor: 10 })] });

      const resultado = await sync.sincronizarTudo('u1');

      expect(remoto.salvarDividasRemotas).toHaveBeenCalledWith('u1', [divida('d1', T2, { valor: 99 })]);
      expect(await storage.carregarDividasLocais()).toEqual([divida('d1', T2, { valor: 99 })]);
      expect(resultado).toEqual({ success: true, data: { enviados: 1, recebidos: 0 } });
    });

    it('remota mais nova vence: é gravada localmente e não é reenviada', async () => {
      await storage.substituirDividasLocais([divida('d1', T1, { valor: 10 })]);
      remoto.buscarDividasRemotas.mockResolvedValue({ success: true, data: [divida('d1', T2, { valor: 99 })] });

      const resultado = await sync.sincronizarTudo('u1');

      expect(await storage.carregarDividasLocais()).toEqual([divida('d1', T2, { valor: 99 })]);
      expect(remoto.salvarDividasRemotas).not.toHaveBeenCalled();
      expect(resultado).toEqual({ success: true, data: { enviados: 0, recebidos: 1 } });
    });

    it('lado sem atualizadoEm perde nos dois sentidos', async () => {
      await storage.substituirDividasLocais([divida('local-sem-data', undefined), divida('remota-sem-data', T1)]);
      remoto.buscarDividasRemotas.mockResolvedValue({
        success: true,
        data: [divida('local-sem-data', T1, { valor: 70 }), divida('remota-sem-data', undefined, { valor: 5 })],
      });

      await sync.sincronizarTudo('u1');

      const locais = await storage.carregarDividasLocais();
      expect(locais.find((d) => d.id === 'local-sem-data')).toEqual(divida('local-sem-data', T1, { valor: 70 }));
      expect(locais.find((d) => d.id === 'remota-sem-data')).toEqual(divida('remota-sem-data', T1));
      expect(remoto.salvarDividasRemotas).toHaveBeenCalledWith('u1', [divida('remota-sem-data', T1)]);
    });

    it('exclusão local (tombstone) mais nova é enviada para a nuvem com removido=true', async () => {
      await storage.substituirDividasLocais([divida('d1', T2, { removido: true })]);
      remoto.buscarDividasRemotas.mockResolvedValue({ success: true, data: [divida('d1', T1, { removido: false })] });

      await sync.sincronizarTudo('u1');

      expect(remoto.salvarDividasRemotas).toHaveBeenCalledWith('u1', [divida('d1', T2, { removido: true })]);
      expect(await storage.carregarDividasLocais()).toEqual([]);
    });

    it('removerDividaLocal gera um tombstone que é propagado na próxima sincronização', async () => {
      await storage.salvarDividaLocal(divida('d1', T1));
      remoto.buscarDividasRemotas.mockResolvedValue({ success: true, data: [divida('d1', T1, { removido: false })] });
      await sync.sincronizarTudo('u1');
      expect(remoto.salvarDividasRemotas).not.toHaveBeenCalled(); // já estava em dia

      await storage.removerDividaLocal('d1');
      await sync.sincronizarTudo('u1');

      expect(remoto.salvarDividasRemotas).toHaveBeenCalledWith('u1', [
        expect.objectContaining({ id: 'd1', removido: true }),
      ]);
    });

    it('exclusão remota (tombstone) mais nova remove a dívida localmente', async () => {
      await storage.substituirDividasLocais([divida('d1', T1), divida('d2', T1)]);
      remoto.buscarDividasRemotas.mockResolvedValue({
        success: true,
        data: [divida('d1', T2, { removido: true }), divida('d2', T1)],
      });

      const resultado = await sync.sincronizarTudo('u1');

      expect((await storage.carregarDividasLocais()).map((d) => d.id)).toEqual(['d2']);
      expect(await storage.carregarDividasLocaisComRemovidas()).toContainEqual(divida('d1', T2, { removido: true }));
      expect(remoto.salvarDividasRemotas).not.toHaveBeenCalled();
      expect(resultado).toEqual({ success: true, data: { enviados: 0, recebidos: 1 } });
    });

    it('tombstone remoto de dívida desconhecida fica guardado localmente como removido', async () => {
      remoto.buscarDividasRemotas.mockResolvedValue({ success: true, data: [divida('d9', T1, { removido: true })] });

      await sync.sincronizarTudo('u1');

      expect(await storage.carregarDividasLocais()).toEqual([]);
      expect(await storage.carregarDividasLocaisComRemovidas()).toEqual([divida('d9', T1, { removido: true })]);
    });

    it('dívida reativada depois da exclusão vence o tombstone remoto mais antigo', async () => {
      await storage.substituirDividasLocais([divida('d1', T2, { removido: false })]);
      remoto.buscarDividasRemotas.mockResolvedValue({ success: true, data: [divida('d1', T1, { removido: true })] });

      await sync.sincronizarTudo('u1');

      expect(remoto.salvarDividasRemotas).toHaveBeenCalledWith('u1', [divida('d1', T2, { removido: false })]);
      expect((await storage.carregarDividasLocais()).map((d) => d.id)).toEqual(['d1']);
    });
  });

  describe('meta base', () => {
    it('não é enviada sem timestamp local (o padrão do aparelho nunca sobrescreve a nuvem)', async () => {
      const resultado = await sync.sincronizarTudo('u1');

      expect(remoto.salvarMetaBaseRemota).not.toHaveBeenCalled();
      expect(resultado).toEqual({ success: true, data: { enviados: 0, recebidos: 0 } });
    });

    it('é enviada quando há timestamp local e não existe meta na nuvem', async () => {
      await storage.gravarMetaBaseLocal(150, T1);

      const resultado = await sync.sincronizarTudo('u1');

      expect(remoto.salvarMetaBaseRemota).toHaveBeenCalledWith('u1', 150, T1);
      expect(resultado).toEqual({ success: true, data: { enviados: 1, recebidos: 0 } });
    });

    it('local mais nova que a remota é enviada', async () => {
      await storage.gravarMetaBaseLocal(150, T2);
      remoto.buscarMetaBaseRemota.mockResolvedValue({ success: true, data: { metaBase: 120, atualizadoEm: T1 } });

      await sync.sincronizarTudo('u1');

      expect(remoto.salvarMetaBaseRemota).toHaveBeenCalledWith('u1', 150, T2);
      await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 150, atualizadoEm: T2 });
    });

    it('remota mais nova é gravada localmente e não é reenviada', async () => {
      await storage.gravarMetaBaseLocal(150, T1);
      remoto.buscarMetaBaseRemota.mockResolvedValue({ success: true, data: { metaBase: 200, atualizadoEm: T2 } });

      const resultado = await sync.sincronizarTudo('u1');

      await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 200, atualizadoEm: T2 });
      expect(remoto.salvarMetaBaseRemota).not.toHaveBeenCalled();
      expect(resultado).toEqual({ success: true, data: { enviados: 0, recebidos: 1 } });
    });

    it('remota é aplicada quando a meta nunca foi alterada neste aparelho', async () => {
      remoto.buscarMetaBaseRemota.mockResolvedValue({ success: true, data: { metaBase: 180, atualizadoEm: T1 } });

      await sync.sincronizarTudo('u1');

      await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 180, atualizadoEm: T1 });
      expect(remoto.salvarMetaBaseRemota).not.toHaveBeenCalled();
    });

    it('com o mesmo timestamp nada é recebido nem enviado', async () => {
      await storage.gravarMetaBaseLocal(150, T1);
      remoto.buscarMetaBaseRemota.mockResolvedValue({ success: true, data: { metaBase: 120, atualizadoEm: T1 } });

      const resultado = await sync.sincronizarTudo('u1');

      await expect(storage.carregarMetaBaseLocal()).resolves.toBe(150);
      expect(remoto.salvarMetaBaseRemota).not.toHaveBeenCalled();
      expect(resultado).toEqual({ success: true, data: { enviados: 0, recebidos: 0 } });
    });
  });

  describe('estados emitidos', () => {
    it('sucesso: sincronizando → ok, com ultimaSync persistida', async () => {
      jest.useFakeTimers({ now: new Date(AGORA) });
      const estados = registrarEstados();

      await sync.sincronizarTudo('u1');

      const estadoOk = { status: 'ok', ultimaSync: AGORA, mensagem: 'Sincronizado com a nuvem.' };
      expect(estados).toEqual([
        { status: 'sem_conta', mensagem: MSG_SEM_CONTA },
        { status: 'sincronizando', mensagem: 'Sincronizando...' },
        estadoOk,
      ]);
      await expect(storage.carregarEstadoSyncPersistido()).resolves.toEqual(estadoOk);
    });

    it('sem conexão: sincronizando → offline, sem tocar nos dados', async () => {
      remoto.verificarConexao.mockResolvedValue({ online: false, motivo: remoto.MSG_OFFLINE });
      const estados = registrarEstados();

      await expect(sync.sincronizarTudo('u1')).resolves.toEqual({ success: false, error: remoto.MSG_OFFLINE });

      expect(statusDe(estados)).toEqual(['sem_conta', 'sincronizando', 'offline']);
      expect(sync.obterEstadoSync()).toEqual({ status: 'offline', mensagem: MSG_OFFLINE_UI });
      expect(remoto.buscarGanhosRemotos).not.toHaveBeenCalled();
      expect(remoto.buscarDividasRemotas).not.toHaveBeenCalled();
      expect(remoto.buscarMetaBaseRemota).not.toHaveBeenCalled();
    });

    it('banco não configurado: sincronizando → erro com a mensagem de configuração', async () => {
      remoto.verificarConexao.mockResolvedValue({ online: false, motivo: remoto.MSG_BANCO_NAO_CONFIGURADO });
      const estados = registrarEstados();

      await expect(sync.sincronizarTudo('u1')).resolves.toEqual({
        success: false,
        error: remoto.MSG_BANCO_NAO_CONFIGURADO,
      });

      expect(statusDe(estados)).toEqual(['sem_conta', 'sincronizando', 'erro']);
      expect(sync.obterEstadoSync()).toEqual({ status: 'erro', mensagem: remoto.MSG_BANCO_NAO_CONFIGURADO });
    });

    it('nuvem indisponível sem motivo informado vira erro genérico', async () => {
      remoto.verificarConexao.mockResolvedValue({ online: false });

      await expect(sync.sincronizarTudo('u1')).resolves.toEqual({ success: false, error: 'Nuvem indisponível.' });
      expect(sync.obterEstadoSync()).toEqual({ status: 'erro', mensagem: 'Nuvem indisponível.' });
    });

    it.each([
      ['offline', 'Sem conexão com a internet.', MSG_OFFLINE_UI],
      ['erro', 'Banco não configurado: execute supabase/schema.sql no SQL Editor do Supabase.', null],
      ['erro', 'Sessão expirada. Entre novamente.', null],
      ['erro', 'Permissão negada pelo banco.', null],
    ])('falha no meio da sincronização vira estado "%s" (erro: %s)', async (status, erro, mensagemUi) => {
      remoto.buscarGanhosRemotos.mockResolvedValue({ success: false, error: erro });

      await expect(sync.sincronizarTudo('u1')).resolves.toEqual({ success: false, error: erro });
      expect(sync.obterEstadoSync()).toEqual({ status, mensagem: mensagemUi ?? erro });
    });

    it('falha preserva a ultimaSync da última sincronização bem-sucedida', async () => {
      jest.useFakeTimers({ now: new Date(AGORA) });
      await sync.sincronizarTudo('u1');
      const estados = registrarEstados();
      remoto.verificarConexao.mockResolvedValue({ online: false, motivo: remoto.MSG_OFFLINE });

      await sync.sincronizarTudo('u1');

      expect(estados.slice(1)).toEqual([
        { status: 'sincronizando', mensagem: 'Sincronizando...', ultimaSync: AGORA },
        { status: 'offline', mensagem: MSG_OFFLINE_UI, ultimaSync: AGORA },
      ]);
    });

    const etapasDeFalha: Array<[FuncaoRemota, FuncaoRemota[]]> = [
      [
        'buscarGanhosRemotos',
        ['salvarGanhosRemotos', 'buscarDividasRemotas', 'salvarDividasRemotas', 'buscarMetaBaseRemota', 'salvarMetaBaseRemota'],
      ],
      ['salvarGanhosRemotos', ['buscarDividasRemotas', 'salvarDividasRemotas', 'buscarMetaBaseRemota', 'salvarMetaBaseRemota']],
      ['buscarDividasRemotas', ['salvarDividasRemotas', 'buscarMetaBaseRemota', 'salvarMetaBaseRemota']],
      ['salvarDividasRemotas', ['buscarMetaBaseRemota', 'salvarMetaBaseRemota']],
      ['buscarMetaBaseRemota', ['salvarMetaBaseRemota']],
      ['salvarMetaBaseRemota', []],
    ];

    it.each(etapasDeFalha)(
      'falha em %s interrompe as etapas seguintes e não persiste estado ok',
      async (etapa, naoDevemSerChamadas) => {
        // Dados locais em todas as frentes, para que toda etapa tenha algo a fazer.
        await storage.substituirGanhosLocais({ '2020-01-10': ganho('2020-01-10', 100, T1) });
        await storage.substituirDividasLocais([divida('d1', T1)]);
        await storage.gravarMetaBaseLocal(150, T1);
        (remoto[etapa] as jest.Mock).mockResolvedValue({ success: false, error: `falha em ${etapa}` });

        await expect(sync.sincronizarTudo('u1')).resolves.toEqual({ success: false, error: `falha em ${etapa}` });

        expect(remoto[etapa]).toHaveBeenCalledTimes(1);
        naoDevemSerChamadas.forEach((nome) => expect(remoto[nome]).not.toHaveBeenCalled());
        expect(sync.obterEstadoSync()).toEqual({ status: 'erro', mensagem: `falha em ${etapa}` });
        await expect(storage.carregarEstadoSyncPersistido()).resolves.toBeNull();
      }
    );
  });

  describe('exclusão mútua (mutex)', () => {
    it('duas chamadas concorrentes não rodam em paralelo e recebem o mesmo resultado', async () => {
      const conexao = adiado<{ online: boolean; motivo?: string }>();
      remoto.verificarConexao.mockReturnValueOnce(conexao.promessa);
      const estados = registrarEstados();

      const primeira = sync.sincronizarTudo('u1');
      const segunda = sync.sincronizarTudo('u1');
      await esvaziarFila();
      expect(remoto.verificarConexao).toHaveBeenCalledTimes(1);

      conexao.resolver({ online: true });
      const [r1, r2] = await Promise.all([primeira, segunda]);
      await esvaziarFila();

      expect(r1).toEqual({ success: true, data: { enviados: 0, recebidos: 0 } });
      expect(r2).toEqual(r1);
      // Sem usuário logado não há rodada extra.
      expect(remoto.verificarConexao).toHaveBeenCalledTimes(1);
      expect(statusDe(estados)).toEqual(['sem_conta', 'sincronizando', 'ok']);
    });

    it('com usuário logado, pedidos feitos durante a execução viram uma única rodada extra ao final', async () => {
      const conexao = adiado<{ online: boolean; motivo?: string }>();
      remoto.verificarConexao.mockReturnValueOnce(conexao.promessa);
      const estados = registrarEstados();

      sync.definirUsuarioSync('u1');
      await esvaziarFila();
      void sync.sincronizarTudo('u1');
      void sync.sincronizarTudo('u1');
      void sync.sincronizarTudo('u1');
      await esvaziarFila();
      expect(remoto.verificarConexao).toHaveBeenCalledTimes(1);

      conexao.resolver({ online: true });
      await esvaziarFila();

      expect(remoto.verificarConexao).toHaveBeenCalledTimes(2);
      // Nunca dois "sincronizando" seguidos: as rodadas são estritamente sequenciais.
      expect(statusDe(estados)).toEqual(['sem_conta', 'sincronizando', 'ok', 'sincronizando', 'ok']);
    });
  });
});

describe('agendarSync', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('é no-op sem usuário logado (nem chega a criar timer)', async () => {
    jest.useFakeTimers();

    sync.agendarSync();

    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(remoto.verificarConexao).not.toHaveBeenCalled();
  });

  it('com usuário logado aplica debounce de 2s, agrupando chamadas próximas em uma só', async () => {
    sync.definirUsuarioSync('u1');
    await esvaziarFila(); // sincronização inicial do login
    expect(remoto.verificarConexao).toHaveBeenCalledTimes(1);
    jest.useFakeTimers();

    sync.agendarSync();
    await jest.advanceTimersByTimeAsync(1500);
    sync.agendarSync(); // reinicia a contagem
    await jest.advanceTimersByTimeAsync(1500);
    sync.agendarSync(); // reinicia de novo
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1999);
    expect(remoto.verificarConexao).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);

    expect(remoto.verificarConexao).toHaveBeenCalledTimes(2);
    expect(remoto.buscarGanhosRemotos).toHaveBeenLastCalledWith('u1');
    expect(sync.obterEstadoSync().status).toBe('ok');
  });

  it('gravações do usuário no storage disparam a sincronização depois do debounce', async () => {
    sync.definirUsuarioSync('u1');
    await esvaziarFila();
    jest.useFakeTimers();

    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 120, T1));
    expect(remoto.salvarGanhosRemotos).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2000);

    expect(remoto.salvarGanhosRemotos).toHaveBeenCalledWith('u1', [ganho('2020-01-10', 120, T1)]);
  });

  it('definirUsuarioSync(null) cancela a sincronização agendada', async () => {
    sync.definirUsuarioSync('u1');
    await esvaziarFila();
    jest.useFakeTimers();
    sync.agendarSync();
    expect(jest.getTimerCount()).toBe(1);

    sync.definirUsuarioSync(null);

    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(remoto.verificarConexao).toHaveBeenCalledTimes(1);
    expect(sync.obterEstadoSync().status).toBe('sem_conta');
  });
});

describe('troca de usuário durante a sincronização', () => {
  // Regressão: a sincronização em andamento não era cancelada no logout; ao terminar, ela
  // regravava localmente os dados do usuário anterior (depois de limparDadosLocais) e emitia
  // "ok". No login seguinte, esses dados eram enviados para a conta do novo usuário.
  it('logout durante uma sincronização não vaza dados para a próxima conta', async () => {
    const ganhosDoUsuarioA = adiado<ResultadoServico<RegistroGanhoLocal[]>>();
    remoto.buscarGanhosRemotos.mockReturnValueOnce(ganhosDoUsuarioA.promessa);

    // Login do usuário A: a sincronização fica esperando a nuvem responder.
    sync.definirUsuarioSync('usuario-a');
    await esvaziarFila();

    // Logout como o App faz: observarSessao → definirUsuarioSync(null), depois limparDadosLocais().
    sync.definirUsuarioSync(null);
    await storage.limparDadosLocais();

    // A nuvem finalmente responde à sincronização antiga do usuário A.
    ganhosDoUsuarioA.resolver({ success: true, data: [ganho('2020-01-10', 999, T1)] });
    await esvaziarFila();

    // Login do usuário B no mesmo aparelho.
    sync.definirUsuarioSync('usuario-b');
    await esvaziarFila();

    expect(remoto.salvarGanhosRemotos).not.toHaveBeenCalledWith('usuario-b', expect.anything());
  });
});
