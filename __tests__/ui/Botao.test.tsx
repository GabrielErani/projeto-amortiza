import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Botao } from '../../src/components/Botao';
import { ALVO_TOQUE, cores, opacidade, tamanho } from '../../src/theme';

// O ActivityIndicator não tem papel de acessibilidade: localizamos o elemento host pelo tipo.
const indicadoresDeCarregamento = () =>
  screen.container.queryAll((el) => el.type === 'ActivityIndicator');

describe('Botao', () => {
  it('renderiza o título como um botão acessível e habilitado', async () => {
    await render(<Botao titulo="Salvar" onPress={jest.fn()} />);

    const botao = screen.getByRole('button', { name: 'Salvar' });
    expect(botao).toBeOnTheScreen();
    expect(botao).toBeEnabled();
    expect(indicadoresDeCarregamento()).toHaveLength(0);
  });

  it('chama onPress a cada toque', async () => {
    const onPress = jest.fn();
    await render(<Botao titulo="Salvar" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(onPress).toHaveBeenCalledTimes(1);

    // Tocar no texto também aciona o botão (o evento sobe até o TouchableOpacity).
    await fireEvent.press(screen.getByText('Salvar'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  describe('variantes', () => {
    it.each([
      ['primario', cores.primariaTexto],
      ['secundario', cores.texto],
      ['texto', cores.textoSuave],
      ['perigo', cores.erro],
    ] as const)('variante "%s" pinta o rótulo com a cor da variante', async (variante, cor) => {
      await render(<Botao titulo="Ação" onPress={jest.fn()} variante={variante} />);

      expect(screen.getByText('Ação')).toHaveStyle({ color: cor });
    });

    it('usa a variante "primario" por padrão (fundo na cor primária)', async () => {
      await render(<Botao titulo="Ação" onPress={jest.fn()} />);

      expect(screen.getByRole('button', { name: 'Ação' })).toHaveStyle({ backgroundColor: cores.primaria });
      expect(screen.getByText('Ação')).toHaveStyle({ color: cores.primariaTexto });
    });

    it('variante "secundario" tem borda neutra e não tem fundo preenchido', async () => {
      await render(<Botao titulo="Ação" onPress={jest.fn()} variante="secundario" />);

      const botao = screen.getByRole('button', { name: 'Ação' });
      expect(botao).toHaveStyle({ borderWidth: 1, borderColor: cores.neutro });
      expect(botao).not.toHaveStyle({ backgroundColor: cores.primaria });
    });

    it('variante "perigo" tem borda avermelhada (token erroBorda)', async () => {
      await render(<Botao titulo="Excluir" onPress={jest.fn()} variante="perigo" />);

      expect(screen.getByRole('button', { name: 'Excluir' })).toHaveStyle({
        borderWidth: 1,
        borderColor: cores.erroBorda,
      });
    });

    it('todas as variantes têm alvo de toque acessível (48 no padrão, 44 no "texto")', async () => {
      await render(<Botao titulo="Principal" onPress={jest.fn()} />);
      expect(screen.getByRole('button', { name: 'Principal' })).toHaveStyle({ minHeight: tamanho.botao });

      await screen.rerender(<Botao titulo="Cancelar" onPress={jest.fn()} variante="texto" />);
      expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveStyle({ minHeight: ALVO_TOQUE });
    });
  });

  describe('estado carregando', () => {
    it('troca o título pelo ActivityIndicator', async () => {
      await render(<Botao titulo="Salvar" onPress={jest.fn()} carregando />);

      expect(screen.queryByText('Salvar')).not.toBeOnTheScreen();
      expect(indicadoresDeCarregamento()).toHaveLength(1);
    });

    it('mantém o nome acessível e marca o botão como ocupado e desabilitado', async () => {
      await render(<Botao titulo="Salvar" onPress={jest.fn()} carregando />);

      const botao = screen.getByRole('button', { name: 'Salvar' });
      expect(botao).toBeBusy();
      expect(botao).toBeDisabled();
      expect(botao).toHaveProp('accessibilityState', expect.objectContaining({ busy: true, disabled: true }));
    });

    it('fora do carregamento não fica ocupado', async () => {
      await render(<Botao titulo="Salvar" onPress={jest.fn()} desabilitado />);

      expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeBusy();
    });

    it('desabilita o botão e não dispara onPress', async () => {
      const onPress = jest.fn();
      await render(<Botao titulo="Salvar" onPress={onPress} carregando />);

      const botao = screen.getByRole('button');
      expect(botao).toBeDisabled();

      await fireEvent.press(botao);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('o ActivityIndicator usa a cor do rótulo da variante', async () => {
      await render(<Botao titulo="Salvar" onPress={jest.fn()} variante="secundario" carregando />);

      expect(indicadoresDeCarregamento()[0]).toHaveProp('color', cores.texto);
    });

    it('volta a mostrar o título quando o carregamento termina', async () => {
      const onPress = jest.fn();
      await render(<Botao titulo="Salvar" onPress={onPress} carregando />);

      await screen.rerender(<Botao titulo="Salvar" onPress={onPress} carregando={false} />);

      const botao = screen.getByRole('button', { name: 'Salvar' });
      expect(botao).toBeEnabled();
      expect(indicadoresDeCarregamento()).toHaveLength(0);
      await fireEvent.press(botao);
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('estado desabilitado', () => {
    it('mantém o título visível, mas marca o botão como desabilitado', async () => {
      await render(<Botao titulo="Salvar" onPress={jest.fn()} desabilitado />);

      expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
      expect(indicadoresDeCarregamento()).toHaveLength(0);
    });

    it('não dispara onPress', async () => {
      const onPress = jest.fn();
      await render(<Botao titulo="Salvar" onPress={onPress} desabilitado />);

      await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await fireEvent.press(screen.getByText('Salvar'));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('aplica opacidade reduzida', async () => {
      await render(<Botao titulo="Salvar" onPress={jest.fn()} desabilitado />);

      expect(screen.getByRole('button', { name: 'Salvar' })).toHaveStyle({ opacity: opacidade.inativo });
    });
  });

  it('mescla o estilo extra recebido em "estilo"', async () => {
    await render(<Botao titulo="Salvar" onPress={jest.fn()} estilo={{ marginTop: 8 }} />);

    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveStyle({ marginTop: 8 });
  });
});
