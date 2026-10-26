// Testes unitários de src/utils/amortizacao.ts — motor da Regra Amortiza (cascata de excedentes entre os dias).
//
// Regra: o excedente de um dia cobre os dias seguintes da semana. Com meta 100 e R$ 250 na segunda:
//   Seg 100% "atingida" | Ter 100% "adiantada" (Amortizado por Seg) | Qua 50% "parcial" | Qui..Dom 0% "pendente".
//
// Convenções deste arquivo:
//  - `criarSemana` monta uma semana (Seg..Dom) sem depender de src/utils/datas, para isolar o motor.
//  - `projetar` resume cada dia em [status, percentual, detalhe] para asserções legíveis.
//  - O bloco "casos de borda (regressões corrigidas)" guarda os defeitos já corrigidos, para não voltarem.

import type { GanhoDia } from '../../src/types';
import { META_DIARIA_PADRAO, calcularAmortizacaoPorFases } from '../../src/utils/amortizacao';
import { gerarEstruturaSemana } from '../../src/utils/datas';

type Status = GanhoDia['statusAmortizacao'];
type Linha = [Status, number, string]; // [status, percentual, detalhe]

const SIGLAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const CAMPOS_RECALCULADOS: Array<keyof GanhoDia> = [
  'metaBase',
  'valorCoberto',
  'percentual',
  'statusAmortizacao',
  'detalheAmortizacao',
];

/** Semana de 19/10/2026 (segunda) a 25/10/2026 (domingo); `valores` preenche os ganhos a partir de segunda. */
function criarSemana(valores: number[] = [], metaBase = 100): GanhoDia[] {
  return SIGLAS.map((sigla, i) => ({
    data: new Date(2026, 9, 19 + i),
    dataISO: `2026-10-${19 + i}`,
    dataExibicao: `${19 + i} de out`,
    diaCompleto: `${sigla}, ${19 + i} de out`,
    sigla,
    valor: valores[i] ?? 0,
    valorCoberto: 0,
    metaBase,
    percentual: 0,
    statusAmortizacao: 'pendente' as Status,
    detalheAmortizacao: '0%',
    isHoje: i === 2,
    temRegistro: i < valores.length,
  }));
}

const projetar = (dias: GanhoDia[]): Linha[] => dias.map((d) => [d.statusAmortizacao, d.percentual, d.detalheAmortizacao]);
const coberturas = (dias: GanhoDia[]): number[] => dias.map((d) => d.valorCoberto);

const PENDENTE: Linha = ['pendente', 0, '0%'];
const pendentes = (quantidade: number): Linha[] => Array.from({ length: quantidade }, () => PENDENTE);

function congelar(dias: GanhoDia[]): GanhoDia[] {
  dias.forEach((d) => Object.freeze(d));
  return Object.freeze(dias) as GanhoDia[];
}

/** Gerador pseudoaleatório determinístico (mulberry32) para testes de propriedade reprodutíveis. */
function criarAleatorio(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('META_DIARIA_PADRAO', () => {
  it('é R$ 100,00', () => {
    expect(META_DIARIA_PADRAO).toBe(100);
  });

  it('é um número finito e positivo (pode ser usado como divisor)', () => {
    expect(typeof META_DIARIA_PADRAO).toBe('number');
    expect(Number.isFinite(META_DIARIA_PADRAO)).toBe(true);
    expect(META_DIARIA_PADRAO).toBeGreaterThan(0);
  });
});

describe('calcularAmortizacaoPorFases', () => {
  describe('regra de cascata com meta 100 (exemplo oficial: R$ 250 na segunda)', () => {
    const resultado = () => calcularAmortizacaoPorFases(criarSemana([250]), 100);

    it('Seg 100% atingida, Ter 100% adiantada, Qua 50% parcial e Qui a Dom 0% pendentes', () => {
      expect(projetar(resultado())).toEqual([
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Seg)'],
        ['parcial', 50, '50% (Amortizado por Seg)'],
        ...pendentes(4),
      ]);
    });

    it('os valores cobertos são 100, 100, 50 e depois zero', () => {
      expect(coberturas(resultado())).toEqual([100, 100, 50, 0, 0, 0, 0]);
    });

    it('segunda: o ganho próprio bate a meta, então é "atingida" com detalhe "100% ✓"', () => {
      const seg = resultado()[0];
      expect(seg.statusAmortizacao).toBe('atingida');
      expect(seg.percentual).toBe(100);
      expect(seg.valorCoberto).toBe(100);
      expect(seg.detalheAmortizacao).toBe('100% ✓');
    });

    it('terça: sem ganho próprio, é "adiantada" e o detalhe menciona "Amortizado por Seg"', () => {
      const ter = resultado()[1];
      expect(ter.valor).toBe(0);
      expect(ter.statusAmortizacao).toBe('adiantada');
      expect(ter.percentual).toBe(100);
      expect(ter.valorCoberto).toBe(100);
      expect(ter.detalheAmortizacao).toContain('Amortizado por Seg');
    });

    it('quarta: o resto do excedente cobre só metade e o dia fica "parcial" amortizado por Seg', () => {
      const qua = resultado()[2];
      expect(qua.statusAmortizacao).toBe('parcial');
      expect(qua.percentual).toBe(50);
      expect(qua.valorCoberto).toBe(50);
      expect(qua.detalheAmortizacao).toBe('50% (Amortizado por Seg)');
    });

    it('quinta a domingo: sem ganho e sem excedente, ficam "pendente" com 0%', () => {
      resultado()
        .slice(3)
        .forEach((dia) => {
          expect(dia.statusAmortizacao).toBe('pendente');
          expect(dia.percentual).toBe(0);
          expect(dia.valorCoberto).toBe(0);
          expect(dia.detalheAmortizacao).toBe('0%');
        });
    });

    it('o ganho original de cada dia (valor) não é alterado: só a cobertura é redistribuída', () => {
      expect(resultado().map((d) => d.valor)).toEqual([250, 0, 0, 0, 0, 0, 0]);
    });
  });

  describe('ganho exatamente igual à meta e múltiplos exatos da meta', () => {
    it('R$ 100 na segunda fecha só a segunda: não há excedente para a terça', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([100]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ...pendentes(6),
      ]);
    });

    it('R$ 200 na segunda cobre Seg e Ter e consome todo o excedente (quarta fica pendente)', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([200]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Seg)'],
        ...pendentes(5),
      ]);
    });

    it('R$ 300 na segunda cobre Seg, Ter e Qua e deixa Qui pendente', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([300]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Seg)'],
        ['adiantada', 100, '100% ✓ (Amortizado por Seg)'],
        ...pendentes(4),
      ]);
    });

    it('R$ 100 em cada um de três dias seguidos: três "atingida", sem cascata', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([100, 100, 100]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['atingida', 100, '100% ✓'],
        ['atingida', 100, '100% ✓'],
        ...pendentes(4),
      ]);
    });
  });

  describe('excedente que chega ao fim da semana', () => {
    it('R$ 700 na segunda (7 metas) cobre a semana inteira: Seg atingida e Ter..Dom adiantadas', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([700]), 100);
      expect(resultado[0].statusAmortizacao).toBe('atingida');
      resultado.slice(1).forEach((dia) => {
        expect(dia.statusAmortizacao).toBe('adiantada');
        expect(dia.percentual).toBe(100);
        expect(dia.detalheAmortizacao).toBe('100% ✓ (Amortizado por Seg)');
      });
      expect(coberturas(resultado)).toEqual([100, 100, 100, 100, 100, 100, 100]);
    });

    it('o excedente além do domingo é descartado: R$ 800 e R$ 700 dão o mesmo resultado', () => {
      const com800 = calcularAmortizacaoPorFases(criarSemana([800]), 100);
      const com700 = calcularAmortizacaoPorFases(criarSemana([700]), 100);
      expect(projetar(com800)).toEqual(projetar(com700));
      expect(coberturas(com800)).toEqual(coberturas(com700));
      expect(com800).toHaveLength(7);
    });

    it('ganho enorme na segunda também cobre só os 7 dias da semana', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([1_000_000]), 100);
      expect(coberturas(resultado)).toEqual([100, 100, 100, 100, 100, 100, 100]);
      expect(resultado.every((d) => d.percentual === 100)).toBe(true);
    });

    it('R$ 250 na sexta: Sex atingida, Sáb adiantada (Amortizado por Sex) e Dom parcial 50%', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([0, 0, 0, 0, 250]), 100))).toEqual([
        ...pendentes(4),
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Sex)'],
        ['parcial', 50, '50% (Amortizado por Sex)'],
      ]);
    });

    it('R$ 250 no domingo: só o domingo é atingido; o excedente não vai para lugar nenhum', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([0, 0, 0, 0, 0, 0, 250]), 100))).toEqual([
        ...pendentes(6),
        ['atingida', 100, '100% ✓'],
      ]);
    });

    it('o excedente nunca volta no tempo: ganho no fim da semana não cobre dias anteriores', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([0, 0, 0, 0, 0, 0, 700]), 100);
      expect(resultado.slice(0, 6).every((d) => d.statusAmortizacao === 'pendente')).toBe(true);
    });
  });

  describe('ganho parcial próprio, sem cascata ("Faltam R$ X")', () => {
    const casos: Array<[number, number, string]> = [
      [1, 1, '1% (Faltam R$ 99)'],
      [25, 25, '25% (Faltam R$ 75)'],
      [50, 50, '50% (Faltam R$ 50)'],
      [60, 60, '60% (Faltam R$ 40)'],
      [99, 99, '99% (Faltam R$ 1)'],
      [33.3, 33, '33% (Faltam R$ 66,70)'],
      [66.7, 67, '67% (Faltam R$ 33,30)'],
    ];

    it.each(casos)('R$ %p de 100: parcial com %p% e detalhe %p', (ganho, percentual, detalhe) => {
      const seg = calcularAmortizacaoPorFases(criarSemana([ganho]), 100)[0];
      expect(seg.statusAmortizacao).toBe('parcial');
      expect(seg.percentual).toBe(percentual);
      expect(seg.valorCoberto).toBe(ganho);
      expect(seg.detalheAmortizacao).toBe(detalhe);
    });

    it('não gera excedente: o dia seguinte sem ganho continua pendente', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([60]), 100))).toEqual([
        ['parcial', 60, '60% (Faltam R$ 40)'],
        ...pendentes(6),
      ]);
    });

    it('dois dias parciais seguidos não se ajudam: cada um mostra o seu "Faltam"', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([40, 40]), 100))).toEqual([
        ['parcial', 40, '40% (Faltam R$ 60)'],
        ['parcial', 40, '40% (Faltam R$ 60)'],
        ...pendentes(5),
      ]);
    });

    const casosOutrasMetas: Array<[number, number, string]> = [
      [300, 100, '33% (Faltam R$ 200)'],
      [300, 200, '67% (Faltam R$ 100)'],
      [8, 1, '13% (Faltam R$ 7)'], // 12,5% arredonda para cima (Math.round)
      [200, 1, '1% (Faltam R$ 199)'], // 0,5% arredonda para cima
    ];

    it.each(casosOutrasMetas)('arredonda o percentual com meta %p e ganho %p: %p', (meta, ganho, detalhe) => {
      const seg = calcularAmortizacaoPorFases(criarSemana([ganho], meta), meta)[0];
      expect(seg.statusAmortizacao).toBe('parcial');
      expect(seg.detalheAmortizacao).toBe(detalhe);
    });

    it('depois que a cascata acaba, um novo ganho parcial volta a mostrar "Faltam"', () => {
      // Seg 150 → sobra 50 cobre metade da terça; a quarta recebe R$ 20 próprios sem cascata.
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([150, 0, 20]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['parcial', 50, '50% (Amortizado por Seg)'],
        ['parcial', 20, '20% (Faltam R$ 80)'],
        ...pendentes(4),
      ]);
    });
  });

  describe('excedente encadeado entre dias', () => {
    it('R$ 250 na segunda e R$ 250 na terça: o excedente é renovado pela terça (origem passa a ser Ter)', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([250, 250]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Ter)'],
        ['adiantada', 100, '100% ✓ (Amortizado por Ter)'],
        ['adiantada', 100, '100% ✓ (Amortizado por Ter)'],
        ...pendentes(2),
      ]);
    });

    it('R$ 250 na segunda e R$ 100 na terça: a terça é "atingida" e passa a ser a origem do que sobra', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([250, 100]), 100);
      expect(projetar(resultado)).toEqual([
        ['atingida', 100, '100% ✓'],
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Ter)'],
        ['parcial', 50, '50% (Amortizado por Ter)'],
        ...pendentes(3),
      ]);
      expect(coberturas(resultado)).toEqual([100, 100, 100, 50, 0, 0, 0]);
    });

    it('excedente de R$ 50 da segunda + R$ 60 próprios na terça completam a meta: terça adiantada', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([150, 60]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Seg)'],
        ['parcial', 10, '10% (Amortizado por Seg)'],
        ...pendentes(4),
      ]);
    });

    it('excedente + ganho parcial que ainda não completa a meta: terça "parcial" amortizada (não mostra "Faltam")', () => {
      // 50 de sobra da segunda + 30 próprios = 80
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([150, 30]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['parcial', 80, '80% (Amortizado por Seg)'],
        ...pendentes(5),
      ]);
    });

    it('a sobra de um dia parcial não passa adiante: ela é inteiramente absorvida', () => {
      // 170 na segunda → sobra 70; terça com 20 próprios → 90 (parcial) e quarta começa do zero
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([170, 20, 0]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['parcial', 90, '90% (Amortizado por Seg)'],
        ...pendentes(5),
      ]);
    });

    it('duas cascatas independentes na mesma semana (Seg 250 e Qui 300) têm origens diferentes', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([250, 0, 0, 300]), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Seg)'],
        ['parcial', 50, '50% (Amortizado por Seg)'],
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Qui)'],
        ['adiantada', 100, '100% ✓ (Amortizado por Qui)'],
        PENDENTE,
      ]);
    });

    it('dia atingido sem excedente não cria origem nova: depois da cascata, o ganho exato da quarta só fecha a quarta', () => {
      // Seg 150 (sobra 50) → Ter parcial 50% absorve a sobra; Qua 100 exatos → atingida sem excedente.
      const resultado = calcularAmortizacaoPorFases(criarSemana([150, 0, 100, 0]), 100);
      expect(projetar(resultado).slice(0, 4)).toEqual([
        ['atingida', 100, '100% ✓'],
        ['parcial', 50, '50% (Amortizado por Seg)'],
        ['atingida', 100, '100% ✓'],
        PENDENTE,
      ]);
    });

    it('a cascata é consumida exatamente: sem sobra, o dia seguinte é pendente', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([200]), 100);
      expect(resultado[2].statusAmortizacao).toBe('pendente');
      expect(resultado[2].valorCoberto).toBe(0);
    });

    it('a cascata segue a ordem do array, não a ordem natural das siglas (e usa a sigla do primeiro elemento)', () => {
      // Array invertido: o primeiro elemento é o domingo (com R$ 250) e a cascata flui para Sáb e Sex.
      const invertida = criarSemana([0, 0, 0, 0, 0, 0, 250]).reverse();
      const resultado = calcularAmortizacaoPorFases(invertida, 100);
      expect(resultado.map((d) => d.sigla)).toEqual(['Dom', 'Sáb', 'Sex', 'Qui', 'Qua', 'Ter', 'Seg']);
      expect(projetar(resultado)).toEqual([
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Dom)'],
        ['parcial', 50, '50% (Amortizado por Dom)'],
        ...pendentes(4),
      ]);
    });
  });

  describe('meta alterada', () => {
    it('meta 200 com R$ 250 na segunda: Seg atingida (cobre 200) e Ter parcial com 25%', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([250]), 200);
      expect(projetar(resultado)).toEqual([
        ['atingida', 100, '100% ✓'],
        ['parcial', 25, '25% (Amortizado por Seg)'],
        ...pendentes(5),
      ]);
      expect(coberturas(resultado)).toEqual([200, 50, 0, 0, 0, 0, 0]);
    });

    it('meta 50 com R$ 250 na segunda: cobre cinco dias (Seg atingida e Ter..Sex adiantadas)', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([250]), 50);
      expect(resultado.map((d) => d.statusAmortizacao)).toEqual([
        'atingida',
        'adiantada',
        'adiantada',
        'adiantada',
        'adiantada',
        'pendente',
        'pendente',
      ]);
      expect(coberturas(resultado)).toEqual([50, 50, 50, 50, 50, 0, 0]);
    });

    it('grava a metaBase informada em todos os dias, sobrescrevendo a meta antiga da entrada', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([0], 100), 175);
      expect(resultado.every((d) => d.metaBase === 175)).toBe(true);
    });

    it('reaplicar com uma nova meta sobre o resultado anterior equivale a calcular do zero (fluxo salvarMeta do App)', () => {
      const entrada = criarSemana([250, 0, 80, 130]);
      const comMeta100 = calcularAmortizacaoPorFases(entrada, 100);
      const reaplicado = calcularAmortizacaoPorFases(comMeta100, 200);
      expect(reaplicado).toEqual(calcularAmortizacaoPorFases(entrada, 200));
    });

    it('é idempotente: reaplicar a mesma meta sobre o próprio resultado não muda nada', () => {
      const uma = calcularAmortizacaoPorFases(criarSemana([250, 0, 80, 130]), 100);
      const duas = calcularAmortizacaoPorFases(uma, 100);
      expect(duas).toEqual(uma);
    });

    it('meta decimal: R$ 100 com meta 33,33 cobre Seg, Ter e Qua e sobra R$ 0,01 para a quinta (parcial, percentual mínimo 1)', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([100]), 33.33);
      expect(resultado.slice(0, 3).map((d) => d.statusAmortizacao)).toEqual(['atingida', 'adiantada', 'adiantada']);
      expect(resultado.slice(0, 3).map((d) => d.valorCoberto)).toEqual([33.33, 33.33, 33.33]);
      expect(resultado[3].statusAmortizacao).toBe('parcial');
      expect(resultado[3].valorCoberto).toBeCloseTo(0.01, 6);
      expect(resultado[3].percentual).toBe(1);
      expect(resultado.slice(4).every((d) => d.statusAmortizacao === 'pendente')).toBe(true);
    });

    it('com centavos acima da meta inteira: R$ 300,30 cobre três dias e sobram ~R$ 0,30 na quinta', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([300.3]), 100);
      expect(resultado.slice(0, 3).map((d) => d.statusAmortizacao)).toEqual(['atingida', 'adiantada', 'adiantada']);
      expect(resultado[3].statusAmortizacao).toBe('parcial');
      expect(resultado[3].valorCoberto).toBeCloseTo(0.3, 6);
    });
  });

  describe('valores zero, ausentes e lista vazia', () => {
    it('semana sem nenhum ganho: tudo pendente, 0% e sem cobertura', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana(), 100);
      expect(projetar(resultado)).toEqual(pendentes(7));
      expect(coberturas(resultado)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it('lista vazia devolve lista vazia', () => {
      expect(calcularAmortizacaoPorFases([], 100)).toEqual([]);
    });

    it('valor undefined, null ou NaN conta como zero', () => {
      const dias = criarSemana([250]);
      (dias[1] as { valor: unknown }).valor = undefined;
      (dias[2] as { valor: unknown }).valor = null;
      (dias[3] as { valor: unknown }).valor = NaN;
      const resultado = calcularAmortizacaoPorFases(dias, 100);
      expect(projetar(resultado)).toEqual(projetar(calcularAmortizacaoPorFases(criarSemana([250]), 100)));
    });

    it('um dia com zero no meio de dois dias com ganho não herda cascata que já acabou', () => {
      // Seg 150 (sobra 50 → Ter parcial); Qua 0; Qui 100
      const resultado = calcularAmortizacaoPorFases(criarSemana([150, 0, 0, 100]), 100);
      expect(projetar(resultado).slice(0, 4)).toEqual([
        ['atingida', 100, '100% ✓'],
        ['parcial', 50, '50% (Amortizado por Seg)'],
        PENDENTE,
        ['atingida', 100, '100% ✓'],
      ]);
    });

    it('ganho negativo isolado não gera cobertura nem contamina o dia seguinte', () => {
      // A validação de sinal é feita na tela; aqui só se garante que nada quebra.
      const resultado = calcularAmortizacaoPorFases(criarSemana([-50, 150]), 100);
      expect(resultado[0].statusAmortizacao).toBe('pendente');
      expect(resultado[0].valorCoberto).toBe(0);
      expect(resultado[1].statusAmortizacao).toBe('atingida');
      expect(resultado[2].detalheAmortizacao).toBe('50% (Amortizado por Ter)');
    });
  });

  describe('metaBase zero ou inválida', () => {
    it('metaBase 0 não divide por zero: nenhum campo numérico vira NaN ou Infinity', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([50, 0, 250]), 0);
      resultado.forEach((dia) => {
        [dia.valorCoberto, dia.percentual, dia.metaBase].forEach((numero) => {
          expect(Number.isFinite(numero)).toBe(true);
        });
        expect(dia.detalheAmortizacao).not.toMatch(/NaN|Infinity/);
      });
    });

    it('metaBase 0: percentual e valorCoberto ficam em zero em todos os dias', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([50, 0, 250]), 0);
      expect(resultado.map((d) => d.percentual)).toEqual([0, 0, 0, 0, 0, 0, 0]);
      expect(coberturas(resultado)).toEqual([0, 0, 0, 0, 0, 0, 0]);
      expect(resultado.every((d) => d.metaBase === 0)).toBe(true);
    });

    it('metaBase 0 sem nenhum ganho também não lança exceção', () => {
      expect(() => calcularAmortizacaoPorFases(criarSemana(), 0)).not.toThrow();
    });

    it('metaBase negativa não lança exceção e mantém o percentual em 0', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([50]), -100);
      resultado.forEach((dia) => {
        expect(dia.percentual).toBe(0);
        expect(Number.isFinite(dia.valorCoberto)).toBe(true);
      });
    });
  });

  describe('limites de percentual e de cobertura', () => {
    it('o percentual nunca passa de 100, mesmo com ganhos gigantescos', () => {
      [1e6, 1e9, 1e15, Number.MAX_SAFE_INTEGER].forEach((ganho) => {
        const resultado = calcularAmortizacaoPorFases(criarSemana([ganho, ganho]), 100);
        resultado.forEach((dia) => expect(dia.percentual).toBeLessThanOrEqual(100));
        expect(resultado[0].percentual).toBe(100);
      });
    });

    it('o valor coberto de um dia nunca passa da meta (o excedente é repassado, não somado ao dia)', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([1000, 500]), 100);
      resultado.forEach((dia) => expect(dia.valorCoberto).toBeLessThanOrEqual(100));
      expect(resultado[0].valorCoberto).toBe(100);
    });

    it('o ganho de um dia acima da meta mantém percentual 100 (e não 250)', () => {
      const seg = calcularAmortizacaoPorFases(criarSemana([250]), 100)[0];
      expect(seg.valor).toBe(250);
      expect(seg.percentual).toBe(100);
    });

    it('o percentual é um inteiro entre 0 e 100 (arredondado)', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([33.333, 0, 66.666, 0, 12.5]), 100);
      resultado.forEach((dia) => {
        expect(Number.isInteger(dia.percentual)).toBe(true);
        expect(dia.percentual).toBeGreaterThanOrEqual(0);
        expect(dia.percentual).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('imutabilidade e pureza', () => {
    it('não altera o array de entrada nem os seus itens', () => {
      const entrada = criarSemana([250, 0, 80]);
      const copia = entrada.map((d) => ({ ...d, data: new Date(d.data.getTime()) }));
      calcularAmortizacaoPorFases(entrada, 100);
      expect(entrada).toEqual(copia);
    });

    it('aceita entrada totalmente congelada (Object.freeze) sem lançar exceção', () => {
      const entrada = congelar(criarSemana([250, 0, 80]));
      expect(() => calcularAmortizacaoPorFases(entrada, 100)).not.toThrow();
    });

    it('devolve um array novo com objetos novos', () => {
      const entrada = criarSemana([250]);
      const resultado = calcularAmortizacaoPorFases(entrada, 100);
      expect(resultado).not.toBe(entrada);
      resultado.forEach((dia, i) => expect(dia).not.toBe(entrada[i]));
    });

    it('a entrada continua com os valores antigos (valorCoberto 0, pendente) depois do cálculo', () => {
      const entrada = criarSemana([250]);
      calcularAmortizacaoPorFases(entrada, 100);
      expect(entrada.every((d) => d.valorCoberto === 0 && d.statusAmortizacao === 'pendente')).toBe(true);
    });

    it('não guarda estado entre chamadas: a cascata de uma semana não vaza para a seguinte', () => {
      calcularAmortizacaoPorFases(criarSemana([700]), 100);
      expect(projetar(calcularAmortizacaoPorFases(criarSemana(), 100))).toEqual(pendentes(7));
    });

    it('é determinística: duas chamadas com a mesma entrada dão resultados iguais', () => {
      const entrada = criarSemana([250, 0, 80, 130]);
      expect(calcularAmortizacaoPorFases(entrada, 100)).toEqual(calcularAmortizacaoPorFases(entrada, 100));
    });
  });

  describe('estrutura da saída', () => {
    it('mantém tamanho, ordem e identidade dos dias (sigla, dataISO, valor)', () => {
      const entrada = criarSemana([250, 0, 80]);
      const resultado = calcularAmortizacaoPorFases(entrada, 100);
      expect(resultado).toHaveLength(7);
      expect(resultado.map((d) => d.sigla)).toEqual(SIGLAS);
      expect(resultado.map((d) => d.dataISO)).toEqual(entrada.map((d) => d.dataISO));
      expect(resultado.map((d) => d.valor)).toEqual(entrada.map((d) => d.valor));
    });

    it('preserva todos os campos que não são recalculados (data, textos, isHoje, temRegistro)', () => {
      const entrada = criarSemana([250, 0, 80]);
      const resultado = calcularAmortizacaoPorFases(entrada, 100);
      entrada.forEach((diaEntrada, i) => {
        (Object.keys(diaEntrada) as Array<keyof GanhoDia>)
          .filter((campo) => !CAMPOS_RECALCULADOS.includes(campo))
          .forEach((campo) => {
            expect(resultado[i][campo]).toEqual(diaEntrada[campo]);
          });
      });
    });

    it('preserva propriedades extras que o chamador tenha anexado ao dia', () => {
      const entrada = criarSemana([250]).map((d) => ({ ...d, observacao: `nota ${d.sigla}` }));
      const resultado = calcularAmortizacaoPorFases(entrada, 100) as Array<GanhoDia & { observacao?: string }>;
      expect(resultado.map((d) => d.observacao)).toEqual(SIGLAS.map((s) => `nota ${s}`));
    });

    it('não acrescenta nem remove propriedades do dia (mesmo conjunto de chaves da entrada)', () => {
      const entrada = criarSemana([250]);
      const resultado = calcularAmortizacaoPorFases(entrada, 100);
      expect(Object.keys(resultado[0]).sort()).toEqual(Object.keys(entrada[0]).sort());
    });

    it('funciona com menos de 7 dias: a cascata acaba junto com o array', () => {
      expect(projetar(calcularAmortizacaoPorFases(criarSemana([250]).slice(0, 3), 100))).toEqual([
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Seg)'],
        ['parcial', 50, '50% (Amortizado por Seg)'],
      ]);
    });

    it('usa a sigla que vier no dia de origem para montar o texto "Amortizado por ..."', () => {
      const entrada = criarSemana([250]);
      entrada[0].sigla = 'XYZ';
      const resultado = calcularAmortizacaoPorFases(entrada, 100);
      expect(resultado[1].detalheAmortizacao).toBe('100% ✓ (Amortizado por XYZ)');
      expect(resultado[2].detalheAmortizacao).toBe('50% (Amortizado por XYZ)');
    });

    it('os textos usam o símbolo ✓ (U+2713)', () => {
      const resultado = calcularAmortizacaoPorFases(criarSemana([250]), 100);
      expect(resultado[0].detalheAmortizacao.charCodeAt(5)).toBe(0x2713);
      expect(resultado[1].detalheAmortizacao.charCodeAt(5)).toBe(0x2713);
    });
  });

  describe('integração com gerarEstruturaSemana (fluxo real do App)', () => {
    const hoje = new Date(2026, 9, 21); // quarta-feira, 21/10/2026

    it('aplica a regra sobre a estrutura real da semana e preserva isHoje', () => {
      const estrutura = gerarEstruturaSemana(hoje).map((dia, i) => (i === 0 ? { ...dia, valor: 250, temRegistro: true } : dia));
      const resultado = calcularAmortizacaoPorFases(estrutura, META_DIARIA_PADRAO);
      expect(projetar(resultado)).toEqual([
        ['atingida', 100, '100% ✓'],
        ['adiantada', 100, '100% ✓ (Amortizado por Seg)'],
        ['parcial', 50, '50% (Amortizado por Seg)'],
        ...pendentes(4),
      ]);
      expect(resultado.map((d) => d.isHoje)).toEqual([false, false, true, false, false, false, false]);
    });

    it('semana nova (sem ganhos) já nasce consistente com o cálculo: tudo pendente', () => {
      const estrutura = gerarEstruturaSemana(hoje);
      expect(calcularAmortizacaoPorFases(estrutura, META_DIARIA_PADRAO)).toEqual(estrutura);
    });

    it('fluxo "somar" do App: R$ 100 e depois mais R$ 150 no mesmo dia dá o mesmo que lançar R$ 250 de uma vez', () => {
      const inicial = calcularAmortizacaoPorFases(
        gerarEstruturaSemana(hoje).map((d, i) => (i === 0 ? { ...d, valor: 100, temRegistro: true } : d)),
        100
      );
      expect(inicial[0].statusAmortizacao).toBe('atingida');
      expect(inicial[1].statusAmortizacao).toBe('pendente');

      const somado = calcularAmortizacaoPorFases(
        inicial.map((d, i) => (i === 0 ? { ...d, valor: d.valor + 150 } : d)),
        100
      );
      const direto = calcularAmortizacaoPorFases(
        gerarEstruturaSemana(hoje).map((d, i) => (i === 0 ? { ...d, valor: 250, temRegistro: true } : d)),
        100
      );
      expect(somado).toEqual(direto);
    });

    it('"dias cobertos" do Dashboard (percentual 100) conta Seg e Ter no exemplo de R$ 250', () => {
      const resultado = calcularAmortizacaoPorFases(
        gerarEstruturaSemana(hoje).map((d, i) => (i === 0 ? { ...d, valor: 250 } : d)),
        100
      );
      expect(resultado.filter((d) => d.percentual === 100)).toHaveLength(2);
    });

    it('o total coberto da semana é igual ao total ganho quando todo o ganho cabe na semana (250 = 100 + 100 + 50)', () => {
      const resultado = calcularAmortizacaoPorFases(
        gerarEstruturaSemana(hoje).map((d, i) => (i === 0 ? { ...d, valor: 250 } : d)),
        100
      );
      const ganho = resultado.reduce((acc, d) => acc + d.valor, 0);
      const coberto = resultado.reduce((acc, d) => acc + d.valorCoberto, 0);
      expect(coberto).toBe(ganho);
    });
  });

  describe('propriedades com dados pseudoaleatórios (semente fixa)', () => {
    type Esperado = { status: Status; coberto: number; percentual: number; detalhe: string };

    /**
     * Modelo de referência com outra formulação: em vez de carregar "saldo" dia a dia, usa acumulados.
     * Cobertura acumulada K(i) = min(K(i-1) + meta, G(i)), onde G(i) é o ganho acumulado até o dia i.
     * Vale para ganhos não negativos. Com números inteiros as contas são exatas (sem ruído de ponto flutuante).
     */
    function modeloReferencia(valores: number[], meta: number): Esperado[] {
      let ganhoAcumulado = 0;
      let cobertoAcumulado = 0;
      let origem = '';
      return valores.map((ganho, i): Esperado => {
        const sigla = SIGLAS[i];
        const sobraHerdada = ganhoAcumulado - cobertoAcumulado;
        ganhoAcumulado += ganho;
        const novoCobertoAcumulado = Math.min(cobertoAcumulado + meta, ganhoAcumulado);
        const coberto = novoCobertoAcumulado - cobertoAcumulado;
        const sobraFinal = ganhoAcumulado - novoCobertoAcumulado;
        cobertoAcumulado = novoCobertoAcumulado;

        if (coberto === meta) {
          if (ganho >= meta) {
            if (sobraFinal > 0) origem = sigla;
            return { status: 'atingida', coberto, percentual: 100, detalhe: '100% ✓' };
          }
          return { status: 'adiantada', coberto, percentual: 100, detalhe: `100% ✓ (Amortizado por ${origem})` };
        }
        if (coberto > 0) {
          // Dia parcial nunca mostra 0% nem 100%: fica entre 1 e 99.
          const percentual = Math.min(99, Math.max(1, Math.round((coberto / meta) * 100)));
          const detalhe =
            ganho > 0 && sobraHerdada === 0
              ? `${percentual}% (Faltam R$ ${(meta - coberto).toFixed(0)})`
              : `${percentual}% (Amortizado por ${origem})`;
          return { status: 'parcial', coberto, percentual, detalhe };
        }
        return { status: 'pendente', coberto: 0, percentual: 0, detalhe: '0%' };
      });
    }

    const METAS = [1, 7, 20, 50, 100, 150, 333];

    function sortearSemana(sorteio: () => number, meta: number, comCentavos: boolean): number[] {
      return Array.from({ length: 7 }, () => {
        const r = sorteio();
        let valor: number;
        if (r < 0.35) valor = 0;
        else if (r < 0.6) valor = Math.floor(sorteio() * meta); // 0..meta-1
        else if (r < 0.7) valor = meta;
        else valor = meta + Math.floor(sorteio() * meta * 4); // meta..5*meta-1
        return comCentavos ? valor + Math.floor(sorteio() * 100) / 100 : valor;
      });
    }

    it('com valores inteiros, coincide exatamente com o modelo de referência (status, cobertura, percentual e texto) em 1.000 semanas', () => {
      const sorteio = criarAleatorio(2026);
      for (let i = 0; i < 1000; i++) {
        const meta = METAS[Math.floor(sorteio() * METAS.length)];
        const valores = sortearSemana(sorteio, meta, false);
        const real = calcularAmortizacaoPorFases(criarSemana(valores, meta), meta);
        const esperado = modeloReferencia(valores, meta);
        const contexto = `meta=${meta} valores=${JSON.stringify(valores)}`;
        expect({ contexto, dias: real.map((d) => ({ status: d.statusAmortizacao, coberto: d.valorCoberto, percentual: d.percentual, detalhe: d.detalheAmortizacao })) }).toEqual({
          contexto,
          dias: esperado.map((e) => ({ status: e.status, coberto: e.coberto, percentual: e.percentual, detalhe: e.detalhe })),
        });
      }
    });

    /** Confere as invariantes da regra e devolve a lista de violações (vazia = tudo certo). */
    function verificarInvariantes(dias: GanhoDia[], meta: number): string[] {
      const EPS = 1e-6;
      const erros: string[] = [];
      const exigir = (condicao: boolean, mensagem: string) => {
        if (!condicao) erros.push(mensagem);
      };

      exigir(dias.length === 7, `esperava 7 dias e veio ${dias.length}`);
      let totalGanho = 0;
      let totalCoberto = 0;

      dias.forEach((dia, idx) => {
        const id = `${dia.sigla}(valor=${dia.valor}, coberto=${dia.valorCoberto}, ${dia.statusAmortizacao}, ${dia.percentual}%, "${dia.detalheAmortizacao}")`;
        totalGanho += dia.valor;
        totalCoberto += dia.valorCoberto;

        exigir(dia.metaBase === meta, `${id}: metaBase diferente da meta informada`);
        exigir(Number.isInteger(dia.percentual) && dia.percentual >= 0 && dia.percentual <= 100, `${id}: percentual fora de 0..100`);
        exigir(dia.valorCoberto >= 0 && dia.valorCoberto <= meta + EPS, `${id}: valorCoberto fora de 0..meta`);
        // o dia nunca recebe menos cobertura do que o próprio ganho (limitado à meta)
        exigir(dia.valorCoberto >= Math.min(dia.valor, meta) - EPS, `${id}: cobertura menor que o próprio ganho`);

        switch (dia.statusAmortizacao) {
          case 'atingida':
            exigir(dia.valor >= meta, `${id}: atingida com ganho abaixo da meta`);
            exigir(Math.abs(dia.valorCoberto - meta) < EPS, `${id}: atingida sem cobrir a meta inteira`);
            exigir(dia.detalheAmortizacao === '100% ✓', `${id}: detalhe de atingida`);
            break;
          case 'adiantada': {
            exigir(dia.valor < meta, `${id}: adiantada com ganho próprio já suficiente`);
            exigir(Math.abs(dia.valorCoberto - meta) < EPS, `${id}: adiantada sem cobrir a meta inteira`);
            const origem = /^100% ✓ \(Amortizado por (\S+)\)$/.exec(dia.detalheAmortizacao);
            exigir(origem !== null, `${id}: detalhe de adiantada fora do formato`);
            if (origem) {
              // a origem é sempre um dia anterior que bateu a meta sozinho
              const indiceOrigem = SIGLAS.indexOf(origem[1]);
              exigir(indiceOrigem >= 0 && indiceOrigem < idx, `${id}: origem não é um dia anterior`);
              exigir(indiceOrigem >= 0 && dias[indiceOrigem].statusAmortizacao === 'atingida', `${id}: origem não está "atingida"`);
            }
            break;
          }
          case 'parcial':
            exigir(dia.valorCoberto > 0 && dia.valorCoberto < meta, `${id}: parcial fora de 0 < coberto < meta`);
            exigir(/^\d+% \((Faltam R\$ \d+(,\d{2})?|Amortizado por \S+)\)$/.test(dia.detalheAmortizacao), `${id}: detalhe de parcial fora do formato`);
            exigir(dia.percentual >= 1 && dia.percentual <= 99, `${id}: parcial com percentual fora de 1..99`);
            break;
          case 'pendente':
            exigir(dia.valorCoberto === 0 && dia.percentual === 0 && dia.detalheAmortizacao === '0%', `${id}: pendente com cobertura`);
            break;
          default:
            exigir(false, `${id}: status inesperado`);
        }
      });

      exigir(totalCoberto <= totalGanho + EPS, `cobriu ${totalCoberto} tendo ganho só ${totalGanho}`);
      exigir(totalCoberto <= 7 * meta + EPS, `cobriu mais de 7 metas (${totalCoberto})`);
      return erros;
    }

    it('invariantes valem também com centavos e metas decimais em 1.000 semanas', () => {
      const sorteio = criarAleatorio(1021);
      const falhas: Array<{ meta: number; valores: number[]; erros: string[] }> = [];
      for (let i = 0; i < 1000; i++) {
        const meta = METAS[Math.floor(sorteio() * METAS.length)] + (sorteio() < 0.5 ? 0 : Math.floor(sorteio() * 100) / 100);
        const valores = sortearSemana(sorteio, Math.ceil(meta), true);
        const erros = verificarInvariantes(calcularAmortizacaoPorFases(criarSemana(valores, meta), meta), meta);
        if (erros.length > 0) falhas.push({ meta, valores, erros });
      }
      expect(falhas.slice(0, 3)).toEqual([]);
    });

    it('o verificador de invariantes realmente acusa resultados inconsistentes (teste do teste)', () => {
      const dias = calcularAmortizacaoPorFases(criarSemana([250]), 100);
      expect(verificarInvariantes(dias, 100)).toEqual([]);

      const adulterado = dias.map((d, i) => (i === 1 ? { ...d, statusAmortizacao: 'atingida' as Status } : d));
      expect(verificarInvariantes(adulterado, 100).length).toBeGreaterThan(0);

      const coberturaAMais = dias.map((d, i) => (i === 3 ? { ...d, valorCoberto: 40, statusAmortizacao: 'parcial' as Status, percentual: 40, detalheAmortizacao: '40% (Amortizado por Seg)' } : d));
      expect(verificarInvariantes(coberturaAMais, 100).some((e) => e.includes('cobriu'))).toBe(true);
    });

    it('trocar a meta de 100 para 200 e recalcular sobre o resultado dá o mesmo que partir da entrada original', () => {
      const sorteio = criarAleatorio(77);
      for (let i = 0; i < 200; i++) {
        const valores = sortearSemana(sorteio, 100, true);
        const entrada = criarSemana(valores, 100);
        const encadeado = calcularAmortizacaoPorFases(calcularAmortizacaoPorFases(entrada, 100), 200);
        expect(encadeado).toEqual(calcularAmortizacaoPorFases(entrada, 200));
      }
    });
  });

  describe('casos de borda (regressões corrigidas)', () => {
    describe('percentual de um dia parcial fica entre 1 e 99', () => {
      // Regressão: Math.round fazia 99,5%..99,99% da meta virar "100%" com status "parcial", e o App contava
      // percentual === 100 como "dia coberto". Agora 100 só aparece com a meta coberta.
      it('R$ 99,60 de 100: "parcial", percentual 99 e detalhe "99% (Faltam R$ 0,40)"', () => {
        const seg = calcularAmortizacaoPorFases(criarSemana([99.6]), 100)[0];
        expect(seg.statusAmortizacao).toBe('parcial');
        expect(seg.percentual).toBe(99);
        expect(seg.detalheAmortizacao).toBe('99% (Faltam R$ 0,40)');
      });

      it('R$ 99,50 de 100: "99% (Faltam R$ 0,50)"', () => {
        const seg = calcularAmortizacaoPorFases(criarSemana([99.5]), 100)[0];
        expect(seg.statusAmortizacao).toBe('parcial');
        expect(seg.percentual).toBe(99);
        expect(seg.detalheAmortizacao).toBe('99% (Faltam R$ 0,50)');
      });

      it('R$ 199,99 na segunda: a terça recebe R$ 99,99, fica "parcial" com percentual 99', () => {
        const resultado = calcularAmortizacaoPorFases(criarSemana([199.99]), 100);
        expect(resultado[1].statusAmortizacao).toBe('parcial');
        expect(resultado[1].percentual).toBe(99);
        expect(resultado[1].detalheAmortizacao).toBe('99% (Amortizado por Seg)');
      });

      it('"dias cobertos" (percentual === 100) coincide com os dias atingidos ou adiantados', () => {
        const resultado = calcularAmortizacaoPorFases(criarSemana([199.99]), 100);
        const diasCobertosPeloPercentual = resultado.filter((d) => d.percentual === 100).length;
        const diasRealmenteCobertos = resultado.filter((d) => d.statusAmortizacao === 'atingida' || d.statusAmortizacao === 'adiantada').length;
        expect(diasCobertosPeloPercentual).toBe(1);
        expect(diasRealmenteCobertos).toBe(1);
      });

      it('R$ 0,40 de 100: "parcial" com percentual mínimo 1 e "Faltam R$ 99,60"', () => {
        const seg = calcularAmortizacaoPorFases(criarSemana([0.4]), 100)[0];
        expect(seg.statusAmortizacao).toBe('parcial');
        expect(seg.percentual).toBe(1);
        expect(seg.detalheAmortizacao).toBe('1% (Faltam R$ 99,60)');
      });

      it('valor que falta inteiro continua sem centavos: "50% (Faltam R$ 50)"', () => {
        expect(calcularAmortizacaoPorFases(criarSemana([50]), 100)[0].detalheAmortizacao).toBe('50% (Faltam R$ 50)');
      });
    });

    describe('metaBase inválida (zero, negativa ou NaN)', () => {
      // Regressão: com metaBase 0 todo dia virava "atingida" com "100% ✓" e percentual 0. A tela e o sync já
      // impedem meta <= 0; o motor agora trata o caso como "nada a cobrir", sem divisão por zero.
      it.each([0, -100, NaN])('meta %p: todos os dias ficam "pendente", 0%% e sem exceção', (meta) => {
        const resultado = calcularAmortizacaoPorFases(criarSemana([50, 250]), meta);
        resultado.forEach((dia) => {
          expect(dia.statusAmortizacao).toBe('pendente');
          expect(dia.detalheAmortizacao).toBe('0%');
          expect(dia.percentual).toBe(0);
          expect(dia.valorCoberto).toBe(0);
        });
      });
    });

    describe('ruído de ponto flutuante na cascata', () => {
      // Regressão: o excedente era calculado sem arredondar para centavos; com metas decimais, um ganho igual a
      // N x meta deixava resíduos (~1e-15) e o dia final saía "parcial" em vez de "adiantada".
      it('meta 45,90 e ganho 137,70 (= 3 x meta) cobrem Seg, Ter e Qua e deixam a Qui pendente', () => {
        const resultado = calcularAmortizacaoPorFases(criarSemana([137.7]), 45.9);
        expect(resultado.slice(0, 4).map((d) => d.statusAmortizacao)).toEqual(['atingida', 'adiantada', 'adiantada', 'pendente']);
      });

      it('meta 10,10 e ganho 30,30 (= 3 x meta) não deixam a quinta "parcial" por resíduo', () => {
        const resultado = calcularAmortizacaoPorFases(criarSemana([30.3]), 10.1);
        expect(resultado[3].statusAmortizacao).toBe('pendente');
      });

      it('o valor coberto de um dia adiantado é exatamente a meta (sem resíduo)', () => {
        const resultado = calcularAmortizacaoPorFases(criarSemana([137.7]), 45.9);
        expect(resultado[2].valorCoberto).toBe(45.9);
      });
    });

    it('aceita valor em string vinda de fonte externa ("250" não vira "2500")', () => {
      const semana = criarSemana([0]);
      (semana[0] as unknown as { valor: string }).valor = '250';
      const resultado = calcularAmortizacaoPorFases(semana, 100);
      expect(resultado.slice(0, 3).map((d) => d.percentual)).toEqual([100, 100, 50]);
    });
  });
});
