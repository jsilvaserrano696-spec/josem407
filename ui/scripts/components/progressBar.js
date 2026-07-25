// The progress bar only ever shows indeterminate activity (a single IPC round-trip has no
// meaningful percentage to report), so this is just an on/off toggle of the CSS animation.
export function setProgressActive(progressBarEl, active) {
  progressBarEl.classList.toggle("indeterminate", active);
}
