# LR Motors — site e backoffice

Stand online da **Luís & Ricardo Motors, Lda** (LR Motors), Vila Verde, Braga.
Site estático em GitHub Pages, sem custos de alojamento, com backoffice para o
cliente gerir o stock sozinho.

**Site:** https://renatovalente5.github.io/LR_Motors/

---

## Para o cliente — como gerir o stock

Não é preciso perceber nada de programação, nem ter conta no GitHub.

### Entrar

1. Abra o link que recebeu por email.
2. Escreva o seu email e carregue em entrar — recebe um link de acesso.

### Pôr um carro à venda

1. **Viaturas** → **Add an entry**.
2. Preencha. Os campos obrigatórios estão marcados.
   - **Endereço da página**: minúsculas e hífens, por exemplo `bmw-serie-3-320d`.
     É o que fica no link. Depois de publicado, não convém mudar.
   - **Preço**: em euros, valor final com impostos. É o que a lei exige a quem
     anuncia preços.
   - **Fotografias**: carregue à vontade, mesmo grandes — o site trata de as
     encolher. **A primeira foto é a mais importante**: é a que aparece na
     listagem e nas partilhas do WhatsApp e do Facebook. Use o carro inteiro,
     de três quartos à frente. Depois exterior, interior e mala.
3. **Save**. Em 1 a 3 minutos está no site.

### Vender ou reservar

Não apague o anúncio. Mude o **Estado**:

- **Reservado** — continua visível, com etiqueta amarela.
- **Vendido** — sai da listagem, mas a página continua a existir para quem tenha
  o link guardado. Apagar criaria erros em partilhas antigas.

### Mudar contactos, horário ou textos

**Dados do stand** → altere → **Save**.

---

## Para quem mexer no código

### Como está montado

| | |
|---|---|
| Alojamento | GitHub Pages, publicado por GitHub Actions |
| Conteúdo | `data/viaturas/*.json` (um ficheiro por viatura) e `data/definicoes.json` |
| Fotos | `assets/veiculos/<slug>/` em WebP, três larguras |
| Gerador | `scripts/gerar.mjs` — Node puro, **zero dependências** |
| Imagens | `scripts/otimizar-imagens.py` — Pillow |
| Backoffice | [Pages CMS](https://pagescms.org), configurado em `.pages.yml` |

**Porquê um gerador próprio e não Astro ou Jekyll:** as páginas que valem
dinheiro num stand são as de cada viatura. Precisam de existir em HTML no
código-fonte — não só depois de o JavaScript correr — porque os robôs de
pré-visualização de links do **WhatsApp, Facebook e Instagram não executam
JavaScript**, e é por aí que este negócio partilha carros. Um gerador de ~900
linhas sem dependências resolve isso e não apodrece: não há `npm install`,
não há versões a partir o build daqui a dois anos.

### Correr localmente

```bash
BASE= SITE=http://localhost:4200 node scripts/gerar.mjs
python3 -m http.server 4200 --directory _site
```

O `BASE` vazio serve para o site funcionar na raiz em local. Em produção o
`BASE` é `/LR_Motors`, porque é uma *project page*. **Nunca escrever caminhos
absolutos à mão** — usar sempre o `u()` do gerador, ou o site parte quando
publicado e funciona em local, que é a pior combinação possível.

### Fotografias

```bash
python3 scripts/otimizar-imagens.py --varrer      # gera o que falta
```

Os originais ficam em `_fonte/originais/`, **fora do repositório** (ver
`.gitignore`). Foi de propósito: uma vez comitados, os ficheiros ficam na
história do Git para sempre e o repositório nunca mais encolhe.

### Publicar

`git push` para `main`. A Action gera e publica. Também há botão manual em
Actions → Publicar site → Run workflow.

> Em **Settings → Pages**, a origem tem de estar em **GitHub Actions**. Na opção
> antiga o GitHub tenta processar o repositório com Jekyll e publica a fonte.

---

## Conformidade legal

Verificado para um stand de usados (Lda) em Vila Verde:

- **Identificação** no rodapé de todas as páginas — firma, forma jurídica,
  capital social, matrícula, NIPC e sede. Exigido pelo art. 171.º do Código das
  Sociedades Comerciais e pelo art. 10.º do DL 7/2004. *O capital social está lá
  por imposição legal, não por opção.*
- **Livro de Reclamações electrónico** com ligação em todas as páginas
  (DL 156/2005).
- **Resolução de litígios**: a entidade competente para Vila Verde é o **CIAB —
  Tribunal Arbitral de Consumo**, de Braga. Até 5.000 € a arbitragem é
  *necessária* se o consumidor a escolher. A plataforma ODR europeia foi
  desactivada em julho de 2025 e por isso **não** aparece no site.
- **Garantia**: página própria a explicar o DL 84/2021 — 3 anos, reduzíveis a
  18 meses em usados só por acordo escrito.
- **Preços** em euros com impostos incluídos (DL 138/90).
- **Sem cookies**: o site não tem analítica, publicidade, tipos de letra
  externos nem *embeds*. Por isso **não tem banner de cookies** — não é preciso.
  O mapa do Google só carrega depois de a pessoa carregar no botão.
- **Custo da chamada** indicado junto de cada número (DL 59/2021).
- O site é uma **montra**: não vende, não reserva e não recebe pagamentos, pelo
  que não se aplica o regime dos contratos à distância.

### Por confirmar com o cliente

- **Intermediação de crédito.** O site diz que há financiamento, sem taxas nem
  mensalidades — o que é seguro. Se a LR Motors apresentar propostas de
  financiadoras, tem de estar registada no Banco de Portugal como intermediária
  de crédito e indicá-lo no site (DL 81-C/2017).
- **Conservatória do registo comercial.** No rodapé está a fórmula genérica com
  o número único de matrícula. Se quiserem nomear a conservatória, é preciso
  confirmá-la.
- **Vila do Conde.** A informação da empresa fala em «Braga e Vila do Conde»,
  mas só há morada para Vila Verde. Se houver segundo espaço, falta a morada.

---

## O que falta preencher

Três viaturas estão publicadas **sem preço** («Sob consulta»), porque não havia
essa informação nas fotos de origem: **BMW i4**, **Kia EV6** e
**Mercedes Classe E Station**. Recomendo pôr preço — é o primeiro filtro mental
de quem compra.

Faltam também, em todas as viaturas, os campos que o **DL 74/93** exige na venda
de usados e que só o stand tem: **matrícula**, **data da matrícula**, **ano de
construção** e **número de proprietários anteriores**. Os campos já existem no
backoffice e aparecem na ficha assim que forem preenchidos.
