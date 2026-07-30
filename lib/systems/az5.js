export function createAZ5State() {
  return { active: false, triggerTime: -1 };
}

export function stepAZ5(st, dt) {
}

export function triggerAZ5(st, t) {
  st.active = true;
  st.triggerTime = t;
}
