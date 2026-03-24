# SEM PLANO • GPL Portugal

App estática para GitHub Pages com:
- mapa Leaflet
- pesquisa por localização
- geolocalização automática
- 10 postos mais próximos
- filtro por zona, distrito, marca e raio
- link direto para rota no Waze por baixo de cada posto
- atualização diária do `data/stations.json`

## Publicação
1. Carrega todos os ficheiros para o repositório.
2. Em **Settings > Pages**, escolhe:
   - Branch: `main`
   - Folder: `/ (root)`
3. Guarda e abre o URL do GitHub Pages.

## Atualização de dados
O workflow `.github/workflows/update-data.yml` corre diariamente e gera `data/stations.json`.

## Fontes incluídas nesta versão
- glpautogas.info: base de postos GPL em Portugal
- myLPG.eu: preços de referência e data de confirmação

## Nota
Se mais tarde tiveres acesso formal à partilha de informação da DGEG, a melhor evolução é trocar a fonte principal de preços para a DGEG e manter as restantes apenas como complemento.
