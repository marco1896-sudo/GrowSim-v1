function resolvePathValue(plantState, path) {
  if (!path || typeof path !== 'string') return undefined;
  const key = path.trim();
  return plantState[key];
}

function compare(actual, op, expected) {
  switch (op) {
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '>': return Number(actual) > Number(expected);
    case '>=': return Number(actual) >= Number(expected);
    case '<': return Number(actual) < Number(expected);
    case '<=': return Number(actual) <= Number(expected);
    case 'in': return Array.isArray(expected) ? expected.includes(actual) : false;
    case 'not_in': return Array.isArray(expected) ? !expected.includes(actual) : true;
    default: return false;
  }
}

function compileClause(clause) {
  if (!clause || typeof clause !== 'object') {
    return () => true;
  }

  const statePath = clause.state;
  const op = clause.op || '==';
  const value = clause.value;

  return function clauseEval(plantState) {
    const actual = resolvePathValue(plantState, statePath);
    return compare(actual, op, value);
  };
}

export function compileTrigger(triggerDef) {
  if (!triggerDef || typeof triggerDef !== 'object') {
    return () => true;
  }

  if (Array.isArray(triggerDef.all)) {
    const checks = triggerDef.all.map((item) => compileClause(item));
    return function allEval(plantState) {
      for (const check of checks) {
        if (!check(plantState)) return false;
      }
      return true;
    };
  }

  if (Array.isArray(triggerDef.any)) {
    const checks = triggerDef.any.map((item) => compileClause(item));
    return function anyEval(plantState) {
      for (const check of checks) {
        if (check(plantState)) return true;
      }
      return false;
    };
  }

  return compileClause(triggerDef);
}
