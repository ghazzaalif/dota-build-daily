// Turns the single-file build into a page fragment for hosts that supply their own
// <html>/<head>/<body> skeleton (e.g. a claude.ai artifact preview).
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-single/index.html', 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = src.match(/<body>([\s\S]*?)<\/body>/)[1];
const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const rest = head
  .replace(title, '')
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
writeFileSync('dist-single/preview.html', `${title}\n${rest.trim()}\n${body.trim()}\n`);
console.log('dist-single/preview.html written');
