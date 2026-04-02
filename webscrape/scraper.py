"""Spirit Island Wiki Scraper.

Crawls spiritislandwiki.com and saves all page content + images locally.
Run this script from a network without restrictions (e.g., home WiFi).

Usage:
    conda activate arcade
    python webscrape/scraper.py                  # Full crawl (pages + images)
    python webscrape/scraper.py --pages-only     # Text content only, skip images
    python webscrape/scraper.py --resume         # Resume an interrupted crawl

Output structure:
    webscrape/output/
        index.json              # Master index of all scraped pages
        pages/
            <PageTitle>/
                raw.html        # Full HTML
                content.txt     # Clean extracted text
        images/
            spirits/            # Spirit panel images
            powers/             # Power card images
            fears/              # Fear card images
            blights/            # Blight card images
            events/             # Event card images
            boards/             # Island board images
            adversaries/        # Adversary panel images
            scenarios/          # Scenario images
            misc/               # Other images
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib3
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

import requests
from bs4 import BeautifulSoup

# Disable SSL warnings for self-signed cert on the wiki
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE_URL = "https://spiritislandwiki.com"
WIKI_PREFIX = "/index.php?title="
API_URL = f"{BASE_URL}/api.php"

# Output directories
SCRAPE_DIR = Path(__file__).parent
OUTPUT_DIR = SCRAPE_DIR / "output"
PAGES_DIR = OUTPUT_DIR / "pages"
IMAGES_DIR = OUTPUT_DIR / "images"

# Rate limiting - be polite to the wiki
REQUEST_DELAY = 0.3  # seconds between requests

# Seed pages to start crawling from
SEED_PAGES = [
    "Main_Page",
    "Spirits",
    "Minor_Powers",
    "Major_Powers",
    "Fear_Cards",
    "Blight_Cards",
    "Event_Cards",
    "Island_Boards",
    "Adversaries",
    "Scenarios",
    "Rules",
    "Invader_Cards",
    "Dahan",
    "Invaders",
    "Tokens_and_Markers",
    "Elements",
    "Unique_Powers",
]

# Pages whose outgoing links we should follow (deep crawl)
DEEP_CRAWL_CATEGORIES = {
    "Spirits",
    "Minor_Powers",
    "Major_Powers",
    "Fear_Cards",
    "Blight_Cards",
    "Event_Cards",
    "Island_Boards",
    "Adversaries",
    "Scenarios",
    "Unique_Powers",
}

# Known spirit names for categorization
KNOWN_SPIRITS = [
    "lightning", "river", "shadow", "vital", "earth", "green", "ocean",
    "bringer", "thunderspeaker", "keeper", "sharp", "shifting", "stone",
    "serpent", "wildfire", "fangs", "fracture", "many minds", "volcano",
    "starlight", "lure", "vengeance", "finder", "trickster", "downpour",
    "ember", "eyes", "rising", "shroud", "sun", "wounded", "breath",
    "whirlwind", "grinning", "portent", "spread", "heart", "devouring",
]


class WikiScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })
        self.visited_pages: set[str] = set()
        self.visited_images: set[str] = set()
        self.page_index: dict[str, dict] = {}
        self.stats = {"pages": 0, "images": 0, "errors": 0, "skipped": 0}

    # ─── HTTP helpers ────────────────────────────────────────────────────

    def _get(self, url: str) -> requests.Response | None:
        """Fetch a URL with retries and rate limiting."""
        for attempt in range(3):
            try:
                resp = self.session.get(url, timeout=30)
                if resp.status_code == 503:
                    print(f"  503 on attempt {attempt + 1}, retrying...")
                    time.sleep(2 ** attempt)
                    continue
                resp.raise_for_status()
                time.sleep(REQUEST_DELAY)
                return resp
            except requests.RequestException as e:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                print(f"  ERROR fetching {url}: {e}")
                self.stats["errors"] += 1
                return None
        return None

    def _page_url(self, title: str) -> str:
        return f"{BASE_URL}{WIKI_PREFIX}{title}"

    # ─── Content extraction ──────────────────────────────────────────────

    def _save_page(self, title: str, soup: BeautifulSoup) -> Path:
        """Save page content as clean text + raw HTML."""
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', title)
        page_dir = PAGES_DIR / safe_name
        page_dir.mkdir(parents=True, exist_ok=True)

        # Save raw HTML
        html_path = page_dir / "raw.html"
        html_path.write_text(str(soup), encoding="utf-8")

        # Extract clean text from the content area
        content_div = (
            soup.find("div", {"class": "mw-parser-output"})
            or soup.find("div", {"id": "mw-content-text"})
        )

        text_parts = []
        if content_div:
            for elem in content_div.find_all(
                ["h1", "h2", "h3", "h4", "h5", "p", "li", "td", "th",
                 "caption", "dd", "dt", "blockquote", "pre"]
            ):
                text = elem.get_text(strip=True)
                if not text:
                    continue
                tag = elem.name
                if tag in ("h1", "h2"):
                    text_parts.append(f"\n{'=' * 60}\n{text}\n{'=' * 60}")
                elif tag in ("h3", "h4"):
                    text_parts.append(f"\n--- {text} ---")
                elif tag == "h5":
                    text_parts.append(f"\n  * {text}")
                elif tag == "li":
                    text_parts.append(f"  - {text}")
                elif tag in ("dt", "dd"):
                    text_parts.append(f"  {text}")
                else:
                    text_parts.append(text)

            # Also extract tables as structured data
            for table in content_div.find_all("table"):
                rows = table.find_all("tr")
                if rows:
                    text_parts.append("\n[TABLE]")
                    for row in rows:
                        cells = row.find_all(["th", "td"])
                        if cells:
                            cell_texts = [c.get_text(strip=True) for c in cells]
                            text_parts.append(" | ".join(cell_texts))
                    text_parts.append("[/TABLE]\n")

        text_path = page_dir / "content.txt"
        text_path.write_text("\n".join(text_parts), encoding="utf-8")

        return page_dir

    def _extract_wiki_links(self, soup: BeautifulSoup) -> list[str]:
        """Extract internal wiki page titles from the content area."""
        titles = []
        content_div = (
            soup.find("div", {"class": "mw-parser-output"})
            or soup.find("div", {"id": "mw-content-text"})
            or soup
        )
        for a in content_div.find_all("a", href=True):
            href = a["href"]
            if WIKI_PREFIX in href:
                title = href.split(WIKI_PREFIX)[-1].split("#")[0]
                # Skip special/meta pages
                if ":" in title:
                    continue
                if title in ("Main_Page",):
                    continue
                if title:
                    titles.append(title)
        return list(dict.fromkeys(titles))  # dedupe, preserve order

    def _extract_image_urls(self, soup: BeautifulSoup) -> list[str]:
        """Extract meaningful image URLs from the page content."""
        urls = []
        content_div = (
            soup.find("div", {"class": "mw-parser-output"})
            or soup.find("div", {"id": "mw-content-text"})
            or soup
        )

        # Get <img> tags
        for img in content_div.find_all("img", src=True):
            src = img["src"]
            if src.startswith("//"):
                src = "https:" + src
            elif src.startswith("/"):
                src = BASE_URL + src

            # Skip tiny UI elements
            try:
                w = int(img.get("width", 0))
                h = int(img.get("height", 0))
                if w < 40 and h < 40:
                    continue
            except (ValueError, TypeError):
                pass

            # Skip site chrome
            skip_patterns = [
                "logo", "favicon", "icon", "button", "arrow",
                "magnify-clip", "sitenotice", "footer",
            ]
            if any(p in src.lower() for p in skip_patterns):
                continue

            urls.append(src)

        # Get links to full-resolution images (File: pages)
        for a in content_div.find_all("a", href=True):
            href = a.get("href", "")
            if "/images/" in href and any(
                href.lower().endswith(ext)
                for ext in (".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp")
            ):
                full_url = urljoin(BASE_URL, href)
                urls.append(full_url)

        # Also check "a.image" wrappers that link to File: pages
        for a in content_div.find_all("a", {"class": "image"}):
            href = a.get("href", "")
            if href:
                # These often link to /index.php?title=File:xxx
                # We need the actual image URL from the File page
                full_url = urljoin(BASE_URL, href)
                urls.append(full_url)

        return list(dict.fromkeys(urls))

    # ─── Image downloading ───────────────────────────────────────────────

    def _download_image(self, url: str, category: str = "misc") -> Path | None:
        """Download an image and save it to the appropriate category folder."""
        if url in self.visited_images:
            return None
        self.visited_images.add(url)

        resp = self._get(url)
        if resp is None:
            return None

        content_type = resp.headers.get("content-type", "")

        # If we got an HTML page (File: description page), find the actual image
        if "html" in content_type:
            soup = BeautifulSoup(resp.text, "lxml")
            # Look for the full-resolution image link
            full_link = soup.find("div", {"class": "fullImageLink"})
            if full_link:
                a = full_link.find("a", href=True)
                if a:
                    actual_url = urljoin(BASE_URL, a["href"])
                    if actual_url not in self.visited_images:
                        return self._download_image(actual_url, category)
            # Also try the direct image in the page
            for img in soup.find_all("img", src=True):
                src = img["src"]
                if "/images/" in src and "thumb" not in src:
                    actual_url = urljoin(BASE_URL, src)
                    if actual_url not in self.visited_images:
                        return self._download_image(actual_url, category)
            return None

        if "image" not in content_type and "octet-stream" not in content_type:
            return None

        # Determine filename
        parsed = urlparse(url)
        filename = unquote(Path(parsed.path).name)
        if not filename or filename == "/":
            filename = hashlib.md5(url.encode()).hexdigest()[:16]

        # Clean up filename
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)

        # Ensure proper extension
        ext = Path(filename).suffix.lower()
        if ext not in (".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"):
            if "jpeg" in content_type or "jpg" in content_type:
                filename += ".jpg"
            elif "png" in content_type:
                filename += ".png"
            elif "gif" in content_type:
                filename += ".gif"
            elif "svg" in content_type:
                filename += ".svg"
            else:
                filename += ".bin"

        # Save
        cat_dir = IMAGES_DIR / category
        cat_dir.mkdir(parents=True, exist_ok=True)
        filepath = cat_dir / filename

        # Skip if already downloaded
        if filepath.exists() and filepath.stat().st_size > 0:
            self.stats["skipped"] += 1
            return filepath

        filepath.write_bytes(resp.content)
        self.stats["images"] += 1
        return filepath

    # ─── Categorization ──────────────────────────────────────────────────

    def _categorize_page(self, title: str) -> str:
        """Determine the image category for a page based on its title."""
        t = title.lower().replace("_", " ")

        # Check specific categories first
        if any(s in t for s in KNOWN_SPIRITS):
            return "spirits"
        if "spirit" in t and "island" not in t:
            return "spirits"
        if "minor power" in t or "minor_power" in t:
            return "powers"
        if "major power" in t or "major_power" in t:
            return "powers"
        if "unique power" in t or "unique_power" in t:
            return "powers"
        if "power" in t and "card" in t:
            return "powers"
        if "fear" in t:
            return "fears"
        if "blight" in t:
            return "blights"
        if "event" in t:
            return "events"
        if "board" in t or "island board" in t:
            return "boards"
        if "adversar" in t:
            return "adversaries"
        if "scenario" in t:
            return "scenarios"
        if "invader" in t:
            return "invaders"
        return "misc"

    # ─── Main crawl logic ────────────────────────────────────────────────

    def scrape_page(self, title: str, download_images: bool = True) -> dict:
        """Scrape a single wiki page."""
        if title in self.visited_pages:
            return self.page_index.get(title, {})
        self.visited_pages.add(title)

        url = self._page_url(title)
        print(f"  [{self.stats['pages'] + 1:>4}] {title}")

        resp = self._get(url)
        if resp is None:
            return {}

        soup = BeautifulSoup(resp.text, "lxml")

        # Check if we got actual wiki content (not a block page)
        if soup.find("title") and "blocked" in soup.find("title").text.lower():
            print(f"    BLOCKED - skipping")
            self.stats["errors"] += 1
            return {}

        # Save page
        page_dir = self._save_page(title, soup)

        # Extract links and images
        links = self._extract_wiki_links(soup)
        image_urls = self._extract_image_urls(soup)

        # Download images
        category = self._categorize_page(title)
        downloaded = []
        if download_images and image_urls:
            for img_url in image_urls:
                path = self._download_image(img_url, category)
                if path:
                    downloaded.append(str(path))
            if downloaded:
                print(f"         -> {len(downloaded)} images saved to {category}/")

        self.stats["pages"] += 1

        entry = {
            "title": title,
            "url": url,
            "dir": str(page_dir),
            "links": links,
            "image_count": len(image_urls),
            "downloaded_images": downloaded,
            "category": category,
        }
        self.page_index[title] = entry
        return entry

    def _save_index(self):
        """Save the page index to disk."""
        index_path = OUTPUT_DIR / "index.json"
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(self.page_index, f, indent=2, ensure_ascii=False)

    def _load_resume_state(self):
        """Load previously scraped state for resuming."""
        index_path = OUTPUT_DIR / "index.json"
        if index_path.exists():
            with open(index_path, "r", encoding="utf-8") as f:
                self.page_index = json.load(f)
            self.visited_pages = set(self.page_index.keys())
            print(f"Resumed: {len(self.visited_pages)} pages already scraped")

    def crawl(
        self,
        pages_only: bool = False,
        resume: bool = False,
    ):
        """Run the full wiki crawl."""
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        PAGES_DIR.mkdir(parents=True, exist_ok=True)
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)

        if resume:
            self._load_resume_state()

        download_images = not pages_only

        print("=" * 60)
        print("  Spirit Island Wiki Scraper")
        print("=" * 60)
        print(f"  Target:  {BASE_URL}")
        print(f"  Output:  {OUTPUT_DIR}")
        print(f"  Images:  {'yes' if download_images else 'no'}")
        print(f"  Delay:   {REQUEST_DELAY}s between requests")
        print("=" * 60)

        # ── Phase 1: Seed pages ──────────────────────────────────────────
        print(f"\n[Phase 1] Scraping {len(SEED_PAGES)} seed pages...")
        for title in SEED_PAGES:
            self.scrape_page(title, download_images=download_images)
        self._save_index()
        print(f"  -> {self.stats['pages']} pages, {self.stats['images']} images so far")

        # ── Phase 2: Follow links from category pages ────────────────────
        print(f"\n[Phase 2] Deep crawl from category pages...")
        pages_to_crawl = []
        for cat_title in DEEP_CRAWL_CATEGORIES:
            entry = self.page_index.get(cat_title, {})
            for link_title in entry.get("links", []):
                if link_title not in self.visited_pages:
                    pages_to_crawl.append(link_title)

        pages_to_crawl = list(dict.fromkeys(pages_to_crawl))
        total = len(pages_to_crawl)
        print(f"  Found {total} linked pages to crawl")

        for i, title in enumerate(pages_to_crawl):
            if i > 0 and i % 25 == 0:
                self._save_index()  # periodic save
                print(f"\n  --- Progress: {i}/{total} pages | "
                      f"{self.stats['pages']} total | "
                      f"{self.stats['images']} images | "
                      f"{self.stats['errors']} errors ---\n")
            self.scrape_page(title, download_images=download_images)

        self._save_index()
        print(f"  -> {self.stats['pages']} pages, {self.stats['images']} images so far")

        # ── Phase 3: Spirit sub-pages (one more level deep) ──────────────
        print(f"\n[Phase 3] Deep crawl spirit sub-pages...")
        spirit_sub_pages = []
        for title, entry in self.page_index.items():
            if entry.get("category") == "spirits":
                for link_title in entry.get("links", []):
                    if link_title not in self.visited_pages:
                        spirit_sub_pages.append(link_title)

        spirit_sub_pages = list(dict.fromkeys(spirit_sub_pages))
        if spirit_sub_pages:
            print(f"  Found {len(spirit_sub_pages)} spirit sub-pages")
            for i, title in enumerate(spirit_sub_pages):
                if i > 0 and i % 25 == 0:
                    self._save_index()
                self.scrape_page(title, download_images=download_images)
        else:
            print("  No new spirit sub-pages found")

        self._save_index()

        # ── Phase 4: Follow any remaining power card links ───────────────
        print(f"\n[Phase 4] Checking for additional power card pages...")
        power_pages = []
        for title, entry in self.page_index.items():
            if entry.get("category") == "powers":
                for link_title in entry.get("links", []):
                    if link_title not in self.visited_pages:
                        power_pages.append(link_title)

        power_pages = list(dict.fromkeys(power_pages))
        if power_pages:
            print(f"  Found {len(power_pages)} additional power pages")
            for title in power_pages:
                self.scrape_page(title, download_images=download_images)
        else:
            print("  No new power pages found")

        self._save_index()

        # ── Summary ──────────────────────────────────────────────────────
        categories = {}
        for entry in self.page_index.values():
            cat = entry.get("category", "misc")
            categories[cat] = categories.get(cat, 0) + 1

        print("\n" + "=" * 60)
        print("  SCRAPE COMPLETE")
        print("=" * 60)
        print(f"  Pages scraped:     {self.stats['pages']}")
        print(f"  Images downloaded:  {self.stats['images']}")
        print(f"  Images skipped:    {self.stats['skipped']} (already existed)")
        print(f"  Errors:            {self.stats['errors']}")
        print(f"\n  Pages by category:")
        for cat, count in sorted(categories.items()):
            print(f"    {cat:20s} {count}")
        print(f"\n  Output directory:  {OUTPUT_DIR}")
        print(f"  Index file:        {OUTPUT_DIR / 'index.json'}")
        print("=" * 60)
        print("\nNext step: Run the game project and point Claude at")
        print("webscrape/output/ to read the scraped content.")


def main():
    pages_only = "--pages-only" in sys.argv
    resume = "--resume" in sys.argv

    scraper = WikiScraper()
    scraper.crawl(pages_only=pages_only, resume=resume)


if __name__ == "__main__":
    main()
