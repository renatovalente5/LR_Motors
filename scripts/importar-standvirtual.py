#!/usr/bin/env python3
"""
Importa os anúncios reais do Standvirtual para os dados do site.

Porque existe: o stock do site eram catorze viaturas de exemplo, inventadas no
arranque para haver o que mostrar. Os anúncios a sério vivem no Standvirtual, e
é de lá que vêm — não copiados à mão, que com onze carros e sessenta atributos
cada um seria erro garantido.

De onde lê: a página do stand guardada em disco. O Standvirtual é uma aplicação
Next.js e traz o inventário todo num bloco JSON dentro do HTML (`__NEXT_DATA__`
→ `urqlState` → `publishedAds`). É a mesma fonte que a página usa para se
desenhar, portanto está tão certa quanto o site deles.

As FOTOGRAFIAS não vêm da pasta que o browser guardou: lá os ficheiros chamam-se
`image`, `image(1)`, `image(2)`… e não há forma fiável de saber a que carro
pertence cada um. Vêm do CDN, pelas URLs que estão no JSON, que além de
inequívocas dão 1920×1440 em vez dos 600×450 que o browser guardou.

Correr:  python3 scripts/importar-standvirtual.py           (mostra o que faria)
         python3 scripts/importar-standvirtual.py --gravar  (grava a sério)
"""
import json
import re
import shutil
import sys
import unicodedata
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FONTE = RAIZ / 'Standvirtual - Comprar e vender carros usados.html'
DADOS = RAIZ / 'data' / 'viaturas'
FOTOS = RAIZ / 'assets' / 'veiculos'
TAMANHO = ';s=1920x1440'          # o CDN aceita sufixo de tamanho; o nosso máximo é 1600

GRAVAR = '--gravar' in sys.argv


def texto_simples(s: str) -> str:
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def ler_anuncios():
    html = FONTE.read_text(encoding='utf-8', errors='ignore')
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>', html, re.S)
    dados = json.loads(m.group(1))
    for bloco in dados['props']['pageProps']['urqlState'].values():
        d = json.loads(bloco['data'])
        if 'publishedAds' in d:
            return d['publishedAds']['ads'], d['publishedAds']['total']
    raise SystemExit('não encontrei os anúncios no HTML')


# Índice 1 = Janeiro. O site guarda o nome do mês, não o número: é o que se lê
# na ficha e o que o backoffice mostra na lista.
MESES_PT = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

# Etiquetas do Standvirtual → o que se escreve no site. Só o que o comprador
# reconhece; o resto dos sessenta atributos fica de fora.
EQUIPAMENTO = {
    'air_conditioning_type': None,            # usa o valueLabel: «AC automático»
    'cruisecontrol_type': None,
    'alloy_wheels_type': None,
    'upholstery_type': None,
    'android_auto': 'Android Auto',
    'apple_carplay': 'Apple CarPlay',
    'bluetooth_interface': 'Bluetooth',
    'touchscreen_monitor': 'Ecrã táctil',
    'navigation_system': 'Navegação GPS',
    'park_distance_control_rear': 'Sensores de estacionamento traseiros',
    'park_distance_control_front': 'Sensores de estacionamento dianteiros',
    'rear_view_camera': 'Câmara de marcha-atrás',
    'keyless_go': 'Arranque sem chave',
    'keyless_entry': 'Entrada sem chave',
    'led_headlights': 'Faróis LED',
    'led_daytime_running_lights': 'Luzes diurnas LED',
    'xenon_headlights': 'Faróis de xénon',
    'panorama_roof': 'Tecto panorâmico',
    'sunroof': 'Tecto de abrir',
    'seat_heating': 'Bancos aquecidos',
    'electrically_adjustable_seats': 'Bancos eléctricos',
    'lane_departure_warning': 'Aviso de saída de faixa',
    'blind_spot_sensor': 'Aviso de ângulo morto',
    'isofix': 'Fixação Isofix',
    'child_seat_fixation': 'Fixação para cadeira de criança',
    'multi_functional_steering_wheel': 'Volante multifunções',
    'startstop_system': 'Sistema Start/Stop',
    'complete_review_book': 'Livro de revisões completo',
    'second_key': 'Segunda chave',
    'non_smoking': 'Nunca foi fumado',
}


def converter(a, ordem):
    at = {x['key']: x for x in a['attributes']}
    v = lambda k: (at.get(k) or {}).get('value')
    r = lambda k: (at.get(k) or {}).get('valueLabel')

    marca = r('make') or ''
    modelo = r('model') or ''
    versao = r('version_label') or ''
    slug = texto_simples(f'{marca} {modelo} {versao}')[:70].strip('-')

    ano = int(v('first_registration_year')) if v('first_registration_year') else None
    mes = int(v('first_registration_month')) if v('first_registration_month') else None

    # Carroçaria: o Standvirtual escreve «SUV / TT», que numa ficha fica estranho.
    carroçaria = (r('body_type') or '').split(' / ')[0].strip()

    # Combustível traduzido para a lista EXACTA do backoffice. Não é
    # preciosismo: o Pages CMS, ao gravar, não reconhece um valor que não esteja
    # nas opções e deixa o campo vazio, sem avisar. O Standvirtual escreve
    # «Híbrido Plug-In» e a lista do site tem «Híbrido Plug-in» — uma maiúscula
    # bastava para o combustível de duas viaturas desaparecer.
    COMBUSTIVEIS = {
        'Gasolina': 'Gasolina', 'Diesel': 'Diesel', 'Elétrico': 'Elétrico',
        'Híbrido': 'Híbrido', 'Híbrido Plug-In': 'Híbrido Plug-in', 'GPL': 'GPL',
    }
    bruto = r('fuel_type') or ''
    comb = COMBUSTIVEIS.get(bruto, bruto)

    # Garantia: o valor vem em meses. O cliente pediu para NÃO anunciar três
    # anos, por isso 36 fica como «Garantia incluída» — e fica assinalado no
    # relatório, porque é o próprio anúncio do Standvirtual que diz 36.
    meses = v('vendors_warranty_valid_until_date')
    if meses and str(meses).isdigit() and int(meses) < 36:
        garantia = f'{meses} meses'
    else:
        garantia = 'Garantia incluída'

    # Equipamento a partir do que está mesmo marcado no anúncio.
    equipamento = []
    for chave, rotulo in EQUIPAMENTO.items():
        x = at.get(chave)
        if not x:
            continue
        if rotulo is None:
            if x.get('valueLabel'):
                equipamento.append(x['valueLabel'])
        elif str(x.get('value')) == '1':
            equipamento.append(rotulo)

    # Descrição composta a partir dos dados — não inventada. Sem adjectivos que
    # não se possam provar.
    partes = [f'{marca} {modelo} {versao}'.strip()]
    if ano:
        partes.append(f'de {mes:02d}/{ano}' if mes else f'de {ano}')
    if v('mileage'):
        partes.append(f"com {int(v('mileage')):,}".replace(',', ' ') + ' km')
    frase = ' '.join(partes) + '.'
    extra = []
    if r('gearbox'):
        extra.append(f"Caixa {r('gearbox').lower()}")
    if v('engine_power'):
        extra.append(f"{v('engine_power')} cv")
    if r('origin'):
        extra.append(r('origin').lower() if r('origin') != 'Nacional' else 'viatura nacional')
    if extra:
        frase += ' ' + ', '.join(extra) + '.'
    if garantia != 'Garantia incluída':
        frase += f' Garantia de {garantia}.'

    return {
        'slug': slug,
        'marca': marca,
        'modelo': modelo,
        'versao': versao,
        'tipo': 'carro',
        'carrocaria': carroçaria,
        'preco': a['price']['grossMinorAmount'] // 100,
        'ano': ano,
        'km': int(v('mileage')) if v('mileage') else None,
        'combustivel': comb,
        'caixa': r('gearbox') or '',
        'potencia': int(v('engine_power')) if v('engine_power') else None,
        'cor': r('color') or '',
        'lugares': None,                       # o Standvirtual não o traz
        'portas': int(v('door_count')) if v('door_count') else None,
        'origem': r('origin') or '',
        'garantia': garantia,
        'estado': 'disponivel',
        'destaque': ordem <= 6,
        'descricao': frase,
        'equipamento': equipamento[:10],
        'fotos': [f'assets/veiculos/{slug}/{i:02d}-1600.webp' for i in range(1, len(a['photos']) + 1)],
        'publicado': True,
        'ordem': ordem,
        # Informação que o DL 74/93 obriga a prestar. Vem do anúncio quando lá
        # está; o que não vier fica de fora em vez de ser inventado.
        **({'mes': MESES_PT[mes]} if mes and 1 <= mes <= 12 else {}),
        **({'registos_anteriores': int(v('number_of_registrations'))} if v('number_of_registrations') else {}),
        **({'cilindrada': int(v('engine_capacity'))} if v('engine_capacity') else {}),
    }, a['photos']


def descarregar(url, destino):
    pedido = urllib.request.Request(url + TAMANHO, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(pedido, timeout=40) as r:
        destino.write_bytes(r.read())


def main():
    ads, total = ler_anuncios()
    print(f'{total} anúncios no Standvirtual, {len(ads)} no ficheiro\n')

    viaturas = []
    for i, a in enumerate(ads, 1):
        v, fotos = converter(a, i)
        viaturas.append((v, fotos))
        print(f"{i:2}. {v['slug']}")
        print(f"    {v['marca']} {v['modelo']} {v['versao']} · {v['preco']} € · {v['ano']} · "
              f"{v['km']} km · {v['combustivel']} · {v['caixa']} · {v['potencia']} cv · {len(fotos)} fotos")
        print(f"    garantia: {v['garantia']} | equipamento: {len(v['equipamento'])} itens")

    if not GRAVAR:
        print('\n(simulação — corre com --gravar para escrever)')
        return

    # Fora o que lá estava. As viaturas de exemplo saem todas, dados e fotos.
    for f in DADOS.glob('*.json'):
        f.unlink()
    if FOTOS.exists():
        shutil.rmtree(FOTOS)
    FOTOS.mkdir(parents=True)
    print('\nviaturas de exemplo apagadas')

    for v, fotos in viaturas:
        pasta = FOTOS / v['slug']
        pasta.mkdir(parents=True, exist_ok=True)
        for i, u in enumerate(fotos, 1):
            descarregar(u, pasta / f'{i:02d}.jpg')
        (DADOS / f"{v['slug']}.json").write_text(
            json.dumps(v, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f"  {v['slug']}: {len(fotos)} fotos")

    print(f'\n{len(viaturas)} viaturas escritas')


if __name__ == '__main__':
    main()
