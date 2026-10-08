# E-SUGID interactive thesis showcase

The finished static application is in `dist/`. All imagery, fonts, the community video, and the Three.js renderer are local, so the presentation can work without an Internet connection when served locally. It has no connection to the live Firebase application.

## Preview

Run `START_PREVIEW.ps1` in PowerShell, then open http://127.0.0.1:5173/ in a browser. Keep the PowerShell session running. Stop it with Ctrl+C when finished.

## Defense

Choose **Defense mode** or **Begin the defense**. The 13 chapter allocations total **13:25**. Use Previous/Next, the chapter picker, or Left/Right / Page Up/Page Down. Space also advances when the focused control does not consume it. Escape exits. The timer starts when defense mode starts; presenter notes are available on larger screens. In defense mode the phone stays front-facing. Pause Motion also stops the opening video and device animation; reduced-motion preferences are respected.

The screenshot tabs and galleries present captured app interfaces. They do not submit concerns, publish announcements, or send alerts.

## Content still to finalize

- Approved problem and objective wording, team/institution/adviser/date.
- Actual evaluation procedure and results.
- A matched concern submission → staff reply → resident timeline → resolution capture sequence.
- A verified custom cloud assistant response capture.
- Screenshot/brand/location permissions and personal information review before wider sharing.

The proposed research content comes from `../docs/RESEARCH_CONTENT_DRAFT.md`. Admin captures show a Barangay Captain. Dashboard counts are operational records, not evaluation findings.

Source screenshots remain in `../assets/screenshots/`. The runtime uses a curated copy under `dist/screens/`. The login and private complaint captures are excluded from the shipped site. Assets are not redrawn or altered.

Three.js 0.180.0 is vendored under `dist/vendor/` with its MIT license. Fonts and the logo are copied from the app's resources. The video and poster come from the supplied generated community clip.
