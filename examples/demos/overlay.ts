/** Append a small bottom-of-screen overlay describing the demo. */
export function makeOverlay(host: HTMLElement, html: string): () => void {
  const div = document.createElement('div');
  div.className = 'demo-overlay';
  div.innerHTML = html;
  host.appendChild(div);
  return () => div.remove();
}
