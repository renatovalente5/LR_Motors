#!/usr/bin/env bash
# =============================================================
# PROVA DE QUE UMA MUDANÇA NÃO MEXE NO SITE: gera o _site de duas versões
# do repositório e compara-as com diff -r.
#
#   .github/comparar-site.sh [<versão-a> [<versão-b>]]   (por omissão: main e HEAD)
#
# Cada versão sai do git (git archive, para uma pasta temporária: nem o
# repositório nem o _site de quem corre isto mudam) e passa pelos passos do
# publicar.yml DESSA versão que mexem nos dados, pela ordem de lá:
#   · «Conferir o conteúdo» (a guarda), se a versão a tiver;
#   · «Arrumar as viaturas vendidas»;
#   · «Preparar a cópia que o gerador lê», se a versão a tiver;
#   · «Gerar o site», com o BASE e o SITE do env: desse passo.
# Não prepara as fotografias: é o mesmo script nas duas versões, e as geradas
# estão no repositório. O relógio fica parado nas duas (o rodapé diz a hora
# da publicação, e o sitemap a data).
#
# Sai com 0 se os dois _site forem iguais byte a byte; com 1, e o diff, se não.
# =============================================================
set -euo pipefail
A="${1:-main}"
B="${2:-HEAD}"
RAIZ="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
T="$(mktemp -d "${TMPDIR:-/tmp}/comparar-site.XXXXXX")"
trap 'rm -rf "$T"' EXIT

cat > "$T/relogio.mjs" <<'JS'
const PARADO = Date.parse('2026-10-01T12:00:00Z');
const Verdadeiro = Date;
globalThis.Date = class extends Verdadeiro {
  constructor(...a) { super(...(a.length ? a : [PARADO])); }
  static now() { return PARADO; }
};
JS

# O valor de uma variável no env: do passo «Gerar o site» (sem as aspas).
env_do_gerar() {
  awk -v v="$1" '
    /^      - name: Gerar o site$/ { dentro = 1; next }
    dentro && /^      - / { exit }
    dentro && $1 == v ":" { sub(/^[^:]*: */, ""); gsub(/^\x27|\x27$/, ""); gsub(/^"|"$/, ""); print; exit }
  ' .github/workflows/publicar.yml
}
tem_passo() { grep -q "^      - name: $1\$" .github/workflows/publicar.yml; }

gerar() {   # gerar <versão> <pasta>
  local versao="$1" pasta="$2"
  mkdir -p "$pasta"
  git -C "$RAIZ" archive "$versao" | tar -x -C "$pasta"
  (
    cd "$pasta"
    if tem_passo 'Conferir o conteúdo'; then node .github/guardas.mjs > "$T/guarda-$(basename "$pasta").txt"; fi
    node scripts/arrumar-vendidas.mjs
    if tem_passo 'Preparar a cópia que o gerador lê'; then GITHUB_ACTIONS=true node .github/guardas.mjs --neutralizar . >> "$T/guarda-$(basename "$pasta").txt"; fi
    BASE="$(env_do_gerar BASE)" SITE="$(env_do_gerar SITE)" node --import "$T/relogio.mjs" scripts/gerar.mjs
    echo "  com BASE='$(env_do_gerar BASE)' SITE='$(env_do_gerar SITE)'"
  )
}

echo "== $A ($(git -C "$RAIZ" rev-parse --short "$A"))"
gerar "$A" "$T/a"
echo "== $B ($(git -C "$RAIZ" rev-parse --short "$B"))"
gerar "$B" "$T/b"
for lado in a b; do
  if [ -f "$T/guarda-$lado.txt" ]; then echo "guarda em $lado: $(grep '^Guarda do conteúdo:' "$T/guarda-$lado.txt"); $(grep -c 'nada a neutralizar' "$T/guarda-$lado.txt") × «nada a neutralizar»"; fi
done

n=$(find "$T/a/_site" -type f | wc -l | tr -d ' ')
bytes=$(du -sk "$T/a/_site" | cut -f1)
if diff -r "$T/a/_site" "$T/b/_site" > "$T/diff.txt"; then
  echo "IGUAL: os dois _site têm os mesmos $n ficheiros, byte a byte (${bytes} KB)"
else
  echo "DIFERENTE:"; head -100 "$T/diff.txt"; exit 1
fi
