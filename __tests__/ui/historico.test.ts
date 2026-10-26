// Testes de src/utils/historico.ts (LIMITE_HISTORICO, siglaDoDiaISO, montarHistoricoGanhos).
// É a lista exibida em "Histórico de Registros" (HistoricoRegistros, via useDadosApp).
//
// Datas sempre no formato ISO local (YYYY-MM-DD); siglaDoDiaISO lê o dia ao meio-dia local,
// então os resultados não dependem do fuso horário da máquina.

import type { RegistroGanhoLocal } from '../../src/types';
import { gerarEstruturaSemana, SIGLAS_DIAS, toISOLocal } from '../../src/utils/datas';
import { LIMITE_HISTORICO, montarHistoricoGanhos, siglaDoDiaISO } from '../../src/utils/historico';

// ─── Auxiliares ───────────────────────────────────────────────────────────────

function registro(dataISO: string, extra: Partial<RegistroGanhoLocal> = {}): RegistroGanhoLocal {
  return {
    dataISO,
    valor: 120,
    metaDoDia: 100,
    percentual: 100,
    atualizadoEm: '2026-10-21T13:00:00.000Z',
    ...extra,
  };
}

const mapaDe = (...registros: RegistroGanhoLocal[]): Record<string, RegistroGanhoLocal> =>
  Object.fromEntries(registros.map((r) => [r.dataISO, r]));

/** `quantidade` dias consecutivos a partir de `inicio` (construtor local, sem fuso). */
function diasConsecutivos(inicio: Date, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) =>
    toISOLocal(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i))
  );
}

const datasDe = (lista: RegistroGanhoLocal[]) => lista.map((r) => r.dataISO);

// ─── LIMITE_HISTORICO ─────────────────────────────────────────────────────────

describe('LIMITE_HISTORICO', () => {
  it('limita o histórico aos 30 registros mais recentes', () => {
    expect(LIMITE_HISTORICO).toBe(30);
  });
});

// ─── siglaDoDiaISO ────────────────────────────────────────────────────────────

describe('siglaDoDiaISO', () => {
  it.each([
    ['2026-10-19', 'Seg'],
    ['2026-10-20', 'Ter'],
    ['2026-10-21', 'Qua'],
    ['2026-10-22', 'Qui'],
    ['2026-10-23', 'Sex'],
    ['2026-10-24', 'Sáb'],
    ['2026-10-25', 'Dom'],
    ['2026-10-26', 'Seg'],
  ])('%s → %s', (dataISO, sigla) => {
    expect(siglaDoDiaISO(dataISO)).toBe(sigla);
  });

  it.each([
    ['2026-12-31', 'Qui'],
    ['2027-01-01', 'Sex'],
    ['2028-02-29', 'Ter'],
    ['2024-02-29', 'Qui'],
  ])('acerta viradas de ano e 29 de fevereiro: %s → %s', (dataISO, sigla) => {
    expect(siglaDoDiaISO(dataISO)).toBe(sigla);
  });

  it('usa as mesmas siglas de gerarEstruturaSemana (Seg a Dom) em 8 semanas seguidas', () => {
    for (let semana = 0; semana < 8; semana++) {
      const dias = gerarEstruturaSemana(new Date(2026, 9, 21 + semana * 7));
      expect(dias.map((d) => siglaDoDiaISO(d.dataISO))).toEqual(SIGLAS_DIAS);
      expect(dias.map((d) => d.sigla)).toEqual(SIGLAS_DIAS);
    }
  });

  it.each(['', 'abc', '2026-13-45'])('devolve string vazia para data inválida (%j)', (dataISO) => {
    expect(siglaDoDiaISO(dataISO)).toBe('');
  });
});

// ─── montarHistoricoGanhos ────────────────────────────────────────────────────

describe('montarHistoricoGanhos', () => {
  it('devolve lista vazia para um mapa vazio', () => {
    expect(montarHistoricoGanhos({})).toEqual([]);
  });

  it('ordena do mais recente para o mais antigo pela dataISO, independente da ordem de inserção', () => {
    const mapa = mapaDe(
      registro('2026-10-20'),
      registro('2026-10-25'),
      registro('2026-09-30'),
      registro('2026-10-21'),
      registro('2025-12-31')
    );

    expect(datasDe(montarHistoricoGanhos(mapa))).toEqual([
      '2026-10-25',
      '2026-10-21',
      '2026-10-20',
      '2026-09-30',
      '2025-12-31',
    ]);
  });

  it('usa a dataISO do registro (não a chave do mapa) para ordenar', () => {
    const mapa: Record<string, RegistroGanhoLocal> = {
      z: registro('2026-10-01'),
      a: registro('2026-10-03'),
      m: registro('2026-10-02'),
    };

    expect(datasDe(montarHistoricoGanhos(mapa))).toEqual(['2026-10-03', '2026-10-02', '2026-10-01']);
  });

  it(`limita por padrão aos ${LIMITE_HISTORICO} registros mais recentes`, () => {
    const datas = diasConsecutivos(new Date(2026, 8, 1), 40); // 01/09 a 10/10
    const mapa = mapaDe(...datas.map((d) => registro(d)));

    const historico = montarHistoricoGanhos(mapa);

    expect(historico).toHaveLength(30);
    expect(historico[0].dataISO).toBe('2026-10-10');
    expect(historico[29].dataISO).toBe('2026-09-11');
    expect(datasDe(historico)).toEqual([...datas].reverse().slice(0, 30));
  });

  it('respeita um limite personalizado', () => {
    const mapa = mapaDe(...diasConsecutivos(new Date(2026, 9, 1), 10).map((d) => registro(d)));

    expect(datasDe(montarHistoricoGanhos(mapa, 3))).toEqual(['2026-10-10', '2026-10-09', '2026-10-08']);
    expect(montarHistoricoGanhos(mapa, 50)).toHaveLength(10);
  });

  it.each([0, -1, -30])('devolve lista vazia quando o limite é %i', (limite) => {
    const mapa = mapaDe(registro('2026-10-20'), registro('2026-10-21'));
    expect(montarHistoricoGanhos(mapa, limite)).toEqual([]);
  });

  it('preenche a descrição ausente com "Ganho <sigla>", como ao salvar pelo app', () => {
    const semDescricao = registro('2026-10-21');
    const mapa = mapaDe(semDescricao, registro('2026-10-25'), registro('2026-10-19'));

    expect(montarHistoricoGanhos(mapa).map((r) => r.descricao)).toEqual(['Ganho Dom', 'Ganho Qua', 'Ganho Seg']);
    // O objeto original (cache do storage) não é alterado
    expect(semDescricao.descricao).toBeUndefined();
  });

  it('também preenche descrição vazia', () => {
    const [item] = montarHistoricoGanhos(mapaDe(registro('2026-10-24', { descricao: '' })));
    expect(item.descricao).toBe('Ganho Sáb');
  });

  it('mantém a descrição existente e o próprio objeto do registro', () => {
    const comDescricao = registro('2026-10-22', { descricao: 'Corridas da noite' });

    const [item] = montarHistoricoGanhos(mapaDe(comDescricao));

    expect(item).toBe(comDescricao);
    expect(item.descricao).toBe('Corridas da noite');
  });

  it('preserva os demais campos do registro ao preencher a descrição', () => {
    const original = registro('2026-10-23', { valor: 87.5, metaDoDia: 150, percentual: 58 });

    const [item] = montarHistoricoGanhos(mapaDe(original));

    expect(item).toEqual({ ...original, descricao: 'Ganho Sex' });
    expect(item).not.toBe(original);
  });

  it('ignora entradas inválidas (nulas ou sem dataISO em texto)', () => {
    const mapa = {
      '2026-10-20': registro('2026-10-20'),
      nulo: null,
      indefinido: undefined,
      semData: { valor: 10, metaDoDia: 100, percentual: 10, atualizadoEm: 'x' },
      dataNumerica: { ...registro('2026-10-21'), dataISO: 20261021 },
    } as unknown as Record<string, RegistroGanhoLocal>;

    expect(datasDe(montarHistoricoGanhos(mapa))).toEqual(['2026-10-20']);
  });

  it('não altera o mapa recebido', () => {
    const mapa = mapaDe(registro('2026-10-21'), registro('2026-10-19', { descricao: 'Ganho Seg' }));
    const copia = JSON.parse(JSON.stringify(mapa));

    montarHistoricoGanhos(mapa, 1);

    expect(mapa).toEqual(copia);
  });
});
