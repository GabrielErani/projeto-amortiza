// Modal (bottom sheet) de lançamento de ganho em três estados:
//  1) analisando o print via OCR, 2) confirmação do valor lido, 3) formulário manual
//  (seletor de dias, atalhos de valor e escolha entre somar ou substituir).
// Documentação Modal: https://reactnative.dev/docs/modal
// Documentação Google ML Kit (OCR on-device): https://developers.google.com/ml-kit/vision/text-recognition/v2

import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { estilosCompartilhados } from '../styles/compartilhados';
import { cores } from '../theme';
import { GanhoDia } from '../types';
import { parseValorDigitado } from '../utils/formatacao';

export type ModoSalvarGanho = 'somar' | 'substituir';

export interface ModalLancarGanhoProps {
  visivel: boolean;
  diasSemana: GanhoDia[];
  diaLancamentoIdx: number;
  valorDigitado: string;
  salvando: boolean;
  analisandoOCR: boolean;
  ocrConfirmacaoPronta: boolean;
  valorExtraidoOCR: number;
  onSelecionarDia: (idx: number) => void;
  onAlterarValor: (texto: string) => void;
  onSalvar: (modo: ModoSalvarGanho) => void;
  onDigitarManualmente: () => void;
  onFechar: () => void;
}

export function ModalLancarGanho({
  visivel,
  diasSemana,
  diaLancamentoIdx,
  valorDigitado,
  salvando,
  analisandoOCR,
  ocrConfirmacaoPronta,
  valorExtraidoOCR,
  onSelecionarDia,
  onAlterarValor,
  onSalvar,
  onDigitarManualmente,
  onFechar,
}: ModalLancarGanhoProps) {
  const diaLancamento = diasSemana[diaLancamentoIdx] || diasSemana[0];
  const valorJaExistente = diaLancamento.valor || 0;
  const valorNovoNumerico = parseValorDigitado(valorDigitado);
  const valorSomadoPreview = valorJaExistente + valorNovoNumerico;

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visivel}
      onRequestClose={onFechar}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.bottomSheetContainer}>
          <View style={styles.bottomSheetHandle} />

          {analisandoOCR && (
            <View style={styles.modalContentState}>
              <ActivityIndicator size="large" color={cores.primaria} style={{ marginBottom: 16 }} />
              <Text style={styles.modalTitleText}>Analisando captura de tela...</Text>
              <Text style={styles.modalSubText}>Extraindo valores via OCR On-Device</Text>
            </View>
          )}

          {!analisandoOCR && ocrConfirmacaoPronta && (
            <View style={styles.modalContentState}>
              <View style={styles.badgeSuccess}>
                <Text style={styles.badgeSuccessText}>✓ OCR Concluído</Text>
              </View>

              <Text style={styles.modalConfirmTitle}>
                Encontramos o valor de{' '}
                <Text style={styles.highlightText}>
                  R$ {valorExtraidoOCR.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                {' '}para {diaLancamento.diaCompleto}. Como deseja salvar?
              </Text>

              {valorJaExistente > 0 && (
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  onPress={() => onSalvar('somar')}
                  disabled={salvando}
                >
                  {salvando ? (
                    <ActivityIndicator color={cores.primariaTexto} />
                  ) : (
                    <Text style={styles.primaryActionText}>
                      + Somar aos R$ {valorJaExistente.toFixed(2)} (Total: R$ {(valorJaExistente + valorExtraidoOCR).toFixed(2)})
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={valorJaExistente > 0 ? styles.secondaryActionButton : styles.primaryActionButton}
                onPress={() => onSalvar('substituir')}
                disabled={salvando}
              >
                <Text style={valorJaExistente > 0 ? styles.secondaryActionText : styles.primaryActionText}>
                  {valorJaExistente > 0 ? `Substituir por R$ ${valorExtraidoOCR.toFixed(2)}` : 'Confirmar e Salvar'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryActionButton, { marginTop: 8 }]}
                onPress={onDigitarManualmente}
              >
                <Text style={styles.secondaryActionText}>Digitar Manualmente</Text>
              </TouchableOpacity>
            </View>
          )}

          {!analisandoOCR && !ocrConfirmacaoPronta && (
            <View style={styles.modalContentState}>
              <Text style={styles.modalTitleText}>Lançar Ganho</Text>
              <Text style={styles.modalSubText}>
                Selecione o dia e informe o valor:
              </Text>

              {/* SELETOR DE DIAS DA SEMANA */}
              <View style={styles.diaSelectorRow}>
                {diasSemana.map((d, idx) => {
                  const ativo = idx === diaLancamentoIdx;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.diaPill, ativo && styles.diaPillAtivo]}
                      onPress={() => onSelecionarDia(idx)}
                    >
                      <Text style={[styles.diaPillTexto, ativo && styles.diaPillTextoAtivo]}>
                        {d.sigla}
                      </Text>
                      {d.isHoje && <View style={styles.diaPillDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.diaSelecionadoTextoModal}>
                📅 {diaLancamento.diaCompleto}
                {diaLancamento.isHoje ? ' (Hoje)' : ''}
              </Text>

              {valorJaExistente > 0 && (
                <View style={styles.avisoAcumuloContainer}>
                  <Text style={styles.avisoAcumuloTexto}>
                    💡 Já registrado neste dia: <Text style={{ color: cores.primaria, fontWeight: 'bold' }}>R$ {valorJaExistente.toFixed(2)}</Text>
                  </Text>
                </View>
              )}

              <Text style={styles.inputLabel}>
                {valorJaExistente > 0 ? 'Quanto quer adicionar a mais? (R$)' : 'Quanto você fez? (R$)'}
              </Text>
              <TextInput
                style={styles.modalInputGrande}
                keyboardType="numeric"
                value={valorDigitado}
                onChangeText={onAlterarValor}
                placeholder="0.00"
                placeholderTextColor={cores.textoApagado}
                autoFocus
              />

              <View style={styles.atalhosValorRow}>
                {[50, 100, 150, 200].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={styles.atalhoBtn}
                    onPress={() => onAlterarValor(v.toString())}
                  >
                    <Text style={styles.atalhoBtnTexto}>+{v}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.atalhoBtn, { backgroundColor: cores.neutro }]}
                  onPress={() => onAlterarValor('')}
                >
                  <Text style={[styles.atalhoBtnTexto, { color: cores.texto }]}>Limpar</Text>
                </TouchableOpacity>
              </View>

              {valorJaExistente > 0 && valorNovoNumerico > 0 ? (
                <>
                  <TouchableOpacity
                    style={styles.primaryActionButton}
                    onPress={() => onSalvar('somar')}
                    disabled={salvando}
                  >
                    {salvando ? (
                      <ActivityIndicator color={cores.primariaTexto} />
                    ) : (
                      <Text style={styles.primaryActionText}>
                        + Somar R$ {valorNovoNumerico.toFixed(2)} (Novo Total: R$ {valorSomadoPreview.toFixed(2)})
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => onSalvar('substituir')}
                    disabled={salvando}
                  >
                    <Text style={styles.secondaryActionText}>
                      Substituir por R$ {valorNovoNumerico.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  onPress={() => onSalvar(valorJaExistente > 0 ? 'substituir' : 'somar')}
                  disabled={salvando}
                >
                  {salvando ? (
                    <ActivityIndicator color={cores.primariaTexto} />
                  ) : (
                    <Text style={styles.primaryActionText}>Salvar Ganho</Text>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.secondaryActionButton, { marginTop: 8, borderColor: 'transparent' }]}
                onPress={onFechar}
              >
                <Text style={[styles.secondaryActionText, { color: cores.textoApagado }]}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = {
  ...estilosCompartilhados,
  ...StyleSheet.create({
    modalContentState: {
      alignItems: 'center',
      width: '100%',
    },
    badgeSuccess: {
      backgroundColor: 'rgba(0, 210, 106, 0.15)',
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
      marginBottom: 14,
    },
    badgeSuccessText: {
      color: '#00D26A',
      fontSize: 13,
      fontWeight: '700',
    },
    modalConfirmTitle: {
      color: cores.texto,
      fontSize: 16,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: 24,
    },
    highlightText: {
      color: '#00D26A',
      fontWeight: '800',
    },

    // SELETOR DE DIAS DA SEMANA
    diaPillDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: cores.info,
      marginTop: 2,
    },
    diaSelecionadoTextoModal: {
      color: cores.texto,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 10,
    },

    avisoAcumuloContainer: {
      backgroundColor: 'rgba(0, 210, 106, 0.1)',
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(0, 210, 106, 0.25)',
      marginBottom: 12,
    },
    avisoAcumuloTexto: {
      color: cores.texto,
      fontSize: 12,
    },

    atalhosValorRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginBottom: 20,
      gap: 6,
    },
    atalhoBtn: {
      flex: 1,
      backgroundColor: cores.superficieAlta,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: cores.neutro,
    },
    atalhoBtnTexto: {
      color: '#00D26A',
      fontSize: 12,
      fontWeight: '700',
    },
  }),
};
