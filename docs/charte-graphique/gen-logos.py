"""Génère les variantes SVG du logo Nestr (logotype « nestr. » et monogramme « (n.)™ »)."""
import os
import sys

FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&amp;display=swap');"
FONT = "'Bricolage Grotesque', 'Arial Black', Arial, sans-serif"
INK, SURFACE, PINE, PINE_DEEP, LINGON = "#14231F", "#FAFAF6", "#1F4D3F", "#14332A", "#C9432F"

# nom de fichier : (fond, couleur du texte, couleur du « n » et du point)
VARIANTS = {
    "principal": (SURFACE, INK, LINGON),
    "principal-fond-sombre": (PINE_DEEP, SURFACE, LINGON),
    "pin": (SURFACE, INK, PINE),
    "mono-encre": (SURFACE, INK, INK),
    "mono-blanc": (PINE_DEEP, SURFACE, SURFACE),
}


def svg(width: int, background: str, body: str) -> str:
    """Enveloppe SVG commune : fond plein, police chargée depuis Google Fonts."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 200" width="{width}" height="200">'
            f'<style>{FONT_IMPORT} text {{ font-family: {FONT}; font-weight: 800; }}</style>'
            f'<rect width="100%" height="100%" fill="{background}"/>{body}</svg>\n')


def logotype(colors: tuple) -> str:
    """« nestr. » : le n et le point en couleur d'accent."""
    background, text, accent = colors
    body = (f'<text x="50%" y="134" font-size="120" text-anchor="middle" fill="{text}">'
            f'<tspan fill="{accent}">n</tspan>estr<tspan fill="{accent}">.</tspan></text>')
    return svg(520, background, body)


def monogram(colors: tuple) -> str:
    """« (n.)™ » : version courte pour les coins de page et les icônes."""
    background, text, accent = colors
    body = (f'<text x="50%" y="134" font-size="120" text-anchor="middle" fill="{text}">'
            f'(<tspan fill="{accent}">n.</tspan>)<tspan font-size="36" dy="-62">™</tspan></text>')
    return svg(300, background, body)


def main() -> None:
    outDir = sys.argv[1]
    for name, colors in VARIANTS.items():
        for prefix, render in (("logo", logotype), ("monogramme", monogram)):
            with open(os.path.join(outDir, f"{prefix}-{name}.svg"), "w", encoding="utf-8") as file:
                file.write(render(colors))
    print(len(os.listdir(outDir)), "fichiers")


if __name__ == "__main__":
    main()
