// The lint as part of the work, not a step to remember (wcstack docs/verification-practices-study.md §2.2).
//
// The skill says the lint is a completion gate (SKILL.md §5), and a MUST in a document is only an instruction:
// AI authors without the skill ran the lint in 0 of 9 cold-start runs. In Claude Code the plugin can run it:
//
//   post  (PostToolUse on Write / Edit): a page Claude wrote that wcstack binds — an .html with data-wcs, a
//         wcs-* tag or a wcstack script, or a wcstack.manifest.json — is linted at once, and what the lint
//         says comes back to Claude as context. Errors are to be fixed; warnings come back as information:
//         each can be a real defect, and a false one is to be explained, not "fixed".
//   stop  (Stop): the pages written in the session are linted again. With errors left:
//           observe (the default)  the user is told, and nothing is blocked;
//           enforce                 the stop is refused with the errors as the reason; a stop right after
//                                   one this hook refused goes through (stop_hook_active), and after two
//                                   refusals in a session every stop does — a lint that is wrong must not
//                                   hold the session (the article's commit gate lets the third one through).
//
// Never blocks when the lint cannot run (offline, no npx, a timeout). Settings, as environment variables:
//   WCSTACK_LINT_HOOK=off          turns both off
//   WCSTACK_LINT_GATE=enforce      the stop as above (default: observe)
//   WCSTACK_LINT_CMD="node …/cli.cjs"  the lint to run (default: the project's wcs-validate, else npx @wcstack/lint)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

const mode = process.argv[2];
if (process.env.WCSTACK_LINT_HOOK === 'off' || (mode !== 'post' && mode !== 'stop')) process.exit(0);

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const cwd = input.cwd || process.cwd();
const stateFile = join(tmpdir(), 'wcstack-skill-hooks', `${String(input.session_id || 'session').replace(/[^\w-]/g, '_')}.json`);
const readState = () => { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return { pages: [], blocks: 0 }; } };
const writeState = (s) => { try { mkdirSync(join(tmpdir(), 'wcstack-skill-hooks'), { recursive: true }); writeFileSync(stateFile, JSON.stringify(s)); } catch {} };

/** A file the lint checks and wcstack binds. */
function isWcstackPage(file) {
  if (!file || !existsSync(file)) return false;
  if (basename(file).endsWith('.manifest.json')) return true;
  if (!/^\.html?$/i.test(extname(file))) return false;
  try { return /data-wcs|<wcs-|@wcstack\//.test(readFileSync(file, 'utf8')); } catch { return false; }
}

/** Runs the lint on `files`; null when it could not run. */
function lint(files) {
  const local = join(cwd, 'node_modules', '.bin', process.platform === 'win32' ? 'wcs-validate.cmd' : 'wcs-validate');
  const cmd = process.env.WCSTACK_LINT_CMD || (existsSync(local) ? `"${local}"` : 'npx --yes @wcstack/lint');
  const r = spawnSync(`${cmd} ${files.map((f) => `"${f}"`).join(' ')}`, { cwd, shell: true, encoding: 'utf8', timeout: 80_000 });
  const out = `${r.stdout || ''}`;
  const sum = /(\d+) error\(s\), (\d+) warning\(s\)/.exec(out);
  if (r.error || !sum) return null;
  const lines = out.split('\n').filter((l) => / (error|warning) wcs\//.test(l));
  return { errors: Number(sum[1]), warnings: Number(sum[2]), errorLines: lines.filter((l) => / error wcs\//.test(l)), warningLines: lines.filter((l) => / warning wcs\//.test(l)) };
}

const list = (lines, n = 15) => lines.slice(0, n).join('\n') + (lines.length > n ? `\n… and ${lines.length - n} more` : '');
const emit = (o) => process.stdout.write(JSON.stringify(o));

if (mode === 'post') {
  const file = input.tool_input?.file_path || input.tool_response?.filePath;
  if (!isWcstackPage(file)) process.exit(0);
  const state = readState();
  if (!state.pages.includes(file)) state.pages.push(file);
  writeState(state);
  const r = lint([file]);
  if (!r || r.errors + r.warnings === 0) process.exit(0);
  const parts = [`wcs-validate on ${basename(file)}: ${r.errors} error(s), ${r.warnings} warning(s).`];
  if (r.errors) parts.push(`Errors — fix each before presenting the app as finished:\n${list(r.errorLines)}`);
  if (r.warnings) parts.push(`Warnings — each can be a real defect (wcs/binding-path-missing is a column left empty): fix it, or tell the user why it does not apply. Do not change correct code only to silence one:\n${list(r.warningLines)}`);
  emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: parts.join('\n\n') } });
  process.exit(0);
}

// stop
const state = readState();
const pages = state.pages.filter((p) => existsSync(p));
if (pages.length === 0) process.exit(0);
const r = lint(pages);
if (!r || r.errors === 0) process.exit(0);
const what = `wcs-validate: ${r.errors} error(s) left in ${pages.map((p) => basename(p)).join(', ')}`;
if (process.env.WCSTACK_LINT_GATE !== 'enforce' || input.stop_hook_active || state.blocks >= 2) {
  emit({ systemMessage: `${what} (not blocking).` });
  process.exit(0);
}
state.blocks += 1;
writeState(state);
emit({ decision: 'block', reason: `${what}. Fix them, or tell the user why the lint is wrong about them, before finishing:\n${list(r.errorLines)}` });
