/**
 * After in-app navigation, focus moves to the new page's <h1>. Lazy pages
 * mount after the navigation effect runs, so the request is kept until a
 * PageHeader mounts and consumes it.
 */
let pending = false;

export function requestHeadingFocus() {
  const h = document.getElementById('page-title');
  if (h) {
    h.focus({ preventScroll: true });
    pending = false;
  } else {
    pending = true;
  }
}

export function consumeHeadingFocus(el: HTMLElement | null) {
  if (!pending || !el) return;
  pending = false;
  el.focus({ preventScroll: true });
}
