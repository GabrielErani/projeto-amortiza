// Modal aberto pelo FAB (+): escolher entre escanear print (OCR) ou digitar o ganho.
// Documentação Modal: https://reactnative.dev/docs/modal

import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { estilosCompartilhados as styles } from '../styles/compartilhados';
import { cores } from '../theme';

export interface ModalEscolhaFABProps {
  visivel: boolean;
  onEscanearOCR: () => void;
  onDigitarManual: () => void;
  onFechar: () => void;
}

export function ModalEscolhaFAB({ visivel, onEscanearOCR, onDigitarManual, onFechar }: ModalEscolhaFABProps) {
  return (
    <Modal
      visible={visivel}
      animationType="fade"
      transparent
      onRequestClose={onFechar}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.bottomSheetContainer}>
          <View style={styles.bottomSheetHandle} />
          <Text style={styles.modalTitleText}>Adicionar Ganho</Text>
          <Text style={styles.modalSubText}>Escolha como deseja registrar seu ganho</Text>

          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={onEscanearOCR}
          >
            <Text style={styles.primaryActionText}>📷 Escanear Print com OCR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={onDigitarManual}
          >
            <Text style={styles.secondaryActionText}>✍️ Digitar Ganho Manualmente</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryActionButton, { marginTop: 8, borderColor: 'transparent' }]}
            onPress={onFechar}
          >
            <Text style={[styles.secondaryActionText, { color: cores.textoApagado }]}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
