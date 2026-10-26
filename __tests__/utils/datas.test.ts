// Testes unitários de src/utils/datas.ts (SIGLAS_DIAS, toISOLocal, formatarDataExibicao, formatarDiaCompleto,
// obterSegundaDaSemana, gerarEstruturaSemana, formatarPeriodo, gerarSemanasDoMes).
//
// Todas as datas são construídas com o construtor local `new Date(ano, mêsIndexado0, dia)` e as asserções só
// usam getters locais, então os resultados não dependem do fuso horário da máquina (TZ).
// Nenhuma função testada lê o relógio do sistema: "hoje" é sempre passado como argumento.
//
// Convenções:
//  - O travessão usado pelo código é o EN DASH (U+2013) e é verificado explicitamente.

import type { GanhoDia, RegistroGanhoLocal, SemanaMesInfo } from '../../src/types';
import { META_DIARIA_PADRAO } from '../../src/utils/amortizacao';
import {
  SIGLAS_DIAS,
  formatarDataExibicao,
  formatarDiaCompleto,
  formatarPeriodo,
  gerarEstruturaSemana,
  gerarSemanasDoMes,
  somarGanhosDoMes,
  obterSegundaDaSemana,
  toISOLocal,
} from '../../src/utils/datas';

const ABREVIACOES_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ─── Auxiliares ───────────────────────────────────────────────────────────────────────────────────────────────

const isoDe = (dias: GanhoDia[]): string[] => dias.map((d) => d.dataISO);

const dividirISO = (iso: string): [number, number, number] => {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return [ano, mes, dia];
};

/** Soma dias a uma data ISO usando aritmética de calendário local. */
const somarDiasISO = (iso: string, dias: number): string => {
  const [ano, mes, dia] = dividirISO(iso);
  return toISOLocal(new Date(ano, mes - 1, dia + dias));
};

const diaDaSemanaDeISO = (iso: string): number => {
  const [ano, mes, dia] = dividirISO(iso);
  return new Date(ano, mes - 1, dia).getDay();
};

/** Diferença em dias de calendário (a - b), imune a horário de verão porque usa Date.UTC dos componentes locais. */
const diferencaEmDias = (a: Date, b: Date): number =>
  Math.round(
    (Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86_400_000
  );

const registro = (dataISO: string, valor: number): RegistroGanhoLocal => ({
  dataISO,
  valor,
  metaDoDia: 100,
  percentual: 0,
  atualizadoEm: '2026-10-21T12:00:00.000Z',
});

const ganhosDe = (...registros: RegistroGanhoLocal[]): Record<string, RegistroGanhoLocal> =>
  Object.fromEntries(registros.map((r) => [r.dataISO, r]));

/** Semanas do mês consultado (dia 15 como "hoje", só para escolher o mês). */
const semanasDe = (ano: number, mesIndex: number, ganhos: Record<string, RegistroGanhoLocal> = {}): SemanaMesInfo[] =>
  gerarSemanasDoMes(new Date(ano, mesIndex, 15), ganhos);

const intervalos = (semanas: SemanaMesInfo[]): Array<[string, string]> => semanas.map((s) => [s.dataInicioISO, s.dataFimISO]);

const bissexto = (ano: number): boolean => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

const diasNoMes = (ano: number, mes: number): number => [31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];

// ─── Pré-condição do ambiente ──────────────────────────────────────────────────────────────────────────────────

describe('pré-condição do ambiente (ICU pt-BR para datas)', () => {
  // Se estes testes falharem, o Node está sem dados de locale pt-BR e os testes de texto de data perdem o sentido.
  it('toLocaleDateString pt-BR devolve o nome do dia da semana em português', () => {
    expect(new Date(2026, 9, 21).toLocaleDateString('pt-BR', { weekday: 'long' })).toBe('quarta-feira');
  });

  it('toLocaleDateString pt-BR devolve a abreviação do mês em português', () => {
    expect(new Date(2026, 9, 21).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')).toBe('out');
  });
});

// ─── SIGLAS_DIAS ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('SIGLAS_DIAS', () => {
  it('lista as siglas de segunda a domingo', () => {
    expect(SIGLAS_DIAS).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
  });

  it('tem 7 siglas distintas', () => {
    expect(SIGLAS_DIAS).toHaveLength(7);
    expect(new Set(SIGLAS_DIAS).size).toBe(7);
  });

  it('a sigla de sábado é acentuada com "á" pré-composto (U+00E1)', () => {
    expect(SIGLAS_DIAS[5]).toBe('Sáb');
    expect(SIGLAS_DIAS[5].charCodeAt(1)).toBe(0x00e1);
  });

  it('cada sigla tem 3 letras', () => {
    SIGLAS_DIAS.forEach((sigla) => expect(sigla).toHaveLength(3));
  });

  it('é indexável pelo dia da semana do JavaScript (getDay): índice = (getDay() + 6) % 7', () => {
    const esperadoPorGetDay: Record<number, string> = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };
    for (let dia = 19; dia <= 25; dia++) {
      const data = new Date(2026, 9, dia);
      expect(SIGLAS_DIAS[(data.getDay() + 6) % 7]).toBe(esperadoPorGetDay[data.getDay()]);
    }
  });
});

// ─── toISOLocal ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('toISOLocal', () => {
  const casos: Array<[string, Date, string]> = [
    ['21/10/2026', new Date(2026, 9, 21), '2026-10-21'],
    ['5/1/2026 (preenche com zero)', new Date(2026, 0, 5), '2026-01-05'],
    ['9/9/2026 (mês e dia com um dígito)', new Date(2026, 8, 9), '2026-09-09'],
    ['31/12/2026 (último dia do ano)', new Date(2026, 11, 31), '2026-12-31'],
    ['1/1/2027 (primeiro dia do ano)', new Date(2027, 0, 1), '2027-01-01'],
    ['29/2/2024 (dia bissexto)', new Date(2024, 1, 29), '2024-02-29'],
    ['1/3/2024 (dia seguinte ao bissexto)', new Date(2024, 2, 1), '2024-03-01'],
    ['1/1/2000', new Date(2000, 0, 1), '2000-01-01'],
  ];

  it.each(casos)('formata %s como YYYY-MM-DD', (_descricao, data, esperado) => {
    expect(toISOLocal(data)).toBe(esperado);
  });

  it('usa o dia local e ignora a hora: 00:00:00.000 e 23:59:59.999 geram a mesma data', () => {
    expect(toISOLocal(new Date(2026, 9, 21, 0, 0, 0, 0))).toBe('2026-10-21');
    expect(toISOLocal(new Date(2026, 9, 21, 12, 30, 0, 0))).toBe('2026-10-21');
    expect(toISOLocal(new Date(2026, 9, 21, 23, 59, 59, 999))).toBe('2026-10-21');
  });

  it('o primeiro instante do dia seguinte já pertence ao dia seguinte', () => {
    expect(toISOLocal(new Date(2026, 9, 22, 0, 0, 0, 0))).toBe('2026-10-22');
    expect(toISOLocal(new Date(2026, 11, 31, 23, 59, 59, 999))).toBe('2026-12-31');
    expect(toISOLocal(new Date(2027, 0, 1, 0, 0, 0, 0))).toBe('2027-01-01');
  });

  it('não altera a data recebida', () => {
    const data = new Date(2026, 9, 21, 15, 45, 30, 123);
    const antes = data.getTime();
    toISOLocal(data);
    expect(data.getTime()).toBe(antes);
  });

  it('tem sempre o formato AAAA-MM-DD (10 caracteres) para anos de 4 dígitos', () => {
    for (const data of [new Date(2026, 0, 1), new Date(2026, 5, 15), new Date(2026, 11, 31), new Date(1999, 6, 4)]) {
      expect(toISOLocal(data)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it.each([2000, 2024, 2026, 2100])(
    'confere todos os dias de %i contra um contador de calendário independente (inclui regra de ano bissexto)',
    (ano) => {
      const divergencias: string[] = [];
      let anterior = '';
      for (let mes = 1; mes <= 12; mes++) {
        for (let dia = 1; dia <= diasNoMes(ano, mes); dia++) {
          const esperado = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
          const real = toISOLocal(new Date(ano, mes - 1, dia));
          if (real !== esperado) divergencias.push(`${esperado} → ${real}`);
          // a ordem lexicográfica das strings acompanha a ordem cronológica
          if (!(real > anterior)) divergencias.push(`fora de ordem: ${anterior} → ${real}`);
          anterior = real;
        }
      }
      expect(divergencias).toEqual([]);
    }
  );

  it('é inversa da construção por componentes: ISO → new Date(a, m-1, d) → ISO devolve a mesma string', () => {
    ['2026-10-21', '2024-02-29', '2026-01-01', '2026-12-31'].forEach((iso) => {
      const [ano, mes, dia] = dividirISO(iso);
      expect(toISOLocal(new Date(ano, mes - 1, dia))).toBe(iso);
    });
  });

  it('data inválida não lança exceção (devolve "NaN-NaN-NaN")', () => {
    expect(() => toISOLocal(new Date(NaN))).not.toThrow();
    expect(toISOLocal(new Date(NaN))).toBe('NaN-NaN-NaN');
  });
});

// ─── formatarDataExibicao ─────────────────────────────────────────────────────────────────────────────────────

describe('formatarDataExibicao', () => {
  const casosMeses: Array<[number, string]> = ABREVIACOES_MESES.map((abreviacao, indice) => [indice, abreviacao]);

  it.each(casosMeses)('mês de índice %i usa a abreviação "%s"', (mesIndex, abreviacao) => {
    expect(formatarDataExibicao(new Date(2026, mesIndex, 5))).toBe(`5 de ${abreviacao}`);
  });

  it('formata 21/10/2026 como "21 de out"', () => {
    expect(formatarDataExibicao(new Date(2026, 9, 21))).toBe('21 de out');
  });

  it('não preenche o dia com zero à esquerda ("1 de jan", não "01 de jan")', () => {
    expect(formatarDataExibicao(new Date(2026, 0, 1))).toBe('1 de jan');
    expect(formatarDataExibicao(new Date(2026, 2, 9))).toBe('9 de mar');
  });

  it('dias de dois dígitos aparecem inteiros ("31 de dez")', () => {
    expect(formatarDataExibicao(new Date(2026, 11, 31))).toBe('31 de dez');
  });

  it('remove o ponto final da abreviação do mês', () => {
    for (let mes = 0; mes < 12; mes++) {
      expect(formatarDataExibicao(new Date(2026, mes, 15))).not.toContain('.');
    }
  });

  it('segue sempre o padrão "D de mmm" (um ou dois dígitos, "de" e três letras)', () => {
    for (let mes = 0; mes < 12; mes++) {
      expect(formatarDataExibicao(new Date(2026, mes, 28))).toMatch(/^\d{1,2} de [a-zç]{3}$/);
    }
  });

  it('ignora a hora do dia', () => {
    expect(formatarDataExibicao(new Date(2026, 9, 21, 0, 0, 0))).toBe(formatarDataExibicao(new Date(2026, 9, 21, 23, 59, 59)));
  });

  it('29 de fevereiro de ano bissexto existe e é formatado ("29 de fev")', () => {
    expect(formatarDataExibicao(new Date(2024, 1, 29))).toBe('29 de fev');
  });

  it('não altera a data recebida', () => {
    const data = new Date(2026, 9, 21, 10, 0, 0);
    const antes = data.getTime();
    formatarDataExibicao(data);
    expect(data.getTime()).toBe(antes);
  });

  it('data inválida não lança exceção', () => {
    expect(() => formatarDataExibicao(new Date(NaN))).not.toThrow();
  });
});

// ─── formatarDiaCompleto ──────────────────────────────────────────────────────────────────────────────────────

describe('formatarDiaCompleto', () => {
  const semana: Array<[number, string]> = [
    [19, 'Segunda-feira, 19 de out'],
    [20, 'Terça-feira, 20 de out'],
    [21, 'Quarta-feira, 21 de out'],
    [22, 'Quinta-feira, 22 de out'],
    [23, 'Sexta-feira, 23 de out'],
    [24, 'Sábado, 24 de out'],
    [25, 'Domingo, 25 de out'],
  ];

  it.each(semana)('dia %i/10/2026 → %p', (dia, esperado) => {
    expect(formatarDiaCompleto(new Date(2026, 9, dia))).toBe(esperado);
  });

  it('começa com letra maiúscula e mantém o restante do nome em minúsculas', () => {
    for (let dia = 19; dia <= 25; dia++) {
      const texto = formatarDiaCompleto(new Date(2026, 9, dia));
      const nomeDoDia = texto.split(',')[0];
      expect(nomeDoDia.charAt(0)).toBe(nomeDoDia.charAt(0).toUpperCase());
      expect(nomeDoDia.slice(1)).toBe(nomeDoDia.slice(1).toLowerCase());
    }
  });

  it('termina sempre com a mesma data devolvida por formatarDataExibicao, separada por ", "', () => {
    for (let dia = 1; dia <= 31; dia++) {
      const data = new Date(2026, 9, dia);
      expect(formatarDiaCompleto(data).endsWith(`, ${formatarDataExibicao(data)}`)).toBe(true);
    }
  });

  it('funciona na virada de mês e de ano', () => {
    expect(formatarDiaCompleto(new Date(2026, 9, 31))).toBe('Sábado, 31 de out');
    expect(formatarDiaCompleto(new Date(2026, 10, 1))).toBe('Domingo, 1 de nov');
    expect(formatarDiaCompleto(new Date(2026, 11, 31))).toBe('Quinta-feira, 31 de dez');
    expect(formatarDiaCompleto(new Date(2027, 0, 1))).toBe('Sexta-feira, 1 de jan');
  });

  it('funciona em 29 de fevereiro de ano bissexto', () => {
    expect(formatarDiaCompleto(new Date(2024, 1, 29))).toBe('Quinta-feira, 29 de fev');
  });

  it('a hora não muda o resultado', () => {
    expect(formatarDiaCompleto(new Date(2026, 9, 21, 23, 59, 59))).toBe('Quarta-feira, 21 de out');
  });

  it('data inválida não lança exceção', () => {
    expect(() => formatarDiaCompleto(new Date(NaN))).not.toThrow();
  });
});

// ─── obterSegundaDaSemana ────────────────────────────────────────────────────────────────────────────────────────

describe('obterSegundaDaSemana', () => {
  const casos: Array<[string, Date, string]> = [
    ['segunda 19/10/2026', new Date(2026, 9, 19), '2026-10-19'],
    ['terça 20/10/2026', new Date(2026, 9, 20), '2026-10-19'],
    ['quarta 21/10/2026', new Date(2026, 9, 21), '2026-10-19'],
    ['quinta 22/10/2026', new Date(2026, 9, 22), '2026-10-19'],
    ['sexta 23/10/2026', new Date(2026, 9, 23), '2026-10-19'],
    ['sábado 24/10/2026', new Date(2026, 9, 24), '2026-10-19'],
    ['domingo 25/10/2026', new Date(2026, 9, 25), '2026-10-19'],
    ['segunda seguinte 26/10/2026', new Date(2026, 9, 26), '2026-10-26'],
    ['domingo 01/11/2026 (cruza o mês)', new Date(2026, 10, 1), '2026-10-26'],
    ['domingo 01/03/2026 (cruza fevereiro)', new Date(2026, 2, 1), '2026-02-23'],
    ['domingo 01/02/2026', new Date(2026, 1, 1), '2026-01-26'],
    ['quinta 01/01/2026 (cruza o ano)', new Date(2026, 0, 1), '2025-12-29'],
    ['sexta 01/01/2027 (cruza o ano)', new Date(2027, 0, 1), '2026-12-28'],
    ['quinta 29/02/2024 (bissexto)', new Date(2024, 1, 29), '2024-02-26'],
    ['sexta 01/03/2024 (após o bissexto)', new Date(2024, 2, 1), '2024-02-26'],
  ];

  it.each(casos)('%s → segunda %s', (_descricao, data, segundaEsperada) => {
    expect(toISOLocal(obterSegundaDaSemana(data))).toBe(segundaEsperada);
  });

  it('o domingo pertence à semana que termina nele: devolve a segunda ANTERIOR, nunca a seguinte', () => {
    const segunda = obterSegundaDaSemana(new Date(2026, 9, 25));
    expect(toISOLocal(segunda)).toBe('2026-10-19');
    expect(segunda.getTime()).toBeLessThan(new Date(2026, 9, 25).getTime());
  });

  it('a segunda-feira devolve ela mesma, à meia-noite', () => {
    const segunda = obterSegundaDaSemana(new Date(2026, 9, 19, 18, 30));
    expect(toISOLocal(segunda)).toBe('2026-10-19');
    expect(segunda.getHours()).toBe(0);
  });

  it('zera horas, minutos, segundos e milissegundos', () => {
    const segunda = obterSegundaDaSemana(new Date(2026, 9, 21, 15, 45, 30, 123));
    expect([segunda.getHours(), segunda.getMinutes(), segunda.getSeconds(), segunda.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  it('o resultado é sempre uma segunda-feira (getDay() === 1)', () => {
    for (let dia = 1; dia <= 31; dia++) {
      expect(obterSegundaDaSemana(new Date(2026, 9, dia)).getDay()).toBe(1);
    }
  });

  it('não altera a data recebida e devolve uma nova instância (mesmo quando já é segunda)', () => {
    const entrada = new Date(2026, 9, 19, 9, 0, 0);
    const antes = entrada.getTime();
    const saida = obterSegundaDaSemana(entrada);
    expect(entrada.getTime()).toBe(antes);
    expect(saida).not.toBe(entrada);
  });

  it.each([2024, 2026])('em todos os dias de %i: o resultado é uma segunda-feira, nunca posterior ao dia e a no máximo 6 dias dele', (ano) => {
    const violacoes: string[] = [];
    for (let mes = 1; mes <= 12; mes++) {
      for (let dia = 1; dia <= diasNoMes(ano, mes); dia++) {
        const entrada = new Date(ano, mes - 1, dia, 13, 37);
        const segunda = obterSegundaDaSemana(entrada);
        const distancia = diferencaEmDias(entrada, segunda);
        if (segunda.getDay() !== 1) violacoes.push(`${ano}-${mes}-${dia}: não é segunda`);
        if (distancia < 0 || distancia > 6) violacoes.push(`${ano}-${mes}-${dia}: distância ${distancia}`);
        if (segunda.getHours() !== 0) violacoes.push(`${ano}-${mes}-${dia}: não está à meia-noite`);
      }
    }
    expect(violacoes).toEqual([]);
  });

  it('todos os dias de uma mesma semana (Seg a Dom) levam à mesma segunda-feira', () => {
    const segundas = new Set<string>();
    for (let dia = 19; dia <= 25; dia++) segundas.add(toISOLocal(obterSegundaDaSemana(new Date(2026, 9, dia))));
    expect([...segundas]).toEqual(['2026-10-19']);
  });

  it('data inválida não lança exceção e devolve data inválida', () => {
    let resultado: Date | undefined;
    expect(() => {
      resultado = obterSegundaDaSemana(new Date(NaN));
    }).not.toThrow();
    expect(Number.isNaN(resultado!.getTime())).toBe(true);
  });
});

// ─── gerarEstruturaSemana ────────────────────────────────────────────────────────────────────────────────────────

describe('gerarEstruturaSemana', () => {
  const hoje = new Date(2026, 9, 21); // quarta-feira, 21/10/2026
  const SEMANA_OUT = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];

  it('devolve 7 dias, de segunda a domingo, com as siglas de SIGLAS_DIAS', () => {
    const semana = gerarEstruturaSemana(hoje);
    expect(semana).toHaveLength(7);
    expect(semana.map((d) => d.sigla)).toEqual(SIGLAS_DIAS);
  });

  it('as datas ISO são consecutivas e começam na segunda-feira da semana de "hoje"', () => {
    expect(isoDe(gerarEstruturaSemana(hoje))).toEqual(SEMANA_OUT);
  });

  it('preenche dataExibicao e diaCompleto de cada dia', () => {
    const semana = gerarEstruturaSemana(hoje);
    expect(semana.map((d) => d.dataExibicao)).toEqual(['19 de out', '20 de out', '21 de out', '22 de out', '23 de out', '24 de out', '25 de out']);
    expect(semana.map((d) => d.diaCompleto)).toEqual([
      'Segunda-feira, 19 de out',
      'Terça-feira, 20 de out',
      'Quarta-feira, 21 de out',
      'Quinta-feira, 22 de out',
      'Sexta-feira, 23 de out',
      'Sábado, 24 de out',
      'Domingo, 25 de out',
    ]);
  });

  it('cada dia nasce zerado e pendente, com a meta padrão', () => {
    gerarEstruturaSemana(hoje).forEach((dia) => {
      expect(dia.valor).toBe(0);
      expect(dia.valorCoberto).toBe(0);
      expect(dia.metaBase).toBe(META_DIARIA_PADRAO);
      expect(dia.percentual).toBe(0);
      expect(dia.statusAmortizacao).toBe('pendente');
      expect(dia.detalheAmortizacao).toBe('0%');
      expect(dia.temRegistro).toBe(false);
    });
  });

  it('cada dia tem exatamente os campos de GanhoDia', () => {
    const chavesEsperadas = [
      'data',
      'dataExibicao',
      'dataISO',
      'detalheAmortizacao',
      'diaCompleto',
      'isHoje',
      'metaBase',
      'percentual',
      'sigla',
      'statusAmortizacao',
      'temRegistro',
      'valor',
      'valorCoberto',
    ];
    gerarEstruturaSemana(hoje).forEach((dia) => expect(Object.keys(dia).sort()).toEqual(chavesEsperadas));
  });

  describe('marcação de isHoje', () => {
    it.each(SIGLAS_DIAS.map((sigla, indice): [string, number] => [sigla, indice]))(
      'quando hoje é %s (índice %i), só esse dia tem isHoje',
      (_sigla, indice) => {
        const semana = gerarEstruturaSemana(new Date(2026, 9, 19 + indice));
        expect(semana.filter((d) => d.isHoje)).toHaveLength(1);
        expect(semana[indice].isHoje).toBe(true);
      }
    );

    it('a semana (as 7 datas) é a mesma não importa qual dia dela seja "hoje"', () => {
      for (let dia = 19; dia <= 25; dia++) {
        expect(isoDe(gerarEstruturaSemana(new Date(2026, 9, dia)))).toEqual(SEMANA_OUT);
      }
    });

    it('a hora de "hoje" não muda qual dia é marcado (00:00:00 e 23:59:59.999)', () => {
      const cedo = gerarEstruturaSemana(new Date(2026, 9, 21, 0, 0, 0, 0));
      const tarde = gerarEstruturaSemana(new Date(2026, 9, 21, 23, 59, 59, 999));
      expect(cedo.findIndex((d) => d.isHoje)).toBe(2);
      expect(tarde.findIndex((d) => d.isHoje)).toBe(2);
    });
  });

  describe('viradas de calendário', () => {
    it('semana que cruza o mês (28/10/2026): termina em 1º de novembro', () => {
      const semana = gerarEstruturaSemana(new Date(2026, 9, 28));
      expect(isoDe(semana)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
      expect(semana[0].dataExibicao).toBe('26 de out');
      expect(semana[6].dataExibicao).toBe('1 de nov');
      expect(semana[2].isHoje).toBe(true);
    });

    it('semana que cruza o ano (31/12/2026): termina em 3 de janeiro de 2027', () => {
      const semana = gerarEstruturaSemana(new Date(2026, 11, 31));
      expect(isoDe(semana)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
      expect(semana[3].isHoje).toBe(true);
      expect(semana[6].diaCompleto).toBe('Domingo, 3 de jan');
    });

    it('semana com 29 de fevereiro de ano bissexto (29/02/2024)', () => {
      const semana = gerarEstruturaSemana(new Date(2024, 1, 29));
      expect(isoDe(semana)).toEqual(['2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01', '2024-03-02', '2024-03-03']);
      expect(semana[3].isHoje).toBe(true);
    });

    it('semana sem 29 de fevereiro em ano comum (01/03/2026, domingo)', () => {
      const semana = gerarEstruturaSemana(new Date(2026, 2, 1));
      expect(isoDe(semana)).toEqual(['2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01']);
      expect(semana[6].isHoje).toBe(true);
    });
  });

  describe('objeto Date de cada dia', () => {
    it('data é o início do dia local (00:00:00.000) e bate com dataISO', () => {
      gerarEstruturaSemana(hoje).forEach((dia) => {
        expect(dia.data).toBeInstanceOf(Date);
        expect([dia.data.getHours(), dia.data.getMinutes(), dia.data.getSeconds(), dia.data.getMilliseconds()]).toEqual([0, 0, 0, 0]);
        expect(toISOLocal(dia.data)).toBe(dia.dataISO);
      });
    });

    it('cada dia tem a sua própria instância de Date', () => {
      const instancias = new Set(gerarEstruturaSemana(hoje).map((d) => d.data));
      expect(instancias.size).toBe(7);
    });

    it('dataExibicao e diaCompleto são coerentes com o Date de cada dia', () => {
      gerarEstruturaSemana(hoje).forEach((dia) => {
        expect(dia.dataExibicao).toBe(formatarDataExibicao(dia.data));
        expect(dia.diaCompleto).toBe(formatarDiaCompleto(dia.data));
      });
    });
  });

  describe('isolamento', () => {
    it('não altera o Date recebido como "hoje"', () => {
      const entrada = new Date(2026, 9, 21, 15, 30, 45, 500);
      const antes = entrada.getTime();
      gerarEstruturaSemana(entrada);
      expect(entrada.getTime()).toBe(antes);
    });

    it('cada chamada devolve objetos independentes: alterar um resultado não afeta outro', () => {
      const a = gerarEstruturaSemana(hoje);
      a[0].valor = 999;
      a[0].data.setFullYear(1999);
      const b = gerarEstruturaSemana(hoje);
      expect(b[0].valor).toBe(0);
      expect(b[0].dataISO).toBe('2026-10-19');
      expect(b[0].data.getFullYear()).toBe(2026);
    });
  });

  describe('independência do relógio do sistema', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date(2030, 5, 15, 12, 0, 0) });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('isHoje e as datas derivam do argumento, não de new Date()', () => {
      expect(new Date().getFullYear()).toBe(2030); // confirma que o relógio falso está ativo
      const semana = gerarEstruturaSemana(new Date(2026, 9, 21));
      expect(isoDe(semana)).toEqual(SEMANA_OUT);
      expect(semana.findIndex((d) => d.isHoje)).toBe(2);
      expect(semana.some((d) => d.dataISO.startsWith('2030'))).toBe(false);
    });
  });
});

// ─── formatarPeriodo ───────────────────────────────────────────────────────────────────────────────────────────

describe('formatarPeriodo', () => {
  const TRAVESSAO_EN = '–';

  it('une o primeiro e o último dia da semana: "19 de out – 25 de out"', () => {
    expect(formatarPeriodo(gerarEstruturaSemana(new Date(2026, 9, 21)))).toBe('19 de out – 25 de out');
  });

  it('o separador é o travessão EN DASH (U+2013) cercado por espaços comuns', () => {
    const periodo = formatarPeriodo(gerarEstruturaSemana(new Date(2026, 9, 21)));
    expect(periodo).toContain(` ${TRAVESSAO_EN} `);
    expect(periodo.indexOf(TRAVESSAO_EN)).toBe('19 de out '.length);
    expect(periodo).not.toContain('-'); // não é hífen
    expect(periodo).not.toContain('—'); // nem travessão EM
  });

  it('semana que cruza o mês: "26 de out – 1 de nov"', () => {
    expect(formatarPeriodo(gerarEstruturaSemana(new Date(2026, 9, 28)))).toBe('26 de out – 1 de nov');
  });

  it('semana que cruza o ano: "28 de dez – 3 de jan"', () => {
    expect(formatarPeriodo(gerarEstruturaSemana(new Date(2026, 11, 31)))).toBe('28 de dez – 3 de jan');
  });

  it('semana com 29 de fevereiro: "26 de fev – 3 de mar"', () => {
    expect(formatarPeriodo(gerarEstruturaSemana(new Date(2024, 1, 29)))).toBe('26 de fev – 3 de mar');
  });

  it.each([0, 1, 3, 6])('lista com %i dia(s) (menos de 7) devolve texto vazio', (quantidade) => {
    expect(formatarPeriodo(gerarEstruturaSemana(new Date(2026, 9, 21)).slice(0, quantidade))).toBe('');
  });

  it('com mais de 7 itens, usa o primeiro (índice 0) e o sétimo (índice 6)', () => {
    const semana = gerarEstruturaSemana(new Date(2026, 9, 21));
    const comExtra = [...semana, { ...semana[0], dataExibicao: 'EXTRA' }];
    expect(formatarPeriodo(comExtra)).toBe('19 de out – 25 de out');
  });

  it('usa somente o campo dataExibicao do primeiro e do sétimo dia (os do meio são irrelevantes)', () => {
    const semana = gerarEstruturaSemana(new Date(2026, 9, 21)).map((dia, i): GanhoDia => {
      if (i === 0) return { ...dia, dataExibicao: 'INÍCIO' };
      if (i === 6) return { ...dia, dataExibicao: 'FIM' };
      return { ...dia, dataExibicao: 'qualquer coisa' };
    });
    expect(formatarPeriodo(semana)).toBe(`INÍCIO ${TRAVESSAO_EN} FIM`);
  });

  it('não altera a lista recebida', () => {
    const semana = gerarEstruturaSemana(new Date(2026, 9, 21));
    const copia = JSON.stringify(semana);
    formatarPeriodo(semana);
    expect(JSON.stringify(semana)).toBe(copia);
  });
});

// ─── gerarSemanasDoMes ──────────────────────────────────────────────────────────────────────────────────────────

describe('gerarSemanasDoMes', () => {
  const hoje = new Date(2026, 9, 21); // quarta-feira, 21/10/2026

  describe('quantidade e intervalos das semanas (Seg a Dom)', () => {
    const casos: Array<[string, number, number, Array<[string, string]>]> = [
      [
        'outubro/2026 (dia 1 numa quinta)',
        2026,
        9,
        [
          ['2026-09-28', '2026-10-04'],
          ['2026-10-05', '2026-10-11'],
          ['2026-10-12', '2026-10-18'],
          ['2026-10-19', '2026-10-25'],
          ['2026-10-26', '2026-11-01'],
        ],
      ],
      [
        'fevereiro/2026 (dia 1 num domingo)',
        2026,
        1,
        [
          ['2026-01-26', '2026-02-01'],
          ['2026-02-02', '2026-02-08'],
          ['2026-02-09', '2026-02-15'],
          ['2026-02-16', '2026-02-22'],
          ['2026-02-23', '2026-03-01'],
        ],
      ],
      [
        'agosto/2026 (último dia numa segunda: 6 semanas)',
        2026,
        7,
        [
          ['2026-07-27', '2026-08-02'],
          ['2026-08-03', '2026-08-09'],
          ['2026-08-10', '2026-08-16'],
          ['2026-08-17', '2026-08-23'],
          ['2026-08-24', '2026-08-30'],
          ['2026-08-31', '2026-09-06'],
        ],
      ],
      [
        'junho/2026 (dia 1 numa segunda)',
        2026,
        5,
        [
          ['2026-06-01', '2026-06-07'],
          ['2026-06-08', '2026-06-14'],
          ['2026-06-15', '2026-06-21'],
          ['2026-06-22', '2026-06-28'],
          ['2026-06-29', '2026-07-05'],
        ],
      ],
      [
        'fevereiro/2027 (28 dias começando na segunda: 4 semanas exatas)',
        2027,
        1,
        [
          ['2027-02-01', '2027-02-07'],
          ['2027-02-08', '2027-02-14'],
          ['2027-02-15', '2027-02-21'],
          ['2027-02-22', '2027-02-28'],
        ],
      ],
      [
        'dezembro/2026 (termina na virada do ano)',
        2026,
        11,
        [
          ['2026-11-30', '2026-12-06'],
          ['2026-12-07', '2026-12-13'],
          ['2026-12-14', '2026-12-20'],
          ['2026-12-21', '2026-12-27'],
          ['2026-12-28', '2027-01-03'],
        ],
      ],
      [
        'janeiro/2027 (começa na virada do ano)',
        2027,
        0,
        [
          ['2026-12-28', '2027-01-03'],
          ['2027-01-04', '2027-01-10'],
          ['2027-01-11', '2027-01-17'],
          ['2027-01-18', '2027-01-24'],
          ['2027-01-25', '2027-01-31'],
        ],
      ],
      [
        'fevereiro/2024 (ano bissexto, 29 dias)',
        2024,
        1,
        [
          ['2024-01-29', '2024-02-04'],
          ['2024-02-05', '2024-02-11'],
          ['2024-02-12', '2024-02-18'],
          ['2024-02-19', '2024-02-25'],
          ['2024-02-26', '2024-03-03'],
        ],
      ],
    ];

    it.each(casos)('%s', (_descricao, ano, mesIndex, esperado) => {
      const semanas = semanasDe(ano, mesIndex);
      expect(semanas).toHaveLength(esperado.length);
      expect(intervalos(semanas)).toEqual(esperado);
      expect(semanas.map((s) => s.numeroSemana)).toEqual(esperado.map((_, i) => i + 1));
    });
  });

  describe('propriedades estruturais em todos os meses de 2024 a 2027', () => {
    const meses: Array<[number, number]> = [];
    for (let ano = 2024; ano <= 2027; ano++) for (let mes = 0; mes < 12; mes++) meses.push([ano, mes]);

    it('a quantidade de semanas é ceil((deslocamento do dia 1 + dias do mês) / 7)', () => {
      const violacoes: string[] = [];
      meses.forEach(([ano, mes]) => {
        const deslocamento = (new Date(ano, mes, 1).getDay() + 6) % 7; // dias entre a segunda e o dia 1
        const esperado = Math.ceil((deslocamento + diasNoMes(ano, mes + 1)) / 7);
        const real = semanasDe(ano, mes).length;
        if (real !== esperado) violacoes.push(`${ano}-${mes + 1}: esperado ${esperado}, veio ${real}`);
      });
      expect(violacoes).toEqual([]);
    });

    it('toda semana começa numa segunda, termina num domingo 6 dias depois e as semanas são contíguas', () => {
      const violacoes: string[] = [];
      meses.forEach(([ano, mes]) => {
        const semanas = semanasDe(ano, mes);
        semanas.forEach((semana, i) => {
          const id = `${ano}-${mes + 1} sem ${semana.numeroSemana}`;
          if (diaDaSemanaDeISO(semana.dataInicioISO) !== 1) violacoes.push(`${id}: início não é segunda`);
          if (diaDaSemanaDeISO(semana.dataFimISO) !== 0) violacoes.push(`${id}: fim não é domingo`);
          if (somarDiasISO(semana.dataInicioISO, 6) !== semana.dataFimISO) violacoes.push(`${id}: não tem 7 dias`);
          if (semana.numeroSemana !== i + 1) violacoes.push(`${id}: numeração fora de sequência`);
          if (i > 0 && somarDiasISO(semanas[i - 1].dataFimISO, 1) !== semana.dataInicioISO) violacoes.push(`${id}: não é contígua à anterior`);
        });
      });
      expect(violacoes).toEqual([]);
    });

    it('a primeira semana contém o dia 1 e a última contém o último dia do mês (nenhum dia fica de fora)', () => {
      const violacoes: string[] = [];
      meses.forEach(([ano, mes]) => {
        const semanas = semanasDe(ano, mes);
        const primeiroDia = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
        const ultimoDia = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diasNoMes(ano, mes + 1)).padStart(2, '0')}`;
        const primeira = semanas[0];
        const ultima = semanas[semanas.length - 1];
        if (!(primeira.dataInicioISO <= primeiroDia && primeiroDia <= primeira.dataFimISO)) violacoes.push(`${ano}-${mes + 1}: dia 1 fora da 1ª semana`);
        if (!(ultima.dataInicioISO <= ultimoDia && ultimoDia <= ultima.dataFimISO)) violacoes.push(`${ano}-${mes + 1}: último dia fora da última semana`);
        // e a primeira semana não pode começar mais de 6 dias antes do dia 1 (senão sobraria uma semana vazia)
        if (primeira.dataInicioISO < somarDiasISO(primeiroDia, -6)) violacoes.push(`${ano}-${mes + 1}: 1ª semana começa cedo demais`);
        // nem a última terminar 7 dias ou mais depois do último dia
        if (ultima.dataFimISO >= somarDiasISO(ultimoDia, 7)) violacoes.push(`${ano}-${mes + 1}: última semana vai além do necessário`);
      });
      expect(violacoes).toEqual([]);
    });

    it('todas as datas dos intervalos estão no formato AAAA-MM-DD', () => {
      meses.forEach(([ano, mes]) => {
        semanasDe(ano, mes).forEach((semana) => {
          expect(semana.dataInicioISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(semana.dataFimISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
      });
    });
  });

  describe('rotulo', () => {
    it('semanas inteiramente dentro do mês seguem o padrão "Sem N (D–D mmm)" (fevereiro/2027)', () => {
      expect(semanasDe(2027, 1).map((s) => s.rotulo)).toEqual([
        'Sem 1 (1–7 fev)',
        'Sem 2 (8–14 fev)',
        'Sem 3 (15–21 fev)',
        'Sem 4 (22–28 fev)',
      ]);
    });

    it('semanas internas de outubro/2026 (2 a 4) mostram dia inicial, dia final e mês', () => {
      const rotulos = semanasDe(2026, 9).map((s) => s.rotulo);
      expect(rotulos[1]).toBe('Sem 2 (5–11 out)');
      expect(rotulos[2]).toBe('Sem 3 (12–18 out)');
      expect(rotulos[3]).toBe('Sem 4 (19–25 out)');
    });

    it('semanas de virada de mês mantêm o número e os dias do início e do fim no rótulo', () => {
      const semanas = semanasDe(2026, 9);
      expect(semanas[0].rotulo).toMatch(/^Sem 1 \(28 set – 4 out\)$/); // 28/09 a 04/10
      expect(semanas[4].rotulo).toMatch(/^Sem 5 \(26 out – 1 nov\)$/); // 26/10 a 01/11
    });

    it('o rótulo usa o travessão EN DASH (U+2013) entre os dias, sem espaços', () => {
      const rotulo = semanasDe(2026, 9)[1].rotulo;
      expect(rotulo.charCodeAt(rotulo.indexOf('5') + 1)).toBe(0x2013);
      expect(rotulo).not.toContain('-');
    });

    it('a abreviação do mês no rótulo não tem ponto', () => {
      meses12().forEach((mesIndex) => {
        semanasDe(2026, mesIndex).forEach((semana) => expect(semana.rotulo).not.toContain('.'));
      });
    });

    function meses12(): number[] {
      return Array.from({ length: 12 }, (_, i) => i);
    }
  });

  describe('isAtual', () => {
    it('marca apenas a semana que contém "hoje" (21/10/2026 → semana 4)', () => {
      const semanas = gerarSemanasDoMes(hoje, {});
      expect(semanas.map((s) => s.isAtual)).toEqual([false, false, false, true, false]);
    });

    it.each([
      ['segunda 19/10 (primeiro dia da semana)', new Date(2026, 9, 19), 3],
      ['domingo 25/10 (último dia da semana)', new Date(2026, 9, 25), 3],
      ['segunda 26/10 (começa a semana 5)', new Date(2026, 9, 26), 4],
      ['sábado 31/10 (último dia do mês)', new Date(2026, 9, 31), 4],
      ['quinta 01/10 (primeiro dia do mês)', new Date(2026, 9, 1), 0],
      ['segunda 05/10', new Date(2026, 9, 5), 1],
    ] as Array<[string, Date, number]>)('%s → índice %i', (_descricao, data, indiceEsperado) => {
      const semanas = gerarSemanasDoMes(data, {});
      expect(semanas.findIndex((s) => s.isAtual)).toBe(indiceEsperado);
      expect(semanas.filter((s) => s.isAtual)).toHaveLength(1);
    });

    it('a hora de "hoje" não interfere (23:59:59.999 do domingo ainda é a mesma semana)', () => {
      const semanas = gerarSemanasDoMes(new Date(2026, 9, 25, 23, 59, 59, 999), {});
      expect(semanas.findIndex((s) => s.isAtual)).toBe(3);
    });

    it('em todos os dias de 2026 há exatamente uma semana atual e ela contém o dia', () => {
      const violacoes: string[] = [];
      for (let mes = 1; mes <= 12; mes++) {
        for (let dia = 1; dia <= diasNoMes(2026, mes); dia++) {
          const data = new Date(2026, mes - 1, dia, 10, 0, 0);
          const iso = toISOLocal(data);
          const atuais = gerarSemanasDoMes(data, {}).filter((s) => s.isAtual);
          if (atuais.length !== 1) {
            violacoes.push(`${iso}: ${atuais.length} semanas atuais`);
          } else if (!(atuais[0].dataInicioISO <= iso && iso <= atuais[0].dataFimISO)) {
            violacoes.push(`${iso}: semana atual ${atuais[0].dataInicioISO}..${atuais[0].dataFimISO} não contém o dia`);
          }
        }
      }
      expect(violacoes).toEqual([]);
    });
  });

  describe('totalGanhos', () => {
    it('sem registros, todas as semanas têm total zero', () => {
      expect(gerarSemanasDoMes(hoje, {}).map((s) => s.totalGanhos)).toEqual([0, 0, 0, 0, 0]);
    });

    it('soma os valores dos 7 dias da semana de cada registro', () => {
      const ganhos = ganhosDe(registro('2026-10-05', 100), registro('2026-10-06', 50.5), registro('2026-10-11', 25), registro('2026-10-21', 250));
      const totais = gerarSemanasDoMes(hoje, ganhos).map((s) => s.totalGanhos);
      expect(totais).toEqual([0, 175.5, 0, 250, 0]);
    });

    it('domingo e segunda consecutivos caem em semanas diferentes (fronteira da semana)', () => {
      const ganhos = ganhosDe(registro('2026-10-11', 10), registro('2026-10-12', 20)); // dom (sem 2) e seg (sem 3)
      const totais = gerarSemanasDoMes(hoje, ganhos).map((s) => s.totalGanhos);
      expect(totais).toEqual([0, 10, 20, 0, 0]);
    });

    it('registros de outros meses distantes não entram em nenhuma semana', () => {
      const ganhos = ganhosDe(registro('2025-10-21', 999), registro('2026-01-01', 999), registro('2026-12-25', 999));
      expect(gerarSemanasDoMes(hoje, ganhos).map((s) => s.totalGanhos)).toEqual([0, 0, 0, 0, 0]);
    });

    it('várias semanas recebem seus próprios totais sem misturar', () => {
      const ganhos = ganhosDe(
        registro('2026-10-05', 1),
        registro('2026-10-12', 2),
        registro('2026-10-19', 3),
        registro('2026-10-20', 4),
        registro('2026-10-26', 5)
      );
      expect(gerarSemanasDoMes(hoje, ganhos).map((s) => s.totalGanhos)).toEqual([0, 1, 2, 7, 5]);
    });

    it('valor ausente, zero ou NaN conta como zero', () => {
      const ganhos = ganhosDe(
        registro('2026-10-19', 0),
        registro('2026-10-20', NaN),
        registro('2026-10-21', 40),
        { ...registro('2026-10-22', 0), valor: undefined as unknown as number }
      );
      const semanaAtual = gerarSemanasDoMes(hoje, ganhos)[3];
      expect(semanaAtual.totalGanhos).toBe(40);
    });

    it('converte valores numéricos que vieram como texto (ex.: "30") em número', () => {
      const ganhos = ganhosDe({ ...registro('2026-10-21', 0), valor: '30' as unknown as number }, registro('2026-10-22', 12.5));
      expect(gerarSemanasDoMes(hoje, ganhos)[3].totalGanhos).toBe(42.5);
    });

    it('registros com chave que não corresponde a nenhum dia do período são ignorados', () => {
      const ganhos: Record<string, RegistroGanhoLocal> = {
        'não-é-data': registro('não-é-data', 500),
        '2026-10-5': registro('2026-10-5', 500), // sem zero à esquerda: não é a chave ISO
        '2026-10-21': registro('2026-10-21', 7),
      };
      expect(gerarSemanasDoMes(hoje, ganhos).map((s) => s.totalGanhos)).toEqual([0, 0, 0, 7, 0]);
    });

    it('usa a chave do dicionário (e não registro.dataISO) para localizar o dia', () => {
      const ganhos: Record<string, RegistroGanhoLocal> = { '2026-10-21': registro('1999-01-01', 33) };
      expect(gerarSemanasDoMes(hoje, ganhos)[3].totalGanhos).toBe(33);
    });
  });

  describe('contrato e isolamento', () => {
    it('cada semana tem exatamente os campos de SemanaMesInfo', () => {
      gerarSemanasDoMes(hoje, {}).forEach((semana) => {
        expect(Object.keys(semana).sort()).toEqual(['dataFimISO', 'dataInicioISO', 'isAtual', 'numeroSemana', 'rotulo', 'totalGanhos']);
      });
    });

    it('não altera "hoje" nem o dicionário de ganhos recebido', () => {
      const entrada = new Date(2026, 9, 21, 14, 30);
      const antes = entrada.getTime();
      const ganhos = ganhosDe(registro('2026-10-21', 100));
      const copiaGanhos = JSON.stringify(ganhos);
      gerarSemanasDoMes(entrada, ganhos);
      expect(entrada.getTime()).toBe(antes);
      expect(JSON.stringify(ganhos)).toBe(copiaGanhos);
    });

    it('aceita dicionário de ganhos congelado', () => {
      const ganhos = Object.freeze(ganhosDe(registro('2026-10-21', 100)));
      expect(() => gerarSemanasDoMes(hoje, ganhos)).not.toThrow();
    });

    it('é determinística e devolve objetos novos a cada chamada', () => {
      const a = gerarSemanasDoMes(hoje, {});
      const b = gerarSemanasDoMes(hoje, {});
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
      a[0].totalGanhos = 999;
      expect(gerarSemanasDoMes(hoje, {})[0].totalGanhos).toBe(0);
    });

    it('o mês é o de "hoje", seja qual for o dia do mês escolhido', () => {
      const base = gerarSemanasDoMes(new Date(2026, 9, 1), {});
      for (let dia = 2; dia <= 31; dia++) {
        expect(intervalos(gerarSemanasDoMes(new Date(2026, 9, dia), {}))).toEqual(intervalos(base));
      }
    });

    it('data inválida devolve lista vazia, sem entrar em laço infinito', () => {
      expect(gerarSemanasDoMes(new Date(NaN), {})).toEqual([]);
    });
  });

  describe('independência do relógio do sistema', () => {
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date(2030, 5, 15, 12, 0, 0) });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('as semanas e isAtual derivam do argumento "hoje", não de new Date()', () => {
      expect(new Date().getFullYear()).toBe(2030); // confirma que o relógio falso está ativo
      const semanas = gerarSemanasDoMes(new Date(2026, 9, 21), {});
      expect(semanas).toHaveLength(5);
      expect(semanas.map((s) => s.isAtual)).toEqual([false, false, false, true, false]);
      expect(semanas[0].dataInicioISO).toBe('2026-09-28');
    });
  });

  describe('semanas de virada de mês', () => {
    // Regressão: o rótulo usava sempre o mês da segunda-feira ("Sem 5 (26–1 out)" para 26/out a 01/nov).
    it('rótulos mostram os dois meses quando a semana cruza o mês', () => {
      expect(semanasDe(2026, 9).map((s) => s.rotulo)).toEqual([
        'Sem 1 (28 set – 4 out)',
        'Sem 2 (5–11 out)',
        'Sem 3 (12–18 out)',
        'Sem 4 (19–25 out)',
        'Sem 5 (26 out – 1 nov)',
      ]);
      expect(semanasDe(2026, 1)[0].rotulo).toBe('Sem 1 (26 jan – 1 fev)'); // fevereiro/2026
      expect(semanasDe(2026, 1)[4].rotulo).toBe('Sem 5 (23 fev – 1 mar)'); // 23/fev a 01/mar
      expect(semanasDe(2027, 0)[0].rotulo).toBe('Sem 1 (28 dez – 3 jan)'); // janeiro/2027 começa em dezembro
    });

    // totalGanhos é sempre a semana inteira (igual ao card "Semana" do Dashboard); o total do mês vem de
    // somarGanhosDoMes, que considera só os dias do mês. Regressão: o card "Mês" somava as semanas e inflava.
    it('totalGanhos soma a semana inteira, mas somarGanhosDoMes considera só os dias do mês', () => {
      const ganhos = ganhosDe(
        registro('2026-09-30', 100), // setembro (semana 1 de outubro)
        registro('2026-10-10', 50),
        registro('2026-10-12', 25.5),
        registro('2026-11-01', 70) // novembro (semana 5 de outubro)
      );
      const semanas = gerarSemanasDoMes(hoje, ganhos);

      expect(semanas.map((s) => s.totalGanhos)).toEqual([100, 50, 25.5, 0, 70]);
      expect(somarGanhosDoMes(hoje, ganhos)).toBe(75.5);
    });

    it('somarGanhosDoMes: mês vazio dá 0, ignora valores inválidos e aceita strings numéricas', () => {
      expect(somarGanhosDoMes(new Date(2026, 11, 15), ganhosDe(registro('2026-10-10', 50)))).toBe(0);
      const ganhos = ganhosDe(registro('2026-10-10', 50), registro('2026-10-11', 25));
      (ganhos['2026-10-11'] as unknown as { valor: string }).valor = '25';
      ganhos['2026-10-12'] = registro('2026-10-12', NaN);
      expect(somarGanhosDoMes(hoje, ganhos)).toBe(75);
    });

    it('a mesma semana de virada aparece nas listas dos dois meses com o mesmo total semanal', () => {
      const ganhos = ganhosDe(registro('2026-10-02', 80));
      const emSetembro = semanasDe(2026, 8, ganhos).find((s) => s.dataInicioISO === '2026-09-28');
      const emOutubro = semanasDe(2026, 9, ganhos).find((s) => s.dataInicioISO === '2026-09-28');
      expect(emSetembro?.totalGanhos).toBe(80);
      expect(emOutubro?.totalGanhos).toBe(80);
      expect(somarGanhosDoMes(new Date(2026, 8, 15), ganhos)).toBe(0); // 02/10 não conta em setembro
    });
  });
});
