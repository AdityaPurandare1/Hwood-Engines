// Procurement engine — JS port of procurement_engine.py
// Dual-loop (s,S)/(r,S) inventory math.

const ATTRITION_RATES = {
  'Glassware - Delicate': 0.10,
  'Glassware - Sturdy':   0.07,
  'Flatware':             0.04,
  'Dinnerware':           0.03,
  'Bar Tools':            0.025,
  'Smallwares':           0.02,
  'Consumable':           0.05,
  'Equipment':            0.01,
};

const VELOCITY_FAST = 15;
const VELOCITY_MED  = 5;
const BUFFER_WH = { FAST: 7, MED: 14, SLOW: 7 };
const BUFFER_VN = { FAST: 3, MED: 5, SLOW: 3 };

function velocity(monthly) {
  if (monthly > VELOCITY_FAST) return 'FAST';
  if (monthly > VELOCITY_MED)  return 'MED';
  return 'SLOW';
}

function roundToCase(units, caseSize) {
  if (units <= 0) return 0;
  return Math.ceil(units / caseSize) * caseSize;
}

// item: { name, sku, category, subcategory, caseSize, unitCost, shippingCost, shippingType, supplier, supplierContact, leadTime }
// venues: [{ name, par, monthlyDemand, currentOnHand, reorderTriggerMonths }]
// wh: { reviewPeriod, maxSimultaneousVenues, currentOnHand, currentOnPO, overrideS, overrideBigS }
function calcItem(item, venues, wh) {
  const caseSize = item.caseSize || 12;
  const leadTime = item.leadTime || 14;
  const reviewPeriod = wh.reviewPeriod || 7;

  let totalMonthlyDemand = 0;
  const venueResults = venues.map(v => {
    const dailyDemand = (v.monthlyDemand || 0) / 30;
    const vel = velocity(v.monthlyDemand || 0);
    const buffer = BUFFER_VN[vel];
    const venueSS = Math.max(1, Math.ceil(dailyDemand * buffer));
    const rawMin = Math.ceil((v.monthlyDemand || 0) * (v.reorderTriggerMonths || 2.5));
    const minR = Math.max(1, Math.min(rawMin, v.par - 1));
    const maxS = v.par;
    const orderQty = Math.max(0, v.par - minR);
    const typicalDraw = Math.ceil(v.monthlyDemand || 0);
    const needNow = Math.max(0, v.par - (v.currentOnHand || 0));
    const needNowCases = needNow > 0 ? roundToCase(needNow, caseSize) : 0;
    totalMonthlyDemand += (v.monthlyDemand || 0);
    return {
      name: v.name,
      par: v.par,
      monthlyDemand: v.monthlyDemand || 0,
      dailyDemand: +dailyDemand.toFixed(2),
      velocity: vel,
      venueSS, minR, maxS, orderQty, typicalDraw,
      currentOnHand: v.currentOnHand || 0,
      needNow, needNowCases,
      needNowPacks: needNowCases > 0 ? Math.floor(needNowCases / caseSize) : 0,
      reorderTriggerMonths: v.reorderTriggerMonths || 2.5,
    };
  });

  // warehouse calcs
  const combinedDaily = totalMonthlyDemand / 30;
  const whVel = velocity(totalMonthlyDemand);
  const whBuffer = BUFFER_WH[whVel];
  const whSS = Math.max(1, Math.ceil(combinedDaily * whBuffer));

  const typicalDraws = venueResults.map(v => v.typicalDraw).sort((a, b) => b - a);
  const simultaneousDraw = typicalDraws.slice(0, wh.maxSimultaneousVenues || 2).reduce((a, b) => a + b, 0);

  const ltReviewDemand = Math.ceil(combinedDaily * (leadTime + reviewPeriod));
  let s = ltReviewDemand + whSS;
  let bigS = roundToCase(s + Math.max(simultaneousDraw, Math.ceil(combinedDaily * reviewPeriod)), caseSize);

  const formulaS = s, formulaBigS = bigS;
  let overridden = false;
  if (wh.overrideS != null && wh.overrideS !== '') { s = +wh.overrideS; overridden = true; }
  if (wh.overrideBigS != null && wh.overrideBigS !== '') { bigS = +wh.overrideBigS; overridden = true; }

  const reorderQty = roundToCase(Math.max(caseSize, bigS - s), caseSize);
  const reorderQtyCases = Math.floor(reorderQty / caseSize);

  const currentPosition = (wh.currentOnHand || 0) + (wh.currentOnPO || 0);
  const warehouseNeed = Math.max(0, bigS - currentPosition);
  const warehouseNeedCases = roundToCase(warehouseNeed, caseSize);

  // first order
  const totalVenueNeed = venueResults.reduce((a, v) => a + v.needNowCases, 0);
  const totalFirstOrder = totalVenueNeed + warehouseNeedCases;
  const totalCost = item.unitCost ? +(totalFirstOrder * item.unitCost).toFixed(2) : null;

  // TCO
  let tco = null;
  if (item.unitCost != null && item.shippingCost != null) {
    tco = [];
    for (const num of [1, 2, 3, 5, 8, 10, 12, 15, 20, 25]) {
      const units = num * caseSize;
      const productCost = units * item.unitCost;
      let shipping;
      if (item.shippingType === 'per_case') shipping = item.shippingCost * num;
      else if (item.shippingType === 'per_unit') shipping = item.shippingCost * units;
      else shipping = item.shippingCost;
      const total = productCost + shipping;
      tco.push({
        cases: num, units,
        productCost: +productCost.toFixed(2),
        shipping: +shipping.toFixed(2),
        total: +total.toFixed(2),
        tcoPerUnit: +(total / units).toFixed(2),
      });
    }
  }

  // stress test
  const stress = stressTest(item, { sReorderPoint: s, reorderQty, reviewPeriod, maxSimultaneousVenues: wh.maxSimultaneousVenues || 2 }, simultaneousDraw, combinedDaily);

  return {
    item: { ...item },
    venues: venueResults,
    warehouse: {
      combinedMonthlyDemand: +totalMonthlyDemand.toFixed(1),
      combinedDailyDemand: +combinedDaily.toFixed(2),
      velocity: whVel,
      safetyStock: whSS,
      sReorderPoint: s,
      bigS, sCases: Math.floor(bigS / caseSize),
      reorderQty, reorderQtyCases,
      maxSimultaneousVenues: wh.maxSimultaneousVenues || 2,
      simultaneousDraw,
      reviewPeriod,
      currentOnHand: wh.currentOnHand || 0,
      currentOnPO: wh.currentOnPO || 0,
      warehouseNeed, warehouseNeedCases,
      overridden, formulaS, formulaBigS,
    },
    firstOrder: {
      venueUnits: totalVenueNeed,
      venueCases: Math.floor(totalVenueNeed / caseSize),
      warehouseUnits: warehouseNeedCases,
      warehouseCases: Math.floor(warehouseNeedCases / caseSize),
      totalUnits: totalFirstOrder,
      totalCases: Math.floor(totalFirstOrder / caseSize),
      totalCost,
    },
    tco,
    stress,
  };
}

function stressTest(item, wh, simultaneousDraw, combinedDaily) {
  let stock = wh.sReorderPoint;
  const lt = item.leadTime;
  const review = wh.reviewPeriod;
  const events = [{ day: 0, event: 'PO placed at reorder point (s)', stock, kind: 'po' }];
  let day = 0, wave = 0;
  while (day < lt) {
    day += review; wave++;
    if (day <= lt) {
      stock -= simultaneousDraw;
      events.push({
        day, wave,
        event: `${wh.maxSimultaneousVenues} venues draw — ${simultaneousDraw} units out`,
        stock,
        stockout: stock < 0,
        kind: 'draw',
      });
    }
  }
  stock += wh.reorderQty;
  events.push({ day: lt, event: `Supplier delivers +${wh.reorderQty} units`, stock, kind: 'arrive' });
  return events;
}

// PAR Advisor — given monthly demand, lead time, attrition risks,
// suggest an "ideal" PAR (math-only) and a "realistic" PAR (with risk buffer).
function advisePar(itemSubcategory, monthlyDemand, leadTimeDays, riskDays, currentPar) {
  const dailyDemand = monthlyDemand / 30;
  // depletion-only days of stock
  const depletionDays = leadTimeDays;
  const idealPar = Math.ceil(dailyDemand * depletionDays);
  // realistic = ideal + risk buffer days
  const realisticPar = Math.ceil(dailyDemand * (depletionDays + riskDays));

  let verdict = 'good';
  if (currentPar < idealPar) verdict = 'too-low';
  else if (currentPar > realisticPar * 2) verdict = 'too-high';

  return { idealPar, realisticPar, dailyDemand: +dailyDemand.toFixed(2), depletionDays, riskDays, verdict };
}

// TCO target finder — minimum order size to land at a target $/unit.
function tcoTarget(item, targetTco) {
  if (item.unitCost == null || item.shippingCost == null) {
    return { reachable: false, reason: 'Unit cost and shipping cost must be set on the item.' };
  }
  const caseSize = item.caseSize || 12;

  if (item.shippingType === 'flat') {
    if (targetTco <= item.unitCost) {
      return { reachable: false, reason: `Target $${targetTco}/unit is at or below unit cost $${item.unitCost.toFixed(2)}. Floor is unreachable with flat shipping.` };
    }
    const minQty = Math.ceil(item.shippingCost / (targetTco - item.unitCost));
    const minCases = Math.ceil(minQty / caseSize);
    const actualQty = minCases * caseSize;
    const totalCost = +(actualQty * item.unitCost + item.shippingCost).toFixed(2);
    const actualTco = +(totalCost / actualQty).toFixed(2);
    return { reachable: true, minQty, minCases, actualQty, actualTco, totalCost };
  }

  if (item.shippingType === 'per_case') {
    const floor = +(item.unitCost + item.shippingCost / caseSize).toFixed(2);
    if (floor > targetTco) {
      return { reachable: false, reason: `Per-case shipping fixes $/unit at $${floor}. Target $${targetTco} is below this floor.` };
    }
    return { reachable: true, minQty: caseSize, minCases: 1, actualQty: caseSize, actualTco: floor, totalCost: +(caseSize * item.unitCost + item.shippingCost).toFixed(2), note: 'Per-case shipping: $/unit is constant regardless of order size.' };
  }

  if (item.shippingType === 'per_unit') {
    const floor = +(item.unitCost + item.shippingCost).toFixed(2);
    if (floor > targetTco) {
      return { reachable: false, reason: `Per-unit shipping fixes $/unit at $${floor}. Target $${targetTco} is below this floor.` };
    }
    return { reachable: true, minQty: caseSize, minCases: 1, actualQty: caseSize, actualTco: floor, totalCost: +(caseSize * floor).toFixed(2), note: 'Per-unit shipping: $/unit is constant regardless of order size.' };
  }

  return { reachable: false, reason: `Unknown shipping type "${item.shippingType}".` };
}

// Depletion diagnostic — compares observed monthly draw to estimate and to industry attrition.
function analyzeDepletion(item, venue, observedMonthly) {
  const estimate = venue.monthlyDemand || 0;
  const attritionRate = ATTRITION_RATES[item.subcategory] || 0;
  const expectedFromAttrition = Math.round(venue.par * attritionRate);
  const issues = [];
  let severity = 'ok';

  if (estimate > 0 && observedMonthly > 0) {
    const gap = ((observedMonthly - estimate) / estimate) * 100;
    if (gap > 15) {
      issues.push({ tone: 'bad', text: `Estimate ${estimate}/mo vs depletion ${observedMonthly}/mo — ${Math.round(gap)}% higher. Under-provisioning risk: every PAR/min/s value built from the estimate is too low.` });
      severity = 'bad';
    } else if (gap < -15) {
      issues.push({ tone: 'warn', text: `Estimate ${estimate}/mo vs depletion ${observedMonthly}/mo — ${Math.round(Math.abs(gap))}% lower. Over-ordering risk: PARs and reorder points may be inflated.` });
      if (severity === 'ok') severity = 'warn';
    } else {
      issues.push({ tone: 'ok', text: `Estimate matches depletion within ±15% (${Math.round(gap)}%). Safe to plan against the estimate.` });
    }
  } else if (estimate === 0 && observedMonthly > 0) {
    issues.push({ tone: 'warn', text: `No estimate on file but depletion shows ${observedMonthly}/mo. Set monthlyDemand to ${observedMonthly} to drive correct r/S and s/S.` });
    if (severity === 'ok') severity = 'warn';
  }

  if (attritionRate > 0 && observedMonthly > 0 && expectedFromAttrition > 0) {
    const ratio = observedMonthly / expectedFromAttrition;
    if (ratio > 1.5) {
      issues.push({ tone: 'warn', text: `Industry attrition (${(attritionRate * 100).toFixed(1)}% of PAR ${venue.par} = ${expectedFromAttrition}/mo) is well below observed ${observedMonthly}/mo (${ratio.toFixed(1)}× higher). Suggests breakage / theft / volume spike beyond normal loss.` });
      if (severity === 'ok') severity = 'warn';
    }
  }

  return {
    item: item.name,
    itemId: item.id,
    venue: venue.name,
    estimate,
    observed: observedMonthly,
    gapPct: estimate > 0 ? Math.round(((observedMonthly - estimate) / estimate) * 100) : null,
    expectedFromAttrition,
    attritionRate,
    severity,
    issues,
  };
}

window.ProcEngine = { calcItem, advisePar, tcoTarget, analyzeDepletion, velocity, roundToCase, ATTRITION_RATES };
