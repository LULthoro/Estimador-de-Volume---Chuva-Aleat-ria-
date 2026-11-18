# Design System — Estimador de Volume por Chuva Aleatória

## 1. Objetivo

Este documento estabelece as regras obrigatórias de design e experiência do usuário (UI/UX) para o frontend do projeto.

O sistema deve priorizar simplicidade, legibilidade, consistência visual e facilidade de utilização.

A interface deve funcionar como uma ferramenta científica de simulação, permitindo que qualquer usuário configure e execute uma estimativa de volume de precipitação sem precisar de conhecimentos técnicos avançados.

**Princípio fundamental:** a interface deve facilitar a utilização do sistema, não chamar mais atenção do que a funcionalidade que oferece.

## 2. Diretrizes gerais

- Priorizar minimalismo funcional.
- Utilizar elementos visuais simples e familiares.
- Priorizar a compreensão das informações em vez de efeitos decorativos.
- Evitar componentes desnecessários.
- Manter consistência entre botões, campos, títulos e espaçamentos.
- Não adicionar funcionalidades que não foram solicitadas.
- Não modificar a lógica matemática ou as funcionalidades existentes para adequá-las ao design.
- Não transformar a aplicação em um dashboard administrativo.

## 3. Identidade visual

### 3.1. Cores

Utilizar uma paleta reduzida e consistente.

- Fundo principal: branco ou cinza muito claro.
- Superfícies e formulários: branco.
- Texto principal: cinza muito escuro.
- Texto secundário: cinza médio.
- Cor de destaque: azul discreto.
- Estados de sucesso: verde.
- Estados de atenção: amarelo ou laranja.
- Estados de erro: vermelho.

Evitar:
- Gradientes decorativos.
- Cores excessivamente saturadas.
- Múltiplas cores de destaque.
- Fundos com padrões ou texturas desnecessárias.

### 3.2. Tipografia

- Utilizar uma fonte sem serifa.
- Priorizar fontes como Inter, Roboto ou Arial.
- Títulos devem apresentar hierarquia visual clara.
- Textos explicativos devem ser curtos e objetivos.
- Campos e botões devem possuir textos legíveis.
- Evitar textos excessivamente pequenos.

### 3.3. Espaçamento

Manter uma escala consistente de espaçamentos:

- 4px: pequenos ajustes.
- 8px: espaçamento entre elementos relacionados.
- 16px: espaçamento interno de componentes.
- 24px: separação entre grupos de campos.
- 32px: separação entre seções.

Evitar espaçamentos arbitrários.

## 4. Componentes e restrições visuais

### 4.1. Formulários

- Utilizar campos de entrada convencionais.
- Todos os campos devem possuir rótulos (labels).
- Utilizar placeholders apenas como exemplos.
- Informar unidades de medida diretamente nos campos ou em seus rótulos.
- Agrupar campos relacionados.
- Não utilizar campos excessivamente grandes.
- Apresentar mensagens de validação próximas aos campos correspondentes.

### 4.2. Botões

- Utilizar botões simples, com cores sólidas.
- O botão principal deve possuir destaque visual moderado.
- Botões secundários devem ser visualmente discretos.
- Utilizar textos objetivos, como "Executar simulação" e "Limpar campos".
- Não utilizar animações ou efeitos exagerados.

### 4.3. Cards e containers

- Utilizar bordas discretas.
- Priorizar separação por espaçamento.
- Sombras devem ser evitadas ou utilizadas de maneira extremamente sutil.
- Não criar cards para cada informação individualmente.
- Não utilizar excesso de caixas e divisórias.

### 4.4. Elementos proibidos

Não utilizar:

- Gradientes clichês.
- Glassmorphism.
- Neumorphism.
- Sombras exageradas.
- Bordas excessivamente arredondadas.
- Animações decorativas.
- Ícones sem finalidade funcional.
- Elementos visuais que não contribuam para a compreensão da aplicação.

## 5. Organização da tela principal

A tela principal deve apresentar uma estrutura simples:

### 5.1. Cabeçalho

Deve conter:

- Nome do projeto.
- Breve descrição da ferramenta.
- Navegação para outras funcionalidades existentes, quando necessário.

Evitar cabeçalhos grandes ou menus complexos.

### 5.2. Formulário de configuração

O formulário deve ser o elemento central da página.

Organizar os campos na seguinte sequência:

**A. Localização**

Apresentar duas opções:

- CEP.
- Coordenadas geográficas.

O usuário deve selecionar apenas uma modalidade de entrada por vez.

Quando selecionar CEP:
- Exibir um campo para digitação do CEP.
- Permitir a identificação das coordenadas geográficas correspondentes.

Quando selecionar coordenadas:
- Exibir dois campos:
  - Latitude.
  - Longitude.

**B. Área de abrangência**

- Campo numérico para informar o raio de abrangência.
- Unidade apresentada em quilômetros (km).
- Utilizar o ponto de localização informado como centro da área.

**C. Configuração da simulação**

- Campo numérico para informar a quantidade de pontos aleatórios.
- Apresentar uma breve explicação de que os pontos representam as amostras utilizadas na estimativa pelo método de Monte Carlo.

**D. Precipitação**

Disponibilizar duas opções:

1. Chuva com quantidade definida pelo usuário.
2. Chuva aleatória.

Quando selecionada a quantidade definida:
- Exibir campo numérico para informar a precipitação.
- Apresentar a unidade em milímetros (mm).

Quando selecionada chuva aleatória:
- Utilizar o mecanismo de geração aleatória já implementado no sistema.
- Não solicitar parâmetros adicionais sem necessidade.
- Não alterar a distribuição estatística utilizada pelo algoritmo.

**E. Execução**

- Apresentar um botão principal: "Executar simulação".
- O botão deve possuir destaque em relação aos demais elementos.
- Durante o processamento, apresentar um indicador de carregamento.
- Impedir envios duplicados enquanto a simulação estiver em execução.

## 6. Resultados

Os resultados devem ser apresentados em uma seção separada do formulário.

Priorizar:

- Volume estimado.
- Dados utilizados na simulação.
- Quantidade de pontos processados.
- Informações sobre a precipitação.
- Representações gráficas ou mapas já existentes no sistema.

Os resultados numéricos devem possuir destaque suficiente para facilitar sua identificação.

Não adicionar gráficos ou indicadores que não possuam utilidade para a interpretação dos resultados.

## 7. Experiência do usuário (UX)

### 7.1. Facilidade de utilização

- O usuário deve conseguir compreender o formulário sem consultar documentação externa.
- Utilizar linguagem simples.
- Evitar termos técnicos sem explicação.
- Apresentar unidades de medida explicitamente.
- Manter uma sequência lógica de preenchimento.

### 7.2. Validação

Validar:

- Formato do CEP.
- Latitude e longitude dentro dos limites geográficos válidos.
- Raio de abrangência maior que zero.
- Quantidade de pontos maior que zero.
- Quantidade de chuva não negativa.
- Campos obrigatórios preenchidos.

As validações devem ocorrer antes da execução da simulação.

### 7.3. Feedback

O sistema deve apresentar mensagens claras para:

- Campos inválidos.
- Dados incompletos.
- Falha na identificação da localização.
- Erros durante a simulação.
- Processamento concluído.

Não utilizar mensagens técnicas de erro diretamente para o usuário.

## 8. Responsividade e acessibilidade

- A aplicação deve funcionar em computadores.
- Campos devem possuir dimensões adequadas para interação.
- Garantir contraste suficiente entre texto e fundo.
- Não utilizar somente cores para comunicar erros ou estados.
- Garantir navegação por teclado.
- Associar corretamente os labels aos campos.

## 9. Restrições de implementação para agentes de IA

Ao desenvolver ou modificar o frontend, os agentes devem obrigatoriamente:

1. Consultar este documento antes de implementar componentes visuais.
2. Respeitar a identidade visual definida.
3. Reutilizar componentes existentes sempre que possível.
4. Evitar adicionar dependências exclusivamente para efeitos visuais.
5. Não modificar funcionalidades existentes sem autorização.
6. Não alterar os cálculos matemáticos ou algoritmos de Monte Carlo.
7. Não criar campos ou parâmetros que não façam parte dos requisitos.
8. Não adicionar informações fictícias ou resultados simulados à interface.
9. Manter os componentes simples e reutilizáveis.
10. Priorizar a legibilidade e a manutenção do código.

## 10. Critério de aprovação visual

Uma implementação somente deve ser considerada adequada quando:

- A interface for simples e intuitiva.
- Os campos estiverem organizados na sequência definida.
- As informações forem legíveis.
- Não houver elementos decorativos desnecessários.
- O formulário funcionar corretamente em diferentes tamanhos de tela.
- As funcionalidades existentes continuarem funcionando.
- O design respeitar integralmente as restrições deste documento.

**Regra final:** em caso de conflito entre uma escolha estética e a facilidade de utilização, priorizar sempre a facilidade de utilização.