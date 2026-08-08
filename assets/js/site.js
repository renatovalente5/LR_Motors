/* ==========================================================================
   LR MOTORS — comportamento do site
   Sem dependências. Tudo degrada com graça se o JavaScript falhar: a listagem
   já vem inteira no HTML, os filtros é que deixam de funcionar.
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ------------------------------------------------ cabeçalho que encolhe */
  /* O logótipo entra grande e encolhe ao descer. O trabalho é todo do CSS —
     aqui só se liga e desliga uma classe, e com histerese: sem ela, parar
     exactamente no limiar põe o cabeçalho a saltar entre os dois tamanhos. */
  (function () {
    var topo = $('#topo');
    if (!topo) return;
    var ENCOLHE = 90, CRESCE = 40, encolhido = false, agendado = false;
    function avaliar() {
      agendado = false;
      var y = window.scrollY || document.documentElement.scrollTop;
      if (!encolhido && y > ENCOLHE) { encolhido = true; topo.classList.add('topo--encolhido'); }
      else if (encolhido && y < CRESCE) { encolhido = false; topo.classList.remove('topo--encolhido'); }
    }
    window.addEventListener('scroll', function () {
      if (!agendado) { agendado = true; requestAnimationFrame(avaliar); }
    }, { passive: true });
    avaliar();
  })();

  /* ------------------------------------------------ menu de ecrã inteiro */
  (function () {
    var btn = $('#btn-menu'), menu = $('#menu');
    if (!btn || !menu) return;
    var focoAntes = null;

    function abrir() {
      focoAntes = document.activeElement;
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Fechar menu');
      /* O `hidden` sai primeiro para a transição de opacidade ter o que animar,
         e a classe entra no frame seguinte.

         O FOCO TEM DE IR AQUI DENTRO, depois da classe e de um reflow. O menu
         está `visibility: hidden` até a classe entrar, e um elemento invisível
         RECUSA foco — estava a focar-se um frame antes de ser possível, e o
         resultado era que o foco nunca entrava no menu. Em cadeia, a armadilha
         de foco nunca engatava e os elementos por trás do painel continuavam
         alcançáveis com o Tab. */
      requestAnimationFrame(function () {
        document.body.classList.add('menu-aberto');
        void menu.offsetHeight;
        var primeiro = $('.menu__link', menu);
        if (primeiro) primeiro.focus({ preventScroll: true });
      });
    }
    function fechar() {
      document.body.classList.remove('menu-aberto');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Abrir menu');
      setTimeout(function () { if (!document.body.classList.contains('menu-aberto')) menu.hidden = true; }, 220);
      if (focoAntes && document.contains(focoAntes)) focoAntes.focus({ preventScroll: true });
    }
    /* O estado lê-se do `aria-expanded`, que o abrir() e o fechar() escrevem de
       forma síncrona — e não da classe `menu-aberto`, que só entra dentro de um
       requestAnimationFrame. Com a classe, dois cliques no mesmo frame liam
       "fechado" nas duas vezes e o menu voltava a abrir em vez de fechar. */
    var aberto = function () { return btn.getAttribute('aria-expanded') === 'true'; };
    btn.addEventListener('click', function () { aberto() ? fechar() : abrir(); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) fechar(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && aberto()) fechar();
    });
    /* Prende o foco dentro do menu enquanto está aberto. */
    menu.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focaveis = $$('a[href], button:not([disabled])', menu).filter(function (el) { return el.offsetParent !== null; });
      if (!focaveis.length) return;
      var primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    });

    /* Acima dos 1180 px o menu passa a `display:none` e o hambúrguer desaparece.
       Se a janela crescesse com o menu aberto, ficava o scroll da página trancado
       sem nada visível para o soltar. O bloqueio em si é CSS, dentro da media
       query do telemóvel, para se libertar sozinho sem depender de nenhum evento
       — medi que o `change` do matchMedia não chega a disparar em todos os casos.
       Isto aqui é só para repor o estado do botão. */
    var movel = window.matchMedia('(max-width: 1180px)');
    var aoMudar = function () { if (!movel.matches && aberto()) fechar(); };
    movel.addEventListener ? movel.addEventListener('change', aoMudar) : movel.addListener(aoMudar);
  })();

  /* ------------------------------------- carrossel das viaturas em destaque */
  /* Avança sozinho, a pedido do cliente. O deslizar, o encaixe e o arrasto são
     nativos do contentor de scroll; o JavaScript só faz as setas e o relógio.

     PÁRA em tudo o que indica que alguém está a olhar ou a mexer: rato em cima,
     foco de teclado dentro, toque, e quando o separador não está visível. Sem
     isso o cartão fugia debaixo do rato antes de se conseguir carregar nele.

     Fica registado que movimento automático com mais de cinco segundos, sem um
     controlo visível para o parar, não cumpre o critério 2.2.2 da WCAG. O
     `prefers-reduced-motion` é respeitado: quem o tem activo não vê o automático.

     As setas desaparecem quando a pista cabe toda no ecrã, e desactivam-se nas
     pontas, para não haver botões que não fazem nada. */
  (function () {
    var pista = $('#vitrine-pista'), caixa = $('#vitrine-setas');
    if (!pista) return;
    var itens = $$('.vit-item', pista);
    if (!caixa || itens.length < 2) return;

    function passo() {
      var r = itens[0].getBoundingClientRect();
      var gap = parseFloat(getComputedStyle(pista).columnGap) || 0;
      return r.width + gap;
    }
    function limite() { return pista.scrollWidth - pista.clientWidth; }

    /* ---- pontos de posição, um por viatura */
    /* Um por cartão e não um por «página»: o número de cartões visíveis muda com
       a largura, e contas de paginação teriam de ser refeitas a cada resize —
       mais uma coisa para desalinhar. Assim o ponto N leva ao cartão N, e o
       próprio browser trava o scroll no fim quando já não há para onde ir.

       Consequência dessa travagem: perto do fim, vários cartões dão a mesma
       posição de scroll. Por isso, quando a pista está no fim, o ponto activo é
       sempre o último — senão ficava aceso um do meio com a pista encostada. */
    var pontos = [];
    var caixaPontos = document.getElementById('vitrine-pontos');
    if (caixaPontos) {
      itens.forEach(function (item, i) {
        var nome = $('.vit-cartao__nome', item);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'vitrine__ponto';
        b.setAttribute('aria-label', 'Ver viatura ' + (i + 1) +
          (nome ? ': ' + nome.textContent.trim() : ''));
        b.addEventListener('click', function () {
          parar();
          pista.scrollTo({ left: i * passo(), behavior: 'smooth' });
        });
        caixaPontos.appendChild(b);
        pontos.push(b);
      });
    }

    function marcarPonto() {
      if (!pontos.length) return;
      var max = limite();
      var i = (pista.scrollLeft >= max - 2)
        ? pontos.length - 1
        : Math.round(pista.scrollLeft / passo());
      if (i < 0) i = 0;
      if (i > pontos.length - 1) i = pontos.length - 1;
      pontos.forEach(function (b, n) {
        if (n === i) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    }

    function avaliar() {
      var max = limite();
      /* Uma folga de 2 px porque o scrollLeft e a largura são fraccionários e
         raramente batem exactamente no fim. */
      caixa.hidden = max <= 2;
      if (caixaPontos) caixaPontos.hidden = max <= 2;
      var botoes = $$('.vitrine__seta', caixa);
      botoes[0].disabled = pista.scrollLeft <= 2;
      botoes[1].disabled = pista.scrollLeft >= max - 2;
      marcarPonto();
    }

    $$('.vitrine__seta', caixa).forEach(function (b) {
      b.addEventListener('click', function () {
        pista.scrollBy({ left: +b.dataset.passo * passo(), behavior: 'smooth' });
      });
    });
    /* Trava por tempo e não por requestAnimationFrame. Com o rAF, uma bandeira
       posta a `true` e nunca limpa — o que acontece se o separador passar para
       segundo plano a meio de um scroll, porque aí o rAF não corre — deixava as
       setas sem actualizar para sempre. Um limiar de tempo não pode encravar.

       Mas uma trava só à entrada deixa cair o ÚLTIMO evento da passagem, e é
       precisamente esse que diz onde a pista ficou: com o encaixe a assentar
       depois do dedo sair, as setas e o ponto aceso ficavam a apontar para a
       posição anterior até alguém voltar a mexer. Daí a chamada de cauda. Um
       `setTimeout` não pode encravar como a bandeira do rAF podia. */
    var ultima = 0, cauda = null;
    var agoraMs = function () {
      return (window.performance && performance.now) ? performance.now() : +new Date();
    };
    pista.addEventListener('scroll', function () {
      var agora = agoraMs();
      if (agora - ultima < 80) {
        clearTimeout(cauda);
        cauda = setTimeout(function () { ultima = agoraMs(); avaliar(); }, 90);
        return;
      }
      ultima = agora;
      avaliar();
    }, { passive: true });
    window.addEventListener('resize', avaliar, { passive: true });
    avaliar();

    /* ---- o automático */
    var lento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var relogio = null;

    function andar() {
      var max = limite();
      if (max <= 2) return;
      /* Chegado ao fim volta ao princípio, senão o automático encravava lá. */
      if (pista.scrollLeft >= max - 2) pista.scrollTo({ left: 0, behavior: 'smooth' });
      else pista.scrollBy({ left: passo(), behavior: 'smooth' });
    }
    function comecar() {
      if (lento || relogio || document.hidden || limite() <= 2) return;
      relogio = setInterval(andar, 4500);
    }
    function parar() { if (relogio) { clearInterval(relogio); relogio = null; } }

    ['mouseenter', 'focusin', 'pointerdown'].forEach(function (ev) {
      pista.addEventListener(ev, parar, { passive: true });
    });
    caixa.addEventListener('mouseenter', parar, { passive: true });
    pista.addEventListener('mouseleave', comecar);
    /* No telemóvel não há `mouseleave`: sem isto o automático morria ao primeiro
       toque e nunca mais voltava. Retoma três segundos depois de largar, tempo
       suficiente para quem está a arrastar não ser interrompido. */
    var retomar = null;
    pista.addEventListener('pointerup', function () {
      clearTimeout(retomar);
      retomar = setTimeout(comecar, 3000);
    }, { passive: true });
    /* Uma seta clicada é intenção de navegar à mão: pára e deixa estar. */
    $$('.vitrine__seta', caixa).forEach(function (b) { b.addEventListener('click', parar); });
    document.addEventListener('visibilitychange', function () {
      document.hidden ? parar() : comecar();
    });
    comecar();
  })();

  /* --------------------------------------------- faixa das marcas */
  /* Anda sozinha empurrando o `scrollLeft`, e NÃO com uma animação de
     `transform`. A razão é um defeito reportado duas vezes — carregar no
     logótipo de uma marca não fazia nada: com o `transform` conduzido pelo
     compositor, o teste de acerto do ponteiro usa a última posição conhecida na
     thread principal e o clique cai ao lado. A rolar, a posição é sempre a
     verdadeira.

     O laço é sem costura porque a pista leva duas filas iguais: quando o scroll
     passa a largura de uma, recua-se essa largura de uma vez. Como as duas
     filas são idênticas, no ecrã não se vê salto nenhum.

     No telemóvel não anda: só se arrasta com o dedo. */
  (function () {
    var fita = $('#fita-marcas');
    if (!fita) return;
    var filas = $$('.fita__fila', fita);
    var lento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var tactil = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    /* O teclado continua a alcançar os 12 cartões reais: agora basta trazê-los
       à vista, sem os truques de reiniciar a animação que aqui estavam. */
    fita.addEventListener('focusin', function (e) {
      var cartao = e.target.closest ? e.target.closest('.marca-cartao') : null;
      if (cartao && cartao.scrollIntoView) cartao.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

    if (tactil || lento || filas.length < 2) return;

    var VELOCIDADE = 0.55;               // px por frame, ~33 px/s a 60 Hz
    var parado = false, quadro = null, pos = 0;

    function largura1() { return filas[0].getBoundingClientRect().width; }

    function andar() {
      quadro = requestAnimationFrame(andar);
      /* Enquanto está parada — ou o dedo a arrasta — a posição verdadeira é a do
         scroll; é daí que se retoma. */
      if (parado || document.hidden) { pos = fita.scrollLeft; return; }
      var meia = largura1();
      /* A posição é acumulada NUMA VARIÁVEL e só depois atribuída. Somar 0,55 ao
         `scrollLeft` directamente arrisca-se a não fazer nada: o browser guarda
         o scroll arredondado ao pixel do ecrã, e meio pixel por frame podia ser
         engolido a cada frame — a faixa ficava parada sem razão aparente. */
      pos += VELOCIDADE;
      /* Recuar uma fila inteira ao passar dela. As duas filas são iguais, por
         isso no ecrã não se vê salto nenhum. */
      if (meia > 0 && pos >= meia) pos -= meia;
      fita.scrollLeft = pos;
    }

    var parar = function () { parado = true; };
    var seguir = function () { parado = false; };
    ['mouseenter', 'focusin', 'pointerdown'].forEach(function (ev) {
      fita.addEventListener(ev, parar, { passive: true });
    });
    fita.addEventListener('mouseleave', seguir);
    /* Depois de arrastar com o dedo ou de sair com o teclado, retoma-se com
       calma para não fugir debaixo de quem ainda está a decidir. */
    var retomar = null;
    ['pointerup', 'focusout'].forEach(function (ev) {
      fita.addEventListener(ev, function () {
        clearTimeout(retomar);
        retomar = setTimeout(function () {
          if (fita.contains(document.activeElement) || fita.matches(':hover')) return;
          seguir();
        }, 1500);
      }, { passive: true });
    });
    quadro = requestAnimationFrame(andar);
  })();


  /* ----------------------------------------------------------- filtros */
  (function () {
    var forma = $('#filtros'), grelha = $('#grelha');
    if (!forma || !grelha) return;
    var cartoes = $$('.cartao', grelha);
    var contagem = $('#contagem'), vazio = $('#vazio');

    function valores() {
      var v = {};
      $$('select, input', forma).forEach(function (c) { if (c.name) v[c.name] = c.value.trim(); });
      return v;
    }

    function aplicar(guardarNoUrl) {
      var f = valores(), n = 0;
      var termo = (f.q || '').toLowerCase();

      cartoes.forEach(function (c) {
        var d = c.dataset;
        var ok =
          (!f.tipo || d.tipo === f.tipo) &&
          (!f.marca || d.marca === f.marca) &&
          (!f.combustivel || d.combustivel === f.combustivel) &&
          (!f.caixa || d.caixa === f.caixa) &&
          (!f.precoMax || (d.preco && +d.preco <= +f.precoMax)) &&
          (!f.anoMin || (d.ano && +d.ano >= +f.anoMin)) &&
          (!termo || d.procura.indexOf(termo) !== -1);
        c.hidden = !ok;
        if (ok) n++;
      });

      /* Ordenação: mexe-se na ordem do flex/grid com `order`, sem tocar no DOM.
         Assim o HTML de origem — que é o que o Google lê — nunca muda. */
      var visiveis = cartoes.filter(function (c) { return !c.hidden; });
      var chave = { 'preco-asc': ['preco', 1], 'preco-desc': ['preco', -1], 'km-asc': ['km', 1] }[f.ordem];
      if (chave) {
        visiveis.slice().sort(function (a, b) {
          var x = +a.dataset[chave[0]] || Infinity, y = +b.dataset[chave[0]] || Infinity;
          return (x - y) * chave[1];
        }).forEach(function (c, i) { c.style.order = i; });
      } else {
        cartoes.forEach(function (c) { c.style.order = ''; });
      }

      contagem.innerHTML = '<b>' + n + '</b> ' + (n === 1 ? 'viatura' : 'viaturas');
      if (vazio) vazio.hidden = n !== 0;

      if (guardarNoUrl) {
        var p = new URLSearchParams();
        Object.keys(f).forEach(function (k) { if (f[k] && k !== 'ordem') p.set(k, f[k]); });
        if (f.ordem && f.ordem !== 'recentes') p.set('ordem', f.ordem);
        var novo = location.pathname + (p.toString() ? '?' + p : '');
        history.replaceState(null, '', novo);
      }
    }

    /* Estado inicial vindo do URL — é o que faz um link filtrado funcionar
       quando o vendedor o cola no WhatsApp. */
    var url = new URLSearchParams(location.search);
    $$('select, input', forma).forEach(function (c) {
      if (c.name && url.has(c.name)) c.value = url.get(c.name);
    });

    /* Os DOIS eventos, e não só o `input`. Num <select>, o Safari e o iOS
       disparam apenas `change` — logo, escolher uma marca no iPhone mudava o
       valor e não filtrava nada. Medido: com só `change` ficavam as 14 viaturas
       à vista; com `input` filtrava para 2. O `aplicar()` é idempotente, por
       isso correr duas vezes no Chrome, que dispara ambos, não faz diferença. */
    ['input', 'change'].forEach(function (ev) {
      forma.addEventListener(ev, function () { aplicar(true); });
    });
    forma.addEventListener('submit', function (e) { e.preventDefault(); });
    var limpar = $('#btn-limpar');
    if (limpar) limpar.addEventListener('click', function () {
      $$('select, input', forma).forEach(function (c) { c.value = ''; });
      var ordem = $('#f-ordem'); if (ordem) ordem.value = 'recentes';
      aplicar(true);
    });

    /* filtros em painel no telemóvel */
    var abrirF = $('#btn-filtros'), verF = $('#btn-ver'), fechoF = $('.filtros__fechar');
    if (abrirF) {
      abrirF.addEventListener('click', function () {
        forma.classList.add('aberto');
        if (fechoF) fechoF.style.display = '';
        document.body.style.overflow = 'hidden';
      });
    }
    if (verF) {
      verF.addEventListener('click', function () {
        forma.classList.remove('aberto');
        if (fechoF) fechoF.style.display = 'none';
        document.body.style.overflow = '';
      });
    }

    aplicar(false);
  })();

  /* ---------------------------------------------------------- galeria */
  (function () {
    var dados = $('#fotos-json');
    if (!dados) return;
    var fotos = JSON.parse(dados.textContent);
    if (!fotos.length) return;

    var principal = $('#foto-principal'), contador = $('#foto-n');
    var tiras = $$('.tira'), i = 0;

    function mostrar(n) {
      i = (n + fotos.length) % fotos.length;
      principal.src = fotos[i].src;
      principal.srcset = fotos[i].srcset;
      if (contador) contador.textContent = i + 1;
      tiras.forEach(function (t, k) { t.setAttribute('aria-current', String(k === i)); });
      var activa = tiras[i];
      if (activa && activa.scrollIntoView) activa.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (lbAberta()) actualizarLb();
    }

    tiras.forEach(function (t) { t.addEventListener('click', function () { mostrar(+t.dataset.i); }); });
    $$('.galeria__nav').forEach(function (b) {
      b.addEventListener('click', function () { mostrar(i + (+b.dataset.passo)); });
    });

    /* --- lightbox --- */
    var lb = $('#lightbox'), lbImg = $('#lb-img'), lbN = $('#lb-n');
    function lbAberta() { return lb && lb.open; }
    function actualizarLb() {
      lbImg.src = fotos[i].src;
      lbImg.srcset = fotos[i].srcset;
      lbImg.alt = principal.alt + ' — fotografia ' + (i + 1);
      if (lbN) lbN.textContent = i + 1;
    }
    if (lb) {
      principal.addEventListener('click', function () { actualizarLb(); lb.showModal(); });
      var x = $('#lb-x'); if (x) x.addEventListener('click', function () { lb.close(); });
      $$('.lightbox__nav').forEach(function (b) {
        b.addEventListener('click', function (e) { e.stopPropagation(); mostrar(i + (+b.dataset.passo)); });
      });
      lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lightbox__corpo')) lb.close(); });
    }

    document.addEventListener('keydown', function (e) {
      if (!lbAberta()) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); mostrar(i + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); mostrar(i - 1); }
    });

    /* arrastar com o dedo */
    var x0 = null;
    var alvo = $('.galeria__principal');
    if (alvo) {
      alvo.addEventListener('touchstart', function (e) { x0 = e.changedTouches[0].clientX; }, { passive: true });
      alvo.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var d = e.changedTouches[0].clientX - x0;
        if (Math.abs(d) > 45) mostrar(i + (d < 0 ? 1 : -1));
        x0 = null;
      }, { passive: true });
    }
  })();


  /* ------------------------------------- pesquisa rápida: fechar no telemóvel */
  /* O HTML manda-o ABERTO de propósito: sem JavaScript o painel fica como
     sempre esteve, e nenhum utilizador perde a pesquisa. Isto fecha-o num ecrã
     estreito, onde os quatro campos empilhados comiam meio ecrã.

     TEM de acompanhar o tamanho da janela, e a primeira versão não acompanhava.
     Julguei que o estado que sobrava ao alargar era «aberto», que não faz mal
     nenhum; o que sobrava era «fechado» — e acima dos 620 px o resumo está em
     `display: none`, portanto ficava um painel vazio de 34 px sem nada em que
     carregar. Visto no ecrã, a 1265 px.

     Só age quando o limiar é CRUZADO, para não desfazer a escolha de quem abriu
     o painel e depois arrastou a janela uns pixéis. E lê o `matches` dentro do
     resize em vez de escutar o evento `change` do matchMedia, que já se mediu
     neste projecto não ser de fiar. */
  (function () {
    var caixa = $('#procura-rapida'), btn = $('#procura-alternar');
    if (!caixa || !btn) return;

    function definir(fechado) {
      caixa.classList.toggle('fechado', fechado);
      btn.setAttribute('aria-expanded', fechado ? 'false' : 'true');
    }
    /* Fecha à chegada num ecrã estreito. Se este JS não correr, não há classe e
       o painel fica aberto — sem perder nada. */
    definir(window.matchMedia('(max-width: 620px)').matches);
    btn.addEventListener('click', function () {
      definir(!caixa.classList.contains('fechado'));
    });
  })();

  /* ------------------------------------------------- horário: marcar hoje */
  /* O texto dos dias é escrito à mão no backoffice, por isso não se confia em
     formato nenhum: se a linha não casar com nada de conhecido, não se marca
     nada. Errar a marcação seria pior do que não marcar — manda alguém ao
     stand num dia em que está fechado. */
  (function () {
    /* Por classe e não por id: o mesmo horário aparece na página inicial e nos
       contactos, e um id só marcaria um deles. */
    var listas = $$('.horario--visita');
    if (!listas.length) return;
    var hoje = new Date().getDay();               // 0 = domingo
    var nomes = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    /* `̀-ͯ` escrito em escapes e não com os acentos à solta: marcas
       combinatórias soltas num ficheiro são invisíveis no editor e já me
       partiram um regex neste projecto. */
    var semAcento = function (s) {
      return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };
    $$('.horario--visita li').forEach(function (li) {
      var t = semAcento(li.getAttribute('data-dias') || '');
      var casa = false;
      var intervalo = t.match(/(domingo|segunda|terca|quarta|quinta|sexta|sabado)[a-z\s-]*\sa\s(domingo|segunda|terca|quarta|quinta|sexta|sabado)/);
      if (intervalo) {
        var de = nomes.indexOf(intervalo[1]), ate = nomes.indexOf(intervalo[2]);
        if (de < 0 || ate < 0) return;
        /* A semana portuguesa começa na segunda; o getDay() começa no domingo.
           Percorre-se de `de` até `ate` dando a volta, o que cobre tanto
           «segunda a sexta» como «sexta a segunda». */
        for (var i = de; ; i = (i + 1) % 7) { if (i === hoje) casa = true; if (i === ate) break; }
      } else if (t.indexOf(nomes[hoje]) !== -1) {
        casa = true;
      }
      if (casa) { li.classList.add('hoje'); li.setAttribute('aria-current', 'date'); }
    });
  })();

  /* --------------------------------------------------- voltar ao topo */
  /* Aparece depois de um ecrã de descida e desaparece perto do topo, com uma
     folga entre os dois limiares para não piscar a cada roçar da roda — a mesma
     histerese do cabeçalho que encolhe. */
  (function () {
    var btn = $('#subir');
    if (!btn) return;
    var lento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dentro = false;
    function avaliar() {
      var y = window.scrollY || document.documentElement.scrollTop;
      if (!dentro && y > window.innerHeight) { dentro = true; btn.classList.add('subir--dentro'); }
      else if (dentro && y < window.innerHeight * 0.5) { dentro = false; btn.classList.remove('subir--dentro'); }
    }
    window.addEventListener('scroll', avaliar, { passive: true });
    window.addEventListener('resize', avaliar, { passive: true });
    avaliar();
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: lento ? 'auto' : 'smooth' });
      /* O foco tem de voltar ao princípio do documento: sem isto, quem navega
         por teclado carregava no botão, a página subia e o Tab seguinte
         continuava lá em baixo, de onde tinha vindo. */
      var alvo = $('#principal') || document.body;
      alvo.setAttribute('tabindex', '-1');
      alvo.focus({ preventScroll: true });
    });
  })();

  /* ------------------------------------------------------- consentimento */
  /* Este site não instala cookies. A única coisa que vem de fora é o mapa do
     Google, e é isso que esta escolha guarda. Aparece uma vez; a resposta fica
     no localStorage, não num cookie — seria irónico. */
  var CHAVE_MAPA = 'lr:mapa';
  function mapaAutorizado() {
    try { return localStorage.getItem(CHAVE_MAPA) === 'sim'; } catch (e) { return false; }
  }
  (function () {
    var barra = $('#cc-barra');
    if (!barra) return;

    var respondido;
    try { respondido = localStorage.getItem(CHAVE_MAPA) !== null; } catch (e) { respondido = true; }

    var lento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var aEsconder = null;

    function mostrarBarra() {
      clearTimeout(aEsconder);
      barra.hidden = false;
      document.body.classList.add('cc-visivel');
      /* O `hidden` sai primeiro e a classe só depois de um reflow: posta no
         mesmo quadro, o browser não vê estado nenhum de onde animar e a barra
         aparece de repente. É a mesma lição do menu de ecrã inteiro. */
      requestAnimationFrame(function () {
        void barra.offsetHeight;
        barra.classList.add('cc-barra--dentro');
      });
    }
    function esconderBarra() {
      barra.classList.remove('cc-barra--dentro');
      document.body.classList.remove('cc-visivel');
      /* `setTimeout` e não `transitionend`: se a transição não chegar a correr
         — separador em segundo plano — o evento nunca vinha e a barra ficava
         presa a apanhar cliques. */
      aEsconder = setTimeout(function () { barra.hidden = true; }, lento ? 0 : 320);
    }

    function guardar(v) {
      try { localStorage.setItem(CHAVE_MAPA, v); } catch (e) { }
      esconderBarra();
      if (v === 'sim') carregarMapa(); else descarregarMapa();
    }

    $('#cc-aceitar').addEventListener('click', function () { guardar('sim'); });
    $('#cc-recusar').addEventListener('click', function () { guardar('nao'); });

    /* «Preferências», no rodapé, faz reaparecer esta barra. Não há segundo
       ecrã: a decisão é a mesma e os botões são os mesmos. */
    $$('[data-cc-abrir]').forEach(function (b) {
      b.addEventListener('click', mostrarBarra);
    });

    /* Espera o primeiro pintar, para a barra não competir com o conteúdo a
       aparecer. Não tranca nada, por isso não há pressa nenhuma. */
    if (!respondido) setTimeout(mostrarBarra, 700);
  })();

  /* ------------------------------------------------------------- mapa */
  /* O aviso é GUARDADO em vez de deitado fora: quem desligar o mapa nas
     preferências, depois de o ter aceite, tem de voltar a ver o botão em vez de
     um buraco. Sem isto, desligar não desligava nada até recarregar a página. */
  var avisoMapa = null;
  function carregarMapa() {
    var caixa = $('#mapa');
    if (!caixa || caixa.querySelector('iframe')) return;
    var f = document.createElement('iframe');
    f.src = caixa.dataset.mapa;
    f.title = 'Mapa com a localização do stand LR Motors';
    f.loading = 'lazy';
    f.referrerPolicy = 'no-referrer-when-downgrade';
    f.allowFullscreen = true;
    var aviso = $('#mapa-consentimento');
    if (aviso) { avisoMapa = aviso; aviso.remove(); }
    caixa.appendChild(f);
  }
  function descarregarMapa() {
    var caixa = $('#mapa');
    if (!caixa) return;
    var f = caixa.querySelector('iframe');
    if (f) f.remove();
    if (avisoMapa && !$('#mapa-consentimento')) caixa.appendChild(avisoMapa);
  }
  (function () {
    var btn = $('#btn-mapa');
    if (btn) btn.addEventListener('click', function () {
      try { localStorage.setItem(CHAVE_MAPA, 'sim'); } catch (e) { }
      carregarMapa();
    });
    if (mapaAutorizado()) carregarMapa();
  })();



})();
