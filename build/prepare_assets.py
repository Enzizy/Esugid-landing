"""Prepare runtime assets for the E-sugid showcase.

Run with the bundled Python (needs Pillow):
    python -I build/prepare_assets.py

* Copies the reviewed screenshots byte-for-byte (evidence views use these originals).
* Writes resized derivatives for thumbnails and WebGL textures (decorative use only).
* Converts the app's PSA barangay boundaries into projected kilometre coordinates.
* Copies fonts and the logo from the read-only app source.

Nothing in the Flutter project or the screenshot collection is modified.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import shutil
from pathlib import Path

from PIL import Image

SITE = Path(__file__).resolve().parents[1]
WORKSPACE = SITE.parent
DIST = SITE / 'dist'
ASSETS = DIST / 'assets'
SHOTS = WORKSPACE / 'assets' / 'screenshots'
APP = Path(r'E:\Download\esugid')

# Screens used by the showcase. Excluded on purpose:
#   mobile/01-onboarding-auth/login.jpg            -> shows a personal e-mail address
#   admin/03-complaints/complaints-hearing-queue.png -> shows names in a private dispute
MOBILE = {
    'home': '03-home-services/home-announcement-overview.jpg',
    'services': '03-home-services/services-hub.jpg',
    'concern-center': '04-concerns/concern-center.jpg',
    'concern-recipient': '04-concerns/select-recipient-type.jpg',
    'concern-mine': '04-concerns/my-concerns-in-progress.jpg',
    'concern-board': '04-concerns/barangay-public-reports.jpg',
    'complaint-form': '05-complaints/complaint-form.jpg',
    'updates-feed': '06-announcements/community-updates-feed.jpg',
    'calendar': '07-calendar/calendar-upcoming-event.jpg',
    'emergency-center': '08-emergencies/emergency-center-all-clear.jpg',
    'hotlines': '08-emergencies/emergency-hotlines.jpg',
    'bayanihan': '09-bayanihan/help-requests-feed.jpg',
    'market': '10-local-market/market-listings-feed.jpg',
    'map': '11-map/barangay-map-current-location.jpg',
    'explore': '12-explore-directions/explore-barili-destinations.jpg',
    'navigation': '12-explore-directions/mantayupan-motorcycle-navigation.jpg',
    'weather': '13-weather/current-weather-and-forecast.jpg',
    'officials': '14-officials-organizations/municipal-officials.jpg',
    'barangay-feed': '14-officials-organizations/my-barangay-announcements.jpg',
    'assistant': '15-ai-assistant/assistant-quick-answers-and-navigation.jpg',
    'carabao': '18-carabao-game/carabao-runner-start.jpg',
}
ADMIN = {
    'a-dashboard': '01-dashboard/barangay-dashboard.png',
    'a-concerns': '02-concerns/concerns-active-category-summary.png',
    'a-alert-1': '04-emergencies/alert-editor-step-01-category.png',
    'a-alert-2': '04-emergencies/alert-editor-step-02-message.png',
    'a-alert-3': '04-emergencies/alert-editor-step-03-audience-schedule.png',
    'a-emergencies': '04-emergencies/emergency-alerts-all-clear.png',
    'a-announcements': '06-announcements/announcements-published-list.png',
    'a-verification': '07-resident-verification/resident-verification-empty-pending-queue.png',
    'a-team': '09-people/barangay-team-directory.png',
    'a-reports': '11-reports/barangay-operational-report.png',
    'a-logs': '12-system-logs/barangay-system-logs.png',
}
# Screens drawn on the 3D phone and in the closing ring (resized copies, embedded as data URIs
# so WebGL can use them even when index.html is opened straight from disk).
PHONE_TEXTURES = ['home', 'services', 'concern-center']
RING = ['home', 'services', 'concern-center', 'concern-recipient', 'concern-mine', 'updates-feed',
        'calendar', 'emergency-center', 'hotlines', 'bayanihan', 'market', 'map', 'explore',
        'navigation', 'weather', 'officials', 'barangay-feed', 'assistant']
RING_ADMIN = ['a-dashboard', 'a-concerns', 'a-announcements', 'a-alert-3', 'a-reports', 'a-logs']

FONTS = ['Outfit-Regular.ttf', 'Outfit-Medium.ttf', 'Outfit-SemiBold.ttf', 'Outfit-Bold.ttf',
         'Outfit-ExtraBold.ttf', 'RobotoMono-Medium.ttf']


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def copy_unaltered() -> dict:
    out = {}
    for group, table, folder in (('mobile', MOBILE, 'mobile'), ('admin', ADMIN, 'admin')):
        for key, rel in table.items():
            src = SHOTS / folder / rel
            name = rel.split('/')[-1]
            dst = ASSETS / 'img' / 'screens' / folder / name
            shutil.copyfile(src, dst)
            assert sha(src) == sha(dst), f'copy mismatch {src}'
            with Image.open(dst) as im:
                w, h = im.size
            out[key] = {'src': f'assets/img/screens/{folder}/{name}', 'w': w, 'h': h,
                        'group': group, 'origin': f'assets/screenshots/{folder}/{rel}'}
    return out


def thumbs(index: dict) -> None:
    for key, meta in index.items():
        src = DIST / meta['src']
        with Image.open(src) as im:
            im = im.convert('RGB')
            if meta['group'] == 'mobile':
                im.thumbnail((360, 820), Image.LANCZOS)
            else:
                im.thumbnail((720, 400), Image.LANCZOS)
            dst = ASSETS / 'img' / 'thumbs' / f'{key}.jpg'
            im.save(dst, 'JPEG', quality=84, optimize=True, progressive=True)
            meta['thumb'] = f'assets/img/thumbs/{key}.jpg'


def data_uri(path: Path, box: tuple[int, int], quality: int) -> str:
    with Image.open(path) as im:
        im = im.convert('RGB')
        im.thumbnail(box, Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=quality, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def textures(index: dict) -> None:
    tex = {'phone': {}, 'ring': []}
    for key in PHONE_TEXTURES:
        tex['phone'][key] = data_uri(DIST / index[key]['src'], (720, 1640), 86)
    for key in RING:
        tex['ring'].append({'key': key, 'kind': 'mobile', 'uri': data_uri(DIST / index[key]['src'], (300, 684), 80)})
    for key in RING_ADMIN:
        tex['ring'].append({'key': key, 'kind': 'admin', 'uri': data_uri(DIST / index[key]['src'], (640, 344), 80)})
    js = '/* Generated by build/prepare_assets.py: resized copies of actual screenshots for WebGL. */\n'
    js += 'window.ESUGID_TEX = ' + json.dumps(tex, separators=(',', ':')) + ';\n'
    (ASSETS / 'js' / 'data' / 'textures.js').write_text(js, encoding='utf-8')


def geo() -> None:
    src = APP / 'assets' / 'data' / 'barili_barangay_boundaries.geojson'
    data = json.loads(src.read_text(encoding='utf-8'))
    feats = data['features']
    lons = [x for f in feats for x, _ in f['geometry']['coordinates'][0]]
    lats = [y for f in feats for _, y in f['geometry']['coordinates'][0]]
    lon0 = (min(lons) + max(lons)) / 2
    lat0 = (min(lats) + max(lats)) / 2
    kx = 111.320 * math.cos(math.radians(lat0))
    ky = 110.574

    def proj(lon, lat):
        # x = east (km), y = north (km); rendered later with north pointing away from the viewer.
        return round((lon - lon0) * kx, 4), round((lat - lat0) * ky, 4)

    out = []
    for f in feats:
        assert f['geometry']['type'] == 'Polygon'
        ring = [proj(x, y) for x, y in f['geometry']['coordinates'][0]]
        if ring[0] == ring[-1]:
            ring = ring[:-1]
        # polygon centroid (shoelace)
        a = cx = cy = 0.0
        for i in range(len(ring)):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % len(ring)]
            c = x1 * y2 - x2 * y1
            a += c
            cx += (x1 + x2) * c
            cy += (y1 + y2) * c
        a *= 0.5
        cx /= (6 * a)
        cy /= (6 * a)
        p = f['properties']
        out.append({'name': p['brgy_name'], 'code': p['psgc_10d'], 'area': round(p['bgyarea_sqkm'], 2),
                    'c': [round(cx, 4), round(cy, 4)], 'ring': ring})

    # Westmost boundary point per latitude band: an approximation of the coastline (sea lies west).
    pts = [pt for b in out for pt in b['ring']]
    ys = [y for _, y in pts]
    lo, hi = min(ys), max(ys)
    bands = 36
    coast = []
    for i in range(bands + 1):
        y0 = lo + (hi - lo) * (i - 0.5) / bands
        y1 = lo + (hi - lo) * (i + 0.5) / bands
        sel = [pt for pt in pts if y0 <= pt[1] <= y1]
        if sel:
            coast.append(min(sel, key=lambda q: q[0]))
    meta = {k: v for k, v in data.items() if k != 'features'}
    payload = {'meta': meta, 'origin': [lon0, lat0], 'barangays': out, 'coast': coast}
    js = '/* Generated by build/prepare_assets.py from the app\'s assets/data/barili_barangay_boundaries.geojson. */\n'
    js += 'window.ESUGID_GEO = ' + json.dumps(payload, separators=(',', ':')) + ';\n'
    (ASSETS / 'js' / 'data' / 'barili.js').write_text(js, encoding='utf-8')
    print('barangays', len(out), 'coast pts', len(coast))


def fonts_and_brand() -> None:
    for f in FONTS:
        shutil.copyfile(APP / 'assets' / 'fonts' / f, ASSETS / 'fonts' / f)
    logo = WORKSPACE / 'assets' / 'references' / '01-brand' / 'esugid-logo.png'
    shutil.copyfile(logo, ASSETS / 'img' / 'brand' / 'esugid-logo.png')
    with Image.open(logo) as im:
        im = im.convert('RGBA')
        im.thumbnail((192, 192), Image.LANCZOS)
        im.save(ASSETS / 'img' / 'brand' / 'esugid-logo-192.png', optimize=True)
        im2 = im.copy()
        im2.thumbnail((64, 64), Image.LANCZOS)
        im2.save(ASSETS / 'img' / 'brand' / 'favicon.png', optimize=True)


def main() -> None:
    index = copy_unaltered()
    thumbs(index)
    textures(index)
    geo()
    fonts_and_brand()
    js = '/* Generated by build/prepare_assets.py. Evidence screenshots are byte-identical copies. */\n'
    js += 'window.ESUGID_SCREENS = ' + json.dumps(index, separators=(',', ':')) + ';\n'
    (ASSETS / 'js' / 'data' / 'screens.js').write_text(js, encoding='utf-8')
    (SITE / 'build' / 'screens-manifest.json').write_text(json.dumps(
        {k: {**v, 'sha256': sha(DIST / v['src'])} for k, v in index.items()}, indent=2), encoding='utf-8')
    print('screens', len(index))


if __name__ == '__main__':
    main()
