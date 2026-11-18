# Estimador de Volume por "Chuva Aleatória" (Método de Monte Carlo) — Cálculo 2

## 🔗 Acesse a Aplicação Online (GitHub Pages)
👉 **[Clique aqui para abrir o Estimador de Volume na Web](https://lulthoro.github.io/Estimador-de-Volume---Chuva-Aleat-ria-/)**

---

## Sobre o Projeto

Aplicação web interativa que une **Integrais Duplas via Método de Monte Carlo** e **Derivadas Parciais / Vetor Gradiente ($\nabla f$)** para estimar:
1. O **volume total de chuva** precipitado sobre uma região topográfica de raio $L\text{ km}$ ($R = [-L, L] \times [-L, L]$).
2. A fração e o volume de água que **infiltra no solo** (em função da permeabilidade e da declividade local $\|\nabla f(x,y)\|$).
3. A fração e o volume de água que **escorre superficialmente para as áreas mais baixas** seguindo o sentido oposto ao gradiente ($-\nabla f(x,y)$).

## Recursos Implementados

- **Localização e Relevo ($z = f(x, y)$):**
  - **Mapa Topográfico Real (Leaflet + Open-Meteo Elevation API):** busca por **CEP** (ViaCEP + Open-Meteo Geocoding) ou por **Coordenadas Geográficas** (latitude e longitude), gerando curvas de nível reais e superfície 3D sem necessidade de chave de API.
  - **Funções Clássicas de Cálculo 2:** *Bacia Parabólica*, *Morros e Vales Senoidais*, *Vale de Sela (Paraboloide Hiperbólico)*, *Dois Morros Gaussianos e Bacia Central* e *Encosta com Calha Fluvial*.
- **Simulação de Monte Carlo e Hidrologia:**
  - Definição do raio de abrangência em quilômetros ($\text{km}$) e da quantidade de pontos aleatórios ($N$).
  - Opção de **Chuva com quantidade definida pelo usuário ($\text{mm}$)** ou **Chuva aleatória**.
  - Comparação automática com a **Soma de Riemann** e gráfico de convergência de Monte Carlo.

## Como Executar Localmente

Você pode acessar diretamente pelo link do GitHub Pages acima, abrir o arquivo `index.html` no navegador ou iniciar um servidor HTTP local na pasta do projeto:

```bash
python3 -m http.server 8000
```
E acessar `http://localhost:8000` no navegador.
