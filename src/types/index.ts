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
}

// Representa uma semana do mês no seletor da Carteira
export interface SemanaMesInfo {
  numeroSemana: number;
  rotulo: string; // Ex: "Semana 1 (01-07 out)"
  dataInicioISO: string;
  dataFimISO: string;
  totalGanhos: number;
  isAtual: boolean;
}
