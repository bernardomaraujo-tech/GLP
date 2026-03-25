# GPL Portugal — SEM PLANO

App estática para GitHub Pages com:
- mapa Leaflet
- localização automática
- pesquisa por localidade
- filtro por raio, zona, distrito e marca
- top 10 mais próximas
- preços por posto
- link direto para rota no Waze

## Estrutura
- `index.html`
- `style.css`
- `app.js`
- `data/stations.json`
- `scripts/build_dataset.py`
- `.github/workflows/update-data.yml`

## Publicação
1. Faz upload de todos os ficheiros para o repositório.
2. Em **Settings > Pages**, usa:
   - Branch: `main`
   - Folder: `/ (root)`
3. O ficheiro `.nojekyll` impede processamento com Jekyll.

## Atualização do dataset
O GitHub Action corre diariamente e também pode ser executado manualmente em **Actions > Update GPL dataset > Run workflow**.

## Fontes
O script tenta consolidar:
- lista pública de postos GPL em Portugal
- páginas públicas de preço médio/por posto do ecossistema glpautogas

A integração oficial DGEG deverá ser a evolução futura quando houver credenciais de partilha de informação.
