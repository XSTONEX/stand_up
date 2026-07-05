// Thin guard around the Tauri global API so every page also runs in a plain browser.

const T = window.__TAURI__ ?? null;

export const isTauri = !!T;

export function invoke(cmd, args) {
  if (!T) return Promise.resolve(null);
  return T.core.invoke(cmd, args).catch((e) => {
    console.warn('[invoke ' + cmd + ']', e);
    return null;
  });
}

export function emit(event, payload) {
  if (T) T.event.emit(event, payload);
}

export function listen(event, cb) {
  if (!T) return Promise.resolve(() => {});
  return T.event.listen(event, cb);
}

export function currentWindow() {
  return T ? T.window.getCurrentWindow() : null;
}
