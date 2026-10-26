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
  valorCoberto: number; // Quanto da meta deste dia está coberto (trabalhado + amortizado)
  metaBase: number;     // Meta base deste dia (ex: 100)
  percentual: number;   // 0% a 100% da meta coberta neste dia
  statusAmortizacao: 'atingida' | 'parcial' | 'pendente' | 'adiantada';
  detalheAmortizacao: string; // Ex: "100% pago", "Amortizado por Seg", "Faltam R$ 50"
  isHoje: boolean;
  temRegistro: boolean;
}
