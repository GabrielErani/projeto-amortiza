import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, layout, raio, superficies, tamanho, textos } from '../theme';

interface Props {
  visivel: boolean;
  onFechar: () => void;
  titulo?: string;
  subtitulo?: string;
  children: React.ReactNode;
}

export function BottomSheet({ visivel, onFechar, titulo, subtitulo, children }: Props) {
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView style={styles.fundo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={layout.preencher} onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={superficies.sheet}>
          <View style={styles.alca} />
          {titulo || subtitulo ? (
            <View style={layout.gapXs}>
              {titulo ? <Text style={textos.tituloSheet}>{titulo}</Text> : null}
              {subtitulo ? <Text style={textos.detalhe}>{subtitulo}</Text> : null}
            </View>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: cores.overlay },
  alca: { alignSelf: 'center', width: tamanho.alca, height: tamanho.trilha, borderRadius: raio.xxs, backgroundColor: cores.neutro },
});
