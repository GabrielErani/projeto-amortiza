<div align="center">

# ⚡ Amortiza — App de Recálculo de Metas & Carteira Macro

  <p align="center">
    <strong>Aplicativo financeiro minimalista para acompanhamento de ganhos operacionais, amortização em cascata e controle macro de dívidas.</strong>
  </p>

  <p align="center">
    <a href="https://reactnative.dev/docs/getting-started"><img src="https://img.shields.io/badge/React_Native-0.88-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React Native"></a>
    <a href="https://docs.expo.dev/"><img src="https://img.shields.io/badge/Expo_SDK-58-000000?style=for-the-badge&logo=expo&logoColor=white" alt="Expo SDK 58"></a>
    <a href="https://react-native-async-storage.github.io/async-storage/"><img src="https://img.shields.io/badge/AsyncStorage-Offline_First-8A2BE2?style=for-the-badge&logo=react" alt="AsyncStorage"></a>
    <a href="https://supabase.com/docs"><img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"></a>
    <a href="https://developers.google.com/ml-kit/vision/text-recognition/v2"><img src="https://img.shields.io/badge/Google_ML_Kit-OCR_OnDevice-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google ML Kit"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"></a>
  </p>

</div>

---

## 📌 Sobre o Projeto

O **Amortiza** é uma solução mobile desenvolvida para motoristas, autônomos e prestadores de serviço que buscam praticidade no acompanhamento diário de resultados, na **amortização inteligente de metas semanais** e no **controle macro de dívidas**.

O aplicativo combina um dashboard operacional ágil estilo Uber com uma carteira estratégica completa, permitindo lançar valores de forma 100% manual e automática, ou via **OCR On-Device** com conformidade com a LGPD.

---

## ✨ Funcionalidades Implementadas (100% Configuradas)

### 1. Dashboard Operacional Semanal
* 📊 **Gráfico de Barras com Amortização por Fases:** As 7 colunas (Segunda a Domingo) mostram o percentual amortizado de cada fase da semana em tempo real.
* ⚡ **Regra Amortiza em Cascata:** Se a meta diária é R$ 100 e você faz R$ 250 na Segunda-feira:
  * **Segunda:** 100% batida ✓
  * **Terça:** 100% amortizada adiantada ✓
  * **Quarta:** 50% amortizada adiantada!
  * **Quinta em diante:** 0% a realizar.
* ✍️ **Lançamento Manual Configurado 100%:**
  * **Data 100% Automática:** Captura a data atual do celular sem necessidade de digitar textos.
  * **Seletor de Dias em 1 Toque:** Pílulas de seleção rápida de Segunda a Domingo.
  * **Acumulação Inteligente:** Lançamentos adicionais somam ao dia existente (ex: R$ 100 + R$ 50 = R$ 150) ou substituem com feedback visual.
  * **Atalhos Rápidos de Valor:** Botões `[+50]`, `[+100]`, `[+150]`, `[+200]` e `[Limpar]`.

### 2. Tela Carteira (Visão Macro de Controle)
* 💼 **Visão Macro de Ganhos:**
  * Card com o total acumulado da **Semana Atual**.
  * Card com o **Total do Mês** consolidado de todas as semanas.
  * Carrossel horizontal para navegar entre todas as semanas do mês.
* 📉 **Gestão Completa de Dívidas & Custos:**
  * **⚡ Dívida Anual Projetada (Automática):** Atualização instantânea com a fórmula:
    $$\text{Dívida Anual} = (\text{Diárias} \times 365) + (\text{Mensais} \times 12) + \text{Imprevistos Anualizados}$$
  * **Dívidas Diárias:** Custos diários (ex: combustível, alimentação) com cálculo de impacto anual.
  * **Dívidas Mensais:** Custos fixos recorrentes (ex: parcela do veículo, seguro, planos).
  * **Dívidas Imprevistas:** Gastos extraordinários com configuração de frequência (diária, mensal ou anual/única).

### 3. Persistência Offline-First & Nuvem
* 📱 **AsyncStorage Nativo:** Todos os lançamentos de ganhos, metas e dívidas ficam gravados na memória do celular. Puxar para baixo (*pull-to-refresh*) ou reiniciar o app mantém todos os dados 100% intactos.
* ☁️ **Sincronização em Segundo Plano com Supabase:** Conexão com banco de dados PostgreSQL.

---

## 🛠️ Tecnologias Utilizadas

* **Front-end Mobile:** [React Native](https://reactnative.dev/docs/getting-started) com [Expo SDK 58](https://docs.expo.dev/)
* **Linguagem:** [TypeScript](https://www.typescriptlang.org/)
* **Armazenamento Local:** [AsyncStorage](https://react-native-async-storage.github.io/async-storage/)
* **Backend & Banco de Dados:** [Supabase Client](https://supabase.com/docs/reference/javascript/initializing) (PostgreSQL)
* **Motor de OCR Local:** [Google ML Kit Text Recognition v2](https://developers.google.com/ml-kit/vision/text-recognition/v2)

---

## 🚀 Como Executar o Projeto

```powershell
# 1. Clonar o repositório
git clone https://github.com/RobertoNeto-Br/Projeto-Amortiza.git
cd Projeto-Amortiza

# 2. Instalar dependências
npm install --legacy-peer-deps

# 3. Iniciar o servidor Expo com cache limpo
npx expo start -c
```

Abra o aplicativo **Expo Go** no celular e escaneie o QR Code exibido no terminal.
