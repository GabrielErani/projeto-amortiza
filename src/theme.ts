// Design tokens do Amortiza — paleta escura, minimalista.

export const cores = {
  fundo: '#0A0F1D',
  superficie: '#111827',
  superficieAlta: '#1E293B',
  borda: '#1F2937',
  texto: '#F8FAFC',
  textoSuave: '#94A3B8',
  textoApagado: '#64748B',
  primaria: '#00E676',
  primariaTexto: '#0A0F1D',
  info: '#38BDF8',
  alerta: '#FBBF24',
  erro: '#F87171',
  neutro: '#334155',
  overlay: 'rgba(2, 6, 23, 0.7)',
} as const;

export const espaco = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const raio = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const fonte = {
  hero: { fontSize: 40, fontWeight: '700' as const, letterSpacing: -1 },
  titulo: { fontSize: 20, fontWeight: '700' as const },
  subtitulo: { fontSize: 16, fontWeight: '600' as const },
  corpo: { fontSize: 14, fontWeight: '400' as const },
  legenda: { fontSize: 12, fontWeight: '500' as const },
  mini: { fontSize: 11, fontWeight: '500' as const },
} as const;

// Altura mínima de alvo de toque acessível
export const ALVO_TOQUE = 44;

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
