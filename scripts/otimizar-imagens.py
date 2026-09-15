#!/usr/bin/env python3
"""
Prepara as fotos dos veículos para a web.

Porque existe: o cliente carrega fotos tiradas com o telemóvel — 3000 px de
largura e 1-4 MB cada. Postas assim numa página, um anúncio com 15 fotos são
30 MB, o site fica lento no telemóvel e o repositório cresce sem controlo
(o GitHub Pages tem ~1 GB de limite prático).

O que faz: para cada foto gera três larguras em WebP (480/960/1600) para o
`srcset`, e um cartão de partilha por anúncio. As fotos grandes nunca chegam
ao site.

DUAS PASTAS, E A RAZÃO É O BACKOFFICE.
    assets/veiculos/  BIBLIOTECA — só o que o cliente carrega, um ficheiro por
                      fotografia. É esta pasta que o Pages CMS mostra.
    assets/fotos/     GERADAS — as três larguras de cada fotografia, no mesmo
                      caminho relativo. É daqui que o site serve.
    assets/fotos/partilha/<slug>.jpg
                      O cartão de partilha, UM POR VIATURA, cortado da capa —
                      a primeira fotografia da lista do anúncio.

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
# O sufixo de largura no fim de um nome, para o tirar: «01-1600» -> «01».
SEM_LARGURA = re.compile(r'-(?:%s)$' % '|'.join(str(w) for w in LARGURAS))

# Cartão de partilha por VIATURA, em JPEG e não em WebP.
#
# Porque existe: o WhatsApp não mostra WebP nas pré-visualizações de link. O
# site serve tudo em WebP, portanto quem partilhasse o anúncio de um carro no
# WhatsApp — que é como este stand partilha — via o link sem imagem nenhuma.
# Esta é a única imagem do site em JPEG, e é só para isso.
#
# POR VIATURA e não por pasta, desde 11/9/2026. Era feito da fotografia primeira
# por ORDEM ALFABÉTICA da pasta, que não é a capa — é só o nome do ficheiro. O
# Polaris ficou com a capa trocada assim que o cliente reordenou as fotografias,
# e os dois carros com as fotos soltas na raiz da biblioteca (Ford Puma e Nissan
# Patrol) partilhavam um cartão só, feito de uma fotografia que não era de
# nenhum deles. Agora sai da PRIMEIRA fotografia da lista do anúncio, que é a
# capa que o cliente escolhe arrastando no backoffice.
#
# 1200x630 é a proporção que o WhatsApp e o Facebook usam na pré-visualização
# grande; a foto é cortada ao centro para lá caber.
OG_TAM = (1200, 630)
CARTOES = DERIVADAS / 'partilha'
# As duas pastas de anúncios. Uma vendida também tem cartão: a sua página passou
# a ser um reencaminhamento, e a razão de esse stub existir são precisamente os
# links já partilhados no WhatsApp, que continuam a ser pré-visualizados.
PASTAS_VIATURAS = (RAIZ / 'data' / 'viaturas', RAIZ / 'data' / 'viaturas' / 'vendidas')


def gravar_og(im: Image.Image, saida: Path) -> Path:
    cartao = ImageOps.fit(im.convert('RGB'), OG_TAM, Image.LANCZOS, centering=(0.5, 0.5))
    cartao.save(saida, 'JPEG', quality=82, optimize=True)
    return saida


def viaturas():
    """(slug, lista de fotografias) de cada anúncio.

    O slug sai do NOME DO FICHEIRO, exactamente como no scripts/gerar.mjs — é o
    endereço da página, e tem de ser o mesmo dos dois lados, senão o gerador
    procura um cartão com outro nome e não o encontra."""
    for pasta in PASTAS_VIATURAS:
        if not pasta.is_dir():
            continue
        for f in sorted(pasta.glob('*.json')):
            slug = re.sub(r'-{2,}', '-', f.stem).strip('-')
            try:
                dados = json.loads(f.read_text(encoding='utf-8'))
            except Exception as e:
                print(f'  !! {f.name}: {e}')
                continue
            fotos = dados.get('fotos')
            yield slug, (fotos if isinstance(fotos, list) else [])


def lista_de_fotografias(fotos, slug):
    """Os caminhos por onde o cartão pode sair, pela ordem do anúncio.

    Com a lista vazia recua-se para a pasta da viatura, por ordem de nome —
    porque é isso que o fotos() do gerar.mjs faz, e o cartão TEM de concordar
    com a capa que a página mostra. Sem este recuo, um anúncio a que o cliente
    tirasse as fotografias do campo (os ficheiros ficam na biblioteca) ficava com
    galeria no site e com o logótipo na partilha do WhatsApp — e isso seria pior
    do que antes desta alteração, porque o cartão por pasta cobria o caso."""
    lista = [c for c in fotos if isinstance(c, str) and c.strip()]
    if lista:
        return lista
    pasta = BIBLIOTECA / slug
    if not pasta.is_dir():
        return []
    return [str((pasta / f.name).relative_to(RAIZ)) for f in sorted(pasta.iterdir()) if f.is_file()]


def candidatos_a_capa(fotos, slug):
    """Os ficheiros por onde a capa pode sair, do melhor para o pior.

    Não é simplesmente a fotos[0]: o gerador deita fora da galeria as
    fotografias que já não existem, e a capa que o visitante vê é a primeira que
    sobra. Se o cartão parasse na fotos[0] ficava a mostrar outra coisa — e,
    pior, ficava PRESO nela: o cliente apaga uma fotografia na biblioteca sem a
    tirar do anúncio (o .pages.yml pede-lhe para não o fazer, e ele já o fez, na
    quinta do Peugeot 2008), a página passa a mostrar a seguinte e a partilha
    continuava, publicação após publicação, com a que ele mandou fora.

    Para cada fotografia dá primeiro a variante de 1600 — que é de onde o cartão
    se corta — e depois o ficheiro da biblioteca, que serve de recuo enquanto as
    variantes não existirem. É o mesmo par, e pela mesma ordem, que o resolver()
    do gerar.mjs usa."""
    for caminho in lista_de_fotografias(fotos, slug):
        p = Path(caminho.lstrip('/'))
        # Um caminho sem pasta resolve-se contra a pasta da viatura, tal como no
        # gerador; e nada fora da biblioteca é candidato a coisa nenhuma — sem
        # esta guarda, um «01.jpg» na lista fazia procurar na RAIZ do
        # repositório e o cartão podia sair de um ficheiro que nada tem a ver.
        pasta = BIBLIOTECA / slug if str(p.parent) == '.' else RAIZ / p.parent
        try:
            relativa = pasta.resolve().relative_to(BIBLIOTECA.resolve())
        except ValueError:
            continue
        base = SEM_LARGURA.sub('', p.stem)
        variante = DERIVADAS / relativa / f'{base}-1600.webp'
        if variante.exists():
            yield variante
        if not pasta.is_dir():
            continue
        # O MESMO teste que está em fotos(), no gerar.mjs: ou o nome bate certo,
        # ou bate sem a extensão. Escrito de outra maneira havia nomes em que os
        # dois lados discordavam, e discordar é o defeito que isto veio fechar.
        for f in sorted(pasta.iterdir()):
            if f.is_file() and (nome_igual(f.name, p.name) or nome_igual(f.stem, base)):
                yield f
                break


def gravar_cartoes() -> int:
    """Um cartão por viatura, em assets/fotos/partilha/<slug>.jpg.

    Refaz-se sempre: é barato, e é assim que o cartão acompanha a capa quando o
    cliente reordena as fotografias. Como o ficheiro sai igual ao anterior
    quando a capa não mudou, a publicação não o dá como alterado.

    Corre DEPOIS da limpeza das órfãs, de propósito: senão, na publicação em que
    o cliente apaga a capa, o cartão ainda era cortado da variante que a limpeza
    está prestes a deitar fora."""
    feitos = 0
    for slug, fotos in viaturas():
        destino = CARTOES / f'{slug}.jpg'
        for origem in candidatos_a_capa(fotos, slug):
            # Tentar ABRIR e não só tentar existir: um ficheiro que o Pillow não
            # abre — uma .heic do iPhone, que este pipeline não sabe ler — é
            # exactamente o caso em que o cartão ficava preso no anterior. Falha
            # uma, passa-se à seguinte; não fica nenhuma a servir de capa, o
            # cartão sai e o gerador usa o logótipo, que é honesto.
            try:
                CARTOES.mkdir(parents=True, exist_ok=True)
                gravar_og(carregar(origem), destino)
                feitos += 1
                break
            except Exception as e:
                print(f'  !! {slug}: não deu para cortar o cartão de {origem.name} ({e})')
        else:
            if destino.exists():
                destino.unlink()
                print(f'  - partilha/{destino.name} (a viatura ficou sem fotografia que sirva de capa)')
    return feitos


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
    slugs = {slug for slug, _ in viaturas()}
    for f in sorted(DERIVADAS.rglob('*')):
        if not f.is_file():
            continue
        if f.parent == CARTOES and f.suffix == '.jpg':
            # Cartão de partilha: vive enquanto houver um anúncio com esse nome.
            # É o que limpa o cartão de uma viatura apagada no backoffice.
            #
            # Só os `.jpg`, e não tudo o que esteja nesta pasta: o nome
            # «partilha» pode calhar a uma pasta que o cliente crie na
            # biblioteca — ele cria-as à mão —, e as variantes dessas
            # fotografias vêm aqui parar. Deixadas cair para o ramo de baixo,
            # são tratadas como variantes e sobrevivem; apanhadas por aqui,
            # desapareciam a cada publicação e o carro dele ficava sem fotos.
            porque = None if f.stem in slugs else 'já não há viatura com este nome'
        elif f.name == 'og.jpg':
            # Os cartões por PASTA, de antes de 11/9/2026. Ninguém os escreve e
            # ninguém os lê; fica esta regra para o caso de voltar um de um ramo
            # antigo — senão ficava no ar um cartão que já ninguém refaz.
            porque = 'cartão por pasta; agora há um por viatura em partilha/'
        else:
            m = VARIANTE.match(f.name)
            if not m:
                continue                      # não foi este script que a escreveu
            pasta_lib = BIBLIOTECA / f.parent.relative_to(DERIVADAS)
            fontes = [p.stem for p in pasta_lib.iterdir() if p.is_file()] if pasta_lib.is_dir() else []
            porque = None if any(nome_igual(s, m.group(1)) for s in fontes) else 'já não está na biblioteca'
        if porque:
            f.unlink()
            apagadas += 1
            print(f'  - {f.relative_to(DERIVADAS)} ({porque})')
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
        if base.endswith(LARGURA_SUFIXO):
            # Uma VARIANTE dentro da biblioteca. Não é fonte de nada — se fosse
            # tratada como tal saía daqui um «01-1600-960.webp» — e não devia
            # sequer lá estar: é isto que punha quatro miniaturas da mesma
            # fotografia no backoffice. A publicação recusa-se a ir para o ar
            # com uma destas na biblioteca; o aviso é para quem correr à mão.
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
    # A limpeza ANTES dos cartões: ver o comentário em gravar_cartoes().
    apagadas = limpar_orfas()
    cartoes = gravar_cartoes()
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
