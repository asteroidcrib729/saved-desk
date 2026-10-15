#!/usr/bin/env bash
# Standalone GPL-3.0-or-later tools. No FFmpeg library is linked into SavedDesk.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
export PATH="$ROOT/.tooling/ffmpeg-build/w64devkit/bin:$ROOT/.tooling/ffmpeg-build/nasm/nasm-2.16.03:$PATH"
export LC_ALL=C
export SOURCE_DATE_EPOCH=1789689600
PREFIX="$(cygpath -m "$ROOT/.cache/store-remediation/media-prefix")"
export PKG_CONFIG_PATH="$(cygpath -m "$PREFIX/lib/pkgconfig")"
export PKG_CONFIG_LIBDIR="$PKG_CONFIG_PATH"
mkdir -p "$PREFIX"
export PYTHONPATH="$(cygpath -m "$ROOT/.tooling/ffmpeg-build/meson")"
PYTHON="$ROOT/.venv/Scripts/python.exe"
DAV1D="$(cygpath -m "$ROOT/.cache/store-remediation/build/dav1d-1.5.3")"
export CC="$(cygpath -m "$ROOT/.tooling/ffmpeg-build/w64devkit/bin/gcc.exe")" AR="$(cygpath -m "$ROOT/.tooling/ffmpeg-build/w64devkit/bin/ar.exe")"
meson() { PATH="/usr/bin:$PATH" "$PYTHON" -m mesonbuild.mesonmain "$@"; }
meson setup "$DAV1D/build" "$DAV1D" --prefix="$PREFIX" --libdir=lib --buildtype=release --default-library=static -Denable_tools=false -Denable_tests=false -Denable_examples=false
meson compile -C "$DAV1D/build" -j4
meson install -C "$DAV1D/build"
cd "$ROOT/.cache/store-remediation/build/x264-c24e06c2e184345ceb33eb20a15d1024d9fd3497"
./configure --host=x86_64-w64-mingw32 --prefix="$PREFIX" --enable-static --disable-cli --disable-opencl --bit-depth=8 --chroma-format=420
make -j4 V=1
make install
cd "$ROOT/.cache/store-remediation/build/ffmpeg-9.0.2"
./configure --target-os=mingw32 --arch=x86_64 --cc=gcc --cxx=g++ --ar=ar --ranlib=ranlib --strip=strip --pkg-config=pkg-config --prefix="$PREFIX" --disable-autodetect --enable-network --enable-schannel --disable-doc --disable-debug --disable-ffplay --disable-shared --enable-static --enable-gpl --enable-version3 --enable-libx264 --enable-libdav1d --enable-w32threads --disable-pthreads --disable-mediafoundation --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib"
make -j4 V=1
make install
