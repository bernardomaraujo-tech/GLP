# GPL Portugal — app estática para GitHub Pages

App pensada ao estilo da tua página SEM PLANO: simples, visual e prática.

## O que já faz
- mapa Leaflet
- botão **Usar a minha localização**
- pesquisa por **localidade / localização**
- filtro por **raio** (10, 25, 50, 75, 100 km)
- filtro por **zona do país**
- filtro por **distrito**
- filtro por **marca**
- ordenação por **distância / preço / nome**
- destaque das **10 mais próximas**
- botão **Mais barato no raio**
- abertura do posto no **Google Maps**

## Estrutura
- `index.html` — layout
- `style.css` — visual
- `app.js` — lógica da app
- `data/stations.json` — dataset inicial
- `scripts/build_dataset.py` — base para gerar dataset final
- `.github/workflows/update-data.yml` — workflow de atualização

## Publicar no GitHub Pages
1. criar repositório
2. copiar todos os ficheiros
3. enviar para a branch principal
4. em **Settings > Pages**
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)** ou `/docs` se reorganizares
5. guardar e esperar a publicação

## Próxima evolução recomendada
A versão certa para produção é:
1. **lista base** de postos GPL a partir do `glpautogas.info`
2. **preços por posto** enriquecidos com DGEG
3. geração automática de `stations.json`
4. atualização periódica com GitHub Actions

## Nota importante
O dataset incluído aqui é apenas uma base inicial para validação da interface e da lógica.
O passo seguinte é substituir `data/stations.json` pelo dataset completo.
