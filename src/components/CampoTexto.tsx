import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { ALVO_TOQUE, cores, espaco, fonte, layout, opacidade, superficies, tamanho, textos } from '../theme';

interface Props extends TextInputProps {
  label?: string;
  erro?: string | null;
  grande?: boolean;
  prefixo?: string; // ex.: "R$" antes do valor
  acaoDireita?: { rotulo: string; rotuloAcessivel?: string; onPress: () => void };
}

export function CampoTexto({ label, erro, grande, prefixo, acaoDireita, style, ...rest }: Props) {
  return (
    <View style={layout.gapXs}>
      {label ? <Text style={textos.legenda}>{label}</Text> : null}
      <View style={[superficies.campo, grande && styles.caixaGrande, erro ? styles.caixaErro : null]}>
        {prefixo ? <Text style={[styles.texto, grande && fonte.valor]}>{prefixo}</Text> : null}
        <TextInput
          style={[styles.texto, styles.input, grande && fonte.valor, style]}
          placeholderTextColor={cores.textoApagado}
          selectionColor={cores.primaria}
          accessibilityLabel={label}
          {...rest}
        />
        {acaoDireita ? (
          <TouchableOpacity
            onPress={acaoDireita.onPress}
            style={styles.acao}
            activeOpacity={opacidade.toque}
            accessibilityRole="button"
            accessibilityLabel={acaoDireita.rotuloAcessivel ?? acaoDireita.rotulo}
          >
            <Text style={[textos.legenda, styles.acaoTexto]}>{acaoDireita.rotulo}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {erro ? <Text style={textos.erro}>{erro}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caixaGrande: { minHeight: tamanho.campoGrande, paddingHorizontal: espaco.lg, backgroundColor: cores.fundo },
  caixaErro: { borderColor: cores.erro },
  texto: { ...fonte.campo, color: cores.texto },
  input: { flex: 1, paddingVertical: espaco.sm },
  acao: { minHeight: ALVO_TOQUE, justifyContent: 'center', paddingLeft: espaco.sm },
  acaoTexto: { fontWeight: '600' },
});
