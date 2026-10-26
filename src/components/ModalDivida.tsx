import React, { useState } from 'react';
import { DividaItem } from '../types';
import { parseValorDigitado } from '../utils/formatacao';
import { Botao } from './Botao';
import { BottomSheet } from './BottomSheet';
import { CampoTexto } from './CampoTexto';
import { PillSelector } from './PillSelector';

type Tipo = DividaItem['tipo'];
type Freq = NonNullable<DividaItem['frequenciaImprevisto']>;

interface Props {
  visivel: boolean;
  tipo: Tipo;
  onFechar: () => void;
  onSalvar: (dados: { descricao: string; valor: number; frequencia?: Freq }) => Promise<void>;
}

const TITULOS: Record<Tipo, string> = {
  diaria: 'Gasto diário',
  mensal: 'Dívida mensal',
  imprevista: 'Imprevisto',
};

const PLACEHOLDERS: Record<Tipo, string> = {
  diaria: 'Ex.: Combustível, almoço',
  mensal: 'Ex.: Parcela do carro, seguro',
  imprevista: 'Ex.: Manutenção do pneu',
};

export function ModalDivida({ visivel, tipo, onFechar, onSalvar }: Props) {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [freq, setFreq] = useState<Freq>('anual');
  const [erroDesc, setErroDesc] = useState<string | null>(null);
  const [erroValor, setErroValor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const limpar = () => {
    setDescricao('');
    setValor('');
    setFreq('anual');
    setErroDesc(null);
    setErroValor(null);
  };

  const fechar = () => {
    limpar();
    onFechar();
  };

  const salvar = async () => {
    const v = parseValorDigitado(valor);
    const okDesc = descricao.trim().length > 0;
    const okValor = v > 0;
    setErroDesc(okDesc ? null : 'Informe uma descrição.');
    setErroValor(okValor ? null : 'Informe um valor maior que zero.');
    if (!okDesc || !okValor) return;

    setSalvando(true);
    try {
      await onSalvar({ descricao: descricao.trim(), valor: v, frequencia: tipo === 'imprevista' ? freq : undefined });
      limpar();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <BottomSheet visivel={visivel} onFechar={fechar} titulo={TITULOS[tipo]}>
      {tipo === 'imprevista' && (
        <PillSelector<Freq>
          opcoes={[
            { valor: 'diaria', rotulo: 'Diária' },
            { valor: 'mensal', rotulo: 'Mensal' },
            { valor: 'anual', rotulo: 'Anual / única' },
          ]}
          valor={freq}
          onChange={setFreq}
        />
      )}
      <CampoTexto
        label="Descrição"
        placeholder={PLACEHOLDERS[tipo]}
        value={descricao}
        onChangeText={(t) => {
          setDescricao(t);
          if (erroDesc) setErroDesc(null);
        }}
        erro={erroDesc}
        autoFocus
      />
      <CampoTexto
        label="Valor (R$)"
        grande
        keyboardType="numeric"
        placeholder="0,00"
        value={valor}
        onChangeText={(t) => {
          setValor(t);
          if (erroValor) setErroValor(null);
        }}
        erro={erroValor}
      />
      <Botao titulo="Salvar" onPress={salvar} carregando={salvando} />
      <Botao titulo="Cancelar" variante="texto" onPress={fechar} />
    </BottomSheet>
  );
}
