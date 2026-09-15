#!/usr/bin/env python3
"""
Bateria do cartão de partilha: o que o WhatsApp mostra tem de ser a capa.

Porque existe: a 11/9/2026 o cartão passou a ser um por viatura, cortado da
PRIMEIRA fotografia da lista do anúncio. A regra é simples de dizer e partiu-se
duas vezes no mesmo dia, das duas por a escolha do cartão discordar da escolha
que o gerador faz para a galeria:

  - o cartão ficava PRESO na fotografia que o cliente apagava na biblioteca (a
    página passava a mostrar a seguinte e a partilha continuava com a que ele
    mandou fora, publicação após publicação);
  - e era APAGADO num anúncio com a lista de fotografias vazia, onde o gerador
    recua para a pasta da viatura e mostra a galeria tona — o carro ficava com
    fotografias no site e sem imagem nenhuma na partilha.

Nenhuma das duas dava erro em lado nenhum. É por isso que isto é uma bateria e
não um comentário: monta uma árvore de teste com fotografias de cores sólidas —
que servem de oráculo, porque a cor diz qual é a fotografia —, corre os scripts
a sério, e compara a cor do cartão com a cor da fotografia que a página mostra.

Correr:  python3 scripts/testar-cartoes.py
Corre na publicação, a seguir a preparar as fotografias.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit('Falta o Pillow:  pip3 install Pillow')

RAIZ = Path(__file__).resolve().parent.parent
# Cores bem separadas: a diferença entre duas quaisquer é muito maior do que o
# que a compressão mexe, portanto não há como confundir uma fotografia com outra.
CORES = {'A': (204, 30, 29), 'B': (30, 179, 61), 'C': (28, 60, 204), 'D': (222, 180, 20)}
SLUG = 'carro-teste'

passaram = falharam = 0
arvore = Path(tempfile.mkdtemp(prefix='cartoes-'))


def montar(pasta_fotos='carro', fotos=None):
    """Uma árvore mínima mas verdadeira: os scripts são os do repositório."""
    if (arvore / 'assets').exists():
        shutil.rmtree(arvore / 'assets')
    for d in ('scripts', f'assets/veiculos/{pasta_fotos}', 'data/viaturas/vendidas'):
        (arvore / d).mkdir(parents=True, exist_ok=True)
    for f in ('otimizar-imagens.py', 'gerar.mjs'):
        shutil.copy(RAIZ / 'scripts' / f, arvore / 'scripts' / f)
    shutil.copy(RAIZ / 'data/definicoes.json', arvore / 'data/definicoes.json')
    for pasta in ('conteudo', 'assets/css', 'assets/js', 'assets/img'):
        shutil.copytree(RAIZ / pasta, arvore / pasta, dirs_exist_ok=True)
    for nome, cor in CORES.items():
        Image.new('RGB', (2000, 1500), cor).save(arvore / f'assets/veiculos/{pasta_fotos}/{nome}.jpg')
    (arvore / f'data/viaturas/{SLUG}.json').write_text(json.dumps({
        'marca': 'Teste', 'modelo': 'X', 'publicado': True, 'estado': 'disponivel',
        'fotos': [f'assets/veiculos/{pasta_fotos}/{n}.jpg' for n in CORES] if fotos is None else fotos,
    }, ensure_ascii=False, indent=2), encoding='utf-8')


def publicar():
    subprocess.run([sys.executable, 'scripts/otimizar-imagens.py', '--varrer'],
                   cwd=arvore, capture_output=True)
    subprocess.run(['node', 'scripts/gerar.mjs'], cwd=arvore, capture_output=True,
                   env={**os.environ, 'BASE': '', 'SITE': 'http://teste'})


def cor_de(caminho):
    if not Path(caminho).exists():
        return None
    try:
        return Image.open(caminho).convert('RGB').resize((1, 1)).getpixel((0, 0))
    except Exception:
        return 'ILEGIVEL'          # existe mas nem o Pillow lhe pega


def pagina():
    return (arvore / f'_site/viaturas/{SLUG}/index.html').read_text(encoding='utf-8')


def cor_da_capa():
    """A fotografia grande da ficha — a capa que o visitante vê."""
    m = re.search(r'id="foto-principal" src="([^"]+)"', pagina())
    return cor_de(arvore / '_site' / m.group(1).lstrip('/')) if m else None


def cor_do_cartao():
    m = re.search(r'property="og:image" content="([^"]+)"', pagina())
    if not m:
        return 'SEM'
    return 'LOGOTIPO' if '/partilha/' not in m.group(1) else cor_de(arvore / f'_site/assets/fotos/partilha/{SLUG}.jpg')


def igual(a, b):
    """Iguais a menos da compressão: o WebP e o JPEG mexem um ou dois níveis."""
    if isinstance(a, str) or isinstance(b, str) or a is None or b is None:
        return a == b
    return all(abs(x - y) <= 4 for x, y in zip(a, b))


def verificar(titulo, esperado):
    global passaram, falharam
    publicar()
    capa, cartao = cor_da_capa(), cor_do_cartao()
    if esperado == 'LOGOTIPO':
        bate = cartao == 'LOGOTIPO'
    elif esperado == 'SALTA':
        # A capa é um ficheiro que o browser também não mostra; o cartão não pode
        # ficar preso no anterior — tem de descer para a fotografia seguinte.
        bate = igual(cartao, CORES['A']) and capa == 'ILEGIVEL'
    else:
        bate = igual(cartao, esperado) and igual(capa, esperado)
    print(('  ok   ' if bate else '  FALHA') + f' {titulo:52} capa={capa} cartão={cartao}')
    passaram += bate
    falharam += not bate


def mexer_na_lista(novas):
    f = arvore / f'data/viaturas/{SLUG}.json'
    d = json.loads(f.read_text(encoding='utf-8'))
    d['fotos'] = novas(d['fotos'])
    f.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding='utf-8')


print('cartão de partilha — o que se partilha tem de ser o que se vê\n')

print('reordenar no backoffice')
montar()
verificar('a capa é a primeira da lista', CORES['A'])
mexer_na_lista(lambda f: f[1:] + f[:1])
verificar('arrastou a segunda para primeiro', CORES['B'])

print('\napaga a capa na biblioteca e deixa-a na lista (o que já aconteceu)')
montar()
publicar()
os.remove(arvore / 'assets/veiculos/carro/A.jpg')
verificar('a publicação seguinte desce para a seguinte', CORES['B'])
verificar('e não fica presa na que foi apagada', CORES['B'])

print('\ntira as fotografias da lista, os ficheiros ficam na biblioteca')
montar(pasta_fotos=SLUG, fotos=[])
verificar('o gerador recua para a pasta, o cartão também', CORES['A'])

print('\numa fotografia que o Pillow não abre (uma .heic do iPhone)')
montar()
(arvore / 'assets/veiculos/carro/IMG.heic').write_bytes(b'\x00\x00\x00\x18ftypheic' + b'\x00' * 200)
mexer_na_lista(lambda f: ['assets/veiculos/carro/IMG.heic'] + f)
verificar('salta para a seguinte em vez de ficar presa', 'SALTA')

print('\no anúncio fica sem fotografia nenhuma')
montar()
publicar()
for nome in CORES:
    os.remove(arvore / f'assets/veiculos/carro/{nome}.jpg')
verificar('o cartão sai e a partilha usa o logótipo', 'LOGOTIPO')

print('\num caminho sem pasta na lista')
montar(pasta_fotos=SLUG, fotos=['A.jpg'])
Image.new('RGB', (2000, 1500), (255, 0, 255)).save(arvore / 'A.png')   # intruso na raiz
verificar('resolve na pasta da viatura, não na raiz', CORES['A'])

print('\numa pasta da biblioteca chamada «partilha», que colide com os cartões')
montar(pasta_fotos='partilha', fotos=[f'assets/veiculos/partilha/{n}.jpg' for n in ('A', 'B')])
publicar()
publicar()
sobrou = sorted(p.name for p in (arvore / 'assets/fotos/partilha').iterdir())
bate = 'A-1600.webp' in sobrou and f'{SLUG}.jpg' in sobrou
print(('  ok   ' if bate else '  FALHA') + f' {"as variantes sobrevivem à limpeza":52} {sobrou[:3]}')
passaram += bate
falharam += not bate
verificar('e o cartão continua a ser a capa', CORES['A'])

shutil.rmtree(arvore, ignore_errors=True)
print(f'\n{passaram} passaram · {falharam} falharam')
sys.exit(1 if falharam else 0)
