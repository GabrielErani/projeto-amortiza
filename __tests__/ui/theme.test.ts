// Tokens de design: presets coerentes, auxiliares de forma/toque e a regra "nada de literal fora do tema".
import {
  ALVO_TOQUE, circulo, corPorStatus, cores, expandirToque, fonte, layout, ponto, superficies, tamanho, textos,
} from '../../src/theme';

const VALORES_DE_COR = new Set<string>(Object.values(cores));

// A regra de literais lê os fontes. O tsconfig do projeto só carrega os tipos do Jest (sem os do Node),
// então declaramos aqui o mínimo usado; em tempo de execução o Jest fornece require e __dirname.
declare const __dirname: string;
declare function require(modulo: 'fs'): { readFileSync(caminho: string, codificacao: 'utf8'): string; readdirSync(caminho: string): string[] };
declare function require(modulo: 'path'): { resolve(...partes: string[]): string; join(...partes: string[]): string };
const fs = require('fs');
const path = require('path');

describe('tokens de texto', () => {
  const MODIFICADORES = ['forte', 'destaque'];

  it('todo preset de texto (exceto modificadores) tem tamanho da escala e cor do tema', () => {
    const tamanhosDaEscala = new Set<number>(Object.values(fonte).map((f) => f.fontSize));
    for (const [nome, estilo] of Object.entries(textos)) {
      expect(VALORES_DE_COR.has(estilo.color as string)).toBe(true);
      if (MODIFICADORES.includes(nome)) continue;
      expect(tamanhosDaEscala.has((estilo as { fontSize: number }).fontSize)).toBe(true);
    }
  });

  it('a hierarquia segue o mockup: hero > display > título > subtítulo > corpo > legenda > mini', () => {
    const ordem = [textos.hero, textos.display, textos.titulo, textos.subtitulo, textos.corpo, textos.legenda, textos.mini];
    const tamanhos = ordem.map((t) => t.fontSize);
    expect([...tamanhos].sort((a, b) => b - a)).toEqual(tamanhos);
  });
});

describe('superfícies e layout', () => {
  it('cores das superfícies vêm do tema', () => {
    for (const estilo of Object.values(superficies)) {
      for (const valor of Object.values(estilo)) {
        if (typeof valor === 'string' && /^(#|rgba?\(|transparent)/.test(valor)) expect(VALORES_DE_COR.has(valor)).toBe(true);
      }
    }
  });

  it('linhas tocáveis e pílulas respeitam o alvo de toque mínimo', () => {
    expect(superficies.linhaDivisoria.minHeight).toBeGreaterThanOrEqual(ALVO_TOQUE);
    expect(superficies.pilula.minHeight).toBeGreaterThanOrEqual(ALVO_TOQUE);
    expect(superficies.campo.minHeight).toBeGreaterThanOrEqual(ALVO_TOQUE);
  });

  it('layout.linhaEntre combina linha + espaço entre', () => {
    expect(layout.linhaEntre).toEqual({ ...layout.linha, justifyContent: 'space-between' });
  });
});

describe('auxiliares', () => {
  it('circulo: lados iguais, raio pela metade e conteúdo centralizado', () => {
    expect(circulo(34)).toEqual({ ...layout.centro, width: 34, height: 34, borderRadius: 17, backgroundColor: cores.superficieAlta });
    expect(circulo(tamanho.fab, cores.primaria)).toMatchObject({ backgroundColor: cores.primaria, borderRadius: tamanho.fab / 2 });
  });

  it('ponto: tamanho padrão de 7 e variante mini', () => {
    expect(ponto(cores.info)).toEqual({ width: 7, height: 7, borderRadius: 3.5, backgroundColor: cores.info });
    expect(ponto(cores.info, tamanho.pontoMini)).toMatchObject({ width: 4, height: 4 });
  });

  it.each([
    [tamanho.avatar, tamanho.avatar],
    [tamanho.chip, ALVO_TOQUE],
    [fonte.detalhe.fontSize, ALVO_TOQUE],
  ])('expandirToque(%i, %i) leva o alvo até 44', (altura, largura) => {
    const { top, bottom, left, right } = expandirToque(altura, largura);
    expect(altura + top + bottom).toBeGreaterThanOrEqual(ALVO_TOQUE);
    expect(largura + left + right).toBeGreaterThanOrEqual(ALVO_TOQUE);
  });

  it('expandirToque não encolhe alvos que já passam de 44', () => {
    expect(expandirToque(tamanho.campoGrande)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it.each([
    ['atingida', cores.primaria],
    ['adiantada', cores.info],
    ['parcial', cores.alerta],
    ['pendente', cores.neutro],
  ] as const)('corPorStatus("%s")', (status, cor) => {
    expect(corPorStatus(status)).toBe(cor);
  });
});

// Regra do design system: cores, espaçamentos e raios só existem em src/theme.ts.
describe('sem literais de estilo fora do tema', () => {
  const raiz = path.resolve(__dirname, '../..');
  const arquivos = [
    'App.tsx',
    ...fs.readdirSync(path.join(raiz, 'src/components')).map((f) => `src/components/${f}`),
    ...fs.readdirSync(path.join(raiz, 'src/screens')).map((f) => `src/screens/${f}`),
  ].filter((f) => /\.tsx?$/.test(f));
  const PROPS_MEDIDA = [
    'gap', 'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingHorizontal', 'paddingVertical',
    'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
    'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'width', 'height', 'minHeight', 'minWidth', 'maxWidth',
    'fontSize', 'top', 'bottom', 'left', 'right', 'borderWidth',
  ];
  const MEDIDA_LITERAL = new RegExp(`\\b(${PROPS_MEDIDA.join('|')})\\s*:\\s*-?(\\d+(?:\\.\\d+)?)\\b`, 'g');

  it.each(arquivos)('%s não tem cor literal', (arquivo) => {
    const fonteDoArquivo = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
    expect(fonteDoArquivo.match(/['"](#[0-9a-fA-F]{3,8}|rgba?\([^'"]*\)|transparent)['"]/g)).toBeNull();
  });

  it.each(arquivos)('%s não tem espaçamento, raio ou tamanho literal (exceto 0 e 1)', (arquivo) => {
    const fonteDoArquivo = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
    const literais = [...fonteDoArquivo.matchAll(MEDIDA_LITERAL)].filter(([, , n]) => n !== '0' && n !== '1').map(([m]) => m);
    expect(literais).toEqual([]);
  });
});
