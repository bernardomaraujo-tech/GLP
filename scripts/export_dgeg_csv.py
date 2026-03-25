from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CSV_PATH = DATA_DIR / "Postos.csv"

PORTAL_URL = "https://precoscombustiveis.dgeg.gov.pt/"


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(PORTAL_URL, wait_until="networkidle", timeout=120000)

        # Ajustar estes seletores caso a interface do portal mude.
        page.get_by_label("Combustivel:*").select_option(label="GPL Auto")
        page.get_by_role("button", name="Procurar").click()
        page.wait_for_load_state("networkidle")

        with page.expect_download() as download_info:
            page.get_by_text("Exportar para CSV").click()

        download = download_info.value
        download.save_as(str(CSV_PATH))
        browser.close()

    print(f"CSV guardado em: {CSV_PATH}")


if __name__ == "__main__":
    main()
