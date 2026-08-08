# Logótipos das marcas

Doze ficheiros, de **duas origens diferentes**. A distinção importa e não deve
ser apagada por quem mexer nisto.

| Origem | Ficheiros |
|---|---|
| Simple Icons (CC0) | `audi` `bmw` `citroen` `kia` `nissan` `opel` `peugeot` `renault` `smart` |
| Desenhados neste projecto | `mercedesbenz` `polaris` |
| Letras de uma fonte do sistema | `jaguar` |

Todos são monocromáticos e de caminho único. **Nem todos são quadrados**: nove
são emblemas com `viewBox` 1:1, e três são mais largos do que altos — o
`polaris` a 1,73:1, o `kia` a 4,25:1 e o `jaguar` a 6,25:1, que são wordmarks.
O CSS trata disso com `height: 32px; width: auto; max-width: 96px`: os emblemas
saem 32×32 e os wordmarks esticam até 96 px de largo.

**Porque é que isto importa:** enquanto o `kia` esteve numa caixa quadrada, a
tinta do wordmark ocupava 5,65 de 24 unidades de altura e a 32 px ficava com
7 px — ilegível. Ajustar a caixa à tinta e deixar esticar deu-lhe quase o triplo
da altura. O mesmo valeu para o `polaris`, que era uma mancha escura pequena.

## Os nove que vêm do Simple Icons

Da colecção <https://github.com/simple-icons/simple-icons>. A `source` de cada
um, no `data/simple-icons.json` da colecção, aponta para material oficial da
própria marca (audi.com/ci, stellantis.com, media.renaultgroup.com,
global.smart.com…).

Ao guardá-los aqui foram-lhes retirados o `xmlns`, o `role="img"` e o
`<title>`, e acrescentado `fill="currentColor"` e `aria-hidden="true"`: são
embutidos no HTML pelo gerador e o nome da marca já vai em texto ao lado, pelo
que anunciá-lo outra vez no leitor de ecrã seria repetição.

Embutidos e não em `<img>` de propósito, por duas razões: o `currentColor`
deixa-os herdar a cor do CSS (a faixa fica monocromática em vez de uma colecção
de logótipos com cores e qualidades diferentes), e não há nenhum pedido a
terceiros — o que mantém verdadeira a afirmação da política de privacidade de
que o site não carrega recursos externos.

## Licença: duas camadas que não se devem confundir

**Direito de autor.** O repositório do Simple Icons está sob **CC0 1.0
Universal** (verificado no `LICENSE.md` real). Mas o `DISCLAIMER.md` da colecção
ressalva expressamente que isso não implica que cada ícone seja CC0, e pede aos
utilizadores que obtenham as permissões devidas. Nenhuma das 9 marcas declara
campo `license` próprio. Na prática o risco de direito de autor é muito baixo:
o que está aqui são formas geométricas simples (argolas, roundel, losango,
chevrons), onde a originalidade protegível é quase nula.

**Marca registada.** O CC0 **não toca** neste direito — o próprio texto do CC0
diz, no §4(a), que nenhum direito de marca é renunciado. É aqui que se decide a
licitude, e resolve-se pelo uso referencial, explicado abaixo.

## Os três desenhados aqui

**Jaguar, Mercedes-Benz e Polaris não existem no Simple Icons** — procurámos nos
3453 ícones da colecção. Não sendo possível obtê-los com licença clara, e a
pedido do cliente, foram **desenhados neste projecto**. Isto tem duas
consequências que ficam registadas:

- **Não são arte oficial.** São aproximações geométricas nossas. Se um dia
  houver material licenciado do fabricante, substituem-se pelo nome do ficheiro
  e o gerador apanha-os sozinho.
- **A qualidade não é igual entre eles.** Avaliação honesta:
  - `mercedesbenz` — construído por trigonometria (anel r=12, pontas a 90°, 210°
    e 330°). Praticamente indistinguível do real.
  - `polaris` — o emblema, elipse com a estrela polar vazada. Boa aproximação;
    os raios estão ~30 % mais grossos do que no original, senão desapareciam a
    32 px.
  - `polaris` — a razão da caixa passou a 1,73:1, ajustada à elipse, o que o
    fez crescer três vezes e meia e tornou a estrela legível.

**O `jaguar` mudou de abordagem.** Era o *growler* desenhado à mão e lia-se como
um gato de banda desenhada, não como a marca. Fizeram-se **oito** tentativas de
desenho ao todo — seis do *growler* e do *leaper* numa primeira volta, mais duas
do *leaper* em silhueta — e nenhuma passou: a esta escala sai sempre uma mancha,
e as tentativas de silhueta com traço fino saíram parecidas com uma pestana.

Passou a ser o **wordmark «JAGUAR»**, construído a partir dos contornos das
letras da Futura Bold, uma fonte do sistema, extraídos com `fontTools` e
convertidos num só caminho, com o espaçamento aberto a 0,09 em — a Jaguar usa o
nome muito espacado. Não é a fonte oficial da marca, é uma aproximação
geométrica próxima. Lê-se de imediato a 32 px, ao contrário de tudo o que se
tentou desenhar, e é a forma de referência à marca mais protegida que existe:
o nome escrito.

Os motivos da ausência no Simple Icons, verificados no histórico do repositório,
não são recusas dos titulares:

- **Jaguar** existiu até à versão 15.9.0 e foi removida porque a Jaguar mudou de
  identidade em 2024/25 e o logótipo antigo ficou obsoleto. Não houve
  substituto, e não foi um pedido de remoção da marca.
- **Mercedes-Benz** existia como `mercedes.svg`. Foi removida no âmbito de uma
  mudança de nome do ficheiro que nunca chegou a ser concluída — o ficheiro novo
  nunca foi acrescentado. Pedidos posteriores ficaram sem seguimento.
- **Polaris** nunca lá esteve.

Antes de desenhar, procurámos alternativas licenciadas e rejeitámos todas: o
SVGL não tem marcas de automóveis, o VectorLogoZone não tem ficheiro de licença
nenhum, o único Jaguar disponível no Wikimedia é o logótipo de 1966 (seria
factualmente errado ao lado de um XF de 2013) e o Polaris de lá está declarado
como CC BY-SA por utilizadores anónimos, que não têm legitimidade para licenciar
o logótipo de uma empresa. **Nada foi copiado dessas fontes.**

## Marca sem ficheiro

O campo «Marca» é texto livre no backoffice, por isso o cliente pode escrever uma
marca que não tenha ficheiro aqui. Nesse caso o gerador mostra um **monograma** —
a inicial, na mesma caixa de 32 px — com o nome completo por baixo, como em todos
os outros cartões. A referência nominativa à marca está garantida de qualquer
forma, porque o nome aparece escrito em todos os cartões.

Para acrescentar uma marca basta deixar aqui o SVG com o nome normalizado: o
gerador apanha-o sozinho.

## Como se chama o ficheiro

O gerador normaliza o nome da marca: minúsculas, sem acentos e sem nada que não
seja letra ou número. «Citroën» → `citroen.svg`, «Mercedes-Benz» →
`mercedesbenz.svg`.

## Direito de marca: porque é que isto é lícito

Mostrar o logótipo do fabricante para identificar viaturas que estão
efectivamente à venda assenta em duas bases que se somam:

- **Esgotamento do direito** — artigo 253.º do Código da Propriedade Industrial.
  As viaturas usadas já foram colocadas no mercado do Espaço Económico Europeu
  pelo próprio fabricante, pelo que o direito se esgotou quanto a elas.
- **Uso referencial** — artigo 254.º, alínea c), do mesmo Código, e artigo 14.º,
  n.º 1, alínea c), do Regulamento (UE) 2017/1001: o titular não pode impedir o
  uso da marca «para efeitos de identificação ou referência a produtos ou
  serviços como sendo os do titular dessa marca», desde que conforme aos usos
  honestos.

O acórdão do Tribunal de Justiça no caso **BMW/Deenik (C-63/97)** é quase o
mesmo caso — um revendedor independente de BMW usados, com oficina — e permite
o uso, com um limite: não pode ser feito de modo a dar a impressão de que existe
uma relação comercial com o titular da marca. O **Portakabin (C-558/08)**
reforça-o para revendedores multimarca de usados, e o **Gillette (C-228/03)**
enumera o que quebra os usos honestos.

Daí três regras de desenho que **não são estética, são a defesa jurídica**, e
que quem mexer nisto tem de manter:

1. **Tudo monocromático e do mesmo tamanho.** Não recolorir cada logótipo com a
   cor oficial do fabricante. A cor única despersonaliza e afasta a ideia de
   representar a marca.
2. **Nunca mostrar a marca de um fabricante que não esteja em stock.** A lista é
   gerada a partir das viaturas à venda, o que garante isto sozinho.
3. **Nunca usar um logótipo de marca como identidade do stand** — nem no
   cabeçalho ao lado do logótipo da LR Motors, nem no favicon, nem na imagem de
   partilha. E nunca escrever «concessionário», «representante», «agente»,
   «oficina autorizada» ou «parceiro oficial» de nenhuma marca.

A página de Termos e Condições diz expressamente que a LR Motors é um stand
independente e que não tem relação comercial com os fabricantes. É essa
declaração que fecha o risco — vale mais do que a escolha de qualquer ficheiro.
