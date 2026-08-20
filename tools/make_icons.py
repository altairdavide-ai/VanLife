#!/usr/bin/env python3
"""Genera le icone PNG dell'app senza dipendenze esterne.

Uso: python3 tools/make_icons.py
Scrive icons/icon-192.png, icons/icon-512.png, icons/maskable-512.png, icons/favicon-64.png
"""
import os
import struct
import zlib

BG = (7, 11, 15)
PANEL = (14, 21, 28)
AMBER = (255, 176, 32)
CYAN = (53, 214, 229)


def blank(size, color):
    return [[color for _ in range(size)] for _ in range(size)]


def rect(px, x0, y0, x1, y1, color, radius=0):
    size = len(px)
    for y in range(max(0, int(y0)), min(size, int(y1))):
        for x in range(max(0, int(x0)), min(size, int(x1))):
            if radius:
                cx = min(max(x, x0 + radius), x1 - radius)
                cy = min(max(y, y0 + radius), y1 - radius)
                if (x - cx) ** 2 + (y - cy) ** 2 > radius * radius:
                    continue
            px[y][x] = color


def ring(px, cx, cy, r, width, color):
    size = len(px)
    inner = (r - width) ** 2
    outer = r * r
    for y in range(max(0, int(cy - r - 1)), min(size, int(cy + r + 2))):
        for x in range(max(0, int(cx - r - 1)), min(size, int(cx + r + 2))):
            d = (x - cx) ** 2 + (y - cy) ** 2
            if inner <= d <= outer:
                px[y][x] = color


def disc(px, cx, cy, r, color):
    ring(px, cx, cy, r, r, color)


def draw_van(px, size, bg):
    u = size / 100.0          # unita' relativa
    body_top = 40 * u
    body_bot = 68 * u
    # corpo
    rect(px, 16 * u, body_top, 84 * u, body_bot, AMBER, radius=6 * u)
    # cabina inclinata (togliamo l'angolo in alto a sinistra)
    for y in range(int(body_top), int(48 * u)):
        cut = (48 * u - y) * 0.9
        for x in range(int(16 * u), int(16 * u + cut)):
            if 0 <= y < size and 0 <= x < size:
                px[y][x] = bg
    # finestrino
    rect(px, 22 * u, 45 * u, 38 * u, 55 * u, bg, radius=2 * u)
    # oblo'/tetto
    rect(px, 44 * u, 33 * u, 66 * u, 40 * u, CYAN, radius=2 * u)
    # ruote
    disc(px, 32 * u, 70 * u, 9 * u, bg)
    disc(px, 70 * u, 70 * u, 9 * u, bg)
    disc(px, 32 * u, 70 * u, 6 * u, AMBER)
    disc(px, 70 * u, 70 * u, 6 * u, AMBER)
    disc(px, 32 * u, 70 * u, 2.5 * u, bg)
    disc(px, 70 * u, 70 * u, 2.5 * u, bg)


def build(size, maskable=False):
    px = blank(size, BG if maskable else (0, 0, 0))
    if maskable:
        rect(px, 0, 0, size, size, BG)
    else:
        # sfondo trasparente fuori dal rounded rect: lo simuliamo con alpha
        rect(px, 0, 0, size, size, BG, radius=size * 0.22)
    pad = size * 0.14 if maskable else 0
    inner = size - 2 * pad
    sub = blank(int(inner), BG)
    ring(sub, inner / 2, inner / 2, inner * 0.46, inner * 0.035, CYAN)
    draw_van(sub, int(inner), BG)
    for y in range(int(inner)):
        for x in range(int(inner)):
            px[int(pad) + y][int(pad) + x] = sub[y][x]
    return px


def write_png(path, px, rounded=0.0):
    size = len(px)
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            r, g, b = px[y][x]
            a = 255
            if rounded:
                rad = size * rounded
                cx = min(max(x, rad), size - rad)
                cy = min(max(y, rad), size - rad)
                if (x - cx) ** 2 + (y - cy) ** 2 > rad * rad:
                    a = 0
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(path, len(png), 'bytes')


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, 'icons')
    os.makedirs(out, exist_ok=True)
    for s in (192, 512):
        write_png(os.path.join(out, 'icon-%d.png' % s), build(s), rounded=0.22)
    write_png(os.path.join(out, 'maskable-512.png'), build(512, maskable=True))
    write_png(os.path.join(out, 'favicon-64.png'), build(64), rounded=0.22)


if __name__ == '__main__':
    main()
