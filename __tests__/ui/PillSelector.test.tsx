import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PillSelector, OpcaoPill } from '../../src/components/PillSelector';
import { cores } from '../../src/theme';

const DIAS: OpcaoPill<number>[] = [
  { valor: 0, rotulo: 'Seg' },
  { valor: 1, rotulo: 'Ter' },
  { valor: 2, rotulo: 'Qua', destaque: true },
];

describe('PillSelector', () => {
  it('renderiza uma pílula (botão) por opção', async () => {
    await render(<PillSelector opcoes={DIAS} valor={0} onChange={jest.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Seg' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ter' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Qua' })).toBeOnTheScreen();
  });

  it('marca apenas a opção do valor atual como selecionada', async () => {
    await render(<PillSelector opcoes={DIAS} valor={1} onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Ter' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Seg' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Qua' })).not.toBeSelected();
    expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
  });

  it('destaca o texto da opção ativa', async () => {
    await render(<PillSelector opcoes={DIAS} valor={1} onChange={jest.fn()} />);

    expect(screen.getByText('Ter')).toHaveStyle({ color: cores.primariaTexto, fontWeight: '700' });
    expect(screen.getByText('Seg')).toHaveStyle({ color: cores.textoSuave });
  });

  it('ao tocar numa pílula chama onChange com o valor da opção', async () => {
    const onChange = jest.fn();
    await render(<PillSelector opcoes={DIAS} valor={0} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Qua' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('funciona com valores string', async () => {
    const onChange = jest.fn();
    await render(
      <PillSelector<'diaria' | 'mensal'>
        opcoes={[
          { valor: 'diaria', rotulo: 'Diária' },
          { valor: 'mensal', rotulo: 'Mensal' },
        ]}
        valor="diaria"
        onChange={onChange}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Mensal' }));

    expect(onChange).toHaveBeenCalledWith('mensal');
    expect(screen.getByRole('button', { name: 'Diária' })).toBeSelected();
  });

  it('tocar na opção já selecionada também notifica (não há bloqueio)', async () => {
    const onChange = jest.fn();
    await render(<PillSelector opcoes={DIAS} valor={0} onChange={onChange} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Seg' }));

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('opção com "destaque" ganha um indicador extra (ponto) abaixo do rótulo', async () => {
    await render(<PillSelector opcoes={DIAS} valor={0} onChange={jest.fn()} />);

    // Pílula com destaque: texto + ponto; sem destaque: apenas o texto.
    expect(screen.getByRole('button', { name: 'Qua' }).children).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Seg' }).children).toHaveLength(1);
  });

  it('o ponto de destaque acompanha a cor do texto da pílula', async () => {
    const corDoPonto = (rotulo: string) => {
      const [, ponto] = screen.getByRole('button', { name: rotulo }).children;
      return typeof ponto === 'string' ? undefined : StyleSheet.flatten(ponto.props.style)?.backgroundColor;
    };
    await render(<PillSelector opcoes={DIAS} valor={0} onChange={jest.fn()} />);
    expect(corDoPonto('Qua')).toBe(cores.textoSuave);

    await screen.rerender(<PillSelector opcoes={DIAS} valor={2} onChange={jest.fn()} />);
    expect(corDoPonto('Qua')).toBe(cores.primariaTexto);
  });

  it('pílula ativa ganha o fundo primário', async () => {
    await render(<PillSelector opcoes={DIAS} valor={1} onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Ter' })).toHaveStyle({ backgroundColor: cores.primaria });
    expect(screen.getByRole('button', { name: 'Seg' })).toHaveStyle({ backgroundColor: cores.superficieAlta });
  });

  describe('modo rolável (semanas da Carteira)', () => {
    const SEMANAS: OpcaoPill<number>[] = [
      { valor: 0, rotulo: 'Sem 1', detalhe: 'R$ 0' },
      { valor: 1, rotulo: 'Sem 2', detalhe: 'R$ 200', destaque: true, rotuloAcessivel: 'Sem 2, R$ 200,00, semana atual' },
    ];

    it('mostra o detalhe numa segunda linha e usa o rótulo acessível quando informado', async () => {
      await render(<PillSelector rolavel opcoes={SEMANAS} valor={1} onChange={jest.fn()} />);

      const atual = screen.getByRole('button', { name: 'Sem 2, R$ 200,00, semana atual' });
      expect(atual).toBeSelected();
      expect(atual).toHaveTextContent('Sem 2R$ 200');
      expect(screen.getByRole('button', { name: 'Sem 1 R$ 0' })).not.toBeSelected();
    });

    it('fica numa única linha com rolagem horizontal', async () => {
      await render(<PillSelector rolavel opcoes={SEMANAS} valor={0} onChange={jest.fn()} />);

      const rolagem = screen.container.queryAll((el) => el.type === 'RCTScrollView');
      expect(rolagem).toHaveLength(1);
      expect(rolagem[0]).toHaveProp('horizontal', true);
    });

    it('tocar no detalhe também seleciona a opção', async () => {
      const onChange = jest.fn();
      await render(<PillSelector rolavel opcoes={SEMANAS} valor={0} onChange={onChange} />);

      await fireEvent.press(screen.getByText('R$ 200'));

      expect(onChange).toHaveBeenCalledWith(1);
    });
  });

  it('acompanha a troca de valor vinda do pai', async () => {
    await render(<PillSelector opcoes={DIAS} valor={0} onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Seg' })).toBeSelected();

    await screen.rerender(<PillSelector opcoes={DIAS} valor={2} onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Seg' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Qua' })).toBeSelected();
  });

  it('sem opções, não renderiza pílulas', async () => {
    await render(<PillSelector<number> opcoes={[]} valor={0} onChange={jest.fn()} />);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
