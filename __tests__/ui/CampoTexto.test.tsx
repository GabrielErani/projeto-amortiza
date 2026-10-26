import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CampoTexto } from '../../src/components/CampoTexto';
import { cores, fonte } from '../../src/theme';

describe('CampoTexto', () => {
  it('renderiza o rótulo e repassa as props do TextInput', async () => {
    await render(<CampoTexto label="E-mail" placeholder="voce@exemplo.com" value="ana@exemplo.com" keyboardType="email-address" />);

    expect(screen.getByText('E-mail')).toBeOnTheScreen();
    const input = screen.getByPlaceholderText('voce@exemplo.com');
    expect(input).toHaveDisplayValue('ana@exemplo.com');
    expect(input).toHaveProp('keyboardType', 'email-address');
  });

  it('o rótulo também é o nome acessível do campo', async () => {
    await render(<CampoTexto label="E-mail" placeholder="voce@exemplo.com" />);

    expect(screen.getByLabelText('E-mail')).toBe(screen.getByPlaceholderText('voce@exemplo.com'));
  });

  it('um accessibilityLabel explícito tem prioridade sobre o rótulo', async () => {
    await render(<CampoTexto label="Valor" placeholder="0,00" accessibilityLabel="Valor do ganho" />);

    expect(screen.getByLabelText('Valor do ganho')).toBe(screen.getByPlaceholderText('0,00'));
  });

  it('mostra o prefixo antes do valor, na mesma caixa do campo', async () => {
    await render(<CampoTexto placeholder="0,00" prefixo="R$" grande />);

    const prefixo = screen.getByText('R$');
    expect(prefixo.parent).toBe(screen.getByPlaceholderText('0,00').parent);
    expect(prefixo).toHaveStyle(fonte.valor);
  });

  it('não renderiza rótulo quando "label" não é informado', async () => {
    await render(<CampoTexto placeholder="Sem rótulo" />);

    expect(screen.getByPlaceholderText('Sem rótulo')).toBeOnTheScreen();
    expect(screen.queryByText('E-mail')).not.toBeOnTheScreen();
  });

  it('chama onChangeText com o texto digitado', async () => {
    const onChangeText = jest.fn();
    await render(<CampoTexto label="Nome" placeholder="Seu nome" onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByPlaceholderText('Seu nome'), 'Gabriel');

    expect(onChangeText).toHaveBeenCalledWith('Gabriel');
  });

  it('usa a cor de placeholder do tema, permitindo sobrescrever', async () => {
    const { rerender } = await render(<CampoTexto placeholder="p" />);
    expect(screen.getByPlaceholderText('p')).toHaveProp('placeholderTextColor', cores.textoApagado);

    await rerender(<CampoTexto placeholder="p" placeholderTextColor="#FFFFFF" />);
    expect(screen.getByPlaceholderText('p')).toHaveProp('placeholderTextColor', '#FFFFFF');
  });

  describe('erro inline', () => {
    it('mostra a mensagem de erro abaixo do campo, em vermelho', async () => {
      await render(<CampoTexto label="Senha" placeholder="Mínimo 6 caracteres" erro="A senha precisa ter pelo menos 6 caracteres." />);

      expect(screen.getByText('A senha precisa ter pelo menos 6 caracteres.')).toHaveStyle({ color: cores.erro });
    });

    it('destaca a borda da caixa do campo com a cor de erro', async () => {
      await render(<CampoTexto placeholder="campo" erro="Inválido" />);

      // A caixa é o pai direto do TextInput.
      const caixa = screen.getByPlaceholderText('campo').parent;
      expect(caixa).toHaveStyle({ borderColor: cores.erro });
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['string vazia', ''],
    ])('não mostra erro quando "erro" é %s', async (_rotulo, erro) => {
      await render(<CampoTexto placeholder="campo" erro={erro} />);

      expect(screen.getByPlaceholderText('campo').parent).toHaveStyle({ borderColor: cores.neutro });
      expect(screen.queryByText('Inválido')).not.toBeOnTheScreen();
    });
  });

  it('variante "grande" usa a fonte de valor e o fundo da tela', async () => {
    await render(<CampoTexto placeholder="0,00" grande />);

    const campo = screen.getByPlaceholderText('0,00');
    expect(campo).toHaveStyle({ fontSize: 28, fontWeight: '800' });
    expect(campo).toHaveStyle(fonte.valor);
    expect(campo.parent).toHaveStyle({ backgroundColor: cores.fundo });
  });

  it('mescla o "style" recebido no TextInput', async () => {
    await render(<CampoTexto placeholder="campo" style={{ textAlign: 'right' }} />);

    expect(screen.getByPlaceholderText('campo')).toHaveStyle({ textAlign: 'right', fontSize: fonte.campo.fontSize });
  });

  describe('ação à direita', () => {
    it('renderiza um botão com o rótulo e dispara a ação', async () => {
      const onPress = jest.fn();
      await render(<CampoTexto placeholder="senha" acaoDireita={{ rotulo: 'Mostrar', onPress }} />);

      await fireEvent.press(screen.getByRole('button', { name: 'Mostrar' }));

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('usa o rótulo acessível da ação quando informado (ex.: "Mostrar senha")', async () => {
      const onPress = jest.fn();
      await render(<CampoTexto placeholder="senha" acaoDireita={{ rotulo: 'Mostrar', rotuloAcessivel: 'Mostrar senha', onPress }} />);

      await fireEvent.press(screen.getByRole('button', { name: 'Mostrar senha' }));

      expect(screen.getByText('Mostrar')).toBeOnTheScreen();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('não renderiza botão quando não há ação', async () => {
      await render(<CampoTexto placeholder="senha" />);

      expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    });

    it('permite alternar mostrar/ocultar senha quando usado com secureTextEntry', async () => {
      function CampoSenha() {
        const [mostrar, setMostrar] = useState(false);
        return (
          <CampoTexto
            placeholder="Mínimo 6 caracteres"
            secureTextEntry={!mostrar}
            acaoDireita={{ rotulo: mostrar ? 'Ocultar' : 'Mostrar', onPress: () => setMostrar((v) => !v) }}
          />
        );
      }
      await render(<CampoSenha />);
      const input = screen.getByPlaceholderText('Mínimo 6 caracteres');
      expect(input).toHaveProp('secureTextEntry', true);

      await fireEvent.press(screen.getByRole('button', { name: 'Mostrar' }));
      expect(input).toHaveProp('secureTextEntry', false);
      expect(screen.getByRole('button', { name: 'Ocultar' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Ocultar' }));
      expect(input).toHaveProp('secureTextEntry', true);
    });
  });
});
