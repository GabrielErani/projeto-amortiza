// Testes de src/components/HistoricoRegistros.tsx: seção "Histórico de Registros".
// Os registros são gerados por montarHistoricoGanhos (src/utils/historico.ts), como no app.

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';
import { HistoricoRegistros } from '../../src/components/HistoricoRegistros';
import type { RegistroGanhoLocal } from '../../src/types';
import { montarHistoricoGanhos } from '../../src/utils/historico';

const TITULO = 'Histórico de Registros';
const VAZIO = 'Ganhos e metas salvos no seu aparelho.';

function registro(dataISO: string, valor: number, extra: Partial<RegistroGanhoLocal> = {}): RegistroGanhoLocal {
  return {
    dataISO,
    valor,
    metaDoDia: 100,
    percentual: Math.min(100, Math.round(valor)),
    atualizadoEm: '2026-10-21T13:00:00.000Z',
    ...extra,
  };
}

/** Histórico pronto, como o useDadosApp entrega ao componente. */
const historicoDe = (...registros: RegistroGanhoLocal[]) =>
  montarHistoricoGanhos(Object.fromEntries(registros.map((r) => [r.dataISO, r])));

/** Texto visível de um elemento (concatena os textos aninhados). */
function textoDe(no: TestInstance | string): string {
  return typeof no === 'string' ? no : no.children.map(textoDe).join('');
}

const DESCRICAO_GERADA = /^Ganho (Seg|Ter|Qua|Qui|Sex|Sáb|Dom)$/;

describe('HistoricoRegistros', () => {
  it('mostra o título e a mensagem de lista vazia quando não há registros', async () => {
    await render(<HistoricoRegistros registros={[]} />);

    expect(screen.getByText(TITULO)).toBeOnTheScreen();
    expect(screen.getByText(VAZIO)).toBeOnTheScreen();
    expect(screen.queryByText(/^Ganho: R\$/)).not.toBeOnTheScreen();
  });

  it('mostra descrição, ganho, meta, data por extenso e percentual de cada registro', async () => {
    await render(<HistoricoRegistros registros={historicoDe(registro('2026-10-21', 150))} />);

    expect(screen.getByText(TITULO)).toBeOnTheScreen();
    expect(screen.queryByText(VAZIO)).not.toBeOnTheScreen();
    expect(screen.getByText('Ganho Qua')).toBeOnTheScreen();
    expect(screen.getByText('Ganho: R$ 150.00 | Meta: R$ 100.00')).toBeOnTheScreen();
    expect(screen.getByText('📅 21 de outubro de 2026')).toBeOnTheScreen();
    expect(screen.getByText('100%')).toBeOnTheScreen();
  });

  it('formata centavos com duas casas e usa a meta e o percentual gravados no registro', async () => {
    await render(
      <HistoricoRegistros registros={historicoDe(registro('2026-10-23', 87.5, { metaDoDia: 150, percentual: 58 }))} />
    );

    expect(screen.getByText('Ganho: R$ 87.50 | Meta: R$ 150.00')).toBeOnTheScreen();
    expect(screen.getByText('58%')).toBeOnTheScreen();
    expect(screen.getByText('📅 23 de outubro de 2026')).toBeOnTheScreen();
  });

  it('usa a descrição salva quando ela existe', async () => {
    await render(
      <HistoricoRegistros registros={historicoDe(registro('2026-10-19', 90, { descricao: 'Corridas da manhã' }))} />
    );

    expect(screen.getByText('Corridas da manhã')).toBeOnTheScreen();
    expect(screen.queryByText('Ganho Seg')).not.toBeOnTheScreen();
  });

  it('lista do mais recente para o mais antigo (ordem entregue por montarHistoricoGanhos)', async () => {
    await render(
      <HistoricoRegistros
        registros={historicoDe(
          registro('2026-10-19', 50),
          registro('2026-10-25', 70),
          registro('2026-10-21', 60),
          registro('2025-12-31', 40)
        )}
      />
    );

    expect(screen.getAllByText(DESCRICAO_GERADA).map(textoDe)).toEqual([
      'Ganho Dom',
      'Ganho Qua',
      'Ganho Seg',
      'Ganho Qua', // 31/12/2025 também foi uma quarta-feira
    ]);
    expect(screen.getAllByText(/^📅 /).map(textoDe)).toEqual([
      '📅 25 de outubro de 2026',
      '📅 21 de outubro de 2026',
      '📅 19 de outubro de 2026',
      '📅 31 de dezembro de 2025',
    ]);
  });

  it('não reordena: exibe exatamente na ordem recebida', async () => {
    const registros = [registro('2026-10-19', 10), registro('2026-10-25', 20), registro('2026-10-21', 30)].map(
      (r) => ({ ...r, descricao: `Ganho de ${r.dataISO}` })
    );

    await render(<HistoricoRegistros registros={registros} />);

    expect(screen.getAllByText(/^Ganho de /).map(textoDe)).toEqual([
      'Ganho de 2026-10-19',
      'Ganho de 2026-10-25',
      'Ganho de 2026-10-21',
    ]);
  });

  it('renderiza um cartão por registro (até o limite de 30 do histórico)', async () => {
    const registros = Array.from({ length: 35 }, (_, i) => {
      const dia = String((i % 28) + 1).padStart(2, '0');
      const mes = i < 28 ? '09' : '10';
      return registro(`2026-${mes}-${dia}`, 100 + i);
    });

    await render(<HistoricoRegistros registros={historicoDe(...registros)} />);

    expect(screen.getAllByText(/^Ganho: R\$/)).toHaveLength(30);
    expect(screen.getAllByText(/^📅 /)).toHaveLength(30);
  });

  it('atualiza a lista quando novos registros chegam', async () => {
    await render(<HistoricoRegistros registros={[]} />);
    expect(screen.getByText(VAZIO)).toBeOnTheScreen();

    await screen.rerender(<HistoricoRegistros registros={historicoDe(registro('2026-10-22', 200))} />);

    expect(screen.queryByText(VAZIO)).not.toBeOnTheScreen();
    expect(screen.getByText('Ganho Qui')).toBeOnTheScreen();
    expect(screen.getByText('Ganho: R$ 200.00 | Meta: R$ 100.00')).toBeOnTheScreen();
  });
});
