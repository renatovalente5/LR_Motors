#!/usr/bin/env python3
"""
Prepara as fotos dos veículos para a web.

Porque existe: o cliente carrega fotos tiradas com o telemóvel — 3000 px de
largura e 1-4 MB cada. Postas assim numa página, um anúncio com 15 fotos são
30 MB, o site fica lento no telemóvel e o repositório cresce sem controlo
(o GitHub Pages tem ~1 GB de limite prático).

O que faz: para cada foto gera três larguras em WebP (480/960/1600) para o
`srcset`, mais o cartão de partilha. As fotos grandes nunca chegam ao site.

DUAS PASTAS, E A RAZÃO É O BACKOFFICE.
    assets/veiculos/  BIBLIOTECA — só o que o cliente carrega, um ficheiro por
                      fotografia. É esta pasta que o Pages CMS mostra.
    assets/fotos/     GERADAS — as três larguras e o cartão de partilha, no
                      mesmo caminho relativo. É daqui que o site serve.

Enquanto as geradas ficaram ao lado dos originais, o cliente via QUATRO
miniaturas da mesma fotografia na biblioteca do backoffice e escolhia à sorte:
a lista de um anúncio ficou com umas fotos em «-480» (a versão de telemóvel) e
outras no original, e houve uma fotografia escolhida duas vezes, que saía
repetida na galeria. Queixou-se a 11/9/2026. Separadas, a biblioteca mostra
exactamente uma miniatura por fotografia e não há nada para escolher mal.

Correr:  python3 scripts/otimizar-imagens.py --varrer   (o que a publicação faz:
         gera o que faltar e apaga o que já não tem fotografia na biblioteca)
         python3 scripts/otimizar-imagens.py            (importa o mapa-fotos.json,
         usado uma vez no arranque; ver importar())

   CORRER ISTO EM LOCAL, NUM MAC, É MÁ IDEIA. As variantes ficam com o nome que
   o sistema de ficheiros dá ao original, e o macOS guarda os acentos em forma
   decomposta («Co» + acento) enquanto o git desta máquina os grava precompostos
   («Ó»). Uma fotografia chamada «Cópia de Stock.jpeg» acabou comitada DUAS
   vezes, com as três variantes de cada — iguais no ecrã, diferentes em bytes,
   e o CI a regenerar tudo na mesma porque não reconhecia as que lá estavam.
   Desde 1/9/2026 a publicação guarda as variantes que gera, e corre em Linux,
   que não normaliza nada: deixe-a fazer o trabalho.
"""
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit('Falta o Pillow:  pip3 install Pillow')

RAIZ = Path(__file__).resolve().parent.parent
MAPA = RAIZ / 'scripts' / 'mapa-fotos.json'
# A biblioteca do backoffice (entra), e as geradas (sai). Ver o cabeçalho.
BIBLIOTECA = RAIZ / 'assets' / 'veiculos'
DERIVADAS = RAIZ / 'assets' / 'fotos'

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
# O que este script escreve em assets/fotos/, e só isso, é o que ele pode apagar.
VARIANTE = re.compile(r'^(.*)-(?:%s)\.webp$' % '|'.join(str(w) for w in LARGURAS))

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


def nome_igual(a: str, b: str) -> bool:
    """Compara nomes de ficheiro sem cair na armadilha dos acentos.

    O macOS grava «Cópia» decomposto («o» + acento) e o git desta máquina
    precomposto; são a MESMA fotografia com bytes diferentes no nome. Isto só
    importa aqui porque a limpeza de órfãs apaga ficheiros — sem normalizar,
    correr isto num Mac deitava fora as variantes boas de qualquer fotografia
    com acento no nome."""
    return unicodedata.normalize('NFC', a) == unicodedata.normalize('NFC', b)


def limpar_orfas() -> int:
    """Apaga de assets/fotos o que já não tem fotografia na biblioteca.

    Sem isto, cada fotografia que o cliente apagasse no backoffice deixava cá
    três variantes e o repositório só crescia. Só se mexe no que ESTE script
    escreve — variantes e cartões de partilha; um ficheiro com outro nome fica
    onde está."""
    if not DERIVADAS.exists():
        return 0
    apagadas = 0
    for f in sorted(DERIVADAS.rglob('*')):
        if not f.is_file():
            continue
        pasta_lib = BIBLIOTECA / f.parent.relative_to(DERIVADAS)
        fontes = [p.stem for p in pasta_lib.iterdir() if p.is_file()] if pasta_lib.is_dir() else []
        if f.name == 'og.jpg':
            vivo = bool(fontes)               # o cartão vive enquanto a pasta tiver fotos
        else:
            m = VARIANTE.match(f.name)
            if not m:
                continue                      # não foi este script que a escreveu
            vivo = any(nome_igual(s, m.group(1)) for s in fontes)
        if not vivo:
            f.unlink()
            apagadas += 1
            print(f'  - {f.relative_to(DERIVADAS)} (já não está na biblioteca)')
    for d in sorted(DERIVADAS.rglob('*'), key=lambda p: len(p.parts), reverse=True):
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
    return apagadas


def varrer():
    """Modo usado pela Action: percorre a biblioteca e gera para assets/fotos/
    as variantes que faltarem. É o que trata das fotos que o cliente carrega
    pelo backoffice — o Pages CMS grava o ficheiro tal como saiu do telemóvel,
    sem lhe tocar."""
    if not BIBLIOTECA.exists():
        print('sem assets/veiculos — nada a fazer')
        return
    novas = existentes = 0
    # `rglob` e não `iterdir()` sobre as subpastas: o botão de carregar do
    # backoffice grava na raiz de assets/veiculos/ a não ser que o cliente crie
    # a pasta à mão. Enquanto isto só entrava nas subpastas, essas fotos ficavam
    # sem variantes e o gerador servia o ficheiro do telemóvel em bruto — vários
    # MB e 3000 px — a todos os visitantes.
    for f in sorted(BIBLIOTECA.rglob('*')):
        if not f.is_file() or f.suffix.lower() not in EXTENSOES:
            continue
        base = f.stem
        if base == 'og' or base.endswith(LARGURA_SUFIXO):
            # Um ficheiro GERADO dentro da biblioteca. Não é fonte de nada — se
            # fosse tratado como tal saía daqui um «01-1600-960.webp» — e não
            # devia sequer lá estar: é isto que punha quatro miniaturas da mesma
            # fotografia no backoffice. A publicação recusa-se a ir para o ar
            # com um destes na biblioteca; o aviso é para quem correr à mão.
            print(f'  !! {f.relative_to(BIBLIOTECA)}: ficheiro gerado dentro da biblioteca — ignorado')
            continue
        pasta = DERIVADAS / f.parent.relative_to(BIBLIOTECA)
        falta = [w for w in LARGURAS if not (pasta / f'{base}-{w}.webp').exists()]
        if not falta:
            existentes += 1
            continue
        try:
            im = carregar(f)
        except Exception as e:
            print(f'  !! {f.name}: {e}')
            continue
        pasta.mkdir(parents=True, exist_ok=True)
        gravar_larguras(im, pasta / f'{base}.webp', so_novas=True)
        novas += 1
        print(f'  + {f.relative_to(BIBLIOTECA).with_suffix("")}  ({im.width}x{im.height})')
    # Um cartão de partilha por pasta, feito da primeira fotografia por ordem de
    # nome. Refaz-se sempre: é barato e evita ficar com o carro antigo quando o
    # cliente troca a foto de capa.
    cartoes = 0
    for pasta in sorted({p.parent for p in DERIVADAS.rglob('*-1600.webp')}):
        primeira = sorted(pasta.glob('*-1600.webp'))
        if not primeira:
            continue
        try:
            gravar_og(Image.open(primeira[0]), pasta)
            cartoes += 1
        except Exception as e:
            print(f'  !! cartão de partilha de {pasta.name}: {e}')
    apagadas = limpar_orfas()
    print(f'\nvariantes novas: {novas} · já existentes: {existentes} · '
          f'cartões de partilha: {cartoes} · órfãs apagadas: {apagadas}')


def importar():
    """Modo de arranque, usado uma vez em Agosto de 2026: pega nas fotografias
    listadas em scripts/mapa-fotos.json — as que foram buscadas ao anúncio
    antigo — e põe-nas na biblioteca com nomes numerados. As variantes ficam por
    conta do --varrer, que corre logo a seguir.

    Foi este modo que escreveu as fotos «01» a «05» dos primeiros anúncios. Na
    altura gravava só as variantes e nunca o ficheiro de origem, e por isso
    esses carros ficaram sem nada para mostrar na biblioteca do backoffice — a
    separação de 11/9/2026 teve de promover a variante de 1600 a original."""
    if not MAPA.exists():
        sys.exit(f'Falta o mapa de fotos: {MAPA}')
    mapa = json.loads(MAPA.read_text(encoding='utf-8'))
    copiadas = 0
    for slug, fotos in mapa.items():
        pasta = BIBLIOTECA / slug
        pasta.mkdir(parents=True, exist_ok=True)
        for i, origem in enumerate(fotos, start=1):
            p = RAIZ / origem
            if not p.exists():
                print(f'  !! não encontrei {origem}')
                continue
            destino = pasta / f'{i:02d}{p.suffix.lower()}'
            if not destino.exists():
                shutil.copy2(p, destino)
                copiadas += 1
        print(f'  {slug:22s} {len(fotos):2d} fotos')
    print(f'\n{copiadas} fotografias postas na biblioteca; a gerar as variantes…\n')
    varrer()


def main():
    if '--varrer' in sys.argv:
        varrer()
        return
    importar()


if __name__ == '__main__':
    main()
