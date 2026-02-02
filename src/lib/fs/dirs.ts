import * as appRoot from 'app-root-path';

export function bundledMediaDir() {
  return `${appRoot.path}/bundled/media`;
}

export function bundledResourceDir() {
  return `${appRoot.path}/bundled/resources`;
}

export function tempDir() {
  return `${appRoot.path}/tmp`;
}

export function uploadsDir() {
  return `${tempDir()}/uploads`;
}

export function downloadsDir() {
  return `${tempDir()}/downloads`;
}

export function s3DownloadsDir() {
  return `${tempDir()}/s3/downloads`;
}

export function jobsDir() {
  return `${tempDir()}/jobs`;
}
