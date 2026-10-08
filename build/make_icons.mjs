// Builds an inline SVG <symbol> sprite from the bundled Lucide icons (ISC licence).
//   node build/make_icons.mjs > build/icons.svg.html
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const base = 'C:/Users/joynoinc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/lucide/dist/cjs/lucide.js';
const lucide = require(base);
const want = {
  'arrow-right': 'ArrowRight', 'arrow-left': 'ArrowLeft', 'chevron-down': 'ChevronDown', 'play': 'Play', 'list': 'ListOrdered',
  'library': 'LibraryBig', 'notes': 'NotebookPen', 'motion': 'Wind', 'static': 'Layers', 'fullscreen': 'Maximize', 'close': 'X',
  'phone': 'Smartphone', 'monitor': 'MonitorSmartphone', 'barangay': 'House', 'landmark': 'Landmark', 'users': 'Users',
  'shield': 'ShieldCheck', 'bell': 'BellRing', 'megaphone': 'Megaphone', 'calendar': 'CalendarDays', 'map': 'Map',
  'compass': 'Compass', 'cloud': 'CloudSun', 'sparkles': 'Sparkles', 'heart-hand': 'HandHeart', 'store': 'Store',
  'lock': 'LockKeyhole', 'check': 'Check', 'clock': 'Clock3', 'database': 'Database', 'server': 'Server', 'key': 'KeyRound',
  'search': 'Search', 'file': 'FileText', 'log': 'ScrollText', 'chart': 'ChartLine', 'pending': 'Hourglass',
  'route': 'Route', 'alert': 'TriangleAlert', 'siren': 'Siren', 'message': 'MessagesSquare', 'flask': 'FlaskConical',
  'target': 'Target', 'layers': 'Layers3', 'zoom': 'ZoomIn', 'timer': 'Timer', 'presenter': 'Presentation', 'external': 'SquareArrowOutUpRight',
  'help': 'Keyboard', 'gavel': 'Gavel', 'id': 'IdCard', 'cpu': 'Cpu', 'mail': 'Mail', 'smartphone-up': 'SendHorizontal', 'refresh': 'RotateCcw',
  'eye-off': 'EyeOff', 'info': 'Info', 'pin': 'MapPin', 'flame': 'Flame', 'droplets': 'Droplets', 'building': 'Building2', 'pause': 'Pause', 'blackout': 'MonitorOff'
};
const toSvg = (node) => node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
let out = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n';
const missing = [];
for (const [id, name] of Object.entries(want)) {
  const icon = lucide.icons?.[name] ?? lucide[name];
  if (!icon) { missing.push(name); continue; }
  const nodes = icon;
  out += `<symbol id="i-${id}" viewBox="0 0 24 24">${toSvg(nodes)}</symbol>\n`;
}
out += '</svg>';
if (missing.length) console.error('MISSING', missing.join(','));
console.log(out);
