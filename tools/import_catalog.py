"""Import Kardanka's public listings. Pass --kardany for the PTO-shaft catalog."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlparse
from collections import Counter
from io import BytesIO
import json
import sys
import tempfile
import threading
import time

import requests
from lxml import html
from PIL import Image, ImageOps


SOURCE = "https://www.kardanka.cz/hydraulicke-dily/"
CATALOG_FILE = "catalog.json"
IMAGE_DIRECTORY = "images"
OUT = Path(__file__).resolve().parents[1] / "dist" / "data"
CACHE = Path(tempfile.gettempdir()) / "nerez-catalog-2026-11-05"
THREADS = threading.local()
CACHE.mkdir(exist_ok=True)
OUT.mkdir(exist_ok=True, parents=True)


def fetch(url):
    if not hasattr(THREADS, "session"):
        THREADS.session = requests.Session()
        THREADS.session.headers["User-Agent"] = "NEREZ catalog preview / product reference"
    for attempt in range(4):
        try:
            response = THREADS.session.get(url, timeout=(10, 30))
            response.raise_for_status()
            return response.content
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(0.8 * (2**attempt))


def page(url):
    key = urlparse(url).path.strip("/").replace("/", "_") + ".html"
    cached = CACHE / key
    if not cached.is_file():
        content = fetch(url)
        cached.write_bytes(content)
    return html.fromstring(cached.read_bytes().decode("utf-8"))


def first(el, pattern):
    values = el.xpath(pattern)
    return values[0] if values else ""


def clean(s):
    return " ".join(str(s).split())


def field(el, pattern):
    match = first(el, pattern)
    return clean(match.text_content()) if hasattr(match, "text_content") else clean(match)


def categories(doc):
    result = []
    for a in doc.xpath('//ul[contains(@class,"subcategories")]/li/a'):
        path = a.get("href")
        result.append(dict(id=path.strip("/"), name=field(a, './/span[@class="text"]'),
                           image=field(a, './/img/@data-src') or field(a,'.//img/@src'),
                           sourceUrl=urljoin(SOURCE, path)))
    return result


def get_page_info(category):
    doc = page(category["sourceUrl"])
    last = field(doc, '//*[@data-testid="linkLastPage"]')
    reported_count = field(doc, '//*[contains(@class,"listItemsTotal")]/strong')
    category["sourceCount"] = int(reported_count) if reported_count else None
    category["children"] = [dict(id=x["id"], name=x["name"]) for x in categories(doc)]
    print(category["id"], category["sourceCount"], flush=True)
    return int(last) if last else (2 if doc.xpath('//*[@data-testid="linkNextPage"]') else 1)


def read_products(job):
    category, page_num = job
    url = category["sourceUrl"] + (f"strana-{page_num}/" if page_num > 1 else "")
    doc = page(url)
    entries = []
    for el in doc.xpath('//*[@id="products"]//*[@data-micro="product"]'):
        name = field(el, './/*[@data-micro="name"]')
        price = field(el, './/*[@data-micro="offer"]/@data-micro-price')
        pic = field(el, './/a[@class="image"]/img/@data-src')
        if not pic:
            pic = field(el, './/a[@class="image"]/img/@src')
        big_pic = field(el, './/a[@class="image"]/img/@data-micro-image')
        unit = field(el, './/*[@class="pr-list-unit"]').strip("/ ").strip()
        entries.append(dict(id=el.get("data-micro-product-id"), name=name,
                            code=field(el, './/*[@data-micro="sku"]'),
                            categoryId=category["id"], categoryIds=[category["id"]],
                            price=float(price) if price else None,
                            image=pic if pic.startswith("http") else big_pic,
                            sourceUrl=urljoin(SOURCE, field(el, './/*[@data-micro="url"]/@href')),
                            unit=unit or "ks"))
    return entries


def write_json(obj):
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    temp = OUT / (CATALOG_FILE + ".tmp")
    temp.write_text(data, encoding="utf-8")
    temp.replace(OUT / CATALOG_FILE)


def crawl():
    parent = dict(id=urlparse(SOURCE).path.strip("/"), sourceUrl=SOURCE)
    cats = categories(page(SOURCE))
    with ThreadPoolExecutor(max_workers=5) as pool:
        all_categories = cats + [parent]
        pages = list(pool.map(get_page_info, all_categories))
        jobs = [(category, p) for category, count in zip(all_categories, pages)
                for p in range(1, count + 1)]
        print("Reading", len(jobs), "listing pages", flush=True)
        found = {}
        root_ids = set()
        for i, (job, rows) in enumerate(zip(jobs, pool.map(read_products, jobs))):
            if i % 30 == 0:
                print("Parsed", i + 1, "pages", flush=True)
            category = job[0]["id"]
            for row in rows:
                product_id = row["id"]
                if category == parent["id"]:
                    root_ids.add(product_id)
                if product_id not in found:
                    found[product_id] = row
                elif category != parent["id"] and category not in found[product_id]["categoryIds"]:
                    found[product_id]["categoryIds"].append(category)
    counts = Counter(cat for pid in root_ids for cat in found[pid]["categoryIds"])
    for cat in cats:
        cat["count"] = counts[cat["id"]]
    print("Root count", parent["sourceCount"], "unique products on root", len(root_ids),
          "uncategorized", counts[parent["id"]], "outside root", len(set(found) - root_ids), flush=True)
    if len(root_ids) < 0.98 * parent["sourceCount"]:
        raise RuntimeError("Incomplete root pagination")
    products = [prod for key, prod in found.items() if key in root_ids]
    result = dict(categories=cats, products=products)
    (CACHE / "remote-catalog.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    write_json(result)
    return result


def save_image(job):
    item, relative_path = job
    target = OUT.parent / relative_path
    try:
        if not target.is_file():
            url = item["image"]
            if not url or urlparse(url).hostname not in {"www.kardanka.cz", "cdn.myshoptet.com"}:
                return False
            with Image.open(BytesIO(fetch(url))) as original:
                original.load()
                picture = ImageOps.exif_transpose(original)
                picture.thumbnail((650, 650))
                if "A" in picture.getbands():
                    background = Image.new("RGB", picture.size, "white")
                    background.paste(picture, mask=picture.getchannel("A"))
                    picture = background
                picture.convert("RGB").save(target, "WEBP", quality=85, method=3)
        item["image"] = relative_path
        return True
    except Exception as error:
        print("Image failed", item["id"], str(error)[:120], flush=True)
        return False


def store_images(data):
    (OUT / IMAGE_DIRECTORY).mkdir(exist_ok=True)
    prefix = f"data/{IMAGE_DIRECTORY}/"
    jobs = [(p, f'{prefix}{p["id"]}.webp') for p in data["products"]]
    groups = [(c, f'{prefix}group-{c["id"]}.webp') for c in data["categories"]]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for i, _ in enumerate(pool.map(save_image, groups + jobs)):
            if i % 250 == 0:
                print("Processed", i + 1, "images", flush=True)
                write_json(data)
    write_json(data)
    print("Local images", sum(p["image"].startswith(prefix) for p, _ in jobs), "/", len(jobs), flush=True)


if __name__ == "__main__":
    kardany = "--kardany" in sys.argv
    if kardany:
        SOURCE = "https://www.kardanka.cz/kardanove-hridele/"
        CATALOG_FILE = "kardany.json"
        IMAGE_DIRECTORY = "kardany-images"
        CACHE = CACHE / "kardany"
        CACHE.mkdir(exist_ok=True)
    if "--images-only" in sys.argv:
        catalog = json.loads((CACHE / "remote-catalog.json").read_text(encoding="utf-8"))
    else:
        catalog = crawl()
    if "--data-only" not in sys.argv:
        store_images(catalog)
    if kardany:
        offline_data = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))
        (OUT / "kardany-offline.js").write_text("window.nerezKardanyOffline = " + offline_data + ";", encoding="utf-8")
    else:
        specs_file = OUT / "featured-specs.json"
        specs = json.loads(specs_file.read_text(encoding="utf-8")) if specs_file.exists() else {}
        offline_data = json.dumps({"catalog": catalog, "specs": specs}, ensure_ascii=False, separators=(",", ":"))
        (OUT / "offline.js").write_text("window.nerezOffline = " + offline_data + ";", encoding="utf-8")
