import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { layout } from '../theme';
import { parseValorDigitado } from '../utils/formatacao';
import { Botao } from './Botao';
import { BottomSheet } from './BottomSheet';
import { CampoTexto } from './CampoTexto';

interface Props {
  visivel: boolean;
  metaAtual: number;
  onFechar: () => void;
  onSalvar: (novaMeta: number) => Promise<void>;
}

export function ModalMetaBase({ visivel, metaAtual, onFechar, onSalvar }: Props) {
  const [texto, setTexto] = useState(String(metaAtual));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (visivel) {
      setTexto(metaAtual % 1 === 0 ? String(metaAtual) : metaAtual.toFixed(2).replace('.', ','));
      setErro(null);
    }
  }, [visivel, metaAtual]);

  const salvar = async () => {
    const v = parseValorDigitado(texto);
    if (v <= 0) {
      setErro('A meta precisa ser maior que zero.');
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(v);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <BottomSheet visivel={visivel} onFechar={onFechar} titulo="Meta diária" subtitulo="Quanto você quer fazer por dia?">
      <CampoTexto
        label="Valor base (R$)"
        grande
        keyboardType="numeric"
        value={texto}
        onChangeText={(t) => {
          setTexto(t);
          if (erro) setErro(null);
        }}
        erro={erro}
        placeholder="100"
        autoFocus
        selectTextOnFocus
      />
      <View style={[layout.linha, layout.gapSm]}>
        <Botao titulo="Cancelar" variante="secundario" onPress={onFechar} estilo={layout.preencher} />
        <Botao titulo="Salvar" onPress={salvar} carregando={salvando} estilo={layout.preencher} />
      </View>
    </BottomSheet>
  );
}
