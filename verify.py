from pathlib import Path
import re
import json

root = Path(__file__).resolve().parent
dist = root / 'dist'
mobile = [
    '03-home-services/home-announcement-overview.jpg', '03-home-services/services-hub.jpg',
    '04-concerns/concern-center.jpg', '04-concerns/select-recipient-type.jpg', '04-concerns/my-concerns-in-progress.jpg',
    '06-announcements/community-updates-feed.jpg', '07-calendar/calendar-upcoming-event.jpg',
    '08-emergencies/emergency-center-all-clear.jpg', '08-emergencies/emergency-hotlines.jpg',
    '09-bayanihan/help-requests-feed.jpg', '10-local-market/market-listings-feed.jpg',
    '12-explore-directions/explore-barili-destinations.jpg', '13-weather/current-weather-and-forecast.jpg',
    '14-officials-organizations/municipal-officials.jpg', '14-officials-organizations/my-barangay-announcements.jpg',
    '15-ai-assistant/assistant-quick-answers-and-navigation.jpg', '18-carabao-game/carabao-runner-start.jpg'
]
admin = [
    '01-dashboard/barangay-dashboard.png', '02-concerns/concerns-active-category-summary.png',
    '04-emergencies/alert-editor-step-01-category.png', '04-emergencies/alert-editor-step-02-message.png',
    '04-emergencies/alert-editor-step-03-audience-schedule.png', '06-announcements/announcements-published-list.png',
    '07-resident-verification/resident-verification-empty-pending-queue.png', '09-people/barangay-team-directory.png',
    '11-reports/barangay-operational-report.png'
]
used = {(dist / 'screens' / 'mobile' / p).resolve() for p in mobile}
used.update((dist / 'screens' / 'admin' / p).resolve() for p in admin)
assert all(p.is_file() for p in used), 'A required screenshot is missing'
for screenshot in (dist / 'screens').rglob('*'):
    if screenshot.is_file() and screenshot.resolve() not in used:
        assert screenshot.resolve().is_relative_to((root / 'dist' / 'screens').resolve())
        screenshot.unlink()  # Remove only unused runtime copies; source screenshots are preserved.
for p in used:
    source = root.parent / 'assets' / 'screenshots' / p.relative_to(dist / 'screens')
    assert p.read_bytes() == source.read_bytes(), f'Altered screenshot: {p.name}'
html = (dist / 'index.html').read_text(encoding='utf-8')
for target in re.findall(r'(?:src|href)="([^"#]+)"', html):
    if target.startswith(('http:', 'https:')):
        continue
    assert (dist / target).is_file(), f'Missing resource: {target}'
css = (dist / 'style.css').read_text(encoding='utf-8')
for target in re.findall(r'url\(([^)]+)\)', css):
    assert (dist / target).is_file(), f'Missing font: {target}'
for required in ['media/community.mp4', 'media/community-poster.png', 'vendor/three.module.js', 'vendor/three.core.js', 'vendor/LICENSE.txt']:
    assert (dist / required).is_file()
times = re.findall(r"section\('[^']+','[^']+','(\d+:\d+)'", (dist / 'app.js').read_text(encoding='utf-8'))
times += re.findall(r'data-time="(\d+:\d+)"', html)
seconds = sum(int(t.split(':')[0]) * 60 + int(t.split(':')[1]) for t in times)
assert len(times) == 13 and seconds == 805, (len(times), seconds)
print(json.dumps({'screenshots': len(used), 'unaltered': True, 'chapter_count': len(times), 'planned_minutes': '13:25', 'asset_checks': 'passed'}))
