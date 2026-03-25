from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DEBUG_DIR = ROOT / "debug"
CSV_PATH = DATA_DIR / "Postos.csv"

PORTAL_URL = "https://precoscombustiveis.dgeg.gov.pt/"


def try_click_cookie_buttons(page):
    for label in ["Aceitar", "Accept", "OK", "Concordo", "Fechar"]:
        try:
            page.get_by_role("button", name=label).click(timeout=1500)
            page.wait_for_timeout(800)
            return True
        except Exception:
            pass
    return False


def select_gpl_auto(page):
    # 1) tentar por labels conhecidos
    possible_labels = [
        "Combustivel:*",
        "Combustível:*",
        "Combustivel",
        "Combustível",
        "Tipo de Combustível",
        "Tipo de combustivel",
    ]

    for label in possible_labels:
        try:
            locator = page.get_by_label(label)
            locator.select_option(label="GPL Auto", timeout=3000)
            return True
        except Exception:
            pass

    # 2) tentar todos os selects da página
    selects = page.locator("select")
    count = selects.count()

    for i in range(count):
        try:
            options = selects.nth(i).locator("option")
            opt_count = options.count()

            for j in range(opt_count):
                text = (options.nth(j).inner_text(timeout=500) or "").strip().lower()
                if "gpl" in text:
                    value = options.nth(j).get_attribute("value")
                    if value is not None:
                        selects.nth(i).select_option(value=value, timeout=3000)
                        return True
        except Exception:
            pass

    return False


def click_search(page):
    # 1) tentar botão com texto exato mais provável
    try:
        page.get_by_role("button", name="Procurar").click(timeout=3000)
        return True
    except Exception:
        pass

    # 2) tentar input submit / button submit
    try:
        page.locator("button[type=submit], input[type=submit]").first.click(timeout=3000)
        return True
    except Exception:
        pass

    # 3) tentar por texto visível
    try:
        page.get_by_text("Procurar", exact=False).click(timeout=3000)
        return True
    except Exception:
        pass

    # 4) fallback: submeter o primeiro form
    try:
        page.locator("form").first.evaluate("form => form.submit()")
        return True
    except Exception:
        pass

    return False


def click_export_and_download(page):
    with page.expect_download(timeout=30000) as download_info:
        # 1) por texto
        for text in ["Exportar para CSV", "CSV", "Exportar"]:
            try:
                page.get_by_text(text, exact=False).click(timeout=3000)
                return download_info.value
            except Exception:
                pass

        # 2) procurar em links e botões
        candidates = page.locator("a, button")
        count = candidates.count()

        for i in range(count):
            try:
                text = (candidates.nth(i).inner_text(timeout=500) or "").strip().lower()
                href = (candidates.nth(i).get_attribute("href") or "").strip().lower()

                if "csv" in text or "export" in text or "csv" in href:
                    candidates.nth(i).click(timeout=3000)
                    return download_info.value
            except Exception:
                pass

    return None


def save_debug(page, name_prefix="dgeg_debug"):
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(DEBUG_DIR / f"{name_prefix}.png"), full_page=True)
    html = page.content()
    (DEBUG_DIR / f"{name_prefix}.html").write_text(html, encoding="utf-8")


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto(PORTAL_URL, wait_until="domcontentloaded", timeout=120000)
        page.wait_for_timeout(5000)

        try_click_cookie_buttons(page)

        if not select_gpl_auto(page):
            save_debug(page, "step_select_gpl_failed")
            browser.close()
            raise RuntimeError("Não foi possível selecionar o combustível GPL Auto.")

        page.wait_for_timeout(1500)

        if not click_search(page):
            save_debug(page, "step_search_failed")
            browser.close()
            raise RuntimeError("Não foi possível clicar no botão de pesquisa.")

        page.wait_for_load_state("networkidle", timeout=120000)
        page.wait_for_timeout(4000)

        download = click_export_and_download(page)
        if not download:
            save_debug(page, "step_export_failed")
            browser.close()
            raise RuntimeError("Não foi possível encontrar o botão/link de exportação CSV.")

        download.save_as(str(CSV_PATH))
        browser.close()

    print(f"CSV guardado em: {CSV_PATH}")


if __name__ == "__main__":
    main()
