#!/usr/bin/env python3
"""
Prepara as fotos dos veículos para a web.

Porque existe: o cliente carrega fotos tiradas com o telemóvel — 3000 px de
largura e 1-4 MB cada. Postas assim numa página, um anúncio com 15 fotos são
30 MB, o site fica lento no telemóvel e o repositório cresce sem controlo
(o GitHub Pages tem ~1 GB de limite prático).

O que faz: para cada foto gera três larguras em WebP (480/960/1600) para o
`srcset`, mais uma miniatura quadrada para os cartões da listagem. As fotos
grandes nunca chegam ao site.

Correr:  python3 scripts/otimizar-imagens.py
         python3 scripts/otimizar-imagens.py --so-novas    (salta o que já existe)
"""
import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit('Falta o Pillow:  pip3 install Pillow')

RAIZ = Path(__file__).resolve().parent.parent
MAPA = RAIZ / 'scripts' / 'mapa-fotos.json'
DESTINO = RAIZ / 'assets' / 'veiculos'

LARGURAS = [480, 960, 1600]
QUALIDADE = 76
# Os cartões da listagem usam as mesmas variantes 480/960 com `srcset` — não
# há ficheiro separado. Menos um formato para gerar, guardar e manter em dia.


def carregar(caminho: Path) -> Image.Image:
    im = Image.open(caminho)
    # exif_transpose: sem isto, fotos de telemóvel aparecem deitadas.
    im = ImageOps.exif_transpose(im)
    return im.convert('RGB')


def gravar_larguras(im: Image.Image, base: Path, so_novas: bool) -> list:
    feitos = []
    for w in LARGURAS:
        saida = base.with_name(f'{base.stem}-{w}.webp')
        if so_novas and saida.exists():
            feitos.append(saida)
            continue
        if im.width <= w and w != LARGURAS[0]:
            # não ampliar: uma foto de 700 px não ganha nada em 1600
            escala = im.copy()
        else:
            escala = im.copy()
            escala.thumbnail((w, w * 10), Image.LANCZOS)
        escala.save(saida, 'WEBP', quality=QUALIDADE, method=6)
        feitos.append(saida)
    return feitos




EXTENSOES = {'.jpg', '.jpeg', '.png', '.webp', '.heic'}
LARGURA_SUFIXO = tuple(f'-{w}' for w in LARGURAS)

# Cartão de partilha por viatura, em JPEG e não em WebP.
#
# Porque existe: o WhatsApp não mostra WebP nas pré-visualizações de link. O
# site serve tudo em WebP, portanto quem partilhasse o anúncio de um carro no
# WhatsApp — que é como este stand partilha — via o link sem imagem nenhuma.
# Esta é a única imagem do site em JPEG, e é só para isso.
#
# 1200x630 é a proporção que o WhatsApp e o Facebook usam na pré-visualização
# grande; a foto é cortada ao centro para lá caber.
OG_TAM = (1200, 630)


def gravar_og(im: Image.Image, pasta: Path) -> Path:
    saida = pasta / 'og.jpg'
    cartao = ImageOps.fit(im.convert('RGB'), OG_TAM, Image.LANCZOS, centering=(0.5, 0.5))
    cartao.save(saida, 'JPEG', quality=82, optimize=True)
    return saida


def varrer():
    """Modo usado pela Action: percorre assets/veiculos/ e gera as variantes
    que faltarem. É o que trata das fotos que o cliente carrega pelo backoffice
    — o Pages CMS grava o ficheiro tal como saiu do telemóvel, sem tocar nele."""
    if not DESTINO.exists():
        print('sem assets/veiculos — nada a fazer')
        return
    novas = existentes = 0
    # `rglob` e não `iterdir()` sobre as subpastas: o botão de carregar do
    # backoffice grava na raiz de assets/veiculos/ a não ser que o cliente crie
    # a pasta à mão. Enquanto isto só entrava nas subpastas, essas fotos ficavam
    # sem variantes e o gerador servia o ficheiro do telemóvel em bruto — vários
    # MB e 3000 px — a todos os visitantes.
    for f in sorted(DESTINO.rglob('*')):
        if not f.is_file() or f.suffix.lower() not in EXTENSOES:
            continue
        pasta, base = f.parent, f.stem
        if base.endswith(LARGURA_SUFIXO):
            continue                          # já é uma variante
        if base == 'og':
            continue                          # é o cartão de partilha, não uma foto
        falta = [w for w in LARGURAS if not (pasta / f'{base}-{w}.webp').exists()]
        if not falta:
            existentes += 1
            continue
        try:
            im = carregar(f)
        except Exception as e:
            print(f'  !! {f.name}: {e}')
            continue
        gravar_larguras(im, pasta / f'{base}.webp', so_novas=True)
        novas += 1
        print(f'  + {f.relative_to(DESTINO).with_suffix("")}  ({im.width}x{im.height})')
    # Um cartão de partilha por viatura, feito da PRIMEIRA fotografia — a mesma
    # que o site mostra em primeiro lugar. Refaz-se sempre: é barato e evita
    # ficar com o carro antigo quando o cliente troca a foto de capa.
    cartoes = 0
    for pasta in sorted({p.parent for p in DESTINO.rglob('*-1600.webp')}):
        primeira = sorted(pasta.glob('*-1600.webp'))
        if not primeira:
            continue
        try:
            gravar_og(Image.open(primeira[0]), pasta)
            cartoes += 1
        except Exception as e:
            print(f'  !! cartão de partilha de {pasta.name}: {e}')
    print(f'\nvariantes novas: {novas} · já existentes: {existentes} · cartões de partilha: {cartoes}')


def main():
    so_novas = '--so-novas' in sys.argv
    if '--varrer' in sys.argv:
        varrer()
        return
    if not MAPA.exists():
        sys.exit(f'Falta o mapa de fotos: {MAPA}')
    mapa = json.loads(MAPA.read_text(encoding='utf-8'))

    total_entrada = total_saida = 0
    for slug, fotos in mapa.items():
        pasta = DESTINO / slug
        pasta.mkdir(parents=True, exist_ok=True)
        for i, origem in enumerate(fotos, start=1):
            p = RAIZ / origem
            if not p.exists():
                print(f'  !! não encontrei {origem}')
                continue
            total_entrada += p.stat().st_size
            im = carregar(p)
            base = pasta / f'{i:02d}.webp'
            saidas = gravar_larguras(im, base, so_novas)
            total_saida += sum(s.stat().st_size for s in saidas)
        print(f'  {slug:22s} {len(fotos):2d} fotos')

    print(f'\nentrada {total_entrada/1e6:.1f} MB  ->  saída {total_saida/1e6:.1f} MB'
          f'  ({100*total_saida/max(total_entrada,1):.0f}%)')


if __name__ == '__main__':
    main()
