// Testes unitários do armazenamento local offline-first (src/services/storage.ts).
// Usa o mock oficial do AsyncStorage (jest.setup.js) e substitui o módulo de sync
// para verificar que as gravações do usuário agendam uma sincronização.
// O módulo guarda caches em memória, então cada teste recarrega os módulos.

import type { DividaItem, EstadoSync, RegistroGanhoLocal } from '../../src/types';

jest.mock('../../src/services/sync', () => ({ agendarSync: jest.fn() }));

type ModuloStorage = typeof import('../../src/services/storage');

interface AsyncStorageMock {
  getItem: jest.Mock;
  setItem: jest.Mock;
  multiGet: jest.Mock;
  multiSet: jest.Mock;
  multiRemove: jest.Mock;
  getAllKeys: jest.Mock;
  clear: jest.Mock;
}

const CHAVE_GANHOS = '@amortiza_ganhos_v1';
const CHAVE_META_BASE = '@amortiza_meta_base_v1';
const CHAVE_META_BASE_ATUALIZADA_EM = '@amortiza_meta_base_atualizada_em_v1';
const CHAVE_DIVIDAS = '@amortiza_dividas_v1';
const CHAVE_ESTADO_SYNC = '@amortiza_estado_sync_v1';

const T1 = '2020-01-01T10:00:00.000Z';
const T2 = '2020-01-02T10:00:00.000Z';
const AGORA = '2026-10-26T12:00:00.000Z';

let storage: ModuloStorage;
let AsyncStorage: AsyncStorageMock;
let agendarSync: jest.Mock;

/** Recarrega storage, sync (mock) e AsyncStorage (mock) do zero: memória e disco vazios. */
function carregarModulos() {
  jest.resetModules();
  AsyncStorage = require('@react-native-async-storage/async-storage');
  agendarSync = require('../../src/services/sync').agendarSync;
  storage = require('../../src/services/storage');
}

/** Simula o app sendo fechado e reaberto: zera os caches em memória, mas preserva o disco. */
async function reiniciarApp() {
  const chaves: string[] = await AsyncStorage.getAllKeys();
  const pares: Array<[string, string]> = await AsyncStorage.multiGet(chaves);
  carregarModulos();
  await AsyncStorage.multiSet(pares);
}

async function lerDoDisco(chave: string): Promise<unknown> {
  const bruto: string | null = await AsyncStorage.getItem(chave);
  return bruto === null ? null : JSON.parse(bruto);
}

function ganho(dataISO: string, valor: number, atualizadoEm = T1): RegistroGanhoLocal {
  return { dataISO, valor, metaDoDia: 100, percentual: Math.min(100, valor), atualizadoEm };
}

function divida(id: string, extra: Partial<DividaItem> = {}): DividaItem {
  return {
    id,
    descricao: `Dívida ${id}`,
    valor: 50,
    tipo: 'mensal',
    dataLancamento: '2020-01-01',
    atualizadoEm: T1,
    ...extra,
  };
}

beforeEach(async () => {
  jest.useRealTimers();
  carregarModulos();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('salvarGanhoLocalmente', () => {
  it('persiste o ganho no AsyncStorage e ele sobrevive a um reinício do app', async () => {
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 120));

    expect(await lerDoDisco(CHAVE_GANHOS)).toEqual({ '2020-01-10': ganho('2020-01-10', 120) });
    await reiniciarApp();
    expect(await storage.carregarGanhosLocais()).toEqual({ '2020-01-10': ganho('2020-01-10', 120) });
  });

  it('mantém o atualizadoEm informado', async () => {
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 120, T2));
    expect((await storage.carregarGanhosLocais())['2020-01-10'].atualizadoEm).toBe(T2);
  });

  it('preenche atualizadoEm com o horário atual quando vier vazio', async () => {
    jest.useFakeTimers({ now: new Date(AGORA) });
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 120, ''));
    expect((await storage.carregarGanhosLocais())['2020-01-10'].atualizadoEm).toBe(AGORA);
  });

  it('guarda um registro por dia: salvar o mesmo dia sobrescreve o anterior', async () => {
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 120));
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 80, T2));
    expect(await storage.carregarGanhosLocais()).toEqual({ '2020-01-10': ganho('2020-01-10', 80, T2) });
  });

  it('preserva os dias já gravados em disco por uma sessão anterior', async () => {
    await AsyncStorage.setItem(CHAVE_GANHOS, JSON.stringify({ '2020-01-09': ganho('2020-01-09', 90) }));
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 120));
    expect(await lerDoDisco(CHAVE_GANHOS)).toEqual({
      '2020-01-09': ganho('2020-01-09', 90),
      '2020-01-10': ganho('2020-01-10', 120),
    });
  });

  it('agenda a sincronização uma vez, depois de gravar no disco', async () => {
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 120));
    expect(agendarSync).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem.mock.invocationCallOrder[0]).toBeLessThan(
      agendarSync.mock.invocationCallOrder[0]
    );
  });
});

describe('carregarGanhosLocais', () => {
  it('devolve um mapa vazio quando não há nada salvo', async () => {
    await expect(storage.carregarGanhosLocais()).resolves.toEqual({});
  });

  it('ignora JSON inválido no disco sem lançar', async () => {
    await AsyncStorage.setItem(CHAVE_GANHOS, '{json quebrado');
    await expect(storage.carregarGanhosLocais()).resolves.toEqual({});
  });

  it('lê os ganhos gravados diretamente no disco', async () => {
    await AsyncStorage.setItem(CHAVE_GANHOS, JSON.stringify({ '2020-01-09': ganho('2020-01-09', 90) }));
    await expect(storage.carregarGanhosLocais()).resolves.toEqual({ '2020-01-09': ganho('2020-01-09', 90) });
  });

  it('não agenda sincronização', async () => {
    await storage.carregarGanhosLocais();
    expect(agendarSync).not.toHaveBeenCalled();
  });
});

describe('substituirGanhosLocais', () => {
  it('substitui o mapa inteiro (dias ausentes são descartados) e persiste', async () => {
    await storage.salvarGanhoLocalmente(ganho('2020-01-09', 90));
    await storage.substituirGanhosLocais({ '2020-01-10': ganho('2020-01-10', 120) });

    expect(await storage.carregarGanhosLocais()).toEqual({ '2020-01-10': ganho('2020-01-10', 120) });
    expect(await lerDoDisco(CHAVE_GANHOS)).toEqual({ '2020-01-10': ganho('2020-01-10', 120) });
  });

  it('não agenda sincronização (é usado pelo próprio sync)', async () => {
    await storage.substituirGanhosLocais({ '2020-01-10': ganho('2020-01-10', 120) });
    expect(agendarSync).not.toHaveBeenCalled();
  });

  it('copia o mapa recebido em vez de guardar a mesma referência', async () => {
    const mapa = { '2020-01-10': ganho('2020-01-10', 120) };
    await storage.substituirGanhosLocais(mapa);
    delete (mapa as Record<string, RegistroGanhoLocal>)['2020-01-10'];
    expect(Object.keys(await storage.carregarGanhosLocais())).toEqual(['2020-01-10']);
  });
});

describe('meta base', () => {
  describe('carregarMetaBaseLocal', () => {
    it('usa 100 como padrão quando nada foi salvo', async () => {
      await expect(storage.carregarMetaBaseLocal()).resolves.toBe(100);
    });

    it.each(['abc', '0', '-50', 'NaN'])('ignora valor inválido "%s" salvo no disco', async (valor) => {
      await AsyncStorage.setItem(CHAVE_META_BASE, valor);
      await expect(storage.carregarMetaBaseLocal()).resolves.toBe(100);
    });

    it('aceita valores decimais gravados no disco', async () => {
      await AsyncStorage.setItem(CHAVE_META_BASE, '150.75');
      await expect(storage.carregarMetaBaseLocal()).resolves.toBe(150.75);
    });

    // Regressão: o cache em memória nascia com 100 e o `padrao` recebido nunca era usado.
    it('devolve o padrão informado pelo chamador quando nada foi salvo', async () => {
      await expect(storage.carregarMetaBaseLocal(250)).resolves.toBe(250);
    });
  });

  describe('salvarMetaBaseLocal', () => {
    it('persiste o valor e o horário da alteração, sobrevivendo a um reinício do app', async () => {
      jest.useFakeTimers({ now: new Date(AGORA) });
      await storage.salvarMetaBaseLocal(150);

      expect(await AsyncStorage.getItem(CHAVE_META_BASE)).toBe('150');
      expect(await AsyncStorage.getItem(CHAVE_META_BASE_ATUALIZADA_EM)).toBe(AGORA);
      await reiniciarApp();
      await expect(storage.carregarMetaBaseLocal()).resolves.toBe(150);
      await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 150, atualizadoEm: AGORA });
    });

    it('agenda a sincronização uma vez, depois de gravar no disco', async () => {
      await storage.salvarMetaBaseLocal(150);
      expect(agendarSync).toHaveBeenCalledTimes(1);
      expect(AsyncStorage.multiSet.mock.invocationCallOrder[0]).toBeLessThan(
        agendarSync.mock.invocationCallOrder[0]
      );
    });
  });

  describe('gravarMetaBaseLocal', () => {
    it('grava valor e timestamp explícitos sem agendar sincronização', async () => {
      await storage.gravarMetaBaseLocal(180, T1);

      await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 180, atualizadoEm: T1 });
      expect(await AsyncStorage.getItem(CHAVE_META_BASE)).toBe('180');
      expect(await AsyncStorage.getItem(CHAVE_META_BASE_ATUALIZADA_EM)).toBe(T1);
      expect(agendarSync).not.toHaveBeenCalled();
    });
  });

  describe('carregarMetaBaseComData', () => {
    it('devolve meta padrão e atualizadoEm null quando o usuário nunca alterou a meta', async () => {
      await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 100, atualizadoEm: null });
    });

    it('lê valor e data gravados diretamente no disco', async () => {
      await AsyncStorage.multiSet([
        [CHAVE_META_BASE, '220'],
        [CHAVE_META_BASE_ATUALIZADA_EM, T2],
      ]);
      await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 220, atualizadoEm: T2 });
    });
  });
});

describe('dívidas', () => {
  describe('salvarDividaLocal', () => {
    it('adiciona a dívida como ativa, persiste e devolve a lista de ativas', async () => {
      const lista = await storage.salvarDividaLocal(divida('d1'));

      expect(lista).toEqual([{ ...divida('d1'), removido: false }]);
      expect(await lerDoDisco(CHAVE_DIVIDAS)).toEqual([{ ...divida('d1'), removido: false }]);
      await reiniciarApp();
      await expect(storage.carregarDividasLocais()).resolves.toEqual([{ ...divida('d1'), removido: false }]);
    });

    it('atualiza no lugar quando o id já existe (sem duplicar e mantendo a ordem)', async () => {
      await storage.salvarDividaLocal(divida('d1'));
      await storage.salvarDividaLocal(divida('d2'));
      const lista = await storage.salvarDividaLocal(divida('d1', { valor: 999, atualizadoEm: T2 }));

      expect(lista.map((d) => [d.id, d.valor])).toEqual([
        ['d1', 999],
        ['d2', 50],
      ]);
    });

    it('preenche atualizadoEm com o horário atual quando ausente', async () => {
      jest.useFakeTimers({ now: new Date(AGORA) });
      const [salva] = await storage.salvarDividaLocal(divida('d1', { atualizadoEm: undefined }));
      expect(salva.atualizadoEm).toBe(AGORA);
    });

    it('sempre grava como ativa, reativando um item que estava removido', async () => {
      await storage.salvarDividaLocal(divida('d1'));
      await storage.removerDividaLocal('d1');
      const lista = await storage.salvarDividaLocal(divida('d1', { removido: true, atualizadoEm: T2 }));

      expect(lista).toEqual([{ ...divida('d1', { atualizadoEm: T2 }), removido: false }]);
    });

    it('agenda a sincronização uma vez, depois de gravar no disco', async () => {
      await storage.salvarDividaLocal(divida('d1'));
      expect(agendarSync).toHaveBeenCalledTimes(1);
      expect(AsyncStorage.setItem.mock.invocationCallOrder[0]).toBeLessThan(
        agendarSync.mock.invocationCallOrder[0]
      );
    });

    it('recomeça do zero quando o JSON salvo no disco é inválido', async () => {
      await AsyncStorage.setItem(CHAVE_DIVIDAS, 'não é json');
      await expect(storage.salvarDividaLocal(divida('d1'))).resolves.toEqual([{ ...divida('d1'), removido: false }]);
    });
  });

  describe('removerDividaLocal (soft delete)', () => {
    it('esconde a dívida das ativas, mas mantém um tombstone com removido=true e novo atualizadoEm', async () => {
      await storage.salvarDividaLocal(divida('d1'));
      await storage.salvarDividaLocal(divida('d2'));
      jest.useFakeTimers({ now: new Date(AGORA) });

      const ativas = await storage.removerDividaLocal('d1');

      expect(ativas.map((d) => d.id)).toEqual(['d2']);
      expect((await storage.carregarDividasLocais()).map((d) => d.id)).toEqual(['d2']);
      expect(await storage.carregarDividasLocaisComRemovidas()).toEqual([
        { ...divida('d1'), removido: true, atualizadoEm: AGORA },
        { ...divida('d2'), removido: false },
      ]);
    });

    it('persiste o tombstone no disco (sobrevive a um reinício do app)', async () => {
      await storage.salvarDividaLocal(divida('d1'));
      await storage.removerDividaLocal('d1');
      await reiniciarApp();

      await expect(storage.carregarDividasLocais()).resolves.toEqual([]);
      const comRemovidas = await storage.carregarDividasLocaisComRemovidas();
      expect(comRemovidas).toHaveLength(1);
      expect(comRemovidas[0]).toMatchObject({ id: 'd1', removido: true });
    });

    it('agenda a sincronização após a remoção', async () => {
      await storage.salvarDividaLocal(divida('d1'));
      agendarSync.mockClear();
      await storage.removerDividaLocal('d1');
      expect(agendarSync).toHaveBeenCalledTimes(1);
    });

    it('não altera nada quando o id não existe', async () => {
      await storage.salvarDividaLocal(divida('d1'));
      await expect(storage.removerDividaLocal('inexistente')).resolves.toEqual([{ ...divida('d1'), removido: false }]);
      await expect(storage.carregarDividasLocaisComRemovidas()).resolves.toEqual([{ ...divida('d1'), removido: false }]);
    });
  });

  describe('carregarDividasLocais', () => {
    it('devolve lista vazia quando não há nada salvo', async () => {
      await expect(storage.carregarDividasLocais()).resolves.toEqual([]);
    });

    it('filtra os tombstones gravados no disco', async () => {
      await AsyncStorage.setItem(
        CHAVE_DIVIDAS,
        JSON.stringify([divida('d1', { removido: true }), divida('d2', { removido: false }), divida('d3')])
      );
      expect((await storage.carregarDividasLocais()).map((d) => d.id)).toEqual(['d2', 'd3']);
    });
  });

  describe('carregarDividasLocaisComRemovidas', () => {
    it('inclui os tombstones', async () => {
      await storage.substituirDividasLocais([divida('d1', { removido: true }), divida('d2')]);
      expect((await storage.carregarDividasLocaisComRemovidas()).map((d) => [d.id, !!d.removido])).toEqual([
        ['d1', true],
        ['d2', false],
      ]);
    });

    it('devolve uma cópia: alterar o array retornado não altera o armazenamento', async () => {
      await storage.salvarDividaLocal(divida('d1'));
      const copia = await storage.carregarDividasLocaisComRemovidas();
      copia.push(divida('intrusa'));
      expect((await storage.carregarDividasLocaisComRemovidas()).map((d) => d.id)).toEqual(['d1']);
    });
  });

  describe('substituirDividasLocais', () => {
    it('substitui a lista inteira, tombstones inclusos, e persiste no disco', async () => {
      await storage.salvarDividaLocal(divida('antiga'));
      await storage.substituirDividasLocais([divida('d1'), divida('d2', { removido: true })]);

      expect(await lerDoDisco(CHAVE_DIVIDAS)).toEqual([divida('d1'), divida('d2', { removido: true })]);
      expect((await storage.carregarDividasLocais()).map((d) => d.id)).toEqual(['d1']);
    });

    it('não agenda sincronização (é usado pelo próprio sync)', async () => {
      await storage.substituirDividasLocais([divida('d1')]);
      expect(agendarSync).not.toHaveBeenCalled();
    });
  });
});

describe('estado de sincronização persistido', () => {
  const estadoOk: EstadoSync = { status: 'ok', ultimaSync: T2, mensagem: 'Sincronizado com a nuvem.' };

  it('carregarEstadoSyncPersistido devolve null quando nada foi salvo', async () => {
    await expect(storage.carregarEstadoSyncPersistido()).resolves.toBeNull();
  });

  it('salvarEstadoSyncPersistido grava no disco e o estado sobrevive a um reinício do app', async () => {
    await storage.salvarEstadoSyncPersistido(estadoOk);

    expect(await lerDoDisco(CHAVE_ESTADO_SYNC)).toEqual(estadoOk);
    await reiniciarApp();
    await expect(storage.carregarEstadoSyncPersistido()).resolves.toEqual(estadoOk);
  });

  it('ignora JSON inválido no disco', async () => {
    await AsyncStorage.setItem(CHAVE_ESTADO_SYNC, '{oops');
    await expect(storage.carregarEstadoSyncPersistido()).resolves.toBeNull();
  });

  it('não agenda sincronização', async () => {
    await storage.salvarEstadoSyncPersistido(estadoOk);
    expect(agendarSync).not.toHaveBeenCalled();
  });
});

describe('limparDadosLocais', () => {
  async function popularTudo() {
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 120));
    await storage.salvarDividaLocal(divida('d1'));
    await storage.salvarDividaLocal(divida('d2'));
    await storage.removerDividaLocal('d2');
    await storage.salvarMetaBaseLocal(150);
    await storage.salvarEstadoSyncPersistido({ status: 'ok', ultimaSync: T2 });
  }

  it('zera ganhos, dívidas (inclusive tombstones), meta base e estado de sync', async () => {
    await popularTudo();
    await storage.limparDadosLocais();

    await expect(storage.carregarGanhosLocais()).resolves.toEqual({});
    await expect(storage.carregarDividasLocais()).resolves.toEqual([]);
    await expect(storage.carregarDividasLocaisComRemovidas()).resolves.toEqual([]);
    await expect(storage.carregarMetaBaseLocal()).resolves.toBe(100);
    await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 100, atualizadoEm: null });
    await expect(storage.carregarEstadoSyncPersistido()).resolves.toBeNull();
  });

  it('remove as chaves do app no disco, mas preserva chaves de outros módulos (ex.: sessão do Supabase)', async () => {
    await popularTudo();
    await AsyncStorage.setItem('sb-projeto-auth-token', '{"access_token":"x"}');

    await storage.limparDadosLocais();

    expect(await AsyncStorage.getAllKeys()).toEqual(['sb-projeto-auth-token']);
    await reiniciarApp();
    await expect(storage.carregarGanhosLocais()).resolves.toEqual({});
  });

  it('não agenda sincronização', async () => {
    await storage.limparDadosLocais();
    expect(agendarSync).not.toHaveBeenCalled();
  });
});

describe('fallback em memória quando o AsyncStorage lança erro', () => {
  beforeEach(() => {
    const erro = new Error('AsyncStorage indisponível');
    AsyncStorage.getItem.mockRejectedValue(erro);
    AsyncStorage.setItem.mockRejectedValue(erro);
    AsyncStorage.multiSet.mockRejectedValue(erro);
    AsyncStorage.multiRemove.mockRejectedValue(erro);
  });

  it('ganhos: salvar não lança, os dados ficam em memória e a sincronização é agendada', async () => {
    await expect(storage.salvarGanhoLocalmente(ganho('2020-01-10', 120))).resolves.toBeUndefined();
    await expect(storage.carregarGanhosLocais()).resolves.toEqual({ '2020-01-10': ganho('2020-01-10', 120) });
    expect(agendarSync).toHaveBeenCalledTimes(1);

    await storage.substituirGanhosLocais({ '2020-01-11': ganho('2020-01-11', 70) });
    await expect(storage.carregarGanhosLocais()).resolves.toEqual({ '2020-01-11': ganho('2020-01-11', 70) });
  });

  it('meta base: salvar não lança e valor/data continuam disponíveis', async () => {
    await expect(storage.salvarMetaBaseLocal(175)).resolves.toBeUndefined();
    await expect(storage.carregarMetaBaseLocal()).resolves.toBe(175);

    await storage.gravarMetaBaseLocal(190, T1);
    await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 190, atualizadoEm: T1 });
  });

  it('dívidas: salvar e remover funcionam em memória, inclusive tombstones', async () => {
    await storage.salvarDividaLocal(divida('d1'));
    await storage.salvarDividaLocal(divida('d2'));
    await expect(storage.removerDividaLocal('d1')).resolves.toEqual([{ ...divida('d2'), removido: false }]);

    await expect(storage.carregarDividasLocais()).resolves.toEqual([{ ...divida('d2'), removido: false }]);
    const comRemovidas = await storage.carregarDividasLocaisComRemovidas();
    expect(comRemovidas.map((d) => [d.id, d.removido])).toEqual([
      ['d1', true],
      ['d2', false],
    ]);
    expect(agendarSync).toHaveBeenCalledTimes(3);
  });

  it('estado de sync: fica disponível em memória', async () => {
    const estado: EstadoSync = { status: 'ok', ultimaSync: T2 };
    await expect(storage.salvarEstadoSyncPersistido(estado)).resolves.toBeUndefined();
    await expect(storage.carregarEstadoSyncPersistido()).resolves.toEqual(estado);
  });

  it('limparDadosLocais não lança e zera o cache em memória mesmo se multiRemove falhar', async () => {
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 120));
    await storage.salvarDividaLocal(divida('d1'));
    await storage.salvarMetaBaseLocal(175);
    await storage.salvarEstadoSyncPersistido({ status: 'ok', ultimaSync: T2 });

    await expect(storage.limparDadosLocais()).resolves.toBeUndefined();

    await expect(storage.carregarGanhosLocais()).resolves.toEqual({});
    await expect(storage.carregarDividasLocaisComRemovidas()).resolves.toEqual([]);
    await expect(storage.carregarMetaBaseComData()).resolves.toEqual({ metaBase: 100, atualizadoEm: null });
    await expect(storage.carregarEstadoSyncPersistido()).resolves.toBeNull();
  });
});

describe('fallback em memória quando só a escrita falha (leitura funciona)', () => {
  // Regressão: quando setItem falhava mas getItem funcionava, o valor antigo do disco
  // sobrescrevia o valor mais novo que só existia no cache em memória.
  it('mantém o ganho mais recente salvo só em memória', async () => {
    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 100));
    AsyncStorage.setItem.mockRejectedValue(new Error('database or disk is full'));

    await storage.salvarGanhoLocalmente(ganho('2020-01-10', 200, T2));

    expect((await storage.carregarGanhosLocais())['2020-01-10'].valor).toBe(200);
  });

  it('não perde dívidas salvas só em memória ao salvar a próxima', async () => {
    await storage.salvarDividaLocal(divida('x'));
    AsyncStorage.setItem.mockRejectedValue(new Error('database or disk is full'));

    await storage.salvarDividaLocal(divida('a'));
    const lista = await storage.salvarDividaLocal(divida('b'));

    expect(lista.map((d) => d.id)).toEqual(['x', 'a', 'b']);
  });
});
