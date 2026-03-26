# GPL Portugal — versão com atualização automática via browser

Este projeto fica preparado para:

- publicar a app no GitHub Pages
- abrir o portal da DGEG com Playwright
- selecionar **GPL Auto**
- correr a pesquisa
- exportar o CSV
- substituir `data/Postos.csv`
- regenerar `data/stations.json`
- fazer commit automático no GitHub

## Ficheiros novos / alterados

Substitui ou adiciona estes ficheiros no teu repositório:

```text
.
├── .github/
│   └── workflows/
│       └── update-data.yml
├── requirements.txt
├── scripts/
│   ├── build_dataset.py
│   └── fetch_dgeg.py
└── README.md
```

## O que tens de manter igual

Mantém sem alterações, salvo se quiseres mexer na app:

- `index.html`
- `app.js`
- `style.css`
- `logo.svg`
- `logo.png`
- `scripts/build_dataset.py`

## Instalação local

```bash
pip install -r requirements.txt
python -m playwright install chromium
python scripts/fetch_dgeg.py
python scripts/build_dataset.py
```

## Agendamento atual

O workflow está configurado para correr:

- **de 2 em 2 dias**
- às **08:00 UTC**

Em Portugal continental, isto pode equivaler a:

- 08:00 no inverno
- 09:00 no verão

Se quiseres outra hora, altera o cron em:

```yaml
.github/workflows/update-data.yml
```

## Notas importantes

### 1. O script usa browser real
Foi feito com **Playwright + Chromium**.

### 2. Pode ser necessário afinar seletores
Como o portal da DGEG pode mudar HTML, o script `scripts/fetch_dgeg.py` já tenta vários seletores e textos, mas pode precisar de ajuste fino no futuro.

### 3. Debug automático
Se falhar, o script grava screenshots em:

```text
debug/
```

## Fluxo completo

1. GitHub Actions arranca no horário definido
2. `scripts/fetch_dgeg.py` abre o site e descarrega o CSV
3. `scripts/build_dataset.py` regenera o JSON
4. GitHub faz commit apenas se houver alterações
