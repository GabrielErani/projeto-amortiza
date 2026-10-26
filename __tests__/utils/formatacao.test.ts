// Testes unitários de src/utils/formatacao.ts (formatarMoeda, formatarMoedaCurta, parseValorDigitado).
//
// Observações sobre o ambiente:
//  - O pt-BR do Intl (Node/ICU) devolve U+00A0 (espaço não separável) entre "R$" e o número; as funções do app
//    trocam esse caractere por espaço comum. Por isso as asserções comparam o texto após `normalizarEspacos`
//    e há testes específicos garantindo que U+00A0 nunca sai das funções.

import { formatarMoeda, formatarMoedaCurta, parseValorDigitado } from '../../src/utils/formatacao';

const NBSP = ' ';

/** Troca qualquer variante de espaço (U+00A0, U+202F, tab...) por espaço comum, independente da versão do ICU. */
const normalizarEspacos = (texto: string): string => texto.replace(/[\s  ]/g, ' ');

describe('pré-condição do ambiente (ICU pt-BR)', () => {
  // Se estes testes falharem, o Node está sem dados de locale e os demais testes deste arquivo perdem o sentido.
  it('Intl.NumberFormat pt-BR usa ponto como milhar e vírgula como decimal', () => {
    expect(new Intl.NumberFormat('pt-BR').format(1234567.89)).toBe('1.234.567,89');
  });

  it('o símbolo da moeda BRL em pt-BR é "R$"', () => {
    const partes = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).formatToParts(1);
    expect(partes.find((p) => p.type === 'currency')?.value).toBe('R$');
  });
});

describe('formatarMoeda', () => {
  const casosFormato: Array<[number, string]> = [
    [0, 'R$ 0,00'],
    [1, 'R$ 1,00'],
    [1.5, 'R$ 1,50'],
    [0.99, 'R$ 0,99'],
    [10, 'R$ 10,00'],
    [100, 'R$ 100,00'],
    [999.99, 'R$ 999,99'],
    [1000, 'R$ 1.000,00'],
    [1234.56, 'R$ 1.234,56'],
    [1250.5, 'R$ 1.250,50'],
    [12345.6, 'R$ 12.345,60'],
    [100000, 'R$ 100.000,00'],
    [1234567.89, 'R$ 1.234.567,89'],
    [1e9, 'R$ 1.000.000.000,00'],
  ];

  it.each(casosFormato)('formata %p como %p (milhar com ponto, decimal com vírgula)', (valor, esperado) => {
    expect(normalizarEspacos(formatarMoeda(valor))).toBe(esperado);
  });

  it('sempre exibe exatamente duas casas decimais', () => {
    [0, 1, 1.5, 10.1, 1234, 1234.5, 0.07, 99999.999].forEach((valor) => {
      expect(formatarMoeda(valor)).toMatch(/,\d{2}$/);
    });
  });

  const casosArredondamento: Array<[number, string]> = [
    [1.234, 'R$ 1,23'],
    [1.236, 'R$ 1,24'],
    [2.999, 'R$ 3,00'],
    [0.004, 'R$ 0,00'],
    [0.999, 'R$ 1,00'],
    [19.999, 'R$ 20,00'],
    [1234.567, 'R$ 1.234,57'],
  ];

  it.each(casosArredondamento)('arredonda %p para duas casas: %p', (valor, esperado) => {
    expect(normalizarEspacos(formatarMoeda(valor))).toBe(esperado);
  });

  const casosImprecisaoFloat: Array<[string, number, string]> = [
    ['0,1 + 0,2', 0.1 + 0.2, 'R$ 0,30'],
    ['0,7 + 0,1', 0.7 + 0.1, 'R$ 0,80'],
    ['1,1 * 3', 1.1 * 3, 'R$ 3,30'],
    ['19,99 * 3', 19.99 * 3, 'R$ 59,97'],
    ['4,35 * 100', 4.35 * 100, 'R$ 435,00'],
  ];

  it.each(casosImprecisaoFloat)('a imprecisão binária de %s não vaza para o texto', (_descricao, valor, esperado) => {
    expect(normalizarEspacos(formatarMoeda(valor))).toBe(esperado);
  });

  const casosNegativos: Array<[number, string]> = [
    [-1, '-R$ 1,00'],
    [-0.5, '-R$ 0,50'],
    [-1000, '-R$ 1.000,00'],
    [-1234.56, '-R$ 1.234,56'],
  ];

  it.each(casosNegativos)('formata o negativo %p com o sinal antes do símbolo: %p', (valor, esperado) => {
    expect(normalizarEspacos(formatarMoeda(valor))).toBe(esperado);
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('trata %s como zero (normalizar)', (_nome, valor) => {
    expect(normalizarEspacos(formatarMoeda(valor))).toBe('R$ 0,00');
  });

  it('nunca devolve espaço não separável (U+00A0): o separador após "R$" é um espaço comum', () => {
    [0, 1, 1234.56, -99.9, 1e6, NaN, Infinity].forEach((valor) => {
      const texto = formatarMoeda(valor);
      expect(texto).not.toContain(NBSP);
      expect(texto).toMatch(/^-?R\$ \d/); // espaço U+0020 entre o símbolo e o primeiro dígito
    });
  });

  it('a saída já está normalizada: normalizar os espaços de novo não muda nada', () => {
    [0, 5, 1234.56, -1234.56].forEach((valor) => {
      const texto = formatarMoeda(valor);
      expect(normalizarEspacos(texto)).toBe(texto);
    });
  });

  it('é determinística: a mesma entrada produz sempre a mesma saída (sem estado entre chamadas)', () => {
    const primeira = formatarMoeda(1234.56);
    formatarMoeda(99999);
    formatarMoeda(-1);
    expect(formatarMoeda(1234.56)).toBe(primeira);
  });

  describe('zero negativo', () => {
    // Regressão: o Intl mostrava o sinal de menos para -0 e para negativos que arredondam para zero.
    // Hoje o resultado é "-R$ 0,00"; o esperado para o usuário é "R$ 0,00".
    it('formatarMoeda(-0) retorna "R$ 0,00"', () => {
      expect(normalizarEspacos(formatarMoeda(-0))).toBe('R$ 0,00');
    });

    it('formatarMoeda(-0.001) retorna "R$ 0,00"', () => {
      expect(normalizarEspacos(formatarMoeda(-0.001))).toBe('R$ 0,00');
    });

    it('resto de subtração em ponto flutuante (0,3 - 0,1 - 0,2) exibe "R$ 0,00"', () => {
      expect(normalizarEspacos(formatarMoeda(0.3 - 0.1 - 0.2))).toBe('R$ 0,00');
    });
  });
});

describe('formatarMoedaCurta', () => {
  const casosFormato: Array<[number, string]> = [
    [0, 'R$ 0'],
    [1, 'R$ 1'],
    [99.4, 'R$ 99'],
    [99.5, 'R$ 100'],
    [100, 'R$ 100'],
    [999, 'R$ 999'],
    [1000, 'R$ 1.000'],
    [1234.4, 'R$ 1.234'],
    [1234.56, 'R$ 1.235'],
    [1250.5, 'R$ 1.251'],
    [1234567.89, 'R$ 1.234.568'],
    [1e9, 'R$ 1.000.000.000'],
  ];

  it.each(casosFormato)('formata %p sem centavos como %p', (valor, esperado) => {
    expect(normalizarEspacos(formatarMoedaCurta(valor))).toBe(esperado);
  });

  it('nunca exibe vírgula nem casas decimais', () => {
    [0, 0.49, 1.5, 99.99, 1234.56, 1e6 + 0.5].forEach((valor) => {
      expect(formatarMoedaCurta(valor)).not.toContain(',');
    });
  });

  // Intl arredonda "metade para longe do zero" (e não para o par): 0,5 → 1; 1,5 → 2; 2,5 → 3.
  const casosMeioReal: Array<[number, string]> = [
    [0.5, 'R$ 1'],
    [1.5, 'R$ 2'],
    [2.5, 'R$ 3'],
    [3.5, 'R$ 4'],
  ];

  it.each(casosMeioReal)('arredonda o meio (%p) para cima: %p', (valor, esperado) => {
    expect(normalizarEspacos(formatarMoedaCurta(valor))).toBe(esperado);
  });

  const casosNegativos: Array<[number, string]> = [
    [-50, '-R$ 50'],
    [-1000, '-R$ 1.000'],
    [-1234.56, '-R$ 1.235'],
  ];

  it.each(casosNegativos)('formata o negativo %p como %p', (valor, esperado) => {
    expect(normalizarEspacos(formatarMoedaCurta(valor))).toBe(esperado);
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('trata %s como zero (normalizar)', (_nome, valor) => {
    expect(normalizarEspacos(formatarMoedaCurta(valor))).toBe('R$ 0');
  });

  it('nunca devolve espaço não separável (U+00A0) e usa espaço comum após "R$"', () => {
    [0, 1, 1234.56, -99.9, 1e6, NaN].forEach((valor) => {
      const texto = formatarMoedaCurta(valor);
      expect(texto).not.toContain(NBSP);
      expect(texto).toMatch(/^-?R\$ \d/);
    });
  });

  it('para inteiros, é igual a formatarMoeda sem o sufixo ",00"', () => {
    [0, 7, 100, 1000, 25000, 1234567, -300].forEach((valor) => {
      expect(formatarMoedaCurta(valor)).toBe(formatarMoeda(valor).replace(/,00$/, ''));
    });
  });

  describe('zero negativo', () => {
    // Regressão: mesma causa de formatarMoeda — o Intl mantinha o sinal em -0 e em negativos que arredondam para 0.
    it('formatarMoedaCurta(-0) retorna "R$ 0"', () => {
      expect(normalizarEspacos(formatarMoedaCurta(-0))).toBe('R$ 0');
    });

    it('formatarMoedaCurta(-0.4) retorna "R$ 0"', () => {
      expect(normalizarEspacos(formatarMoedaCurta(-0.4))).toBe('R$ 0');
    });
  });
});

describe('parseValorDigitado', () => {
  const casosValidos: Array<[string, number]> = [
    // formato brasileiro: ponto = milhar, vírgula = decimal
    ['1.250,50', 1250.5],
    ['1.234.567,89', 1234567.89],
    ['10.000,00', 10000],
    ['1.000,5', 1000.5],
    ['999,99', 999.99],
    ['0,50', 0.5],
    // ponto decimal, sem vírgula
    ['1250.50', 1250.5],
    ['99.99', 99.99],
    ['0.5', 0.5],
    ['100.00', 100],
    // somente vírgula decimal
    ['1,5', 1.5],
    ['0,01', 0.01],
    ['10,5', 10.5],
    // inteiros
    ['100', 100],
    ['50', 50],
    ['0', 0],
    ['00012', 12],
    ['1000000', 1000000],
  ];

  it.each(casosValidos)('lê "%s" como %p', (texto, esperado) => {
    expect(parseValorDigitado(texto)).toBe(esperado);
  });

  it('o lançamento de R$ 250 (como digitado no app) vale 250', () => {
    expect(parseValorDigitado('250')).toBe(250);
    expect(parseValorDigitado('250,00')).toBe(250);
    expect(parseValorDigitado('250.00')).toBe(250);
  });

  describe('vazio, espaços e texto sem número', () => {
    const casosZero: Array<[string, string]> = [
      ['string vazia', ''],
      ['só espaços', '   '],
      ['só tab e quebra de linha', '\t\n'],
      ['só espaço não separável', NBSP],
      ['letras', 'abc'],
      ['só sinal de menos', '-'],
      ['só sinal de mais', '+'],
      ['só ponto', '.'],
      ['só vírgula', ','],
      ['duas vírgulas', ',,'],
      ['dois pontos', '..'],
      ['só o símbolo R$', 'R$'],
      ['dois sinais de menos', '--5'],
      ['símbolos', '!@#'],
      ['a palavra NaN', 'NaN'],
    ];

    it.each(casosZero)('retorna 0 para %s', (_descricao, texto) => {
      expect(parseValorDigitado(texto)).toBe(0);
    });

    it.each([
      ['Infinity', 'Infinity'],
      ['-Infinity', '-Infinity'],
      ['1e999 (estoura o double)', '1e999'],
    ])('retorna 0 para valor não finito: %s', (_descricao, texto) => {
      expect(parseValorDigitado(texto)).toBe(0);
    });
  });

  describe('espaços no meio ou nas pontas', () => {
    const casosEspacos: Array<[string, number]> = [
      ['  42  ', 42],
      [' 1.250,50 ', 1250.5],
      ['1 250,50', 1250.5],
      [`1${NBSP}250,50`, 1250.5],
      ['1\t250', 1250],
      ['  12,5', 12.5],
    ];

    it.each(casosEspacos)('ignora os espaços de %j → %p', (texto, esperado) => {
      expect(parseValorDigitado(texto)).toBe(esperado);
    });
  });

  describe('sinais', () => {
    const casosSinal: Array<[string, number]> = [
      ['-50', -50],
      ['-12', -12],
      ['-1.250,50', -1250.5],
      ['-0,5', -0.5],
      ['-,5', -0.5],
      ['+5', 5],
    ];

    it.each(casosSinal)('lê "%s" como %p (o sinal é preservado; a validação fica na tela)', (texto, esperado) => {
      expect(parseValorDigitado(texto)).toBe(esperado);
    });
  });

  describe('vírgula e ponto nas bordas', () => {
    const casosBorda: Array<[string, number]> = [
      [',5', 0.5],
      ['5,', 5],
      ['5.', 5],
      ['.5', 0.5],
      ['1.250,', 1250],
      ['0,00', 0],
      ['0.0', 0],
    ];

    it.each(casosBorda)('lê "%s" como %p', (texto, esperado) => {
      expect(parseValorDigitado(texto)).toBe(esperado);
    });
  });

  describe('regra "com vírgula, o ponto é milhar"', () => {
    it('remove todos os pontos quando existe vírgula', () => {
      expect(parseValorDigitado('1.2.3,4')).toBe(123.4);
    });

    it('só a primeira vírgula é o separador decimal (o resto é ignorado pelo parseFloat)', () => {
      expect(parseValorDigitado('1,5,5')).toBe(1.5);
    });

    it('sem vírgula, o ponto continua sendo o separador decimal do JavaScript', () => {
      expect(parseValorDigitado('1250.5')).toBe(1250.5);
    });
  });

  describe('texto misturado com letras (parseFloat é leniente)', () => {
    it.each([
      ['12abc', 12],
      ['1,5abc', 1.5],
      ['50 reais', 50],
    ] as Array<[string, number]>)('aproveita o número no início de "%s" → %p', (texto, esperado) => {
      expect(parseValorDigitado(texto)).toBe(esperado);
    });

    it.each([
      ['US$ 5'],
      ['abc123'],
    ])('não aceita outros prefixos/letras antes do número: "%s" → 0', (texto) => {
      expect(parseValorDigitado(texto)).toBe(0);
    });

    it('reinterpreta o texto produzido por formatarMoeda (que começa com "R$"): ida e volta exata', () => {
      expect(parseValorDigitado(formatarMoeda(1250.5))).toBe(1250.5);
      expect(parseValorDigitado(formatarMoedaCurta(1250))).toBe(1250);
    });
  });

  describe('ida e volta com os formatos gerados pelo próprio app', () => {
    const valores = [0.01, 1, 12.5, 100, 1234.56, 99999.99];

    it('lê de volta o texto do OCR no formato toFixed(2) com vírgula (App.tsx → setValorDigitado)', () => {
      valores.forEach((valor) => {
        expect(parseValorDigitado(valor.toFixed(2).replace('.', ','))).toBe(valor);
      });
    });

    it('lê de volta números formatados em pt-BR com milhar (ex.: "1.234,56")', () => {
      [...valores, 1234567.89].forEach((valor) => {
        const textoBR = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        expect(parseValorDigitado(textoBR)).toBe(valor);
      });
    });

    it('lê de volta a meta exibida no modal: inteiro sem decimais e fracionário com vírgula', () => {
      const textoMeta = (meta: number) => (meta % 1 === 0 ? String(meta) : meta.toFixed(2).replace('.', ','));
      expect(parseValorDigitado(textoMeta(100))).toBe(100);
      expect(parseValorDigitado(textoMeta(150.5))).toBe(150.5);
      expect(parseValorDigitado(textoMeta(1000))).toBe(1000);
    });
  });

  it('sempre devolve um número finito, mesmo para entradas hostis', () => {
    const hostis = ['', 'abc', 'Infinity', '1e999', '--', ',,,', '1.2.3.4', '９９', '\u0000', '1e', 'e5', '0x10', '١٢٣'];
    hostis.forEach((texto) => {
      const n = parseValorDigitado(texto);
      expect(typeof n).toBe('number');
      expect(Number.isFinite(n)).toBe(true);
    });
  });

  describe('milhar com ponto sem vírgula (padrão brasileiro de digitação)', () => {
    // Regressão: "1.250" era lido como 1,25. Ponto em grupos de exatamente 3 dígitos agora é milhar;
    // ponto seguido de 1 ou 2 dígitos continua decimal.
    it.each([
      ['1.250', 1250],
      ['1.000', 1000],
      ['1.250.000', 1250000],
      ['12.345', 12345],
      ['1.5', 1.5],
      ['150.50', 150.5],
      ['0.500', 0.5],
      ['1.2345', 1.2345],
    ] as Array<[string, number]>)('"%s" é lido como %p', (texto, esperado) => {
      expect(parseValorDigitado(texto)).toBe(esperado);
    });

    it('aceita o prefixo "R$" e espaços: "R$ 1.250,50" → 1250.5 e "R$ 100" → 100', () => {
      expect(parseValorDigitado('R$ 1.250,50')).toBe(1250.5);
      expect(parseValorDigitado('R$ 100')).toBe(100);
      expect(parseValorDigitado('r$100')).toBe(100);
    });

    it('formato americano "1,234.56" vira 1,23456 (a vírgula decide e o ponto é descartado)', () => {
      expect(parseValorDigitado('1,234.56')).toBe(1.23456);
    });
  });

  describe('zero negativo', () => {
    // Regressão: parseFloat('-0') devolvia -0 e formatarMoeda exibia "-R$ 0,00".
    it('"-0" vira 0 positivo', () => {
      expect(Object.is(parseValorDigitado('-0'), -0)).toBe(false);
    });

    it('formatarMoeda(parseValorDigitado("-0,00")) exibe "R$ 0,00"', () => {
      expect(normalizarEspacos(formatarMoeda(parseValorDigitado('-0,00')))).toBe('R$ 0,00');
    });
  });
});
