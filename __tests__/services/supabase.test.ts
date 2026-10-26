// Testes unitários das operações remotas (src/services/supabase.ts).
// `createClient` é substituído por um cliente falso cujo `from()` devolve um builder
// encadeável e "thenable" (como o PostgrestQueryBuilder), controlado por cada teste.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import {
  MSG_BANCO_NAO_CONFIGURADO,
  MSG_OFFLINE,
  MSG_SESSAO_EXPIRADA,
  buscarDividasRemotas,
  buscarGanhosRemotos,
  buscarMetaBaseRemota,
  ehErroOffline,
  salvarDividasRemotas,
  salvarGanhosRemotos,
  salvarMetaBaseRemota,
  supabase,
  traduzirErroRemoto,
  verificarConexao,
} from '../../src/services/supabase';
import type { DividaItem, RegistroGanhoLocal } from '../../src/types';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(),
    auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() },
  })),
}));

interface RespostaSupabase {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

interface ConsultaFalsa extends PromiseLike<RespostaSupabase> {
  select: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  upsert: jest.Mock;
  maybeSingle: jest.Mock;
}

const MSG_PERMISSAO_NEGADA =
  'Permissão negada pelo banco. Verifique se supabase/schema.sql foi executado e se você está logado.';
const MSG_ERRO_GENERICO = 'Erro inesperado ao acessar a nuvem.';
const T1 = '2026-10-20T10:00:00.000Z';
const T2 = '2026-10-21T10:00:00.000Z';
const AGORA = '2026-10-26T12:00:00.000Z';

const from = supabase.from as unknown as jest.Mock;

/** Builder encadeável: cada método devolve o próprio builder; o `await` entrega `resultado()`. */
function criarConsulta(resultado: () => Promise<RespostaSupabase>): ConsultaFalsa {
  const consulta = {
    then<TResult1 = RespostaSupabase, TResult2 = never>(
      aoResolver?: ((valor: RespostaSupabase) => TResult1 | PromiseLike<TResult1>) | null,
      aoRejeitar?: ((motivo: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): PromiseLike<TResult1 | TResult2> {
      return resultado().then(aoResolver, aoRejeitar);
    },
  } as ConsultaFalsa;
  for (const metodo of ['select', 'eq', 'order', 'upsert', 'maybeSingle'] as const) {
    consulta[metodo] = jest.fn(() => consulta);
  }
  return consulta;
}

const responder = (resposta: RespostaSupabase) => criarConsulta(() => Promise.resolve(resposta));
const rejeitar = (erro: unknown) => criarConsulta(() => Promise.reject(erro));
const nuncaResponder = () => criarConsulta(() => new Promise<RespostaSupabase>(() => undefined));

function usarConsulta(consulta: ConsultaFalsa): ConsultaFalsa {
  from.mockReturnValue(consulta);
  return consulta;
}

const ganhoExemplo: RegistroGanhoLocal = {
  dataISO: '2026-10-20',
  valor: 150.5,
  metaDoDia: 100,
  percentual: 100,
  descricao: 'Corridas',
  atualizadoEm: T1,
};

const dividaExemplo: DividaItem = {
  id: 'd1',
  descricao: 'Aluguel',
  valor: 1200,
  tipo: 'mensal',
  dataLancamento: '2026-10-01',
  atualizadoEm: T1,
};

beforeEach(() => {
  from.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('cliente supabase', () => {
  it('é criado uma única vez, com a sessão persistida no AsyncStorage', () => {
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\//), expect.any(String), {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    expect(supabase).toBe(jest.mocked(createClient).mock.results[0].value);
  });

  it('renova o token apenas com o app em primeiro plano (AppState)', () => {
    const registro = jest.mocked(AppState.addEventListener).mock.calls.find(([evento]) => evento === 'change');
    expect(registro).toBeDefined();
    const aoMudarEstado = registro![1];

    aoMudarEstado('active');
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(supabase.auth.stopAutoRefresh).not.toHaveBeenCalled();

    aoMudarEstado('background');
    aoMudarEstado('inactive');
    expect(supabase.auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
    expect(supabase.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('traduzirErroRemoto', () => {
  it.each([
    [
      'código PGRST205 (tabela fora do schema cache)',
      { code: 'PGRST205', message: "Could not find the table 'public.ganhos' in the schema cache" },
      MSG_BANCO_NAO_CONFIGURADO,
    ],
    ['mensagem "schema cache" sem código', { message: 'Could not find the table in the schema cache' }, MSG_BANCO_NAO_CONFIGURADO],
    ['relação inexistente', { code: '42P01', message: 'relation "public.ganhos" does not exist' }, MSG_BANCO_NAO_CONFIGURADO],
    ['HTTP 401', { status: 401, message: 'Unauthorized' }, MSG_SESSAO_EXPIRADA],
    ['código PGRST301', { code: 'PGRST301', message: 'JWSError JWSInvalidSignature' }, MSG_SESSAO_EXPIRADA],
    ['JWT expirado', { message: 'JWT expired' }, MSG_SESSAO_EXPIRADA],
    ['token inválido', { message: 'Invalid token' }, MSG_SESSAO_EXPIRADA],
    ['RLS pelo código 42501', { code: '42501', message: 'permission denied for table ganhos' }, MSG_PERMISSAO_NEGADA],
    [
      'RLS pela mensagem',
      { message: 'new row violates row-level security policy for table "ganhos"' },
      MSG_PERMISSAO_NEGADA,
    ],
    ['"Network request failed"', new TypeError('Network request failed'), MSG_OFFLINE],
    ['"Failed to fetch"', { message: 'TypeError: Failed to fetch' }, MSG_OFFLINE],
    ['"fetch failed"', { message: 'fetch failed' }, MSG_OFFLINE],
    ['"timeout"', { message: 'Request timeout' }, MSG_OFFLINE],
    ['"tempo limite"', new Error('Tempo limite ao conectar com a nuvem (timeout).'), MSG_OFFLINE],
    ['AbortError', { name: 'AbortError', message: 'The operation was aborted.' }, MSG_OFFLINE],
  ])('classifica %s', (_caso, erro, esperado) => {
    expect(traduzirErroRemoto(erro)).toBe(esperado);
  });

  it('dá prioridade a "banco não configurado" sobre os demais sinais', () => {
    expect(traduzirErroRemoto({ code: 'PGRST205', status: 401, message: 'fetch failed' })).toBe(
      MSG_BANCO_NAO_CONFIGURADO
    );
  });

  it('devolve a mensagem original quando não reconhece o erro', () => {
    expect(traduzirErroRemoto({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(
      'duplicate key value violates unique constraint'
    );
  });

  it.each([
    ['objeto sem mensagem', {}],
    ['null', null],
    ['undefined', undefined],
    ['string solta', 'falhou'],
  ])('usa mensagem genérica para %s', (_caso, erro) => {
    expect(traduzirErroRemoto(erro)).toBe(MSG_ERRO_GENERICO);
  });
});

describe('ehErroOffline', () => {
  it('reconhece a mensagem traduzida de falta de rede', () => {
    expect(ehErroOffline(MSG_OFFLINE)).toBe(true);
    expect(ehErroOffline(traduzirErroRemoto(new TypeError('Network request failed')))).toBe(true);
  });

  it.each([MSG_BANCO_NAO_CONFIGURADO, MSG_SESSAO_EXPIRADA, MSG_PERMISSAO_NEGADA, '', 'Network request failed'])(
    'não considera offline a mensagem "%s"',
    (mensagem) => {
      expect(ehErroOffline(mensagem)).toBe(false);
    }
  );
});

describe('verificarConexao', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('consulta configuracoes só com HEAD + count e responde online', async () => {
    const consulta = usarConsulta(responder({ data: null, error: null, count: 0 }));

    await expect(verificarConexao()).resolves.toEqual({ online: true });

    expect(from).toHaveBeenCalledWith('configuracoes');
    expect(consulta.select).toHaveBeenCalledWith('user_id', { count: 'exact', head: true });
  });

  it.each([
    ['tabela inexistente (PGRST205)', { code: 'PGRST205', message: 'schema cache' }, MSG_BANCO_NAO_CONFIGURADO],
    ['não autorizado (401)', { status: 401, message: 'Unauthorized' }, MSG_SESSAO_EXPIRADA],
    ['falha de rede', { message: 'TypeError: Network request failed' }, MSG_OFFLINE],
  ])('responde offline com motivo traduzido quando o Supabase devolve %s', async (_caso, erro, motivo) => {
    usarConsulta(responder({ data: null, error: erro }));
    await expect(verificarConexao()).resolves.toEqual({ online: false, motivo });
  });

  it('não lança quando a consulta rejeita', async () => {
    usarConsulta(rejeitar(new TypeError('Network request failed')));
    await expect(verificarConexao()).resolves.toEqual({ online: false, motivo: MSG_OFFLINE });
  });

  it('não lança quando o cliente lança de forma síncrona', async () => {
    from.mockImplementation(() => {
      throw new Error('cliente quebrado');
    });
    await expect(verificarConexao()).resolves.toEqual({ online: false, motivo: 'cliente quebrado' });
  });

  it('desiste após 8s sem resposta e informa falta de conexão (timeout)', async () => {
    usarConsulta(nuncaResponder());
    const resultados: Array<{ online: boolean; motivo?: string }> = [];

    void verificarConexao().then((r) => resultados.push(r));
    await jest.advanceTimersByTimeAsync(7999);
    expect(resultados).toEqual([]);

    await jest.advanceTimersByTimeAsync(1);
    expect(resultados).toEqual([{ online: false, motivo: MSG_OFFLINE }]);
  });
});

describe('falhas nunca escapam como exceção (sempre ResultadoServico)', () => {
  const operacoes: Array<[string, () => Promise<unknown>]> = [
    ['salvarGanhosRemotos', () => salvarGanhosRemotos('u1', [ganhoExemplo])],
    ['buscarGanhosRemotos', () => buscarGanhosRemotos('u1')],
    ['salvarDividasRemotas', () => salvarDividasRemotas('u1', [dividaExemplo])],
    ['buscarDividasRemotas', () => buscarDividasRemotas('u1')],
    ['salvarMetaBaseRemota', () => salvarMetaBaseRemota('u1', 150, T1)],
    ['buscarMetaBaseRemota', () => buscarMetaBaseRemota('u1')],
  ];

  describe.each(operacoes)('%s', (_nome, executar) => {
    it('erro PGRST205 vira "banco não configurado"', async () => {
      usarConsulta(responder({ data: null, error: { code: 'PGRST205', message: 'schema cache' } }));
      await expect(executar()).resolves.toEqual({ success: false, error: MSG_BANCO_NAO_CONFIGURADO });
    });

    it('erro 401 vira "sessão expirada"', async () => {
      usarConsulta(responder({ data: null, error: { status: 401, message: 'JWT expired' } }));
      await expect(executar()).resolves.toEqual({ success: false, error: MSG_SESSAO_EXPIRADA });
    });

    it('rejeição de rede vira "sem conexão"', async () => {
      usarConsulta(rejeitar(new TypeError('Network request failed')));
      await expect(executar()).resolves.toEqual({ success: false, error: MSG_OFFLINE });
    });

    it('exceção síncrona do cliente vira falha com a mensagem original', async () => {
      from.mockImplementation(() => {
        throw new Error('cliente quebrado');
      });
      await expect(executar()).resolves.toEqual({ success: false, error: 'cliente quebrado' });
    });
  });
});

describe('salvarGanhosRemotos', () => {
  it('com lista vazia não acessa a nuvem e informa 0 enviados', async () => {
    await expect(salvarGanhosRemotos('u1', [])).resolves.toEqual({ success: true, data: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it('converte para snake_case e faz upsert com onConflict user_id,data_referencia', async () => {
    const consulta = usarConsulta(responder({ data: null, error: null }));

    const resultado = await salvarGanhosRemotos('u1', [
      ganhoExemplo,
      { dataISO: '2026-10-21', valor: 80, metaDoDia: 100, percentual: 80, atualizadoEm: T2 },
    ]);

    expect(from).toHaveBeenCalledWith('ganhos');
    expect(consulta.upsert).toHaveBeenCalledWith(
      [
        {
          user_id: 'u1',
          data_referencia: '2026-10-20',
          valor: 150.5,
          meta_do_dia: 100,
          percentual: 100,
          descricao: 'Corridas',
          atualizado_em: T1,
        },
        {
          user_id: 'u1',
          data_referencia: '2026-10-21',
          valor: 80,
          meta_do_dia: 100,
          percentual: 80,
          descricao: null,
          atualizado_em: T2,
        },
      ],
      { onConflict: 'user_id,data_referencia' }
    );
    expect(resultado).toEqual({ success: true, data: 2 });
  });

  it('preenche atualizado_em com o horário atual quando o registro não tem data', async () => {
    jest.useFakeTimers({ now: new Date(AGORA) });
    const consulta = usarConsulta(responder({ data: null, error: null }));

    await salvarGanhosRemotos('u1', [{ ...ganhoExemplo, atualizadoEm: '' }]);

    expect(consulta.upsert.mock.calls[0][0][0].atualizado_em).toBe(AGORA);
  });
});

describe('buscarGanhosRemotos', () => {
  it('filtra pelo usuário, ordena por data e converte snake_case para o formato do app', async () => {
    const consulta = usarConsulta(
      responder({
        error: null,
        data: [
          {
            user_id: 'u1',
            data_referencia: '2026-10-20',
            valor: '150.50',
            meta_do_dia: '100.00',
            percentual: '100.00',
            descricao: 'Corridas',
            atualizado_em: T1,
          },
          {
            user_id: 'u1',
            data_referencia: '2026-10-21',
            valor: 80,
            meta_do_dia: null,
            percentual: null,
            descricao: null,
            atualizado_em: T2,
          },
        ],
      })
    );

    await expect(buscarGanhosRemotos('u1')).resolves.toEqual({
      success: true,
      data: [
        ganhoExemplo,
        { dataISO: '2026-10-21', valor: 80, metaDoDia: 0, percentual: 0, descricao: undefined, atualizadoEm: T2 },
      ],
    });
    expect(from).toHaveBeenCalledWith('ganhos');
    expect(consulta.select).toHaveBeenCalledWith(
      'user_id,data_referencia,valor,meta_do_dia,percentual,descricao,atualizado_em'
    );
    expect(consulta.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(consulta.order).toHaveBeenCalledWith('data_referencia', { ascending: true });
  });

  it('valor numérico inválido vira 0', async () => {
    usarConsulta(
      responder({
        error: null,
        data: [
          {
            user_id: 'u1',
            data_referencia: '2026-10-20',
            valor: 'abc',
            meta_do_dia: 'x',
            percentual: 'y',
            descricao: null,
            atualizado_em: T1,
          },
        ],
      })
    );
    const resultado = await buscarGanhosRemotos('u1');
    expect(resultado).toEqual({
      success: true,
      data: [expect.objectContaining({ valor: 0, metaDoDia: 0, percentual: 0 })],
    });
  });

  it('resposta sem data vira lista vazia', async () => {
    usarConsulta(responder({ data: null, error: null }));
    await expect(buscarGanhosRemotos('u1')).resolves.toEqual({ success: true, data: [] });
  });
});

describe('salvarDividasRemotas', () => {
  it('com lista vazia não acessa a nuvem e informa 0 enviadas', async () => {
    await expect(salvarDividasRemotas('u1', [])).resolves.toEqual({ success: true, data: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it('converte para snake_case (tombstones inclusos) e faz upsert com onConflict user_id,id', async () => {
    const consulta = usarConsulta(responder({ data: null, error: null }));

    const resultado = await salvarDividasRemotas('u1', [
      dividaExemplo,
      {
        id: 'd2',
        descricao: 'Pneu',
        valor: 300,
        tipo: 'imprevista',
        frequenciaImprevisto: 'anual',
        dataLancamento: '',
        atualizadoEm: T2,
        removido: true,
      },
    ]);

    expect(from).toHaveBeenCalledWith('dividas');
    expect(consulta.upsert).toHaveBeenCalledWith(
      [
        {
          id: 'd1',
          user_id: 'u1',
          descricao: 'Aluguel',
          valor: 1200,
          tipo: 'mensal',
          frequencia_imprevisto: null,
          data_lancamento: '2026-10-01',
          removido: false,
          atualizado_em: T1,
        },
        {
          id: 'd2',
          user_id: 'u1',
          descricao: 'Pneu',
          valor: 300,
          tipo: 'imprevista',
          frequencia_imprevisto: 'anual',
          data_lancamento: null,
          removido: true,
          atualizado_em: T2,
        },
      ],
      { onConflict: 'user_id,id' }
    );
    expect(resultado).toEqual({ success: true, data: 2 });
  });

  it('preenche atualizado_em com o horário atual quando a dívida não tem data', async () => {
    jest.useFakeTimers({ now: new Date(AGORA) });
    const consulta = usarConsulta(responder({ data: null, error: null }));

    await salvarDividasRemotas('u1', [{ ...dividaExemplo, atualizadoEm: undefined }]);

    expect(consulta.upsert.mock.calls[0][0][0].atualizado_em).toBe(AGORA);
  });
});

describe('buscarDividasRemotas', () => {
  it('filtra pelo usuário, traz também os tombstones e converte para o formato do app', async () => {
    const consulta = usarConsulta(
      responder({
        error: null,
        data: [
          {
            id: 'd1',
            user_id: 'u1',
            descricao: 'Aluguel',
            valor: '1200.00',
            tipo: 'mensal',
            frequencia_imprevisto: null,
            data_lancamento: '2026-10-01',
            removido: false,
            atualizado_em: T1,
          },
          {
            id: 'd2',
            user_id: 'u1',
            descricao: 'Pneu',
            valor: 'xyz',
            tipo: 'imprevista',
            frequencia_imprevisto: 'anual',
            data_lancamento: null,
            removido: true,
            atualizado_em: T2,
          },
        ],
      })
    );

    await expect(buscarDividasRemotas('u1')).resolves.toEqual({
      success: true,
      data: [
        { ...dividaExemplo, frequenciaImprevisto: undefined, removido: false },
        {
          id: 'd2',
          descricao: 'Pneu',
          valor: 0,
          tipo: 'imprevista',
          frequenciaImprevisto: 'anual',
          dataLancamento: '',
          atualizadoEm: T2,
          removido: true,
        },
      ],
    });
    expect(from).toHaveBeenCalledWith('dividas');
    expect(consulta.select).toHaveBeenCalledWith(
      'id,user_id,descricao,valor,tipo,frequencia_imprevisto,data_lancamento,removido,atualizado_em'
    );
    expect(consulta.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('resposta sem data vira lista vazia', async () => {
    usarConsulta(responder({ data: null, error: null }));
    await expect(buscarDividasRemotas('u1')).resolves.toEqual({ success: true, data: [] });
  });
});

describe('salvarMetaBaseRemota', () => {
  it('faz upsert em configuracoes com snake_case e onConflict user_id', async () => {
    const consulta = usarConsulta(responder({ data: null, error: null }));

    await expect(salvarMetaBaseRemota('u1', 150, T1)).resolves.toEqual({ success: true, data: undefined });

    expect(from).toHaveBeenCalledWith('configuracoes');
    expect(consulta.upsert).toHaveBeenCalledWith(
      { user_id: 'u1', meta_base: 150, atualizado_em: T1 },
      { onConflict: 'user_id' }
    );
  });
});

describe('buscarMetaBaseRemota', () => {
  it('busca a linha do usuário com maybeSingle e converte para o formato do app', async () => {
    const consulta = usarConsulta(responder({ error: null, data: { meta_base: '150.00', atualizado_em: T1 } }));

    await expect(buscarMetaBaseRemota('u1')).resolves.toEqual({
      success: true,
      data: { metaBase: 150, atualizadoEm: T1 },
    });

    expect(from).toHaveBeenCalledWith('configuracoes');
    expect(consulta.select).toHaveBeenCalledWith('meta_base,atualizado_em');
    expect(consulta.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(consulta.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('devolve data null quando o usuário ainda não tem configuração na nuvem', async () => {
    usarConsulta(responder({ data: null, error: null }));
    await expect(buscarMetaBaseRemota('u1')).resolves.toEqual({ success: true, data: null });
  });

  it.each([0, null, 'abc'])('meta_base inválida (%p) cai no padrão 100', async (metaBase) => {
    usarConsulta(responder({ error: null, data: { meta_base: metaBase, atualizado_em: T1 } }));
    await expect(buscarMetaBaseRemota('u1')).resolves.toEqual({
      success: true,
      data: { metaBase: 100, atualizadoEm: T1 },
    });
  });
});
