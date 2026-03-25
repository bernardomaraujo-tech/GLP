# GPL Portugal — projeto pronto para GitHub Pages

Este projeto já está preparado para:

- publicar uma página estática no GitHub Pages
- ler os postos GPL Auto a partir de `data/Postos.csv`
- gerar automaticamente `data/stations.json`
- mostrar mapa, filtros, 10 postos mais próximos, preço, Google Maps e Waze

## Estrutura

```text
.
├── .github/workflows/deploy.yml
├── app.js
├── data/
│   ├── Postos.csv
│   └── stations.json
├── index.html
├── logo.svg
├── requirements.txt
├── scripts/build_dataset.py
└── style.css
```

## O que tens de fazer no GitHub

### 1. Criar repositório
Cria um repositório novo no GitHub, por exemplo:
`gpl-portugal`

### 2. Fazer upload de todos os ficheiros
Faz upload de **todo o conteúdo desta pasta** para a raiz do repositório.

### 3. Ativar GitHub Pages
No repositório:
- **Settings**
- **Pages**
- em **Source**, escolhe **GitHub Actions**

### 4. Fazer o primeiro commit na branch `main`
Assim que o código estiver no GitHub:
- o workflow vai correr
- `data/stations.json` vai ser regenerado
- a página vai ser publicada automaticamente

## Como atualizar os dados depois

Tens duas formas simples.

### Opção A — mais simples
Substituis o ficheiro:
`data/Postos.csv`

Depois fazes commit/push.

O GitHub Actions:
- volta a gerar `data/stations.json`
- atualiza a página

### Opção B — localmente
Se quiseres gerar o JSON no teu computador antes de fazer push:

```bash
pip install -r requirements.txt
python scripts/build_dataset.py
```

## Formato esperado do CSV

O script espera estas colunas:

- `Nome`
- `TipoPosto`
- `Municipio`
- `Preco`
- `Marca`
- `Combustivel`
- `DataAtualizacao`
- `Distrito`
- `Morada`
- `Localidade`
- `CodPostal`
- `Latitude`
- `Longitude`

Separador:
- `;`

## O que este projeto já faz

- filtra apenas linhas com `GPL`
- deduplica postos por chave estável
- normaliza marcas mais comuns
- cria `stations.json`
- mostra:
  - total de postos
  - postos com coordenadas
  - postos com preço
  - melhor preço
- permite:
  - filtro por raio
  - filtro por zona
  - filtro por distrito
  - filtro por marca
  - pesquisa por texto
  - geolocalização do utilizador
  - abrir navegação no Waze ou Google Maps

## Nota importante
Neste pacote **não incluí scraping automático do portal DGEG**.
A versão que te estou a dar fica **mais estável e mais simples de manter**:

- a página funciona logo
- o workflow funciona logo
- basta atualizares o CSV quando quiseres
