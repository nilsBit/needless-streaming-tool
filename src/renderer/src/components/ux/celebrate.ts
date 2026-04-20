export type CelebrateKind = 'check' | 'spark' | 'success';

export function celebrate(kind: CelebrateKind, el: HTMLElement | null): void {
  if (!el) return;
  const className = `celebrate-${kind}`;
  el.classList.remove(className);
  // Force reflow so the animation can restart if the class was just removed.
  void el.offsetWidth;
  el.classList.add(className);
  const onEnd = () => {
    el.classList.remove(className);
    el.removeEventListener('animationend', onEnd);
  };
  el.addEventListener('animationend', onEnd);
}
