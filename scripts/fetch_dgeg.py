from __future__ import annotations

from pathlib import Path
from typing import Iterable

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUTPUT_FILE = DATA_DIR / "Postos.csv"
DEBUG_DIR = ROOT / "debug"
TARGET_URL = "https://precoscombustiveis.dgeg.gov.pt/"
FUEL_LABEL = "GPL Auto"


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)


def first_visible(page, selectors: Iterable[str], timeout_ms: int = 8000):
    last_error = None
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            locator.wait_for(state="visible", timeout=timeout_ms)
            return locator
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise RuntimeError(f"Nenhum seletor encontrado: {list(selectors)} | último erro: {last_error}")


def safe_click(locator, timeout_ms: int = 10000, force: bool = False) -> None:
    locator.wait_for(state="visible", timeout=timeout_ms)
    locator.scroll_into_view_if_needed(timeout=timeout_ms)
    locator.click(timeout=timeout_ms, force=force)


def wait_modal_to_clear(page, timeout_ms: int = 8000) -> None:
    modal_selectors = [
        ".ck-modal",
        ".modal.show",
        ".modal-backdrop",
        ".swal2-container",
        ".sweet-alert",
        "[role='dialog']",
    ]

    for selector in modal_selectors:
        try:
            locator = page.locator(selector).first
            if locator.count() > 0 and locator.is_visible():
                try:
                    close_candidates = [
                        f"{selector} button:has-text('Fechar')",
                        f"{selector} button:has-text('OK')",
                        f"{selector} button:has-text('Aceitar')",
                        f"{selector} button:has-text('Continuar')",
                        f"{selector} .close",
                        f"{selector} [aria-label='Close']",
                        f"{selector} button",
                    ]
                    for close_selector in close_candidates:
                        btn = page.locator(close_selector).first
                        if btn.count() > 0 and btn.is_visible():
                            try:
                                safe_click(btn, timeout_ms=2000)
                                page.wait_for_timeout(800)
                                break
                            except Exception:
                                pass
                except Exception:
                    pass

                try:
                    locator.wait_for(state="hidden", timeout=timeout_ms)
                except Exception:
                    pass
        except Exception:
            pass


def click_first(page, selectors: Iterable[str], timeout_ms: int = 8000) -> None:
    wait_modal_to_clear(page, timeout_ms=3000)

    locator = first_visible(page, selectors, timeout_ms)

    try:
        safe_click(locator, timeout_ms=timeout_ms)
        return
    except Exception:
        pass

    page.wait_for_timeout(1000)
    wait_modal_to_clear(page, timeout_ms=5000)

    try:
        safe_click(locator, timeout_ms=timeout_ms)
        return
    except Exception:
        pass

    # Último fallback
    safe_click(locator, timeout_ms=timeout_ms, force=True)


def select_fuel(page) -> None:
    select_candidates = [
        "select",
        "select[name*='combust']",
        "select[id*='combust']",
        "select[aria-label*='Combust']",
    ]

    for selector in select_candidates:
        locator = page.locator(selector).first
        try:
            locator.wait_for(state="visible", timeout=4000)
            locator.select_option(label=FUEL_LABEL)
            return
        except Exception:
            pass

    click_first(
        page,
        [
            "label:has-text('Combustível')",
            "text=Combustível",
            "[aria-label*='Combust']",
            "[id*='combust']",
        ],
    )

    option = page.get_by_text(FUEL_LABEL, exact=True)
    option.wait_for(state="visible", timeout=5000)
    option.click()


def fetch_csv() -> Path:
    ensure_dirs()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(accept_downloads=True, locale="pt-PT")
        page = context.new_page()

        try:
            page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=90000)
            page.wait_for_load_state("networkidle", timeout=30000)
            page.screenshot(path=str(DEBUG_DIR / "01-home.png"), full_page=True)

            wait_modal_to_clear(page, timeout_ms=5000)

            select_fuel(page)
            page.screenshot(path=str(DEBUG_DIR / "02-fuel-selected.png"), full_page=True)

            # Alguns fluxos têm botão OK antes do Procurar
            try:
                click_first(
                    page,
                    [
                        "button:has-text('OK')",
                        "input[type='button'][value='OK']",
                        "input[type='submit'][value='OK']",
                        "text=OK",
                    ],
                    timeout_ms=4000,
                )
                page.wait_for_timeout(1000)
            except Exception:
                pass

            wait_modal_to_clear(page, timeout_ms=5000)

            click_first(
                page,
                [
                    "button:has-text('Procurar')",
                    "button:has-text('Pesquisar')",
                    "input[type='button'][value='Procurar']",
                    "input[type='submit'][value='Procurar']",
                    "input[type='button'][value='Pesquisar']",
                    "input[type='submit'][value='Pesquisar']",
                    "text=Procurar",
                    "text=Pesquisar",
                ],
                timeout_ms=15000,
            )

            page.wait_for_timeout(2000)
            page.screenshot(path=str(DEBUG_DIR / "03-after-search.png"), full_page=True)
            wait_modal_to_clear(page, timeout_ms=5000)

            # Em alguns fluxos existe um link intermédio "clique aqui"
            try:
                click_first(
                    page,
                    [
                        "a:has-text('clique aqui')",
                        "a:has-text('Clique aqui')",
                        "text=clique aqui",
                        "text=Clique aqui",
                    ],
                    timeout_ms=8000,
                )
                page.wait_for_timeout(1500)
                page.screenshot(path=str(DEBUG_DIR / "04-after-click-here.png"), full_page=True)
            except Exception:
                pass

            export_selectors = [
                "a:has-text('Exportar para CSV')",
                "button:has-text('Exportar para CSV')",
                "a:has-text('Exportar')",
                "button:has-text('Exportar')",
                "text=Exportar para CSV",
                "text=Exportar",
            ]

            export_button = first_visible(page, export_selectors, timeout_ms=60000)

            with page.expect_download(timeout=60000) as download_info:
                try:
                    safe_click(export_button, timeout_ms=10000)
                except Exception:
                    wait_modal_to_clear(page, timeout_ms=5000)
                    safe_click(export_button, timeout_ms=10000, force=True)

            download = download_info.value
            download.save_as(str(OUTPUT_FILE))

            if not OUTPUT_FILE.exists() or OUTPUT_FILE.stat().st_size < 200:
                raise RuntimeError("O CSV foi descarregado mas parece inválido ou vazio.")

            print(f"CSV atualizado com sucesso: {OUTPUT_FILE}")
            return OUTPUT_FILE

        except PlaywrightTimeoutError as exc:
            page.screenshot(path=str(DEBUG_DIR / "timeout-error.png"), full_page=True)
            raise RuntimeError(
                "Timeout durante a navegação no portal DGEG. Foi criada uma screenshot em debug/timeout-error.png"
            ) from exc
        except Exception as exc:
            page.screenshot(path=str(DEBUG_DIR / "generic-error.png"), full_page=True)
            raise RuntimeError(
                "Falha na recolha do CSV. Foi criada uma screenshot em debug/generic-error.png. "
                "É provável que seja necessário ajustar os seletores ao HTML atual do site."
            ) from exc
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    fetch_csv()
