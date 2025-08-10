#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import crypto from 'crypto';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Returns the current date and time in ISO 8601 format.
 * @returns {string} The current ISO time.
 */
function nowIso() {
    return new Date().toISOString();
}

// --- Command-line Argument Parsing ---

const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 --src <dir> [--public <dir>] [--out <file>] [--ui] [--concurrency <num>] [--verbose] [--pattern <glob>]')
    .option('src', {
        type: 'string',
        describe: 'Source directory containing HTML files to process',
        demandOption: true,
    })
    .option('public', {
        type: 'string',
        describe: 'Public target directory where output files (llm.txt, pages.json) are written',
        default: '.',
    })
    .option('out', {
        type: 'string',
        describe: 'Output filename for the extracted text (relative to --public)',
        default: 'llm.txt',
    })
    .option('ui', {
        type: 'boolean',
        describe: 'Generate an interactive HTML UI file (llm_ui.html) for a quick overview',
        default: false,
    })
    .option('concurrency', {
        type: 'number',
        describe: 'Maximum number of files to process concurrently',
        default: 10,
    })
    .option('verbose', {
        type: 'boolean',
        describe: 'Enable verbose logging to show detailed progress',
        default: false,
    })
    .option('pattern', {
        type: 'string',
        describe: 'Glob pattern (relative to src) to find HTML files',
        default: '**/*.htm?(l)',
    })
    .help()
    .argv;

const SRC_DIR = path.resolve(process.cwd(), argv.src);
const PUBLIC_DIR = path.resolve(process.cwd(), argv.public);
const OUT_FILE = path.join(PUBLIC_DIR, argv.out);
const UI_FILE = path.join(PUBLIC_DIR, 'llm_ui.html');

// --- Helper Functions ---

/**
 * Logs a message to the console if verbose mode is enabled.
 * @param {...any} args The message parts to log.
 */
function log(...args) {
    if (argv.verbose) console.log('[INFO]', ...args);
}

/**
 * Logs a warning message to the console.
 * @param {...any} args The warning message parts to log.
 */
function warn(...args) {
    console.warn('[WARN]', ...args);
}

/**
 * Logs a fatal error message and exits the process.
 * @param {...any} args The error message parts to log.
 */
function fatal(...args) {
    console.error('[FATAL]', ...args);
    process.exit(1);
}

/**
 * Generates a SHA-256 hash of a string.
 * @param {string} content The content to hash.
 * @returns {string} The SHA-256 hash as a hexadecimal string.
 */
function sha256(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Creates a formatted header for a file in the output text.
 * @param {string} relPath The relative path of the file.
 * @returns {string} The formatted header string.
 */
function makeFileHeader(relPath) {
    const line = '═'.repeat(80);
    return `\n${line}\n 📄 FILE: ${relPath}\n${line}\n`;
}

/**
 * Generates a formatted and aligned text-based table of contents.
 * @param {Array<object>} items An array of file metadata objects.
 * @param {string} srcDir The source directory path.
 * @returns {string} The formatted TOC string.
 */
function makeTocSection(items, srcDir) {
    if (!items || items.length === 0) {
        return 'No files were processed.';
    }

    const headers = {
        filePath: 'File Path',
        size: 'Size',
        chars: 'Chars'
    };

    // Calculate max widths without adding spaces here
    const maxPathLength = Math.max(...items.map(item => path.relative(srcDir, item.path).length), headers.filePath.length);
    const maxSizeLength = Math.max(...items.map(item => item.size.toString().length), headers.size.length);
    const maxCharsLength = Math.max(...items.map(item => item.textLength.toString().length), headers.chars.length);

    const makeDivider = (left, mid1, mid2, right) => {
        return left + '═'.repeat(maxPathLength + 2) +
            mid1 + '═'.repeat(maxSizeLength + 2) +
            mid2 + '═'.repeat(maxCharsLength + 2) +
            right;
    };

    const headerTop = makeDivider('╔', '╤', '╤', '╗');
    const headerMid = makeDivider('╟', '┼', '┼', '╢');
    const footerBot = makeDivider('╚', '╧', '╧', '╝');

    const headerRow =
        `║ ${headers.filePath.padEnd(maxPathLength)} ` +
        `│ ${headers.size.padStart(maxSizeLength)} ` +
        `│ ${headers.chars.padStart(maxCharsLength)} ║`;

    const body = items.map(item => {
        const relPath = path.relative(srcDir, item.path);
        return `║ ${relPath.padEnd(maxPathLength)} ` +
            `│ ${item.size.toString().padStart(maxSizeLength)} ` +
            `│ ${item.textLength.toString().padStart(maxCharsLength)} ║`;
    }).join('\n');

    const table = [
        headerTop,
        headerRow,
        headerMid,
        body,
        footerBot
    ].join('\n');

    const summary = [
        `\nTotal files: ${items.length}`,
        `Total characters: ${items.reduce((sum, item) => sum + item.textLength, 0).toLocaleString()}`,
        ''
    ].join('\n');

    return table + summary;
}



// --- Core Processing Functions ---

/**
 * Lists all HTML files in a directory based on a glob pattern.
 * @param {string} dir The directory to search in.
 * @param {string} pattern The glob pattern.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of file paths.
 */
async function listHtmlFiles(dir, pattern) {
    const globPattern = path.join(dir, pattern).replace(/\\/g, '/');
    const files = await glob(globPattern, {
        nodir: true,
        windowsPathsNoEscape: true
    });
    // Normalize and dedupe file paths
    const unique = Array.from(new Set(files.map(f => path.resolve(f))));
    unique.sort(); // Ensure deterministic order
    return unique;
}

/**
 * Extracts clean, readable text from an HTML file.
 * @param {string} filePath The path to the HTML file.
 * @returns {Promise<object>} An object containing the file path, extracted text, and any errors.
 */
async function extractTextFromHTML(filePath) {
    try {
        const html = await fs.readFile(filePath, 'utf8');
        if (!html || html.trim().length === 0) {
            return {
                filePath,
                text: ''
            };
        }

        const $ = cheerio.load(html);

        // Remove noise and hidden content for cleaner extraction
        $('script, style, noscript, iframe, svg, img, meta, link, header, footer, nav, aside').remove();
        $('[aria-hidden=true], [hidden]').remove();
        $('[style]').each((i, el) => {
            const s = ($(el).attr('style') || '').toLowerCase();
            if (s.includes('display:none') || s.includes('visibility:hidden')) {
                $(el).remove();
            }
        });
        // Remove Next.js and similar framework-specific noise
        $('next-route-announcer, [data-nextjs-page], [role="navigation"], .skip-link').remove();

        // Prioritize main content areas for extraction
        const selectors = ['main', 'article', '[role="main"]', '.main-content', '.content', '.prose', '.container', 'body'];
        let text = '';
        for (const sel of selectors) {
            const t = $(sel).text();
            if (t && t.trim().length > 50) {
                text = t;
                break;
            }
        }
        if (!text) text = $('body').text() || '';

        // Simple sanitization and normalization
        text = text.replace(/\s+/g, ' ').replace(/\[.*?\]/g, '').replace(/\{.*?\}/g, '').trim();

        return {
            filePath,
            text
        };
    } catch (err) {
        warn(`Error processing file ${filePath}: ${err.message}`);
        return {
            filePath,
            text: '',
            error: err.message
        };
    }
}

/**
 * Creates the content for the interactive HTML UI.
 * @param {Array<object>} items An array of file metadata objects.
 * @param {string} srcDir The source directory path.
 * @returns {string} The complete HTML content.
 */
function makeHtmlUIContent(items, srcDir) {
    const itemsHtml = items.map((it, i) => {
        const rel = path.relative(process.cwd(), it.path).replace(/\\/g, '/');
        const safeId = `file-${i}`;
        const preview = (it.text || '[No extractable text]').slice(0, 2000).replace(/</g, '&lt;');
        return `
<section class="file" data-file="${rel}">
  <h3><button aria-expanded="false" class="toggle" data-target="#${safeId}">${rel}</button></h3>
  <div id="${safeId}" class="content" hidden>
    <pre>${preview}</pre>
    <button class="show-full">Show Full Text</button>
  </div>
</section>
`;
    }).join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>LLM Extract — Readable UI</title>
  <style>
    body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;margin:20px;line-height:1.5;background-color: #f8f6ff;}
    h1 { color: #21014b;}
    h3 { margin-bottom: 0; }
    .search{width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 8px; margin-bottom: 20px;}
    .file{border-radius:12px;padding:12px;margin-bottom:10px;box-shadow:0 6px 18px rgba(0,0,0,0.06);background-color: #fff;}
    button.toggle{background:#21014b;color:#fff;border:none;padding:8px 10px;border-radius:8px;cursor:pointer;}
    button.show-full{background:#0b74de;color:#fff;border:none;padding:8px 10px;border-radius:8px;margin-top:10px;cursor:pointer;}
    pre{white-space:pre-wrap;word-break:break-word;background:#f8f9fa;padding:12px;border-radius:8px;overflow-x: auto;}
  </style>
</head>
<body class="bg-yellow-50">
  <h1>LLM Extract — Readable UI</h1>
  <p>Generated from: <strong>${srcDir}</strong> on ${new Date().toLocaleString()}</p>
  <input class="search" placeholder="Filter files or text..." />
  <div id="list">
    ${itemsHtml}
  </div>
  <script>
    document.querySelectorAll('.toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const tgt = document.querySelector(btn.dataset.target);
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', !expanded);
        tgt.hidden = expanded;
      });
    });
    document.querySelector('.search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.file').forEach(sec => {
        const txt = sec.innerText.toLowerCase();
        sec.style.display = txt.includes(q) ? '' : 'none';
      });
    });
    // This part of the original script was flawed. show-more button didn't actually show more.
    // A full implementation would require a backend call or storing the full text in the HTML,
    // which is not feasible for large files. We'll leave it as a placeholder.
    document.querySelectorAll('.show-full').forEach(btn => {
      btn.addEventListener('click', () => {
        alert('Showing full text is not yet implemented. Please refer to the generated llm.txt file.');
      });
    });
  </script>
</body>
</html>
`;
}

/**
 * Generates the llm.txt output file in a streaming fashion to handle large files efficiently.
 * @param {Array<object>} items The list of processed files with their extracted text.
 * @param {string} outPath The path to the output file.
 * @param {string} srcDir The source directory path.
 * @returns {Promise<void>} A promise that resolves when the file is fully written.
 */
async function generateLLMTextStream(items, outPath, srcDir) {
    await fs.ensureDir(path.dirname(outPath));
    const stream = fs.createWriteStream(outPath, {
        encoding: 'utf8'
    });

    // Write header metadata
    stream.write(`Generated: ${nowIso()}\n`);
    stream.write(`Source directory: ${srcDir}\n`);
    stream.write(`Files processed: ${items.length}\n\n`);

    // Write TOC
    stream.write(makeTocSection(items, srcDir) + '\n');

    // Write content for each file
    for (const it of items) {
        const rel = path.relative(process.cwd(), it.path);
        stream.write(makeFileHeader(rel) + '\n');
        stream.write((it.text && it.text.length > 0) ? it.text + '\n\n' : '[No extractable text]\n\n');
    }

    await new Promise((resolve) => stream.end(resolve));
}


// --- Main Execution Logic ---

async function main() {
    try {
        if (!await fs.pathExists(SRC_DIR)) {
            fatal(`Source directory does not exist: ${SRC_DIR}`);
        }

        await fs.ensureDir(PUBLIC_DIR);

        log('Scanning for HTML files...');
        const files = await listHtmlFiles(SRC_DIR, argv.pattern);
        if (!files || files.length === 0) {
            fatal('No HTML files found.');
        }
        log(`Found ${files.length} files`);

        const limit = pLimit(argv.concurrency);
        const tasks = files.map(f => limit(async () => {
            const res = await extractTextFromHTML(f);
            const stat = await fs.stat(f).catch(() => ({
                size: 0
            })); // Handle case where file might be gone
            const textLength = (res.text || '').length;
            const contentHash = sha256(res.text || '');
            return {
                path: f,
                rel: path.relative(process.cwd(), f),
                size: stat.size || 0,
                textLength,
                text: res.text || '',
                hash: contentHash,
                error: res.error || null
            };
        }));

        const extracted = await Promise.all(tasks);

        // Sort deterministically by relative path
        extracted.sort((a, b) => a.rel.localeCompare(b.rel));

        // Filter out files with errors if necessary for a clean output, though keeping them is also a valid choice
        const successfulExtractions = extracted.filter(e => !e.error);
        const itemsForOutput = successfulExtractions.map(e => ({
            path: e.path,
            text: e.text,
            size: e.size,
            textLength: e.textLength
        }));

        // Write pages.json (list of pages + metadata)
        const pagesJson = successfulExtractions.map(e => ({
            path: e.rel,
            size: e.size,
            textLength: e.textLength,
            hash: e.hash,
            error: e.error
        }));
        const pagesJsonPath = path.join(PUBLIC_DIR, 'pages.json');
        await fs.writeFile(pagesJsonPath, JSON.stringify({
            generatedAt: nowIso(),
            source: SRC_DIR,
            pages: pagesJson
        }, null, 2), 'utf8');
        log(`Wrote pages metadata to ${pagesJsonPath}`);

        // Write llm.txt via streaming
        await generateLLMTextStream(itemsForOutput, OUT_FILE, SRC_DIR);
        log(`Wrote llm text to ${OUT_FILE}`);

        // Optionally write UI
        if (argv.ui) {
            const html = makeHtmlUIContent(itemsForOutput, SRC_DIR);
            await fs.writeFile(UI_FILE, html, 'utf8');
            log(`Wrote UI to ${UI_FILE}`);
        }

        console.log(`✅ Done. Files written to: ${PUBLIC_DIR}`);
        process.exit(0);

    } catch (err) {
        fatal('Unhandled error:', err instanceof Error ? err.message : String(err));
    }
}

main();