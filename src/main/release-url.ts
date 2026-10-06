// What the update check may hand to the renderer: only a release page of this
// very repository, over https. Anything else in the GitHub answer is ignored.
const RELEASE_PAGE = /^https:\/\/github\.com\/nilsBit\/needless-streaming-tool\/releases\/[A-Za-z0-9._\-/]+$/;
const TAG = /^v?\d+(\.\d+){0,3}(-[A-Za-z0-9.]+)?$/;

export function isReleaseUrl(url: unknown): url is string {
  return typeof url === 'string' && RELEASE_PAGE.test(url);
}

export function isReleaseTag(tag: unknown): tag is string {
  return typeof tag === 'string' && TAG.test(tag);
}
