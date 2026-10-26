// Testes unitários de src/utils/dividas.ts (anualizarDivida, calcularResumoDividas, rotuloFrequencia).
//
// Regra de negócio: diárias x365, mensais x12; imprevistas conforme a frequência
// (diária x365, mensal x12, anual/pontual x1 — inclusive quando a frequência não foi informada).

import type { DividaItem } from '../../src/types';
import type { ResumoDividas } from '../../src/utils/dividas';
import { anualizarDivida, calcularResumoDividas, rotuloFrequencia } from '../../src/utils/dividas';

type Frequencia = DividaItem['frequenciaImprevisto'];

let contador = 0;

function criarDivida(base: Pick<DividaItem, 'tipo' | 'valor'> & Partial<DividaItem>): DividaItem {
  contador += 1;
  return { id: `div-${contador}`, descricao: `Dívida ${contador}`, dataLancamento: '2026-10-21', ...base };
}

const diaria = (valor: number): DividaItem => criarDivida({ tipo: 'diaria', valor });
const mensal = (valor: number): DividaItem => criarDivida({ tipo: 'mensal', valor });
const imprevista = (valor: number, frequenciaImprevisto?: Frequencia): DividaItem =>
  criarDivida({ tipo: 'imprevista', valor, frequenciaImprevisto });

/** Congela a lista e cada item: qualquer tentativa de escrita lança TypeError (módulos ES rodam em modo estrito). */
function congelar(lista: DividaItem[]): DividaItem[] {
  lista.forEach((item) => Object.freeze(item));
  return Object.freeze(lista) as DividaItem[];
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

describe('anualizarDivida', () => {
  describe('dívida diária (x365)', () => {
    const casos: Array<[number, number]> = [
      [1, 365],
      [10, 3650],
      [25.5, 9307.5],
      [60, 21900],
      [1000, 365000],
      [0, 0],
    ];

    it.each(casos)('R$ %p por dia equivale a R$ %p por ano', (valor, esperado) => {
      expect(anualizarDivida(diaria(valor))).toBe(esperado);
    });

    it('trabalha com centavos sem perder a precisão visível', () => {
      expect(anualizarDivida(diaria(0.1))).toBeCloseTo(36.5, 10);
      expect(anualizarDivida(diaria(12.34))).toBeCloseTo(4504.1, 8);
    });
  });

  describe('dívida mensal (x12)', () => {
    const casos: Array<[number, number]> = [
      [1, 12],
      [100, 1200],
      [250.5, 3006],
      [1100, 13200],
      [0, 0],
    ];

    it.each(casos)('R$ %p por mês equivale a R$ %p por ano', (valor, esperado) => {
      expect(anualizarDivida(mensal(valor))).toBe(esperado);
    });
  });

  describe('dívida imprevista (depende da frequência)', () => {
    const casos: Array<[string, Frequencia, number, number]> = [
      ['diária (x365)', 'diaria', 10, 3650],
      ['mensal (x12)', 'mensal', 100, 1200],
      ['anual (x1)', 'anual', 500, 500],
      ['sem frequência informada (x1)', undefined, 500, 500],
    ];

    it.each(casos)('imprevista %s: R$ %p → R$ %p por ano', (_descricao, frequencia, valor, esperado) => {
      expect(anualizarDivida(imprevista(valor, frequencia))).toBe(esperado);
    });

    it('frequência desconhecida (dado corrompido) é tratada como anual/pontual (x1)', () => {
      const corrompida = imprevista(300, 'semestral' as unknown as Frequencia);
      expect(anualizarDivida(corrompida)).toBe(300);
    });

    it('imprevista com valor zero resulta em zero em qualquer frequência', () => {
      (['diaria', 'mensal', 'anual', undefined] as Frequencia[]).forEach((frequencia) => {
        expect(anualizarDivida(imprevista(0, frequencia))).toBe(0);
      });
    });
  });

  describe('a frequência só vale para dívidas imprevistas', () => {
    it('dívida diária ignora frequenciaImprevisto e continua x365', () => {
      (['diaria', 'mensal', 'anual'] as Frequencia[]).forEach((frequenciaImprevisto) => {
        expect(anualizarDivida(criarDivida({ tipo: 'diaria', valor: 10, frequenciaImprevisto }))).toBe(3650);
      });
    });

    it('dívida mensal ignora frequenciaImprevisto e continua x12', () => {
      (['diaria', 'mensal', 'anual'] as Frequencia[]).forEach((frequenciaImprevisto) => {
        expect(anualizarDivida(criarDivida({ tipo: 'mensal', valor: 100, frequenciaImprevisto }))).toBe(1200);
      });
    });
  });

  describe('propriedades gerais', () => {
    it('não altera o item recebido (entrada congelada)', () => {
      const item = Object.freeze(criarDivida({ tipo: 'imprevista', valor: 42, frequenciaImprevisto: 'mensal' }));
      expect(() => anualizarDivida(item)).not.toThrow();
      expect(item.valor).toBe(42);
      expect(item.frequenciaImprevisto).toBe('mensal');
    });

    it('é pura: chamadas repetidas com o mesmo item dão o mesmo resultado', () => {
      const item = mensal(87.9);
      expect(anualizarDivida(item)).toBe(anualizarDivida(item));
    });

    it('é proporcional ao valor: dobrar o valor dobra o total anual, para todos os tipos', () => {
      const fabricas: Array<(valor: number) => DividaItem> = [
        diaria,
        mensal,
        (v) => imprevista(v, 'diaria'),
        (v) => imprevista(v, 'mensal'),
        (v) => imprevista(v, 'anual'),
        (v) => imprevista(v),
      ];
      fabricas.forEach((criar) => {
        expect(anualizarDivida(criar(50))).toBeCloseTo(anualizarDivida(criar(25)) * 2, 10);
      });
    });

    it('ignora o flag removido: quem filtra tombstones é o chamador (storage.carregarDividasLocais)', () => {
      const removida = criarDivida({ tipo: 'diaria', valor: 10, removido: true });
      expect(anualizarDivida(removida)).toBe(3650);
    });

    it('é aritmética pura e não valida o sinal: valor negativo gera total anual negativo', () => {
      // A validação (valor > 0) acontece em ModalDivida; aqui apenas se documenta o comportamento.
      expect(anualizarDivida(diaria(-10))).toBe(-3650);
      expect(anualizarDivida(mensal(-100))).toBe(-1200);
    });
  });
});

describe('calcularResumoDividas', () => {
  const ZERO: ResumoDividas = {
    totalDiario: 0,
    totalMensal: 0,
    totalImprevistosAnualizado: 0,
    totalAnualCalculado: 0,
  };

  it('lista vazia: todos os totais são zero', () => {
    expect(calcularResumoDividas([])).toEqual(ZERO);
  });

  describe('somente dívidas diárias', () => {
    it('totalDiario soma os valores diários e o total anual multiplica por 365', () => {
      const resumo = calcularResumoDividas([diaria(30), diaria(20)]);
      expect(resumo).toEqual({
        totalDiario: 50,
        totalMensal: 0,
        totalImprevistosAnualizado: 0,
        totalAnualCalculado: 50 * 365,
      });
    });

    it('uma única dívida diária', () => {
      expect(calcularResumoDividas([diaria(12)])).toEqual({ ...ZERO, totalDiario: 12, totalAnualCalculado: 4380 });
    });
  });

  describe('somente dívidas mensais', () => {
    it('totalMensal soma os valores mensais e o total anual multiplica por 12', () => {
      const resumo = calcularResumoDividas([mensal(1200), mensal(300)]);
      expect(resumo).toEqual({
        totalDiario: 0,
        totalMensal: 1500,
        totalImprevistosAnualizado: 0,
        totalAnualCalculado: 18000,
      });
    });
  });

  describe('somente dívidas imprevistas (por frequência)', () => {
    const casos: Array<[string, Frequencia, number, number]> = [
      ['diária', 'diaria', 10, 3650],
      ['mensal', 'mensal', 100, 1200],
      ['anual', 'anual', 500, 500],
      ['sem frequência', undefined, 500, 500],
    ];

    it.each(casos)('imprevista %s: entra anualizada em totalImprevistosAnualizado e no total anual', (_nome, frequencia, valor, anual) => {
      expect(calcularResumoDividas([imprevista(valor, frequencia)])).toEqual({
        totalDiario: 0,
        totalMensal: 0,
        totalImprevistosAnualizado: anual,
        totalAnualCalculado: anual,
      });
    });

    it('imprevista diária NÃO entra em totalDiario e imprevista mensal NÃO entra em totalMensal', () => {
      const resumo = calcularResumoDividas([imprevista(10, 'diaria'), imprevista(100, 'mensal')]);
      expect(resumo.totalDiario).toBe(0);
      expect(resumo.totalMensal).toBe(0);
      expect(resumo.totalImprevistosAnualizado).toBe(10 * 365 + 100 * 12);
    });

    it('várias imprevistas de frequências diferentes somam suas versões anualizadas', () => {
      const resumo = calcularResumoDividas([imprevista(2, 'diaria'), imprevista(50, 'mensal'), imprevista(300, 'anual')]);
      expect(resumo.totalImprevistosAnualizado).toBe(730 + 600 + 300);
      expect(resumo.totalAnualCalculado).toBe(1630);
    });
  });

  describe('mistura de tipos', () => {
    // Cenário realista de um motorista de aplicativo.
    const carteira = (): DividaItem[] => [
      diaria(60), // combustível
      diaria(25), // alimentação
      mensal(1100), // parcela do carro
      mensal(250), // seguro
      imprevista(900, 'anual'), // revisão
      imprevista(40, 'mensal'), // reserva para pneus
      imprevista(8, 'diaria'), // pedágio
      imprevista(150), // multa pontual (sem frequência)
    ];

    it('separa e anualiza cada grupo corretamente', () => {
      const resumo = calcularResumoDividas(carteira());
      expect(resumo.totalDiario).toBe(85);
      expect(resumo.totalMensal).toBe(1350);
      // 900 (anual) + 40x12 (mensal) + 8x365 (diária) + 150 (sem frequência) = 900 + 480 + 2920 + 150
      expect(resumo.totalImprevistosAnualizado).toBe(4450);
      // 85x365 + 1350x12 + 4450 = 31025 + 16200 + 4450
      expect(resumo.totalAnualCalculado).toBe(51675);
    });

    it('o total anual é a soma de diário x365, mensal x12 e imprevistos anualizados', () => {
      const resumo = calcularResumoDividas(carteira());
      expect(resumo.totalAnualCalculado).toBe(resumo.totalDiario * 365 + resumo.totalMensal * 12 + resumo.totalImprevistosAnualizado);
    });

    it('o total anual é a soma de anualizarDivida de cada item', () => {
      const itens = carteira();
      const somaItens = itens.reduce((acc, item) => acc + anualizarDivida(item), 0);
      expect(calcularResumoDividas(itens).totalAnualCalculado).toBe(somaItens);
    });

    it('a ordem dos itens não altera o resultado', () => {
      const itens = carteira();
      expect(calcularResumoDividas([...itens].reverse())).toEqual(calcularResumoDividas(itens));
    });

    it('itens repetidos (mesmo valor e tipo) são somados, não mesclados', () => {
      const resumo = calcularResumoDividas([diaria(10), diaria(10), diaria(10)]);
      expect(resumo.totalDiario).toBe(30);
      expect(resumo.totalAnualCalculado).toBe(30 * 365);
    });
  });

  describe('valores com centavos', () => {
    it('soma centavos com tolerância de ponto flutuante', () => {
      const resumo = calcularResumoDividas([diaria(12.34), diaria(5.66), mensal(99.99), imprevista(0.5, 'anual')]);
      expect(resumo.totalDiario).toBeCloseTo(18, 10);
      expect(resumo.totalMensal).toBeCloseTo(99.99, 10);
      expect(resumo.totalImprevistosAnualizado).toBeCloseTo(0.5, 10);
      expect(resumo.totalAnualCalculado).toBeCloseTo(18 * 365 + 99.99 * 12 + 0.5, 6);
    });
  });

  describe('contrato do retorno e da entrada', () => {
    it('devolve exatamente os quatro campos de ResumoDividas', () => {
      const resumo: ResumoDividas = calcularResumoDividas([diaria(1)]);
      expect(Object.keys(resumo).sort()).toEqual(
        ['totalAnualCalculado', 'totalDiario', 'totalImprevistosAnualizado', 'totalMensal'].sort()
      );
      Object.values(resumo).forEach((valor) => expect(typeof valor).toBe('number'));
    });

    it('devolve um objeto novo a cada chamada (sem compartilhar estado)', () => {
      const lista = [diaria(1)];
      const a = calcularResumoDividas(lista);
      const b = calcularResumoDividas(lista);
      expect(a).not.toBe(b);
      a.totalDiario = 999;
      expect(calcularResumoDividas(lista).totalDiario).toBe(1);
    });

    it('não altera a lista nem os itens recebidos (entrada congelada)', () => {
      const lista = congelar([diaria(10), mensal(100), imprevista(5, 'mensal')]);
      const copiaAntes = JSON.stringify(lista);
      expect(() => calcularResumoDividas(lista)).not.toThrow();
      expect(JSON.stringify(lista)).toBe(copiaAntes);
    });

    it('não guarda estado entre chamadas', () => {
      calcularResumoDividas([diaria(1000), mensal(1000), imprevista(1000, 'diaria')]);
      expect(calcularResumoDividas([])).toEqual(ZERO);
    });

    it('soma tudo o que recebe: não filtra itens removidos (tombstones) — o filtro é feito pelo storage', () => {
      // Comportamento atual documentado: App/CarteiraScreen só passam dívidas ativas (carregarDividasLocais).
      const resumo = calcularResumoDividas([diaria(10), criarDivida({ tipo: 'diaria', valor: 10, removido: true })]);
      expect(resumo.totalDiario).toBe(20);
    });
  });

  describe('propriedades com dados pseudoaleatórios (semente fixa)', () => {
    const frequencias: Frequencia[] = ['diaria', 'mensal', 'anual', undefined];

    function listaAleatoria(sorteio: () => number): DividaItem[] {
      const tamanho = Math.floor(sorteio() * 12);
      return Array.from({ length: tamanho }, () => {
        const valor = Math.round(sorteio() * 100000) / 100; // até R$ 1.000,00 com centavos
        const tipoSorteado = sorteio();
        if (tipoSorteado < 0.34) return diaria(valor);
        if (tipoSorteado < 0.67) return mensal(valor);
        return imprevista(valor, frequencias[Math.floor(sorteio() * frequencias.length)]);
      });
    }

    it('em 300 listas aleatórias, o resumo sempre é consistente com anualizarDivida e com a decomposição por tipo', () => {
      const sorteio = criarAleatorio(20261021);
      for (let i = 0; i < 300; i++) {
        const lista = listaAleatoria(sorteio);
        const resumo = calcularResumoDividas(lista);

        const diarias = lista.filter((d) => d.tipo === 'diaria').reduce((a, d) => a + d.valor, 0);
        const mensais = lista.filter((d) => d.tipo === 'mensal').reduce((a, d) => a + d.valor, 0);
        const imprevistas = lista.filter((d) => d.tipo === 'imprevista').reduce((a, d) => a + anualizarDivida(d), 0);
        const somaItens = lista.reduce((a, d) => a + anualizarDivida(d), 0);

        expect(resumo.totalDiario).toBeCloseTo(diarias, 6);
        expect(resumo.totalMensal).toBeCloseTo(mensais, 6);
        expect(resumo.totalImprevistosAnualizado).toBeCloseTo(imprevistas, 6);
        expect(resumo.totalAnualCalculado).toBeCloseTo(somaItens, 5);
        expect(resumo.totalAnualCalculado).toBeCloseTo(resumo.totalDiario * 365 + resumo.totalMensal * 12 + resumo.totalImprevistosAnualizado, 5);
        // valores positivos: nenhum total pode ser negativo
        Object.values(resumo).forEach((total) => expect(total).toBeGreaterThanOrEqual(0));
      }
    });
  });
});

describe('rotuloFrequencia', () => {
  const casos: Array<[Frequencia, string]> = [
    ['diaria', 'Diária'],
    ['mensal', 'Mensal'],
    ['anual', 'Anual / Pontual'],
    [undefined, 'Anual / Pontual'],
  ];

  it.each(casos)('frequência %p → rótulo %p', (frequencia, esperado) => {
    expect(rotuloFrequencia(frequencia)).toBe(esperado);
  });

  it('sem argumento, usa o rótulo de anual/pontual', () => {
    expect(rotuloFrequencia()).toBe('Anual / Pontual');
  });

  it('valor desconhecido (dado corrompido) cai no rótulo de anual/pontual', () => {
    expect(rotuloFrequencia('semestral' as unknown as Frequencia)).toBe('Anual / Pontual');
    expect(rotuloFrequencia('' as unknown as Frequencia)).toBe('Anual / Pontual');
  });

  it('a comparação diferencia maiúsculas de minúsculas ("DIARIA" não é "diaria")', () => {
    expect(rotuloFrequencia('DIARIA' as unknown as Frequencia)).toBe('Anual / Pontual');
  });

  it('o rótulo "Diária" é acentuado (U+00E1) e os três rótulos de frequência são distintos', () => {
    expect(rotuloFrequencia('diaria').charCodeAt(2)).toBe(0x00e1);
    const rotulos = new Set([rotuloFrequencia('diaria'), rotuloFrequencia('mensal'), rotuloFrequencia('anual')]);
    expect(rotulos.size).toBe(3);
  });

  it('é coerente com anualizarDivida: Diária = x365, Mensal = x12, Anual / Pontual = x1', () => {
    const casosFator: Array<[Frequencia, string, number]> = [
      ['diaria', 'Diária', 365],
      ['mensal', 'Mensal', 12],
      ['anual', 'Anual / Pontual', 1],
      [undefined, 'Anual / Pontual', 1],
    ];
    casosFator.forEach(([frequencia, rotulo, fator]) => {
      expect(rotuloFrequencia(frequencia)).toBe(rotulo);
      expect(anualizarDivida(imprevista(7, frequencia))).toBe(7 * fator);
    });
  });
});
