function hashString(input) {
  let h = 2166136261;
  const str = String(input);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPrngContext({ globalSeed, plantId, tickIndex, purpose }) {
  const seedInput = `${globalSeed}|${plantId}|${tickIndex}|${purpose}`;
  const seed = hashString(seedInput);
  const next = mulberry32(seed);

  return {
    seed,
    nextFloat() {
      return next();
    }
  };
}

export function weightedPickStable(items, getWeight, prngContext) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;

  let total = 0;
  const weights = [];

  for (let i = 0; i < list.length; i += 1) {
    const raw = Number(getWeight(list[i]));
    const weight = Number.isFinite(raw) && raw > 0 ? raw : 0;
    weights.push(weight);
    total += weight;
  }

  if (total <= 0) {
    return list[0] || null;
  }

  let roll = prngContext.nextFloat() * total;
  for (let i = 0; i < list.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) {
      return list[i];
    }
  }

  return list[list.length - 1] || null;
}
