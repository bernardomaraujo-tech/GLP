# GPL Portugal — SEM PLANO

App estática para GitHub Pages com:
- pesquisa por localização
- top 10 mais próximas
- filtro por raio, zona, distrito e marca
- destaque do posto mais barato no raio
- links diretos para Waze e Google Maps

## Estrutura
- `scripts/export_dgeg_csv.py` exporta o CSV da DGEG
- `scripts/build_dataset.py` converte o CSV para `data/stations.json`
- `.github/workflows/update-data.yml` corre diariamente

## Nota
Se a interface do portal da DGEG mudar, pode ser preciso ajustar os seletores do Playwright em `export_dgeg_csv.py`.
