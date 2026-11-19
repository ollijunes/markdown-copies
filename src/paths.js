import { readdir } from 'node:fs/promises';
import path from 'node:path';

/** Every .html file under dir, as POSIX paths relative to it. Symlinks are not followed. */
export async function findHtmlFiles(dir) {
  const found = [];
  async function walk(folder, prefix) {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(folder, entry.name), relative);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        found.push(relative);
      }
    }
  }
  await walk(dir, '');
  return found;
}

/**
 * Where a built file is served and where its copy goes.
 * blog/post/index.html -> /blog/post/ and blog/post/index.md
 * blog/post.html       -> /blog/post  and blog/post.md
 */
export function locate(file) {
  const folder = path.posix.dirname(file);
  const name = path.posix.basename(file);
  const prefix = folder === '.' ? '' : `${folder}/`;
  if (name.toLowerCase() === 'index.html') {
    return { urlPath: `/${prefix}`, markdownFile: `${prefix}index.md` };
  }
  const stem = name.slice(0, -'.html'.length);
  return { urlPath: `/${prefix}${stem}`, markdownFile: `${prefix}${stem}.md` };
}

/** Glob to RegExp: `*` stays inside one path segment, `**` crosses segments. */
export function globToRegExp(glob) {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*') {
      if (glob[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

/** A URL path matches with or without its trailing slash. */
export function matchesAny(urlPath, globs) {
  const bare = urlPath.length > 1 ? urlPath.replace(/\/$/, '') : urlPath;
  return globs.some((glob) => {
    const pattern = globToRegExp(glob);
    return pattern.test(urlPath) || pattern.test(bare) || pattern.test(`${bare}/`);
  });
}

/** Join the site, an optional base path and a path inside the build folder. */
export function absoluteUrl(site, base, pathInBuild) {
  const cleanBase = `/${base}/`.replace(/\/+/g, '/');
  return new URL(`${cleanBase}${pathInBuild.replace(/^\//, '')}`, site).href;
}
