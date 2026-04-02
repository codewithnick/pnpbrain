/**
 * build.mjs — PNpbrain WordPress Plugin Packager
 *
 * Workflow:
 *   1. Build the widget embed bundle (apps/widget) via esbuild IIFE.
 *   2. Copy the resulting dist/gcfis-widget.js into this plugin's assets/ folder.
 *   3. Zip the entire plugin folder into dist/gcfis-widget.zip (WordPress-ready).
 *
 * Usage (from repo root):
 *   pnpm --filter @gcfis/wp-plugin build
 *   OR directly:
 *   node apps/backend/wp-plugin/build.mjs
 *
 * Output:
 *   apps/backend/wp-plugin/dist/gcfis-widget.zip
 */

import { execSync }                   from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm }  from 'node:fs/promises';
import { basename, dirname, join, resolve, relative } from 'node:path';
import { createReadStream, statSync }  from 'node:fs';
import { fileURLToPath }              from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const REPO_ROOT   = resolve( __dirname, '..', '..', '..', '..' );
const WIDGET_DIR  = join( REPO_ROOT, 'apps', 'widget' );
const PLUGIN_DIR  = __dirname;
const ASSETS_DIR  = join( PLUGIN_DIR, 'assets' );
const DIST_DIR    = join( PLUGIN_DIR, 'dist' );
const ZIP_PATH    = join( DIST_DIR, 'gcfis-widget.zip' );

// ── helpers ──────────────────────────────────────────────────────────────────

const log  = ( msg ) => process.stdout.write( `\x1b[36m[wp-build]\x1b[0m ${msg}\n` );
const ok   = ( msg ) => process.stdout.write( `\x1b[32m[wp-build]\x1b[0m ${msg}\n` );
const fail = ( msg ) => { process.stderr.write( `\x1b[31m[wp-build] ERROR:\x1b[0m ${msg}\n` ); process.exit(1); };

// ── step 1: build the widget embed bundle ────────────────────────────────────

log( 'Building widget embed bundle…' );
try {
    execSync( 'node scripts/build-embed.mjs', {
        cwd:   WIDGET_DIR,
        stdio: 'inherit',
    });
} catch {
    fail( 'Widget embed build failed. Run `node scripts/build-embed.mjs` manually to debug.' );
}

const BUNDLE_SRC = join( WIDGET_DIR, 'dist', 'gcfis-widget.js' );
if ( ! existsSync( BUNDLE_SRC ) ) {
    fail( `Expected bundle not found at ${BUNDLE_SRC}` );
}
ok( 'Widget bundle built.' );

// ── step 2: copy bundle into plugin assets/ ──────────────────────────────────

log( 'Copying bundle into plugin assets/…' );
await mkdir( ASSETS_DIR, { recursive: true } );
await copyFile( BUNDLE_SRC, join( ASSETS_DIR, 'gcfis-widget.js' ) );
ok( 'Bundle copied.' );

// ── step 3: create distribution zip ─────────────────────────────────────────

log( 'Creating distribution zip…' );
await mkdir( DIST_DIR, { recursive: true } );

// Remove old zip if present.
if ( existsSync( ZIP_PATH ) ) {
    await rm( ZIP_PATH );
}

/**
 * Recursively collect all files in a directory, returning paths
 * relative to `base`.
 */
async function collectFiles( dir, base ) {
    const entries = await readdir( dir, { withFileTypes: true } );
    const files   = [];
    for ( const entry of entries ) {
        const full = join( dir, entry.name );
        const rel  = relative( base, full );

        // Exclude the dist/ folder itself (avoid nesting), node_modules, hidden files.
        if (
            rel.startsWith( 'dist' + ( process.platform === 'win32' ? '\\' : '/' ) ) ||
            entry.name === 'node_modules' ||
            entry.name.startsWith( '.' ) ||
            entry.name === 'build.mjs'           // exclude this script from the zip
        ) {
            continue;
        }

        if ( entry.isDirectory() ) {
            files.push( ...( await collectFiles( full, base ) ) );
        } else {
            files.push( { absolute: full, relative: rel } );
        }
    }
    return files;
}

const allFiles = await collectFiles( PLUGIN_DIR, PLUGIN_DIR );
log( `Zipping ${allFiles.length} files…` );

/**
 * Minimal ZIP writer — supports STORED entries only (no compression dependency).
 * For production, consider piping through `zip` CLI or a library like `archiver`.
 */

// Try to use the native `zip` CLI if available (macOS / Linux).
const useNativeZip = await (async () => {
    try {
        execSync('which zip', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

if ( useNativeZip ) {
    // Build from inside the plugin dir so the zip contains gcfis-widget/* paths.
    const fileList = allFiles.map( f => JSON.stringify( f.relative ) ).join( ' ' );
    execSync(
        `zip -9 -r ${JSON.stringify( ZIP_PATH )} ${fileList}`,
        { cwd: PLUGIN_DIR, stdio: 'inherit' }
    );
} else {
    // Fallback: pure-JS zip using Node streams (STORED, no compression).
    await writeZipStored( ZIP_PATH, allFiles );
}

ok( `\nWordPress plugin zip ready: ${ZIP_PATH}` );
ok( 'Done. Upload gcfis-widget.zip via Plugins → Add New → Upload Plugin in WordPress.' );

/* ── pure-JS STORED zip writer (fallback) ───────────────────────────────── */

async function writeZipStored( zipPath, files ) {
    const out = createWriteStream( zipPath );
    const centralDir = [];
    let offset = 0;

    function writeUInt16LE( buf, val, pos ) {
        buf[pos]   = val & 0xff;
        buf[pos+1] = (val >> 8) & 0xff;
    }
    function writeUInt32LE( buf, val, pos ) {
        buf[pos]   = val & 0xff;
        buf[pos+1] = (val >> 8) & 0xff;
        buf[pos+2] = (val >> 16) & 0xff;
        buf[pos+3] = (val >> 24) & 0xff;
    }
    function crc32( buf ) {
        let crc = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            crc ^= buf[i];
            for (let j = 0; j < 8; j++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
            }
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    const write = ( chunk ) => new Promise( (res, rej) => out.write( chunk, err => err ? rej(err) : res() ) );

    for ( const { absolute, relative: rel } of files ) {
        const data = await import('node:fs/promises').then( m => m.readFile(absolute) );
        const nameBytes = Buffer.from( 'gcfis-widget/' + rel );
        const crc = crc32( data );
        const stat = statSync( absolute );

        const localHeader = Buffer.alloc( 30 + nameBytes.length );
        writeUInt32LE( localHeader, 0x04034b50,      0  );  // local file header sig
        writeUInt16LE( localHeader, 20,              4  );  // version needed
        writeUInt16LE( localHeader, 0,               6  );  // general purpose bit flag
        writeUInt16LE( localHeader, 0,               8  );  // compression (STORED)
        writeUInt16LE( localHeader, 0,               10 );  // last mod time
        writeUInt16LE( localHeader, 0,               12 );  // last mod date
        writeUInt32LE( localHeader, crc,             14 );
        writeUInt32LE( localHeader, data.length,     18 );  // compressed size
        writeUInt32LE( localHeader, data.length,     22 );  // uncompressed size
        writeUInt16LE( localHeader, nameBytes.length,26 );
        writeUInt16LE( localHeader, 0,               28 );  // extra field length
        nameBytes.copy( localHeader, 30 );

        centralDir.push({ nameBytes, crc, size: data.length, offset });
        await write( localHeader );
        await write( data );
        offset += localHeader.length + data.length;
    }

    // Central directory.
    const cdStart = offset;
    for ( const e of centralDir ) {
        const cd = Buffer.alloc( 46 + e.nameBytes.length );
        writeUInt32LE( cd, 0x02014b50,        0  );
        writeUInt16LE( cd, 20,                4  );
        writeUInt16LE( cd, 20,                6  );
        writeUInt16LE( cd, 0,                 8  );
        writeUInt16LE( cd, 0,                 10 );
        writeUInt16LE( cd, 0,                 12 );
        writeUInt16LE( cd, 0,                 14 );
        writeUInt32LE( cd, e.crc,             16 );
        writeUInt32LE( cd, e.size,            20 );
        writeUInt32LE( cd, e.size,            24 );
        writeUInt16LE( cd, e.nameBytes.length,28 );
        writeUInt16LE( cd, 0,                 30 );
        writeUInt16LE( cd, 0,                 32 );
        writeUInt16LE( cd, 0,                 34 );
        writeUInt16LE( cd, 0,                 36 );
        writeUInt32LE( cd, 0,                 38 );
        writeUInt32LE( cd, e.offset,          42 );
        e.nameBytes.copy( cd, 46 );
        await write( cd );
        offset += cd.length;
    }

    // End of central directory.
    const eocd = Buffer.alloc( 22 );
    writeUInt32LE( eocd, 0x06054b50,              0  );
    writeUInt16LE( eocd, 0,                       4  );
    writeUInt16LE( eocd, 0,                       6  );
    writeUInt16LE( eocd, centralDir.length,       8  );
    writeUInt16LE( eocd, centralDir.length,       10 );
    writeUInt32LE( eocd, offset - cdStart,        12 );
    writeUInt32LE( eocd, cdStart,                 16 );
    writeUInt16LE( eocd, 0,                       20 );
    await write( eocd );

    await new Promise( (res, rej) => out.end( err => err ? rej(err) : res() ) );
}
