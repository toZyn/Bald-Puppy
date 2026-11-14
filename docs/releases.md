# Releases de Bald Puppy

El workflow **Bald Puppy release** compila el proyecto y publica un GitHub Release al subir un tag `v<versión>`. Usa runners públicos de GitHub, sin servidores privados, certificados de firma ni tokens personales. Solo el trabajo final tiene permiso para escribir el release.

## Publicar una versión

1. Actualiza `VERSION` con una versión SemVer, por ejemplo `0.1.1`.
2. Añade una sección `## 0.1.1 - AAAA-MM-DD` en `CHANGELOG.md` y escribe los cambios de esa versión. `Unreleased` no se publica como changelog de una versión.
3. Integra el commit en `main` y crea el tag sobre ese commit:

```bash
git switch main
git pull --ff-only
git tag -a v0.1.1 -m "Bald Puppy 0.1.1"
git push origin v0.1.1
```

Para la primera publicación, el repositorio queda preparado con `VERSION=0.1.0` y su sección en el changelog. Tras integrar el workflow, crea y sube `v0.1.0` sobre ese commit.

También puedes ejecutar **Actions → Bald Puppy release → Run workflow**, indicando un tag que ya exista. No crea tags ni inventa números de versión. El tag, `VERSION`, el changelog y el commit de checkout deben coincidir. Los tags como `v0.2.0-rc.1` generan un _prerelease_.

`VERSION` es la versión de distribución: se guarda en `codex-package.json` y se comprueba ejecutando `bin/codex --version` desde el paquete. El workflow sella también la versión del workspace en la copia de compilación del runner, para que el `--version` compilado coincida. Refresca las versiones internas del lockfile sin acceso a la red y comprueba que ninguna dependencia externa cambió. Los manifests originales del tag conservan sus versiones de desarrollo.

## Sistemas y arquitecturas

| Sistema             | Arquitectura    | Target                       |
| ------------------- | --------------- | ---------------------------- |
| Linux GNU           | x86_64 / AMD64  | `x86_64-unknown-linux-gnu`   |
| Linux GNU           | ARM64 / aarch64 | `aarch64-unknown-linux-gnu`  |
| Linux musl          | x86_64 / AMD64  | `x86_64-unknown-linux-musl`  |
| Linux musl          | ARM64 / aarch64 | `aarch64-unknown-linux-musl` |
| macOS Intel         | x86_64          | `x86_64-apple-darwin`        |
| macOS Apple Silicon | ARM64 / aarch64 | `aarch64-apple-darwin`       |
| Windows             | x86_64 / AMD64  | `x86_64-pc-windows-msvc`     |
| Windows             | ARM64 / aarch64 | `aarch64-pc-windows-msvc`    |

Todos los paquetes contienen binarios nativos para el sistema que indica su nombre. **No se incluye PRoot, ninguna distribución Linux, un emulador ni un APK.** Los ejecutables GNU se compilan en Ubuntu 24.04 y requieren una glibc y bibliotecas del sistema compatibles; para otras distribuciones Linux se recomienda musl. Los binarios macOS y Windows no están firmados con certificados comerciales ni notarizados.

Android/Bionic y ARM de 32 bits **no están en esta matriz**. No hay un par de artefactos V8 verificados para esos targets en el proyecto actual; el build de V8 desde fuentes incluye pasos para Android de 64 bits, pero eso no demuestra que el agente completo compile y funcione allí. Incorporarlos requiere preparar y validar el port nativo y sus dependencias. Un binario Linux ARM64 no se etiqueta como Android.

## Archivos adjuntos

Cada uno de los ocho targets produce los tres formatos `.tar.gz`, `.tar.xz` y `.zip`, con nombres como:

```text
bald-puppy-0.1.0-aarch64-unknown-linux-musl.tar.gz
bald-puppy-0.1.0-x86_64-pc-windows-msvc.zip
```

Los archivos comprimidos contienen el ejecutable `bin/codex` o `bin/codex.exe`, sus procesos auxiliares, los recursos de sandbox propios del agente y ripgrep. Conserva la estructura completa al extraerlos. No es necesario compilar en el dispositivo del usuario. Se conservan los nombres internos `codex` para respetar las rutas que usa el runtime.

El release también adjunta:

- `CHANGELOG-v<versión>.md`, con los cambios de esa versión e instrucciones de descarga.
- `RELEASE.json`, con versión, commit, targets, tamaño y SHA-256 de los paquetes.
- `SHA256SUMS`, para verificar todos los archivos anteriores.

GitHub añade automáticamente los enlaces a archivos fuente del tag. El workflow no adjunta sistemas operativos ni imágenes de entornos.

En Linux, verifica la descarga antes de extraer:

```bash
sha256sum --ignore-missing --check SHA256SUMS
tar -xzf bald-puppy-0.1.0-aarch64-unknown-linux-musl.tar.gz
./bin/codex --version
./bin/codex
```

## Comprobaciones y reintentos

El workflow comprueba SemVer, el changelog y el commit exacto del tag. Compila con `cargo build --locked`, descarga el par V8 y ripgrep con sus checksums y monta el paquete completo. En Linux, el digest de `bwrap` se calcula después de quitar símbolos y antes de compilar el agente que lo comprueba. Cada runner ejecuta el `--version` del paquete y de ripgrep en su arquitectura nativa.

La publicación exige **los 24 archivos comprimidos**. También inspecciona sus metadatos y los auxiliares obligatorios. Los archivos se suben primero a un borrador; se verifican el inventario y los tamaños recibidos, además de los digests cuando la API los proporciona. Solo entonces se publica el release. Una compilación fallida impide publicar una distribución incompleta.

Puedes reintentar una ejecución fallida. Un borrador incompleto se puede completar; un release ya publicado no se sobrescribe. Para modificar una versión pública, publica un nuevo número de versión.

Las pruebas rápidas del mecanismo están en **Bald Puppy release checks**. Ejecutarlas localmente no compila las ocho plataformas:

```bash
python3 -m unittest discover -s scripts/release -p 'test_*.py'
```

El workflow heredado `rust-release.yml` sigue usando los tags `rust-v*` y su infraestructura upstream. Para Bald Puppy usa exclusivamente los tags `v*` descritos aquí.
