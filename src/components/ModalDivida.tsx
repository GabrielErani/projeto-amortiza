// Modal (bottom sheet) de lançamento de dívida da Carteira: diária, mensal ou imprevista.
// Documentação Modal: https://reactnative.dev/docs/modal

import React from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { estilosCompartilhados as styles } from '../styles/compartilhados';
import { cores } from '../theme';
import { DividaItem } from '../types';

type TipoDivida = DividaItem['tipo'];
type FrequenciaImprevisto = NonNullable<DividaItem['frequenciaImprevisto']>;

export interface ModalDividaProps {
  visivel: boolean;
  tipo: TipoDivida;
  frequencia: FrequenciaImprevisto;
  descricao: string;
  valor: string;
  onAlterarFrequencia: (frequencia: FrequenciaImprevisto) => void;
  onAlterarDescricao: (texto: string) => void;
  onAlterarValor: (texto: string) => void;
  onSalvar: () => void;
  onFechar: () => void;
}

export function ModalDivida({
  visivel,
  tipo,
  frequencia,
  descricao,
  valor,
  onAlterarFrequencia,
  onAlterarDescricao,
  onAlterarValor,
  onSalvar,
  onFechar,
}: ModalDividaProps) {
  return (
    <Modal
      visible={visivel}
      animationType="slide"
      transparent
      onRequestClose={onFechar}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.bottomSheetContainer}>
          <View style={styles.bottomSheetHandle} />

          <Text style={styles.modalTitleText}>
            {tipo === 'diaria' ? 'Cadastrar Gasto Diário' : tipo === 'mensal' ? 'Cadastrar Dívida Mensal' : 'Lançar Dívida Imprevista'}
          </Text>
          <Text style={styles.modalSubText}>
            A dívida anual projetada atualizará automaticamente.
          </Text>

          {/* SELETOR SE FOR IMPREVISTA */}
          {tipo === 'imprevista' && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.inputLabel}>Frequência do Imprevisto:</Text>
              <View style={styles.diaSelectorRow}>
                {(['diaria', 'mensal', 'anual'] as const).map(freq => (
                  <TouchableOpacity
                    key={freq}
                    style={[styles.diaPill, frequencia === freq && styles.diaPillAtivo]}
                    onPress={() => onAlterarFrequencia(freq)}
                  >
                    <Text style={[styles.diaPillTexto, frequencia === freq && styles.diaPillTextoAtivo]}>
                      {freq === 'diaria' ? 'Diária' : freq === 'mensal' ? 'Mensal' : 'Anual / Única'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.inputLabel}>Descrição da Dívida / Gasto:</Text>
          <TextInput
            style={styles.modalInput}
            placeholder={tipo === 'diaria' ? 'Ex: Combustível, Almoço' : tipo === 'mensal' ? 'Ex: Parcela do Carro, Seguro' : 'Ex: Manutenção inesperada do pneu'}
            placeholderTextColor={cores.textoApagado}
            value={descricao}
            onChangeText={onAlterarDescricao}
            autoFocus
          />

          <Text style={styles.inputLabel}>Valor (R$):</Text>
          <TextInput
            style={styles.modalInputGrande}
            keyboardType="numeric"
            placeholder="0.00"
            placeholderTextColor={cores.textoApagado}
            value={valor}
            onChangeText={onAlterarValor}
          />

          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={onSalvar}
          >
            <Text style={styles.primaryActionText}>Salvar Dívida</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryActionButton, { marginTop: 6, borderColor: 'transparent' }]}
            onPress={onFechar}
          >
            <Text style={[styles.secondaryActionText, { color: cores.textoApagado }]}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
