// Tiny DOM helpers shared by the two views. No framework: two static panels
// do not need one, and the host's CSP would block a CDN anyway.

import { SHEET_CSS } from './styles.js';

export function el(
  tag: string,
  attrs: Record<string, string> = {},
  children: Array<Node | string> = [],
): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

export function mount(): HTMLElement {
  const style = document.createElement('style');
  style.textContent = SHEET_CSS;
  document.head.appendChild(style);
  const root = el('main');
  document.body.appendChild(root);
  return root;
}

export function showError(root: HTMLElement, message: string): void {
  root.replaceChildren(
    el('p', { class: 'note' }, [`Could not render: ${message}`]),
  );
}
