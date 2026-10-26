// Definição de Tipos da Aplicação
// Documentação TypeScript: https://www.typescriptlang.org/docs/

export interface MetaNumerica {
  id?: string;
  created_at?: string;
  descricao: string;
  valor_meta: number;
  valor_atingido: number;
  percentual: number;
  data_referencia?: string;
}

export interface ResultadoOCR {
  textoBruto: string;
  valorMetaExtrado: number | null;
  percentualExtraido: number | null;
}

// Representa os dados de ganho e o status de amortização de um dia da semana
export interface GanhoDia {
  data: Date;           // Objeto Date do dia
  dataISO: string;      // Formato YYYY-MM-DD para lookup
  dataExibicao: string; // "26 de out"
  diaCompleto: string;  // "Segunda-feira, 26 de out"
  sigla: string;        // "Seg", "Ter", ..., "Dom"
  valor: number;        // Ganho real trabalhado neste dia
  valorCoberto: number; // Quanto da meta deste dia está coberto
  metaBase: number;     // Meta base deste dia (ex: 100)
  percentual: number;   // 0% a 100% da meta coberta neste dia
  statusAmortizacao: 'atingida' | 'parcial' | 'pendente' | 'adiantada';
  detalheAmortizacao: string; // Ex: "100% ✓", "Amortizado por Seg"
  isHoje: boolean;
  temRegistro: boolean;
}

// Representa um item de dívida / custo na Carteira
export interface DividaItem {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'diaria' | 'mensal' | 'imprevista';
  frequenciaImprevisto?: 'diaria' | 'mensal' | 'anual';
  dataLancamento: string;
  atualizadoEm?: string; // ISO datetime — usado no merge last-write-wins
  removido?: boolean;    // Soft delete (tombstone) para sincronizar exclusões
}

// Representa uma semana do mês no seletor da Carteira
export interface SemanaMesInfo {
  numeroSemana: number;
  rotulo: string; // Ex: "Sem 2 (5–11 out)" ou "Sem 1 (28 set – 4 out)" quando cruza o mês
  dataInicioISO: string;
  dataFimISO: string;
  totalGanhos: number;
  isAtual: boolean;
}

// ─── AUTENTICAÇÃO & SINCRONIZAÇÃO ────────────────────────────────────────────

// Usuário autenticado (espelho simplificado do Supabase Auth)
export interface Usuario {
  id: string;
  email: string | null;
  nome: string | null;
}

// Registro local de ganho de um dia (fonte da verdade offline-first)
export interface RegistroGanhoLocal {
  dataISO: string;      // YYYY-MM-DD (chave única por dia)
  valor: number;
  metaDoDia: number;
  percentual: number;
  descricao?: string;
  atualizadoEm: string; // ISO datetime — usado no merge last-write-wins
}

// Resultado padrão de qualquer chamada de serviço (auth, nuvem, sync)
export type ResultadoServico<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

// Estado da sincronização com a nuvem exibido na UI
export type StatusSync = 'sem_conta' | 'offline' | 'sincronizando' | 'ok' | 'erro';

export interface EstadoSync {
  status: StatusSync;
  ultimaSync?: string; // ISO datetime da última sincronização bem-sucedida
  mensagem?: string;   // Texto curto amigável para exibir ao usuário
}
