// DIRECTOR stage (stub). Will eventually turn ANALYZE's output into concrete artistic decisions
// (which style to lean on, what to prioritize). For now it invents nothing — it just carries the
// style already chosen by the user forward, in the shape future stages will expect.
function decideDirection({ analysis } = {}) {
  return {
    styleId: analysis?.styleId ?? null,
    priorities: [],
    notes: [],
  };
}

module.exports = { decideDirection };
