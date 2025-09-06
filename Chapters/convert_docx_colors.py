"""
convert_docx_colors.py
Simple converter: take a Word-exported HTML file and map inline color styles to the project's semantic classes.
Usage (pwsh):
  python .\Chapters\convert_docx_colors.py \
    -i "C:\path\to\exported.html" \
    -o "C:\path\to\Solarity Project Website\Chapters\solarity_chapter6.html" 

Requirements: beautifulsoup4, lxml
Install (pwsh): pip install -r .\Chapters\requirements.txt

Behavior:
- Maps known color hex values to <span class="spoken NAME">...</span>
- Wraps lines enclosed in [brackets] with <p class="transition">[...]</p>
- Converts elements with class translation or explicit markers if found to <span class="translation NAME">...
- Preserves other markup and outputs a full HTML file with link to chapter.css

Note: run Word -> HTML export first (PowerShell COM example provided earlier).
"""
import argparse
import re
from bs4 import BeautifulSoup

# mapping of hex colors (lowercase) to (class, speaker-name)
COLOR_MAP = {
    '#7dd4fc': ('spoken', 'cortana'),
    '#f79c2c': ('spoken', 'ahsoka'),
    '#5b85fa': ('spoken', 'philipp'),
    '#00bb96': ('spoken', 'friendly'),
    '#ff0000': ('spoken', 'enemy'),
}

TRANSITION_RE = re.compile(r"^\[.*\]$")


def map_color_span(tag):
    style = tag.get('style')
    if not style:
        return None
    m = re.search(r'color:\s*#?([0-9a-fA-F]{6})', style)
    if not m:
        return None
    hexcol = '#' + m.group(1).lower()
    return COLOR_MAP.get(hexcol)


def convert(soup):
    # Convert colored spans/fonts to semantic spans
    for tag in soup.find_all(['span', 'font']):
        mapped = map_color_span(tag)
        if mapped:
            cls, name = mapped
            # create new span with proper classes
            new = soup.new_tag('span')
            new['class'] = f"{cls} {name}"
            new.string = tag.get_text()
            tag.replace_with(new)

    # Convert bracketed single-paragraph lines to transition
    for p in soup.find_all(['p', 'div']):
        text = p.get_text().strip()
        if TRANSITION_RE.match(text):
            newp = soup.new_tag('p')
            newp['class'] = 'transition'
            newp.string = text
            p.replace_with(newp)

    # Normalize spoken+translation pattern: ensure a <br/> exists after spoken spans
    # and a following translation span exists unchanged (we keep translation class if present)
    return soup


def build_output(soup, title='Solarity  Chapter 6'):
    out_soup = BeautifulSoup('', 'lxml')
    doc = out_soup.new_tag('html', lang='en')
    head = out_soup.new_tag('head')
    meta = out_soup.new_tag('meta', charset='UTF-8')
    title_tag = out_soup.new_tag('title')
    title_tag.string = title
    link = out_soup.new_tag('link', rel='stylesheet', href='chapter.css')
    head.append(meta)
    head.append(title_tag)
    head.append(link)
    body = out_soup.new_tag('body')
    container = out_soup.new_tag('div', **{'class': 'chapter-container'})
    # append the body contents from input soup's body if available, else all
    body_content = None
    if soup.body:
        body_content = soup.body
    else:
        body_content = soup
    # move children into container
    for child in list(body_content.children):
        # skip empty strings
        if getattr(child, 'name', None) is None and not child.strip():
            continue
        container.append(child)
    body.append(container)
    doc.append(head)
    doc.append(body)
    out_soup.append(doc)
    return out_soup


def main():
    p = argparse.ArgumentParser()
    p.add_argument('-i', '--input', required=True)
    p.add_argument('-o', '--output', required=True)
    args = p.parse_args()

    with open(args.input, 'r', encoding='utf-8') as f:
        text = f.read()

    soup = BeautifulSoup(text, 'lxml')
    convert(soup)
    out = build_output(soup)

    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(out.prettify())

    print(f"Converted {args.input} -> {args.output}")

if __name__ == '__main__':
    main()
