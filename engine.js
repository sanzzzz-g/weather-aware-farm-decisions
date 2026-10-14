/*
 * Resource-aware weather advisory engine (scenario-based prototype)
 * ------------------------------------------------------------------
 * Compares three decision methods on the same synthetic farms and weather events:
 *   A) generic advisory      (warning -> standard action)
 *   B) cost-loss rule        (Murphy 1977 style: act if p > C/L; no farm feasibility)
 *   C) resource-aware ranking(feasibility + ranking by benefit, resources, risk)
 * All farm data is synthetic. Every number in ASSUME is an editable assumption,
 * not a measured value. Replace genFarm() with real survey / forecast data later.
 */
(function (root) {
  'use strict';

  const ASSUME = {
    wage: 50,                 // INR per person-hour (about INR 400 / day)
    hireWagePremium: 1.3,     // hired labour costs 30% more at short notice
    manualPH: 120,            // person-hours per ha, manual harvest + bundling
    combineCostHa: 2500,      // INR per ha, custom-hired combine
    combineHoursHa: 3,        // machine hours per ha
    combineLabourHa: 15,      // person-hours per ha still needed with a machine
    yieldKgHa: 4000,
    priceKg: 23,              // INR per kg paddy
    matureAt: 0.85,           // maturity index at which harvest is agronomically valid
    earlyHarvestPenalty: 0.25,// share of crop value lost if harvested immature
    immatureRainLoss: 0.04,   // share of crop value lost to rain on an immature standing crop
    drainReduction: 0.20,     // share of rain loss avoided by draining and bunding
    drainCostHa: 600,
    drainPH: 12,              // person-hours per ha
    waitBuffer: 12,           // hours that must remain after the wait for the follow-up action
    waitHit: 0.70,            // chance a sharper forecast signals a real event
    waitFalseAlarm: 0.10,
    failShare: 0.25,          // share of action cost wasted if an infeasible action is attempted
    genericThreshold: 0.40,   // generic advisory warns at forecast probability >= 40%
    lossScale: 1,
    costScale: 1,
  };

  const ACTION_NAMES = {
    harvest: 'Harvest now',
    partial: 'Partial harvest',
    hire: 'Hire extra labour, then harvest',
    protect: 'Drain field and reinforce bunds',
    wait: 'Wait for a sharper forecast',
    nothing: 'Do nothing',
  };

  const DEFAULT_WEIGHTS = { benefit: 0.5, resource: 0.2, risk: 0.3 };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(r) {
    let u = 0; while (u === 0) u = r();
    const v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  /* ---------- decision-theory helpers (Murphy 1977 cost-loss) ---------- */
  function costLossNet(p, lossAvoided, cost) {
    return { expectedAvoided: p * lossAvoided, net: p * lossAvoided - cost };
  }

  /* ---------- synthetic farm generator ---------- */
  function genFarm(r, A, id) {
    const area = clamp(Math.exp(normal(r) * 0.5 + Math.log(0.9)), 0.3, 3);
    const lead = 24 + r() * 72;
    const cu = r();
    const crew = cu < 0.2 ? 1 : cu < 0.55 ? 2 : cu < 0.8 ? 3 : cu < 0.92 ? 4 : 5;
    const labour = crew * lead * 0.5 * (0.6 + 0.4 * r());
    const hireable = r() * 1.2 * A.manualPH * area;
    const machine = r() < 0.45;
    const machineWait = 6 + r() * 54;
    const cash = clamp(Math.exp(normal(r) * 0.8 + Math.log(9000)), 1500, 80000);
    const isMature = r() < 0.65;
    const maturity = isMature ? 0.88 + r() * 0.12 : 0.6 + r() * 0.25;
    const lossFrac = 0.10 + r() * 0.20;
    const pF = clamp(0.05 + 0.85 * Math.pow(r(), 1.5), 0.02, 0.95);
    const pT = clamp(0.9 * pF + 0.03 + normal(r) * 0.06, 0.01, 0.99);
    const event = r() < pT;
    const u1 = r(), u2 = r();
    return { id, area, lead, crew, labour, hireable, machine, machineWait, cash,
             maturity, lossFrac, pF, pT, event, u1, u2 };
  }

  /* ---------- action evaluation for one farm ---------- */
  function evaluate(farm, p, Ain) {
    const A = Object.assign({}, ASSUME, Ain || {});
    const wage = A.wage * A.costScale;
    const combineCost = A.combineCostHa * A.costScale;
    const drainCost = A.drainCostHa * A.costScale;
    const V = farm.area * A.yieldKgHa * A.priceKg;
    const mature = farm.maturity >= A.matureAt;
    const L = (mature ? farm.lossFrac : A.immatureRainLoss) * V * A.lossScale;
    const earlyPen = mature ? 0 : A.earlyHarvestPenalty * V;
    const need = A.manualPH * farm.area;

    // harvest modes
    const tMach = farm.machineWait + A.combineHoursHa * farm.area;
    const cMach = combineCost * farm.area;
    const machOK = farm.machine && tMach <= farm.lead && farm.cash >= cMach;
    const cMan = need * wage;
    const manOK = farm.labour >= need;
    const gap = need - farm.labour;
    const hireCash = Math.max(0, gap) * wage * A.hireWagePremium;
    const hireOK = gap > 0 && gap <= farm.hireable && farm.cash >= hireCash;
    const cFull = Math.min(cMach, cMan); // nominal cost of a full harvest, ignoring feasibility

    const list = [];
    const add = (o) => {
      o.name = ACTION_NAMES[o.id];
      o.expLoss = p * o.resid + o.pen;
      o.nb = p * L - o.expLoss - o.cost;
      o.risk = o.resid + o.pen; // loss if the event occurs
      const labShare = Math.min(1, o.lab / Math.max(1, farm.labour));
      const cashShare = Math.min(1, o.cash / Math.max(1, farm.cash));
      o.res = clamp(0.4 * labShare + 0.4 * cashShare + 0.2 * (o.mach ? 1 : 0), 0, 1);
      list.push(o);
    };

    // 1. harvest now
    {
      let o;
      if (machOK && (!manOK || cMach <= cMan)) {
        o = { id: 'harvest', feasible: true, mode: 'combine', cost: cMach, lab: A.combineLabourHa * farm.area, cash: cMach, mach: true, resid: 0, pen: earlyPen };
      } else if (manOK) {
        o = { id: 'harvest', feasible: true, mode: 'manual', cost: cMan, lab: need, cash: 0, mach: false, resid: 0, pen: earlyPen };
      } else {
        const why = !farm.machine ? 'no combine available' : tMach > farm.lead ? 'combine arrives after the storm' : 'cash short for the combine';
        o = { id: 'harvest', feasible: false, mode: 'none', cost: cFull, lab: need, cash: 0, mach: false, resid: 0, pen: earlyPen,
              reason: why + '; labour short by ' + Math.round(Math.max(0, need - farm.labour)) + ' person-hours' };
      }
      add(o);
    }
    // 2. partial harvest
    {
      const f = clamp(farm.labour / need, 0, 1);
      const ok = f >= 0.2 && f < 1;
      add({ id: 'partial', feasible: ok, frac: f, cost: f * need * wage, lab: f * need, cash: 0, mach: false,
            resid: (1 - f) * L, pen: f * earlyPen,
            reason: ok ? '' : f >= 1 ? 'full harvest already possible' : 'labour covers under 20% of the field' });
    }
    // 3. hire labour
    {
      add({ id: 'hire', feasible: hireOK, cost: farm.labour * wage + hireCash, lab: need, cash: hireCash, mach: false,
            resid: 0, pen: earlyPen,
            reason: hireOK ? '' : gap <= 0 ? 'own labour already enough' : gap > farm.hireable ? 'not enough workers for hire' : 'cash short for hired labour' });
    }
    // 4. protect (drain + bunds)
    {
      const lab = A.drainPH * farm.area;
      const cashNeed = drainCost * farm.area;
      const ok = farm.labour >= lab && farm.cash >= cashNeed;
      add({ id: 'protect', feasible: ok, cost: cashNeed + lab * wage, lab, cash: cashNeed, mach: false,
            resid: L * (1 - A.drainReduction), pen: 0, reason: ok ? '' : 'labour or cash short' });
    }
    // 5. wait for a sharper forecast, then act on the signal
    {
      const tManual = need / (0.5 * Math.max(farm.crew, 0.1));
      const tFull = mature ? Math.min(farm.machine ? tMach : Infinity, tManual) : 2;
      const ok = farm.lead - tFull >= A.waitBuffer;
      const follow = mature ? cFull : drainCost * farm.area + A.drainPH * farm.area * wage;
      const actProb = p * A.waitHit + (1 - p) * A.waitFalseAlarm;
      const resid = mature ? (1 - A.waitHit) * L : L * (1 - A.waitHit * A.drainReduction);
      add({ id: 'wait', feasible: ok, cost: actProb * follow, lab: 0, cash: 0, mach: false, resid, pen: 0,
            followCost: follow, mature,
            reason: ok ? '' : 'too little time left to act after waiting' });
    }
    // 6. do nothing
    add({ id: 'nothing', feasible: true, cost: 0, lab: 0, cash: 0, mach: false, resid: L, pen: 0 });

    const byId = {};
    list.forEach((a) => { byId[a.id] = a; });
    return { farm, p, V, L, mature, need, cFull, list, byId, A };
  }

  /* ---------- ranking: Pareto filter, then weighted score ---------- */
  function rank(ev, weights) {
    const w = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
    const sum = w.benefit + w.resource + w.risk || 1;
    const wb = w.benefit / sum, wr = w.resource / sum, wk = w.risk / sum;
    const feas = ev.list.filter((a) => a.feasible);
    const dominates = (b, a) => b.nb >= a.nb && b.res <= a.res && b.risk <= a.risk &&
      (b.nb > a.nb || b.res < a.res || b.risk < a.risk);
    feas.forEach((a) => { a.dominated = feas.some((b) => b !== a && dominates(b, a)); });
    const front = feas.filter((a) => !a.dominated);
    const rng = (key) => {
      const v = front.map((a) => a[key]);
      return [Math.min.apply(null, v), Math.max.apply(null, v)];
    };
    const norm = (x, [lo, hi]) => (hi - lo < 1e-9 ? 0.5 : (x - lo) / (hi - lo));
    const rb = rng('nb'), rr = rng('res'), rk = rng('risk');
    front.forEach((a) => {
      a.score = wb * norm(a.nb, rb) + wr * (1 - norm(a.res, rr)) + wk * (1 - norm(a.risk, rk));
    });
    front.sort((a, b) => b.score - a.score);
    const rest = feas.filter((a) => a.dominated).sort((a, b) => b.nb - a.nb);
    const infeasible = ev.list.filter((a) => !a.feasible);
    infeasible.forEach((a) => { a.dominated = false; a.score = null; });
    return { ranked: front.concat(rest), infeasible, top: front[0] };
  }

  function verdict(ev, weights) {
    const rk = rank(ev, weights);
    const preferred = ev.list.slice().sort((a, b) => b.nb - a.nb)[0]; // best expected benefit, ignoring feasibility
    let label;
    if (!preferred.feasible && preferred.nb > 0) label = 'CANNOT ACT';
    else if (rk.top.id === 'wait' || rk.top.id === 'nothing') label = 'WAIT';
    else label = 'ACT';
    return { label, preferred, top: rk.top, ranked: rk.ranked, infeasible: rk.infeasible };
  }

  /* ---------- outcome realised once the weather is known ---------- */
  function realize(ev, act) {
    const f = ev.farm, A = ev.A, e = f.event, L = ev.L;
    if (act.id === 'wait') {
      const signal = e ? f.u1 < A.waitHit : f.u2 < A.waitFalseAlarm;
      if (!signal) return e ? L : 0;
      const loss = act.mature ? 0 : (e ? L * (1 - A.drainReduction) : 0);
      return loss + act.followCost;
    }
    if (act.feasible) return (e ? act.resid : 0) + act.pen + act.cost;
    return (e ? L : 0) + A.failShare * act.cost;
  }
  function oracle(ev) {
    const e = ev.farm.event;
    return Math.min.apply(null, ev.list.filter((a) => a.feasible && a.id !== 'wait')
      .map((a) => (e ? a.resid : 0) + a.pen + a.cost));
  }

  /* ---------- methods ---------- */
  function pickGeneric(ev) { return ev.p >= ev.A.genericThreshold ? ev.byId.harvest : ev.byId.nothing; }
  function pickCostLoss(ev) {
    // nominal cost vs nominal loss; no crop stage, no feasibility
    const Lnom = ev.farm.lossFrac * ev.V * ev.A.lossScale;
    return ev.p > ev.cFull / Lnom ? ev.byId.harvest : ev.byId.nothing;
  }

  /* ---------- full simulation ---------- */
  function simulate(n, seed, opts) {
    opts = opts || {};
    const A = Object.assign({}, ASSUME, opts.assume || {});
    const weights = opts.weights || DEFAULT_WEIGHTS;
    const r = mulberry32(seed >>> 0);
    const farms = [];
    for (let i = 0; i < n; i++) farms.push(genFarm(r, A, i + 1));

    const M = { generic: [], costloss: [], aware: [], nothing: [], oracle: [] };
    const counts = { ACT: 0, WAIT: 0, 'CANNOT ACT': 0 };
    const feas = { generic: 0, costloss: 0, aware: 0 };
    let cannot = 0, cannotAlt = 0, cannotNoAlt = 0;
    const topDefault = [];
    const evs = [];

    farms.forEach((f) => {
      const ev = evaluate(f, f.pF, A);
      evs.push(ev);
      const v = verdict(ev, weights);
      counts[v.label]++;
      topDefault.push(v.top.id);
      if (v.label === 'CANNOT ACT') {
        cannot++;
        if (v.top.nb > 0) cannotAlt++; else cannotNoAlt++;
      }
      const g = pickGeneric(ev), c = pickCostLoss(ev), a = v.top;
      if (g.feasible) feas.generic++;
      if (c.feasible) feas.costloss++;
      feas.aware++; // the ranked top action is always feasible
      M.generic.push(realize(ev, g));
      M.costloss.push(realize(ev, c));
      M.aware.push(realize(ev, a));
      M.nothing.push(realize(ev, ev.byId.nothing));
      M.oracle.push(oracle(ev));
    });

    const sum = (x) => x.reduce((s, y) => s + y, 0);
    const mean = (x) => sum(x) / (x.length || 1);
    const base = sum(M.nothing), orc = sum(M.oracle);
    const captured = (k) => (base - sum(M[k])) / Math.max(1, base - orc);
    const viol = (k) => n - feas[k];

    const methods = ['generic', 'costloss', 'aware'].map((k) => ({
      key: k,
      meanCost: mean(M[k]),
      feasibility: feas[k] / n,
      violations: viol(k),
      captured: captured(k),
    }));

    // paired bootstrap: aware vs cost-loss and vs generic
    function boot(a, b, seedOff) {
      const rr = mulberry32((seed + seedOff) >>> 0);
      const d = a.map((x, i) => x - b[i]);
      const B = 1000, means = [];
      for (let k = 0; k < B; k++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += d[Math.floor(rr() * n)];
        means.push(s / n);
      }
      means.sort((x, y) => x - y);
      return { mean: mean(d), lo: means[Math.floor(0.025 * B)], hi: means[Math.floor(0.975 * B)],
               pBetter: means.filter((m) => m > 0).length / B };
    }
    const bootCL = boot(M.costloss, M.aware, 7);
    const bootGen = boot(M.generic, M.aware, 11);

    // stability under changed weights and +/-20% cost or loss
    const weightSets = [[.5,.2,.3],[.7,.1,.2],[.2,.5,.3],[.3,.2,.5],[.34,.33,.33],[.6,0,.4],[.4,.4,.2],[.2,.2,.6]];
    let same = 0, total = 0;
    weightSets.forEach((w) => {
      evs.forEach((ev, i) => {
        const t = verdict(ev, { benefit: w[0], resource: w[1], risk: w[2] }).top.id;
        if (t === topDefault[i]) same++; total++;
      });
    });
    const weightStability = same / total;
    const perturb = [{ costScale: 0.8 }, { costScale: 1.2 }, { lossScale: 0.8 }, { lossScale: 1.2 }];
    let same2 = 0, total2 = 0;
    perturb.forEach((pt) => {
      const A2 = Object.assign({}, A, pt);
      farms.forEach((f, i) => {
        const t = verdict(evaluate(f, f.pF, A2), weights).top.id;
        if (t === topDefault[i]) same2++; total2++;
      });
    });
    const paramStability = same2 / total2;
    const stability = (weightStability * weightSets.length + paramStability * perturb.length) / (weightSets.length + perturb.length);

    // calibration of the (synthetic) forecasts
    const bins = [];
    for (let b = 0; b < 10; b++) bins.push({ n: 0, p: 0, o: 0 });
    let brier = 0;
    farms.forEach((f) => {
      const b = Math.min(9, Math.floor(f.pF * 10));
      bins[b].n++; bins[b].p += f.pF; bins[b].o += f.event ? 1 : 0;
      brier += Math.pow(f.pF - (f.event ? 1 : 0), 2);
    });
    brier /= n;
    let ece = 0;
    const reliability = bins.filter((b) => b.n > 0).map((b) => {
      ece += (b.n / n) * Math.abs(b.p / b.n - b.o / b.n);
      return { p: b.p / b.n, o: b.o / b.n, n: b.n };
    });

    const aware = methods[2];
    const parts = {
      value: clamp(aware.captured, 0, 1),
      feasibility: aware.feasibility,
      stability,
      confidence: bootCL.pBetter,
    };
    const score = 100 * (0.35 * parts.value + 0.25 * parts.feasibility + 0.25 * parts.stability + 0.15 * parts.confidence);
    const grade = score >= 80 ? 'High' : score >= 60 ? 'Moderate' : 'Low';

    return {
      n, seed, weights, methods, counts, cannot, cannotAlt, cannotNoAlt,
      altRate: cannot ? cannotAlt / cannot : null,
      bootCL, bootGen, weightStability, paramStability, stability,
      calibration: { brier, ece, reliability },
      parts, score, grade, baseCost: mean(M.nothing), oracleCost: mean(M.oracle),
    };
  }

  /* ---------- unit tests ---------- */
  function runTests() {
    const out = [];
    const t = (name, ok, detail) => out.push({ name, ok: !!ok, detail: detail || '' });
    const near = (a, b) => Math.abs(a - b) < 1e-9;

    let r = costLossNet(1, 8000, 2000);
    t('Concept note: avoided loss 8,000 and cost 2,000 give nominal net 6,000', near(r.net, 6000), 'net = ' + r.net);
    r = costLossNet(0.3, 5000, 1000);
    t('Concept note: p = 30%, L = 5,000, C = 1,000 gives expected avoided 1,500 and net 500', near(r.expectedAvoided, 1500) && near(r.net, 500), 'avoided = ' + r.expectedAvoided + ', net = ' + r.net);
    r = costLossNet(0.1, 5000, 1000);
    t('Concept note: p = 10% gives expected avoided 500, below the 1,000 cost', near(r.expectedAvoided, 500) && r.net < 0, 'net = ' + r.net);

    const mk = (o) => Object.assign({ id: 0, area: 1, lead: 48, crew: 0, labour: 0, hireable: 0, machine: false, machineWait: 30,
      cash: 20000, maturity: 0.95, lossFrac: 0.2, pF: 0.6, pT: 0.6, event: true, u1: 0.5, u2: 0.5 }, o);

    let ev = evaluate(mk({}), 0.6);
    let v = verdict(ev);
    t('No workers and no machine: harvest is infeasible and the verdict is CANNOT ACT', !ev.byId.harvest.feasible && v.label === 'CANNOT ACT', 'verdict = ' + v.label);
    t('Infeasible action is never ranked first', v.top.feasible && v.ranked.every((a) => a.feasible));

    ev = evaluate(mk({ crew: 3, labour: 150, machine: true, machineWait: 8 }), 0.7);
    v = verdict(ev);
    t('Labour and machine available with high rain risk: ACT on a harvest option', v.label === 'ACT' && /harvest|hire/.test(v.top.id), 'top = ' + v.top.id);

    ev = evaluate(mk({ crew: 3, labour: 150, machine: true, machineWait: 8, maturity: 0.7 }), 0.7);
    t('Immature crop: harvesting now has negative expected benefit', ev.byId.harvest.nb < 0, 'net = ' + Math.round(ev.byId.harvest.nb));

    ev = evaluate(mk({ crew: 1, labour: 40, machine: false }), 0.6);
    t('Short on labour: partial harvest is offered as an alternative', ev.byId.partial.feasible && ev.byId.partial.frac > 0.2 && ev.byId.partial.frac < 1, 'fraction = ' + ev.byId.partial.frac.toFixed(2));

    const a = simulate(200, 5), b = simulate(200, 5);
    t('Same seed gives identical results (reproducible)', a.score === b.score && a.methods[2].meanCost === b.methods[2].meanCost);

    const s = simulate(400, 9);
    t('Resource-aware method has zero constraint violations', s.methods[2].violations === 0, 'violations = ' + s.methods[2].violations);
    return out;
  }

  const API = { ASSUME, ACTION_NAMES, DEFAULT_WEIGHTS, genFarm, evaluate, rank, verdict, simulate, runTests, costLossNet, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.AdvisoryEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
