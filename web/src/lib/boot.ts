/**
 * Fades out the boot screen in index.html once the app has drawn itself. If the screen never
 * became visible (a fast load), it is simply removed, so nothing flashes.
 */
export function dismissBootScreen() {
  const boot = document.getElementById("boot");
  if (!boot || boot.dataset.leaving) return;
  boot.dataset.leaving = "true";
  boot.style.pointerEvents = "none";
  const shown = Number(getComputedStyle(boot).opacity);
  if (shown < 0.05 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    boot.remove();
    return;
  }
  // Hold the current opacity, then fade from there.
  boot.style.opacity = String(shown);
  boot.style.animation = "none";
  void boot.offsetWidth;
  boot.style.transition = "opacity 320ms ease-out";
  boot.style.opacity = "0";
  window.setTimeout(() => boot.remove(), 340);
}
