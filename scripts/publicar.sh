#!/usr/bin/env bash
# Compila la web con los datos de web/public/datos y la publica en la rama gh-pages.
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
remoto="$(git -C "$raiz" remote get-url origin)"
nombre="$(git -C "$raiz" config user.name)"
correo="$(git -C "$raiz" config user.email)"

test -f "$raiz/web/public/datos/catalogo.json" || {
  echo "Faltan los datos: ejecutá canasta-etl primero." >&2
  exit 1
}

(cd "$raiz/web" && npx ng build --base-href /canasta-uy/)
salida="$raiz/web/dist/web/browser"
cp "$salida/index.html" "$salida/404.html" # GitHub Pages: abrir directo una ruta de la web
touch "$salida/.nojekyll"

temporal="$(mktemp -d)"
trap 'rm -rf "$temporal"' EXIT
cp -r "$salida/." "$temporal/"
cd "$temporal"
git init -q -b gh-pages
git config user.name "$nombre"
git config user.email "$correo"
git add -A
git commit -q -m "Publica la web de Canasta UY"
git push -q --force "$remoto" gh-pages
echo "Publicado en la rama gh-pages."
