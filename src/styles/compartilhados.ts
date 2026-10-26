// Estilos usados por mais de uma tela/modal (mesmos nomes e valores do App.tsx original).
// Documentação StyleSheet: https://reactnative.dev/docs/stylesheet

import { StyleSheet } from 'react-native';
import { cores } from '../theme';

export const estilosCompartilhados = StyleSheet.create({
  // DIVISOR
  horizontalDivider: {
    height: 1,
    backgroundColor: cores.superficieAlta,
    marginVertical: 18,
  },

  // BOTTOM SHEET & MODAIS
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  cardModalCentral: {
    width: '100%',
    backgroundColor: '#131C2E',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: cores.superficieAlta,
  },
  bottomSheetContainer: {
    backgroundColor: '#131C2E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: cores.superficieAlta,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: cores.neutro,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitleText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  modalSubText: {
    color: cores.textoSuave,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },

  // SELETOR EM PÍLULAS (dias da semana, frequência, modo de acesso)
  diaSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
    gap: 6,
  },
  diaPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: cores.superficieAlta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: cores.neutro,
  },
  diaPillAtivo: {
    backgroundColor: cores.primaria,
    borderColor: cores.primaria,
  },
  diaPillTexto: {
    color: cores.textoSuave,
    fontSize: 12,
    fontWeight: '700',
  },
  diaPillTextoAtivo: {
    color: cores.primariaTexto,
  },

  // INPUTS E BOTÕES
  modalInputGrande: {
    backgroundColor: cores.fundo,
    width: '100%',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00D26A',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#00D26A',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  primaryActionButton: {
    backgroundColor: '#00D26A',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryActionText: {
    color: cores.primariaTexto,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryActionButton: {
    backgroundColor: 'transparent',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: cores.neutro,
  },
  secondaryActionText: {
    color: cores.textoSuave,
    fontSize: 15,
    fontWeight: '600',
  },
  inputLabel: {
    color: cores.textoSuave,
    fontSize: 13,
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 6,
    fontWeight: '500',
  },
  modalInput: {
    backgroundColor: cores.fundo,
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: cores.neutro,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 16,
  },
});
