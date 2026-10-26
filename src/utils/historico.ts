// Histórico de registros de ganho salvos no aparelho (fonte: AsyncStorage).
import { RegistroGanhoLocal } from '../types';
import { SIGLAS_DIAS } from './datas';

export const LIMITE_HISTORICO = 30;

// "2026-10-26" → "Seg" (meio-dia evita erro de fuso na virada do dia)
export function siglaDoDiaISO(dataISO: string): string {
  const dia = new Date(`${dataISO}T12:00:00`).getDay(); // 0 = domingo
  return SIGLAS_DIAS[(dia + 6) % 7] ?? '';
}

/**
 * Lista os registros locais do mais recente para o mais antigo (por dataISO),
 * limitada a `limite` itens. Registros vindos da nuvem sem descrição recebem
 * a mesma descrição gerada ao salvar ("Ganho Seg").
 */
export function montarHistoricoGanhos(
  mapa: Record<string, RegistroGanhoLocal>,
  limite: number = LIMITE_HISTORICO
): RegistroGanhoLocal[] {
  return Object.values(mapa)
    .filter((r): r is RegistroGanhoLocal => !!r && typeof r.dataISO === 'string')
    .sort((a, b) => b.dataISO.localeCompare(a.dataISO))
    .slice(0, Math.max(0, limite))
    .map((r) => (r.descricao ? r : { ...r, descricao: `Ganho ${siglaDoDiaISO(r.dataISO)}` }));
}
