// Modal central para configurar a Meta Diária Base.
// Documentação Modal: https://reactnative.dev/docs/modal

import React from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { estilosCompartilhados } from '../styles/compartilhados';
import { cores } from '../theme';

export interface ModalMetaBaseProps {
  visivel: boolean;
  valor: string;
  onAlterarValor: (texto: string) => void;
  onSalvar: () => void;
  onFechar: () => void;
}

export function ModalMetaBase({ visivel, valor, onAlterarValor, onSalvar, onFechar }: ModalMetaBaseProps) {
  return (
    <Modal
      visible={visivel}
      animationType="fade"
      transparent
      onRequestClose={onFechar}
    >
      <View style={styles.modalOverlayCentral}>
        <View style={styles.cardModalCentral}>
          <Text style={styles.modalTitleText}>Meta Diária Base</Text>
          <Text style={styles.modalSubText}>Qual é o seu objetivo padrão de ganho por dia?</Text>

          <Text style={styles.inputLabel}>Valor Base (R$)</Text>
          <TextInput
            style={styles.modalInput}
            keyboardType="numeric"
            value={valor}
            onChangeText={onAlterarValor}
            placeholder="Ex: 100.00"
            placeholderTextColor={cores.textoApagado}
            autoFocus
          />

          <View style={styles.modalButtonsRow}>
            <TouchableOpacity
              style={styles.btnModalCancelar}
              onPress={onFechar}
            >
              <Text style={styles.secondaryActionText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnModalConfirmar}
              onPress={onSalvar}
            >
              <Text style={styles.primaryActionText}>Salvar Meta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  ...estilosCompartilhados,
  ...StyleSheet.create({
    modalOverlayCentral: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalButtonsRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
      width: '100%',
    },
    btnModalCancelar: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: cores.neutro,
    },
    btnModalConfirmar: {
      flex: 1,
      backgroundColor: '#00D26A',
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: 'center',
    },
  }),
};
