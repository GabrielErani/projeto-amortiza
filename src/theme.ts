// Design tokens do Amortiza — tema escuro e minimalista.
// Espelha os tokens --app-* do mockup aprovado. Telas e componentes compõem a partir destes
// presets: nenhum literal de cor, espaçamento ou raio deve ficar fora deste arquivo.
import { StyleSheet } from 'react-native';

// ─── Primitivos ──────────────────────────────────────────────────────────────

export const cores = {
  fundo: '#0A0F1D', // --app-bg
  superficie: '#111827', // --app-surface
  superficieAlta: '#1E293B', // --app-surface-2
  borda: '#1F2937', // --app-line
  texto: '#F8FAFC', // --app-text
  textoSuave: '#94A3B8', // --app-text-2
  textoApagado: '#64748B', // --app-text-3
  primaria: '#00E676', // --app-primary
  primariaTexto: '#0A0F1D',
  primariaSuave: 'rgba(0, 230, 118, 0.12)',
  info: '#38BDF8', // --app-info
  alerta: '#FBBF24', // --app-warn
  erro: '#F87171', // --app-danger
  erroSuave: 'rgba(248, 113, 113, 0.12)',
  erroBorda: 'rgba(248, 113, 113, 0.35)',
  neutro: '#334155', // borda de campos e botões secundários
  contorno: 'rgba(248, 250, 252, 0.75)', // barra selecionada no gráfico
  overlay: 'rgba(2, 6, 23, 0.62)',
  transparente: 'transparent',
} as const;

export const espaco = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const raio = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Escala tipográfica (tamanho e peso). Para texto já com cor, use `textos`. */
export const fonte = {
  hero: { fontSize: 40, fontWeight: '800', letterSpacing: -0.8 },
  valor: { fontSize: 28, fontWeight: '800' }, // campo de valor grande
  display: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  titulo: { fontSize: 20, fontWeight: '800' },
  tituloSheet: { fontSize: 18, fontWeight: '800' },
  subtitulo: { fontSize: 15, fontWeight: '700' },
  campo: { fontSize: 15, fontWeight: '400' },
  corpo: { fontSize: 14, fontWeight: '400' },
  detalhe: { fontSize: 13, fontWeight: '400' },
  legenda: { fontSize: 12, fontWeight: '500' },
  mini: { fontSize: 11, fontWeight: '500' },
} as const;

/** Altura mínima de alvo de toque acessível. */
export const ALVO_TOQUE = 44;

/** Medidas de elementos que se repetem pelo app. */
export const tamanho = {
  botao: 48,
  campoGrande: 60,
  chip: 28, // altura visual do chip de sync (o toque é expandido até ALVO_TOQUE)
  avatar: 34,
  avatarGrande: 44,
  marca: 40,
  fab: 56,
  iconeConfirmacao: 56,
  ponto: 7,
  pontoMini: 4,
  quadradoLegenda: 8,
  alca: 40,
  trilha: 4, // barra de progresso, alça do sheet e ícone da aba Semana
  iconeAba: 22,
  iconeCarteira: 14,
  contorno: 2, // borda de destaque (barra selecionada, ícone da carteira)
  grafico: 120, // altura das barras
  barra: 28, // largura máxima de uma barra
  barraMinimaPct: 8, // altura mínima (em %) para a barra de um dia sem ganho continuar visível
} as const;

export const opacidade = { toque: 0.8, inativo: 0.55 } as const;

// ─── Presets ─────────────────────────────────────────────────────────────────

/** Texto com cor. Suave = secundário (#94A3B8); Apagado = terciário (#64748B). */
export const textos = StyleSheet.create({
  hero: { ...fonte.hero, color: cores.texto },
  display: { ...fonte.display, color: cores.texto },
  titulo: { ...fonte.titulo, color: cores.texto },
  tituloSheet: { ...fonte.tituloSheet, color: cores.texto },
  subtitulo: { ...fonte.subtitulo, color: cores.texto },
  corpo: { ...fonte.corpo, color: cores.texto },
  corpoSuave: { ...fonte.corpo, color: cores.textoSuave },
  detalhe: { ...fonte.detalhe, color: cores.textoSuave },
  legenda: { ...fonte.legenda, color: cores.textoSuave },
  legendaSuave: { ...fonte.legenda, color: cores.textoApagado },
  mini: { ...fonte.mini, color: cores.textoApagado },
  rotuloMaiusculo: { ...fonte.mini, color: cores.textoApagado, textTransform: 'uppercase', letterSpacing: 0.8 },
  erro: { ...fonte.legenda, color: cores.erro },
  // Modificadores (sem tamanho): ênfase neutra e ênfase na cor primária.
  forte: { color: cores.texto, fontWeight: '700' },
  destaque: { color: cores.primaria, fontWeight: '700' },
});

export const layout = StyleSheet.create({
  preencher: { flex: 1 },
  linha: { flexDirection: 'row', alignItems: 'center' },
  linhaEntre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  centro: { alignItems: 'center', justifyContent: 'center' },
  gapXs: { gap: espaco.xs },
  gapSm: { gap: espaco.sm },
  gapMd: { gap: espaco.md },
  gapLg: { gap: espaco.lg },
  gapXl: { gap: espaco.xl },
});

export const superficies = StyleSheet.create({
  cardBase: {
    gap: espaco.sm, padding: espaco.lg, borderRadius: raio.lg,
    borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.superficie,
  },
  chip: {
    ...layout.linha, gap: espaco.xs, minHeight: tamanho.chip, paddingHorizontal: espaco.sm,
    borderRadius: raio.pill, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.superficie,
  },
  linhaDivisoria: {
    ...layout.linha, gap: espaco.sm, minHeight: ALVO_TOQUE, paddingVertical: espaco.md,
    borderTopWidth: 1, borderTopColor: cores.borda,
  },
  sheet: {
    gap: espaco.md, paddingHorizontal: espaco.xl, paddingTop: espaco.md, paddingBottom: espaco.xxl,
    borderTopLeftRadius: raio.xl, borderTopRightRadius: raio.xl, backgroundColor: cores.superficie,
  },
  campo: {
    ...layout.linha, gap: espaco.xs, minHeight: tamanho.botao, paddingHorizontal: espaco.md,
    borderRadius: raio.md, borderWidth: 1, borderColor: cores.neutro, backgroundColor: cores.superficie,
  },
  pilula: {
    ...layout.centro, minHeight: ALVO_TOQUE, paddingHorizontal: espaco.xs,
    borderRadius: raio.sm, backgroundColor: cores.superficieAlta,
  },
});

export const sombras = StyleSheet.create({
  fab: { shadowColor: cores.primaria, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
});

// ─── Auxiliares ──────────────────────────────────────────────────────────────

/** Círculo com conteúdo centralizado (avatar, FAB, ícone de confirmação). */
export function circulo(lado: number, cor: string = cores.superficieAlta) {
  return { ...layout.centro, width: lado, height: lado, borderRadius: lado / 2, backgroundColor: cor };
}

/** Ponto colorido (status do dia, dia de hoje, estado da nuvem). */
export function ponto(cor: string, lado: number = tamanho.ponto) {
  return { width: lado, height: lado, borderRadius: lado / 2, backgroundColor: cor };
}

/** hitSlop que leva um alvo visual menor até ALVO_TOQUE sem mudar o layout. */
export function expandirToque(altura: number, largura: number = altura) {
  const vertical = Math.max(0, Math.ceil((ALVO_TOQUE - altura) / 2));
  const horizontal = Math.max(0, Math.ceil((ALVO_TOQUE - largura) / 2));
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

export function corPorStatus(status: 'atingida' | 'parcial' | 'pendente' | 'adiantada'): string {
  switch (status) {
    case 'atingida':
      return cores.primaria;
    case 'adiantada':
      return cores.info;
    case 'parcial':
      return cores.alerta;
    default:
      return cores.neutro;
  }
}
