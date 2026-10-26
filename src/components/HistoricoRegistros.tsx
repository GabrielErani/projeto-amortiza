// Seção "Histórico de Registros": ganhos salvos no aparelho, do mais recente ao mais antigo.
// A lista vem pronta (ordenada e limitada) de montarHistoricoGanhos (src/utils/historico.ts).
// Documentação React Native: https://reactnative.dev/docs/getting-started

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores } from '../theme';
import { RegistroGanhoLocal } from '../types';

export interface HistoricoRegistrosProps {
  registros: RegistroGanhoLocal[];
}

export function HistoricoRegistros({ registros }: HistoricoRegistrosProps) {
  return (
    <View style={styles.bancoSection}>
      <Text style={styles.sectionHeaderTitle}>Histórico de Registros</Text>

      {registros.length === 0 ? (
        <Text style={styles.emptyText}>Ganhos e metas salvos no seu aparelho.</Text>
      ) : (
        registros.map((item) => (
          <View key={item.dataISO} style={styles.metaRowCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaRowDesc}>{item.descricao}</Text>
              <Text style={styles.metaRowSub}>
                Ganho: R$ {Number(item.valor).toFixed(2)} | Meta: R$ {Number(item.metaDoDia).toFixed(2)}
              </Text>
              <Text style={styles.metaRowData}>
                📅 {new Date(item.dataISO + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>
            <View style={styles.percentBadge}>
              <Text style={styles.metaRowPercent}>{item.percentual}%</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // HISTÓRICO
  bancoSection: {
    marginTop: 24,
  },
  sectionHeaderTitle: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyText: {
    color: cores.textoApagado,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 12,
  },
  metaRowCard: {
    backgroundColor: '#131C2E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: cores.superficieAlta,
  },
  metaRowDesc: {
    color: cores.texto,
    fontSize: 14,
    fontWeight: '600',
  },
  metaRowSub: {
    color: cores.textoSuave,
    fontSize: 12,
    marginTop: 2,
  },
  metaRowData: {
    color: '#475569',
    fontSize: 11,
    marginTop: 3,
  },
  percentBadge: {
    backgroundColor: 'rgba(0, 210, 106, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 10,
  },
  metaRowPercent: {
    color: '#00D26A',
    fontSize: 15,
    fontWeight: '800',
  },
});
