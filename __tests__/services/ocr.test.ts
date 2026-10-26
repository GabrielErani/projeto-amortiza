// Testes unitários do OCR local (src/services/ocr.ts).
// extrairValorNumerico/extrairPercentual não são exportadas, então são testadas
// através de processarOCRLocal com o módulo nativo do ML Kit mockado.

type ModuloOCR = typeof import('../../src/services/ocr');

// O prefixo "mock" permite usar a variável na fábrica do jest.mock (que é içada e
// só é executada quando o ocr.ts faz o require, depois desta linha).
const mockRecognize = jest.fn<Promise<{ text?: string }>, [string]>();

jest.mock('@react-native-ml-kit/text-recognition', () => ({ default: { recognize: mockRecognize } }), {
  virtual: true,
});

const MODULO_ML_KIT = '@react-native-ml-kit/text-recognition';
const URI = 'file:///cache/print-da-meta.png';
const TEXTO_DEMONSTRATIVO = 'Meta Mensal de Vendas R$ 2.500,00 atingido 75% (Modo Demonstrativo Expo Go)';
const MSG_FALHA_OCR = 'Falha no reconhecimento óptico de caracteres no dispositivo.';

let ocr: ModuloOCR;
let avisoConsole: jest.SpyInstance;
let erroConsole: jest.SpyInstance;

function carregarOCR(): ModuloOCR {
  jest.resetModules();
  return require('../../src/services/ocr');
}

/** Executa o OCR fazendo o ML Kit "ler" o texto informado. */
async function ocrDoTexto(texto: string | undefined) {
  mockRecognize.mockResolvedValue({ text: texto });
  return ocr.processarOCRLocal(URI);
}

beforeEach(() => {
  mockRecognize.mockReset();
  avisoConsole = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  erroConsole = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  ocr = carregarOCR();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('processarOCRLocal com o ML Kit disponível', () => {
  it('reconhece a imagem pela URI e devolve o texto bruto lido', async () => {
    const resultado = await ocrDoTexto('Ganhos do dia R$ 1.500,00');

    expect(mockRecognize).toHaveBeenCalledTimes(1);
    expect(mockRecognize).toHaveBeenCalledWith(URI);
    expect(resultado.textoBruto).toBe('Ganhos do dia R$ 1.500,00');
    expect(avisoConsole).not.toHaveBeenCalled();
  });

  describe('extração do valor (extrairValorNumerico)', () => {
    it('extrai "R$ 1.500,00" como 1500', async () => {
      await expect(ocrDoTexto('Meta: R$ 1.500,00')).resolves.toEqual({
        textoBruto: 'Meta: R$ 1.500,00',
        valorMetaExtrado: 1500,
        percentualExtraido: null,
      });
    });

    it.each([
      ['R$1.500,00', 1500],
      ['R$ 999,99', 999.99],
      ['R$ 0,50', 0.5],
      ['1.500', 1500],
      ['R$ 1.234.567,89', 1234567.89],
      ['Total 250', 250],
    ])('extrai "%s" como %p', async (texto, esperado) => {
      expect((await ocrDoTexto(texto)).valorMetaExtrado).toBe(esperado);
    });

    // Regressão: números com 4+ dígitos sem separador de milhar eram truncados ("1500.00" virava 150).
    it('extrai "1500.00" como 1500', async () => {
      expect((await ocrDoTexto('Faturamento 1500.00')).valorMetaExtrado).toBe(1500);
    });

    it('extrai "R$ 2500,00" (sem separador de milhar) como 2500', async () => {
      expect((await ocrDoTexto('R$ 2500,00')).valorMetaExtrado).toBe(2500);
    });

    // Regressão: o primeiro número do texto vencia, mesmo sendo um percentual.
    it('prefere o valor em reais a um percentual que aparece antes', async () => {
      expect((await ocrDoTexto('Atingido 85% da meta de R$ 1.500,00')).valorMetaExtrado).toBe(1500);
    });
  });

  describe('extração do percentual (extrairPercentual)', () => {
    it('extrai "85%" como 85', async () => {
      expect((await ocrDoTexto('Progresso 85%')).percentualExtraido).toBe(85);
    });

    it('extrai "85,5%" (vírgula decimal) como 85.5', async () => {
      expect((await ocrDoTexto('Progresso 85,5%')).percentualExtraido).toBe(85.5);
    });

    it('extrai "85.5 %" (ponto decimal e espaço antes do %) como 85.5', async () => {
      expect((await ocrDoTexto('Progresso 85.5 %')).percentualExtraido).toBe(85.5);
    });

    it('devolve null quando não há percentual', async () => {
      expect((await ocrDoTexto('R$ 1.500,00')).percentualExtraido).toBeNull();
    });
  });

  it('extrai valor e percentual do mesmo texto', async () => {
    await expect(ocrDoTexto('Meta R$ 2.500,00 atingida em 75%')).resolves.toEqual({
      textoBruto: 'Meta R$ 2.500,00 atingida em 75%',
      valorMetaExtrado: 2500,
      percentualExtraido: 75,
    });
  });

  it('texto sem números devolve valor e percentual nulos', async () => {
    await expect(ocrDoTexto('Nenhum valor por aqui')).resolves.toEqual({
      textoBruto: 'Nenhum valor por aqui',
      valorMetaExtrado: null,
      percentualExtraido: null,
    });
  });

  it.each([
    ['texto vazio', ''],
    ['sem campo text', undefined],
  ])('resultado com %s vira texto bruto vazio e nulos', async (_caso, texto) => {
    await expect(ocrDoTexto(texto)).resolves.toEqual({
      textoBruto: '',
      valorMetaExtrado: null,
      percentualExtraido: null,
    });
  });

  it('erro do recognize vira Error com mensagem em português (e é registrado no console)', async () => {
    const erroNativo = new Error('ML Kit: image decode failed');
    mockRecognize.mockRejectedValue(erroNativo);

    const promessa = ocr.processarOCRLocal(URI);

    await expect(promessa).rejects.toBeInstanceOf(Error);
    await expect(promessa).rejects.toThrow(MSG_FALHA_OCR);
    expect(erroConsole).toHaveBeenCalledWith('Erro no processamento OCR Local:', erroNativo);
  });

  it('erro síncrono do recognize também vira Error com mensagem em português', async () => {
    mockRecognize.mockImplementation(() => {
      throw new Error('módulo não linkado');
    });
    await expect(ocr.processarOCRLocal(URI)).rejects.toThrow(MSG_FALHA_OCR);
  });
});

describe('processarOCRLocal sem o módulo nativo (Expo Go)', () => {
  function carregarOCRCom(fabrica: () => unknown): ModuloOCR {
    jest.resetModules();
    jest.doMock(MODULO_ML_KIT, fabrica, { virtual: true });
    return require('../../src/services/ocr');
  }

  afterEach(() => {
    // Restaura o mock padrão para os demais testes.
    jest.doMock(MODULO_ML_KIT, () => ({ default: { recognize: mockRecognize } }), { virtual: true });
  });

  it('usa o texto demonstrativo e avisa no console quando o require do módulo falha', async () => {
    const ocrSemNativo = carregarOCRCom(() => {
      throw new Error(`Cannot find module '${MODULO_ML_KIT}'`);
    });

    expect(avisoConsole).toHaveBeenCalledWith('Módulo nativo ML Kit não disponível no Expo Go padrão.');
    await expect(ocrSemNativo.processarOCRLocal(URI)).resolves.toEqual({
      textoBruto: TEXTO_DEMONSTRATIVO,
      valorMetaExtrado: 2500,
      percentualExtraido: 75,
    });
    expect(mockRecognize).not.toHaveBeenCalled();
  });

  it('usa o texto demonstrativo quando o módulo carrega mas não expõe recognize', async () => {
    const ocrSemRecognize = carregarOCRCom(() => ({ default: {} }));

    await expect(ocrSemRecognize.processarOCRLocal(URI)).resolves.toEqual({
      textoBruto: TEXTO_DEMONSTRATIVO,
      valorMetaExtrado: 2500,
      percentualExtraido: 75,
    });
  });
});
