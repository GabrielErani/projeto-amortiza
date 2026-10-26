// Definição de Tipos da Aplicação
// Documentação TypeScript: https://www.typescriptlang.org/docs/

export interface MetaNumerica {
  id?: string;
  created_at?: string;
  descricao: string;
  valor_meta: number;
  valor_atingido: number;
  percentual: number;
  data_referencia?: string; // Data no formato YYYY-MM-DD para vincular ao dia correto
}

export interface ResultadoOCR {
  textoBruto: string;
  valorMetaExtrado: number | null;
  percentualExtraido: number | null;
}

// Representa os dados de ganho e a meta recalculada de um dia da semana
export interface GanhoDia {
  data: Date;           // Objeto Date do dia
  dataISO: string;      // Formato YYYY-MM-DD para lookup no banco
  dataExibicao: string; // Formato "24 de out" para exibição
  diaCompleto: string;  // "Segunda-feira, 26 de out"
  sigla: string;        // "Seg", "Ter", ..., "Dom"
  valor: number;        // Valor de ganho registrado (0 se não houver)
  metaDoDia: number;    // Meta recalculada deste dia (considerando amortização)
  saldoDia: number;     // metaDoDia - valor (positivo = déficit, negativo = sobra/amortizado)
  percentual: number;   // Porcentagem concluída deste dia
  isHoje: boolean;      // true se for o dia de hoje
  temRegistro: boolean; // true se o usuário já salvou ganho para este dia
}
