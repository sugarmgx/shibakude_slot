// PRIVATE_SPEC: deterministic reel mechanics; no DOM, game state, clock or RNG.
(function(root){
'use strict';
class ReelControlError extends Error {
  constructor(message) { super(message); this.name = 'ReelControlError'; }
}
function createReelControl({SYMBOLS, PAYLINES, REEL_STRIPS, ROLE_DEFS, WIN_ROLE_KEYS, NORMAL_RANDOM_ROLE_KEYS, MAX_REEL_SLIP, LEFT_REEL_BOTTOM_ROW, CHERRY_TRIGGER_ROWS, BABA_SANDWICH_SYMBOLS, EXTENDED_STOP_ROLE_KEYS, REEL_STOP_ORDERS}) {
function wrapIndex(index, length) {
  return ((index % length) + length) % length;
}

function visibleWindowFromStop(reelIndex, stopIndex) {
  const strip = REEL_STRIPS[reelIndex];
  return [
    strip[wrapIndex(stopIndex, strip.length)],
    strip[wrapIndex(stopIndex + 1, strip.length)],
    strip[wrapIndex(stopIndex + 2, strip.length)],
  ];
}

function visibleWindowFromPosition(reelIndex, position) {
  return visibleWindowFromStop(reelIndex, Math.floor(position));
}


function matrixFromStops(stopIndexes) {
  return stopIndexes.map((stopIndex, reelIndex) => visibleWindowFromStop(reelIndex, stopIndex));
}

function extractLineSymbols(matrix, payline) {
  return payline.rows.map((rowIndex, reelIndex) => matrix[reelIndex][rowIndex]);
}

function rolePatterns(role) {
  if (role.patterns) {
    return role.patterns;
  }
  return role.symbols ? [role.symbols] : [];
}

function matchesRolePattern(role, symbols) {
  return rolePatterns(role).some((pattern) =>
    pattern.every((symbol, index) => symbol === symbols[index])
  );
}

function evaluateWins(matrix) {
  const wins = [];

  for (const payline of PAYLINES) {
    const symbols = extractLineSymbols(matrix, payline);
    for (const roleKey of WIN_ROLE_KEYS) {
      if (roleKey === "cherry") {
        continue;
      }
      const role = ROLE_DEFS[roleKey];
      if (role.allowedPaylines && !role.allowedPaylines.includes(payline.index)) {
        continue;
      }
      if (matchesRolePattern(role, symbols)) {
        wins.push({ roleKey, paylineIndex: payline.index, paylineName: payline.name, symbols: [...symbols] });
      }
    }
  }

  const hasMiddleCherry = matrix[0][1] === "チェリー";
  const hasStrongCherry = wins.some((win) => win.roleKey === "strongCherry");
  if (!hasMiddleCherry && !hasStrongCherry) {
    const triggerRow = CHERRY_TRIGGER_ROWS.find((rowIndex) => matrix[0][rowIndex] === "チェリー");
    if (triggerRow !== undefined) {
      const referenceLine = PAYLINES[triggerRow === 0 ? 0 : 2];
      wins.push({
        roleKey: "cherry",
        paylineIndex: referenceLine.index,
        paylineName: triggerRow === 0 ? "左リール上段" : "左リール下段",
        symbols: extractLineSymbols(matrix, referenceLine),
      });
    }
  }

  return wins;
}

function symbolCountInWindow(windowSymbols, targetSymbol) {
  return windowSymbols.reduce((count, symbol) => count + (symbol === targetSymbol ? 1 : 0), 0);
}

function hasCleanWatermelonDisplay(matrix) {
  return matrix.every((windowSymbols) => symbolCountInWindow(windowSymbols, "スイカ") === 1);
}

function hasCleanWatermelonChanceDisplay(matrix, payline) {
  if (!payline) return false;
  const lineSymbols = extractLineSymbols(matrix, payline);
  return lineSymbols[0] === "スイカ"
    && lineSymbols[1] === "スイカ"
    && lineSymbols[2] !== "スイカ"
    && symbolCountInWindow(matrix[0], "スイカ") === 1
    && symbolCountInWindow(matrix[1], "スイカ") === 1
    && symbolCountInWindow(matrix[2], "スイカ") === 0;
}

function fixedStopsKey(fixedStops) {
  return [...fixedStops]
    .sort((a, b) => a[0] - b[0])
    .map(([index, stop]) => `${index}:${stop}`)
    .join(",");
}

function controlCandidateIndexKey(fixedStops, targetStop) {
  return `${fixedStopsKey(fixedStops)}|${targetStop}`;
}

function forEachStopAssignment(reelIndexes, visit, depth = 0, fixedStops = new Map()) {
  if (depth >= reelIndexes.length) {
    visit(fixedStops);
    return;
  }

  const reelIndex = reelIndexes[depth];
  for (let stop = 0; stop < REEL_STRIPS[reelIndex].length; stop += 1) {
    fixedStops.set(reelIndex, stop);
    forEachStopAssignment(reelIndexes, visit, depth + 1, fixedStops);
  }
  fixedStops.delete(reelIndex);
}

function controlledDisplayFallbacks(roleKey) {
  const key = controlCatalogKey(roleKey);
  switch (key) {
    case "strongCherry":
      return ["strongCherry"];
    case "cherry":
      return ["cherry"];
    case "watermelon":
      return ["watermelon"];
    case "watermelonChance":
      return ["watermelonChance", "miss"];
    case "chance":
      return ["chance", "miss"];
    default:
      return [key];
  }
}

function buildReelControlTables(catalog) {
  const candidateIndex = Object.fromEntries(
    Object.keys(catalog).map((roleKey) => [roleKey, REEL_STRIPS.map(() => new Map())]),
  );

  Object.entries(catalog).forEach(([roleKey, entries]) => {
    entries.forEach((entry) => {
      REEL_STRIPS.forEach((_, reelIndex) => {
        const otherReels = [0, 1, 2].filter((index) => index !== reelIndex);
        for (let mask = 0; mask < (1 << otherReels.length); mask += 1) {
          const fixedStops = new Map();
          otherReels.forEach((index, bit) => {
            if (mask & (1 << bit)) fixedStops.set(index, entry.stops[index]);
          });
          const key = controlCandidateIndexKey(fixedStops, entry.stops[reelIndex]);
          const index = candidateIndex[roleKey][reelIndex];
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(entry);
        }
      });
    });
  });

  const remainingOrders = new Map();
  REEL_STOP_ORDERS.forEach((stopOrder) => {
    for (let start = 1; start < stopOrder.length; start += 1) {
      const remainingOrder = stopOrder.slice(start);
      remainingOrders.set(remainingOrder.join(","), remainingOrder);
    }
  });
  const roleFullStops = new Map();
  const robustRolePrefixes = new Map();
  Object.keys(catalog).forEach((policyRoleKey) => {
    const allowedRoles = controlledDisplayFallbacks(policyRoleKey);
    const fullStops = new Set(
      allowedRoles.flatMap((roleKey) => catalog[roleKey] || [])
        .map((entry) => fixedStopsKey(new Map(entry.stops.map((stop, index) => [index, stop])))),
    );
    const policyPrefixes = new Map();

    [...remainingOrders.values()]
      .sort((a, b) => a.length - b.length)
      .forEach((remainingOrder) => {
        const orderKey = remainingOrder.join(",");
        const [reelIndex, ...rest] = remainingOrder;
        const fixedReels = [0, 1, 2].filter((index) => !remainingOrder.includes(index));
        const safePrefixes = new Set();

        forEachStopAssignment(fixedReels, (fixedStops) => {
          const safeForEveryPressPosition = [...Array(REEL_STRIPS[reelIndex].length).keys()]
            .every((baseStop) => {
              for (let slip = 0; slip <= MAX_REEL_SLIP; slip += 1) {
                const targetStop = wrapIndex(baseStop - slip, REEL_STRIPS[reelIndex].length);
                const nextFixed = new Map(fixedStops);
                nextFixed.set(reelIndex, targetStop);
                const safe = rest.length
                  ? policyPrefixes.get(rest.join(","))?.has(fixedStopsKey(nextFixed))
                  : fullStops.has(fixedStopsKey(nextFixed));
                if (safe) return true;
              }
              return false;
            });
          if (safeForEveryPressPosition) safePrefixes.add(fixedStopsKey(fixedStops));
        });

        policyPrefixes.set(orderKey, safePrefixes);
      });

    roleFullStops.set(policyRoleKey, fullStops);
    robustRolePrefixes.set(policyRoleKey, policyPrefixes);
  });

  return {
    candidateIndex,
    roleFullStops,
    robustRolePrefixes,
    audit: {
      candidateIndexEntries: Object.values(candidateIndex).reduce(
        (total, roleIndexes) => total + roleIndexes.reduce(
          (roleTotal, index) => roleTotal + [...index.values()].reduce((count, entries) => count + entries.length, 0),
          0,
        ),
        0,
      ),
      robustPrefixCounts: Object.fromEntries(
        [...robustRolePrefixes].map(([roleKey, prefixes]) => [
          roleKey,
          Object.fromEntries([...prefixes].map(([order, values]) => [order, values.size])),
        ]),
      ),
    },
  };
}

function isRobustRolePrefix(controlTables, policyRoleKey, fixedStops, remainingOrder) {
  const key = controlCatalogKey(policyRoleKey);
  if (!remainingOrder.length) {
    return controlTables.roleFullStops.get(key)?.has(fixedStopsKey(fixedStops)) || false;
  }
  return controlTables.robustRolePrefixes.get(key)
    .get(remainingOrder.join(","))
    ?.has(fixedStopsKey(fixedStops)) || false;
}

function indexedControlChoices(controlTables, roleKey, reelIndex, fixedStops, reachableStops) {
  const index = controlTables.candidateIndex[controlCatalogKey(roleKey)]?.[reelIndex];
  if (!index) return [];
  const choices = [];
  reachableStops.forEach((_, targetStop) => {
    const entries = index.get(controlCandidateIndexKey(fixedStops, targetStop));
    if (entries?.length) choices.push([targetStop, entries]);
  });
  return choices;
}

function decideRoleAwareStop({
  controlTables,
  policyRoleKey,
  displayRoleKey,
  missedRoleKey,
  reelIndex,
  fixedStops,
  remainingOrder,
  reachableStops,
  preferBottomBar = false,
  rejectBabaSandwich = false,
  allowExtended = false,
}) {
  const fallbackRoles = controlledDisplayFallbacks(policyRoleKey);
  const currentIndex = fallbackRoles.indexOf(controlCatalogKey(displayRoleKey));
  const rolesToTry = currentIndex >= 0 ? fallbackRoles.slice(currentIndex) : fallbackRoles;
  const trace = { roleCandidates: {}, robustCandidates: {}, barCandidates: null };

  for (const candidateRoleKey of rolesToTry) {
    let choices = indexedControlChoices(
      controlTables,
      candidateRoleKey,
      reelIndex,
      fixedStops,
      reachableStops,
    );
    trace.roleCandidates[candidateRoleKey] = choices.length;

    if (remainingOrder.length && !allowExtended) {
      choices = choices.filter(([targetStop]) => {
        const nextFixed = new Map(fixedStops);
        nextFixed.set(reelIndex, targetStop);
        return isRobustRolePrefix(controlTables, policyRoleKey, nextFixed, remainingOrder);
      });
    }
    trace.robustCandidates[candidateRoleKey] = choices.length;

    if (rejectBabaSandwich && reelIndex === 0) {
      choices = choices.filter(([targetStop]) => (
        !BABA_SANDWICH_SYMBOLS.every(
          (symbol, rowIndex) => visibleWindowFromStop(0, targetStop)[rowIndex] === symbol,
        )
      ));
    }

    if (preferBottomBar && reelIndex === 0) {
      const bottomBarChoices = choices.filter(([targetStop]) => (
        visibleWindowFromStop(0, targetStop)[LEFT_REEL_BOTTOM_ROW] === "BAR"
      ));
      trace.barCandidates = { before: choices.length, after: bottomBarChoices.length };
      if (bottomBarChoices.length) choices = bottomBarChoices;
    }

    if (!choices.length) continue;
    choices.sort((a, b) => (
      reachableStops.get(a[0]) - reachableStops.get(b[0]) || b[1].length - a[1].length
    ));
    const [targetStop, entries] = choices[0];
    return {
      noSafeStop: false,
      displayRoleKey: candidateRoleKey,
      missedRoleKey: candidateRoleKey === controlCatalogKey(policyRoleKey)
        ? missedRoleKey
        : controlCatalogKey(policyRoleKey),
      targetStop,
      entries,
      slip: reachableStops.get(targetStop),
      trace,
    };
  }

  return { noSafeStop: true, trace };
}

function auditFourSlipControl(catalog, roleKeys, controlTables, { rejectBabaSandwich = false } = {}) {
  const basesByReel = REEL_STRIPS.map((strip) => [...Array(strip.length).keys()]);
  const summary = {};
  const decisionCache = new Map();

  const decide = (internalRoleKey, displayRoleKey, missedRoleKey, reelIndex, baseStop, fixedStops, remainingOrder) => {
    const fixedKey = [...fixedStops].sort((a, b) => a[0] - b[0]).map(([index, stop]) => `${index}:${stop}`).join(",");
    const cacheKey = `${internalRoleKey}|${displayRoleKey}|${missedRoleKey || ""}|${reelIndex}|${baseStop}|${fixedKey}|${remainingOrder.join("")}`;
    if (decisionCache.has(cacheKey)) return decisionCache.get(cacheKey);

    const stripLength = REEL_STRIPS[reelIndex].length;
    const reachable = new Map();
    const isIntentionalExtendedStop = EXTENDED_STOP_ROLE_KEYS.has(internalRoleKey);
    const maxSlip = isIntentionalExtendedStop ? stripLength - 1 : MAX_REEL_SLIP;
    for (let slip = 0; slip <= maxSlip; slip += 1) {
      reachable.set(wrapIndex(baseStop - slip, stripLength), slip);
    }
    const result = decideRoleAwareStop({
      controlTables,
      policyRoleKey: internalRoleKey,
      displayRoleKey,
      missedRoleKey,
      reelIndex,
      fixedStops,
      remainingOrder,
      reachableStops: reachable,
      preferBottomBar: true,
      rejectBabaSandwich,
      allowExtended: isIntentionalExtendedStop,
    });
    if (!result.noSafeStop) result.selected = result.entries[0];
    decisionCache.set(cacheKey, result);
    return result;
  };

  roleKeys.forEach((internalRoleKey) => {
    const roleSummary = { byStopOrder: {} };

    REEL_STOP_ORDERS.forEach((stopOrder) => {
      const orderKey = stopOrder.map((index) => ["L", "C", "R"][index]).join("-");
      const orderSummary = {
        totalPatterns: 0,
        primaryDisplays: 0,
        fallbackDisplays: 0,
        misses: 0,
        falseVisibleWins: 0,
        noLegalStops: 0,
        maxSlip: 0,
        overFour: 0,
        intentionalSpecialOverFour: 0,
        displayRoleCounts: {},
      };
      for (const leftBase of basesByReel[0]) {
        for (const centerBase of basesByReel[1]) {
          for (const rightBase of basesByReel[2]) {
            orderSummary.totalPatterns += 1;
            const baseStops = [leftBase, centerBase, rightBase];
            const fixedStops = new Map();
            let displayRoleKey = internalRoleKey;
            let missedRoleKey = null;
            let selected = null;

            for (const reelIndex of stopOrder) {
              const decision = decide(
                internalRoleKey,
                displayRoleKey,
                missedRoleKey,
                reelIndex,
                baseStops[reelIndex],
                fixedStops,
                stopOrder.slice(fixedStops.size + 1),
              );
              if (decision.noSafeStop) {
                orderSummary.noLegalStops += 1;
                selected = null;
                break;
              }
              displayRoleKey = decision.displayRoleKey;
              missedRoleKey = decision.missedRoleKey;
              fixedStops.set(reelIndex, decision.targetStop);
              selected = decision.selected;
              orderSummary.maxSlip = Math.max(orderSummary.maxSlip, decision.slip);
              if (decision.slip > MAX_REEL_SLIP) {
                if (EXTENDED_STOP_ROLE_KEYS.has(internalRoleKey)) orderSummary.intentionalSpecialOverFour += 1;
                else orderSummary.overFour += 1;
              }
            }

            if (!selected || fixedStops.size !== 3) continue;
            const matrix = matrixFromStops(selected.stops);
            const wins = evaluateWins(matrix);
            const hasMiddleCherry = matrix[0][1] === "チェリー";
            const expected = controlCatalogKey(displayRoleKey);
            const displayIsValid = displayRoleKey === "middleCherry"
              ? hasMiddleCherry && wins.length === 0
              : displayRoleKey === "watermelonChance"
                ? !hasMiddleCherry
                  && wins.length === 0
                  && hasCleanWatermelonChanceDisplay(matrix, selected.payline)
                : displayRoleKey === "miss"
                  ? !hasMiddleCherry && wins.length === 0
                  : displayRoleKey === "watermelon"
                    ? !hasMiddleCherry
                      && wins.length === 1
                      && wins[0].roleKey === expected
                      && hasCleanWatermelonDisplay(matrix)
                : !hasMiddleCherry && wins.length === 1 && wins[0].roleKey === expected;
            if (!displayIsValid) orderSummary.falseVisibleWins += 1;
            orderSummary.displayRoleCounts[displayRoleKey] = (orderSummary.displayRoleCounts[displayRoleKey] || 0) + 1;
            if (displayRoleKey === controlCatalogKey(internalRoleKey)) orderSummary.primaryDisplays += 1;
            else if (displayRoleKey === "miss") orderSummary.misses += 1;
            else orderSummary.fallbackDisplays += 1;
          }
        }
      }
      orderSummary.primaryDisplayRate = orderSummary.totalPatterns
        ? orderSummary.primaryDisplays / orderSummary.totalPatterns
        : 0;
      orderSummary.fallbackRate = orderSummary.totalPatterns
        ? orderSummary.fallbackDisplays / orderSummary.totalPatterns
        : 0;
      orderSummary.missRate = orderSummary.totalPatterns ? orderSummary.misses / orderSummary.totalPatterns : 0;
      roleSummary.byStopOrder[orderKey] = orderSummary;
    });
    summary[internalRoleKey] = roleSummary;
  });

  return summary;
}

function summarizeReelAuditInvariants(summary) {
  const allOrders = (roleKey) => Object.values(summary[roleKey]?.byStopOrder || {});
  const everyOrder = (roleKey, predicate) => allOrders(roleKey).length === REEL_STOP_ORDERS.length
    && allOrders(roleKey).every(predicate);
  const everyRoleOrder = Object.keys(summary).every((roleKey) => (
    everyOrder(roleKey, (result) => result.falseVisibleWins === 0 && result.noLegalStops === 0)
  ));
  const normalFourSlip = Object.keys(summary)
    .filter((roleKey) => !EXTENDED_STOP_ROLE_KEYS.has(roleKey))
    .every((roleKey) => everyOrder(roleKey, (result) => result.overFour === 0 && result.maxSlip <= MAX_REEL_SLIP));
  const extendedStopsOnlyForDeclaredRoles = Object.keys(summary).every((roleKey) => (
    everyOrder(roleKey, (result) => result.overFour === 0 && (
      EXTENDED_STOP_ROLE_KEYS.has(roleKey) || result.intentionalSpecialOverFour === 0
    ))
  ));
  return {
    A_internalMissNeverShowsWin: everyOrder("miss", (result) => (
      result.primaryDisplays === result.totalPatterns && result.falseVisibleWins === 0
    )),
    B_C_displayAndEvaluationAgree: everyRoleOrder,
    D_E_bellAndReplayNeverMiss: ["bell", "replay"].every((roleKey) => (
      everyOrder(roleKey, (result) => result.primaryDisplays === result.totalPatterns)
    )),
    F_weakCherryHasLegalStops: everyOrder("cherry", (result) => result.primaryDisplays > 0),
    G_strongCherryHasLegalPrimaryOrWeakFallback: everyOrder("strongCherry", (result) => (
      result.primaryDisplays > 0 && result.primaryDisplays + result.fallbackDisplays + result.misses === result.totalPatterns
    )),
    H_middleCherryDisplayGuaranteed: everyOrder("middleCherry", (result) => (
      result.primaryDisplays === result.totalPatterns && result.falseVisibleWins === 0
    )),
    I_watermelonIsGuaranteed: everyOrder("watermelon", (result) => (
      result.fallbackDisplays === 0
      && result.misses === 0
      && result.primaryDisplays === result.totalPatterns
      && result.falseVisibleWins === 0
    )),
    J_watermelonChanceIsExactTeaseOrCleanMiss: everyOrder("watermelonChance", (result) => (
      result.fallbackDisplays === 0
      && result.primaryDisplays + result.misses === result.totalPatterns
      && result.falseVisibleWins === 0
    )),
    K_normalControlWithinFour: normalFourSlip,
    L_extendedStopsOnlyForDeclaredRoles: extendedStopsOnlyForDeclaredRoles,
    M_noZeroCandidatePath: everyRoleOrder,
  };
}

function buildReelLayoutCatalog({ extendedAuditEnabled = false } = {}) {
  const catalog = Object.fromEntries(
    ["miss", "babaSandwich", "watermelonChance", "middleCherry", ...WIN_ROLE_KEYS].map((key) => [key, []]),
  );
  const stripLengths = REEL_STRIPS.map((strip) => strip.length);
  const knownSymbols = new Set(SYMBOLS);
  const blankCounts = REEL_STRIPS.map((strip) => strip.filter((symbol) => symbol === "ブランク").length);
  let excludedMultiWinStopCount = 0;
  let excludedMiddleCherryCollisionCount = 0;

  if (NORMAL_RANDOM_ROLE_KEYS.includes("barLine")) {
    throw new ReelControlError("通常時の抽選テーブルにBAR揃いが含まれています");
  }

  if (!stripLengths.every((length) => length === stripLengths[0] && length >= 12)) {
    throw new ReelControlError(`リール配列長が不正です: ${stripLengths.join("/")}`);
  }

  if (!blankCounts.every((count) => count === blankCounts[0] && count <= 2)) {
    throw new ReelControlError(`ブランク図柄数が不正です: ${blankCounts.join("/")}`);
  }

  REEL_STRIPS.forEach((strip, reelIndex) => {
    const invalid = strip.filter((symbol) => !knownSymbols.has(symbol));
    const missing = SYMBOLS.filter((symbol) => !strip.includes(symbol));
    if (invalid.length || missing.length) {
      throw new ReelControlError(`リール${reelIndex + 1}の図柄構成が不正です (不明:${invalid.join(",")} / 不足:${missing.join(",")})`);
    }
  });

  for (let left = 0; left < stripLengths[0]; left += 1) {
    for (let center = 0; center < stripLengths[1]; center += 1) {
      for (let right = 0; right < stripLengths[2]; right += 1) {
        const stops = [left, center, right];
        const matrix = matrixFromStops(stops);
        const wins = evaluateWins(matrix);
        const hasMiddleCherry = matrix[0][1] === "チェリー";
        if (wins.length > 1) excludedMultiWinStopCount += 1;
        if (hasMiddleCherry && wins.length > 0) excludedMiddleCherryCollisionCount += 1;

        if (wins.length === 0) {
          if (hasMiddleCherry) {
            catalog.middleCherry.push({ stops });
            continue;
          }
          catalog.miss.push({ stops });
          for (const payline of PAYLINES) {
            const symbols = extractLineSymbols(matrix, payline);
            if (symbols[0] === "スイカ" && symbols[1] === "スイカ" && symbols[2] !== "スイカ") {
              catalog.watermelonChance.push({ stops, payline, symbols });
            }
          }
        }

        if (wins.length === 1 && !hasMiddleCherry) {
          catalog[wins[0].roleKey].push({ stops, win: wins[0] });
        }
      }
    }
  }

  // A technically valid 5LINE win can still look ambiguous when an extra watermelon is
  // visible outside the winning line. Keep only visually unambiguous pickup patterns.
  catalog.watermelon = catalog.watermelon.filter((entry) => (
    hasCleanWatermelonDisplay(matrixFromStops(entry.stops))
  ));
  catalog.watermelonChance = catalog.watermelonChance.filter((entry) => (
    hasCleanWatermelonChanceDisplay(matrixFromStops(entry.stops), entry.payline)
  ));
  const watermelonChanceStops = new Set(catalog.watermelonChance.map((entry) => entry.stops.join(",")));
  catalog.miss = catalog.miss.filter((entry) => !watermelonChanceStops.has(entry.stops.join(",")));
  // A weak cherry is represented by one cherry on either the upper or lower row
  // of the left reel. Exclude windows that show cherries on both trigger rows;
  // otherwise the same stop looks like two overlapping weak-cherry patterns.
  catalog.cherry = catalog.cherry.filter((entry) => {
    const matrix = matrixFromStops(entry.stops);
    return CHERRY_TRIGGER_ROWS.filter((rowIndex) => matrix[0][rowIndex] === "チェリー").length === 1;
  });

  catalog.babaSandwich = catalog.miss.filter((entry) => (
    visibleWindowFromStop(0, entry.stops[0]).every((symbol, rowIndex) => symbol === BABA_SANDWICH_SYMBOLS[rowIndex])
  ));

  const requiredKeys = ["miss", "babaSandwich", "watermelonChance", "middleCherry", ...WIN_ROLE_KEYS];
  const missingKeys = requiredKeys.filter((key) => catalog[key].length === 0);
  if (missingKeys.length) {
    throw new ReelControlError(`5LINE停止テーブルに候補がありません: ${missingKeys.join(", ")}`);
  }

  const strongPatterns = new Set(catalog.strongCherry.map((entry) => entry.win.symbols.join(",")));
  const nonMiddleKeys = requiredKeys.filter((key) => key !== "middleCherry");
  const middleCherryLeakCount = nonMiddleKeys.reduce(
    (total, key) => total + catalog[key].filter((entry) => matrixFromStops(entry.stops)[0][1] === "チェリー").length,
    0,
  );
  const invalidWeakCherryCount = catalog.cherry.filter((entry) => {
    const matrix = matrixFromStops(entry.stops);
    const triggerRows = CHERRY_TRIGGER_ROWS.filter((rowIndex) => matrix[0][rowIndex] === "チェリー");
    const wins = evaluateWins(matrix);
    return (
      triggerRows.length !== 1 ||
      matrix[0][1] === "チェリー" ||
      wins.length !== 1 ||
      wins[0].roleKey !== "cherry"
    );
  }).length;
  const invalidStrongCherryCount = catalog.strongCherry.filter((entry) => {
    const wins = evaluateWins(matrixFromStops(entry.stops));
    return (
      wins.length !== 1 ||
      wins[0].roleKey !== "strongCherry" ||
      ![0, 2, 3, 4].includes(wins[0].paylineIndex) ||
      wins[0].symbols.join(",") !== "チェリー,チェリー,チェリー"
    );
  }).length;
  const invalidWatermelonCount = catalog.watermelon.filter((entry) => {
    const matrix = matrixFromStops(entry.stops);
    const wins = evaluateWins(matrix);
    return !hasCleanWatermelonDisplay(matrix)
      || wins.length !== 1
      || wins[0].roleKey !== "watermelon"
      || wins[0].symbols.join(",") !== "スイカ,スイカ,スイカ";
  }).length;
  const invalidWatermelonChanceCount = catalog.watermelonChance.filter((entry) => {
    const matrix = matrixFromStops(entry.stops);
    return !hasCleanWatermelonChanceDisplay(matrix, entry.payline)
      || evaluateWins(matrix).length !== 0
      || matrix[0][1] === "チェリー";
  }).length;
  const selectedRoleMismatchCount = WIN_ROLE_KEYS.reduce(
    (total, roleKey) => total + catalog[roleKey].filter((entry) => {
      const wins = evaluateWins(matrixFromStops(entry.stops));
      return wins.length !== 1 || wins[0].roleKey !== roleKey;
    }).length,
    0,
  );
  if (
    strongPatterns.size !== 1 ||
    !strongPatterns.has("チェリー,チェリー,チェリー") ||
    middleCherryLeakCount !== 0 ||
    invalidWeakCherryCount !== 0 ||
    invalidStrongCherryCount !== 0 ||
    invalidWatermelonCount !== 0 ||
    invalidWatermelonChanceCount !== 0 ||
    selectedRoleMismatchCount !== 0
  ) {
    const invalidLayoutAudit = {
      strongPatterns: [...strongPatterns],
      middleCherryLeakCount,
      invalidWeakCherryCount,
      invalidStrongCherryCount,
      invalidWatermelonCount,
      invalidWatermelonChanceCount,
      selectedRoleMismatchCount,
    };
    throw new ReelControlError(`チェリー・スイカ停止形または5LINE成立役の検証に失敗しました: ${JSON.stringify(invalidLayoutAudit)}`);
  }

  const perLine = Object.fromEntries(
    WIN_ROLE_KEYS.map((roleKey) => [
      roleKey,
      PAYLINES.map((payline) => catalog[roleKey].filter((entry) => entry.win.paylineIndex === payline.index).length),
    ]),
  );
  const leftBottomBarStops = [...Array(stripLengths[0]).keys()].filter(
    (stopIndex) => visibleWindowFromStop(0, stopIndex)[LEFT_REEL_BOTTOM_ROW] === "BAR",
  );
  const bottomBarCandidateCounts = Object.fromEntries(
    requiredKeys.map((roleKey) => [
      roleKey,
      catalog[roleKey].filter((entry) => leftBottomBarStops.includes(entry.stops[0])).length,
    ]),
  );
  const missingBottomBarRoles = ["miss"]
    .filter((roleKey) => bottomBarCandidateCounts[roleKey] === 0);
  if (missingBottomBarRoles.length) {
    throw new ReelControlError(`左リール下段BAR停止候補がありません: ${missingBottomBarRoles.join(", ")}`);
  }

  const controlTables = buildReelControlTables(catalog);
  // C1: future-reel safety must use the same exclusion as the final left stop.
  const noSandwichCatalog = Object.fromEntries(Object.entries(catalog).map(([key, entries]) => [
    key, entries.filter(entry => !BABA_SANDWICH_SYMBOLS.every(
      (symbol, row) => visibleWindowFromStop(0, entry.stops[0])[row] === symbol,
    )),
  ]));
  const normalControlTables = buildReelControlTables(noSandwichCatalog);

  const fourSlipControl = extendedAuditEnabled
    ? auditFourSlipControl(catalog, requiredKeys.filter((key) => key !== "babaSandwich"), controlTables)
    : { status: "extended audit available with ?audit=1" };
  const invariantResults = extendedAuditEnabled ? summarizeReelAuditInvariants(fourSlipControl) : null;
  const normalControlAudit = extendedAuditEnabled
    ? auditFourSlipControl(catalog, NORMAL_RANDOM_ROLE_KEYS.filter(key => !EXTENDED_STOP_ROLE_KEYS.has(key)), normalControlTables, { rejectBabaSandwich: true })
    : null;
  if (normalControlAudit && Object.values(normalControlAudit).some(role => Object.values(role.byStopOrder).some(order => order.noLegalStops || order.falseVisibleWins || order.overFour))) {
    throw new ReelControlError('通常時の挟み目除外付き停止監査に失敗しました');
  }
  if (invariantResults && Object.values(invariantResults).some((passed) => !passed)) {
    throw new ReelControlError(`リール制御の不変条件監査に失敗しました: ${JSON.stringify(invariantResults)}`);
  }

  return {
    catalog,
    controlTables,
    normalControlTables,
    audit: {
      stripLengths,
      blankCounts,
      totalStopCombinations: stripLengths.reduce((total, length) => total * length, 1),
      excludedMultiWinStopCount,
      excludedMiddleCherryCollisionCount,
      candidateCounts: Object.fromEntries(requiredKeys.map((key) => [key, catalog[key].length])),
      perLine,
      paylines: PAYLINES.map((payline) => payline.name),
      leftReelAim: {
        target: "下段BAR",
        maxSlip: MAX_REEL_SLIP,
        stopIndexes: leftBottomBarStops,
        candidateCounts: bottomBarCandidateCounts,
      },
      cherryRules: {
        weakTrigger: "左リール上段または下段のチェリー単体",
        weakTriggerRows: [...CHERRY_TRIGGER_ROWS],
        strongPatterns: [...strongPatterns],
        strongAllowedPaylines: ["上段", "下段", "右下がり", "右上がり"],
        middleCherryLeakCount,
        invalidWeakCherryCount,
        invalidStrongCherryCount,
        selectedRoleMismatchCount,
      },
      watermelonRules: {
        exactLineSymbols: ["スイカ", "スイカ", "スイカ"],
        visibleSymbolCounts: [1, 1, 1],
        chanceVisibleSymbolCounts: [1, 1, 0],
        invalidWatermelonCount,
        invalidWatermelonChanceCount,
      },
      normalBarLineEnabled: NORMAL_RANDOM_ROLE_KEYS.includes("barLine"),
      middleCherryProbability: "1/16384",
      precomputedControl: controlTables.audit,
      invariants: invariantResults,
      normalControlAudit,
      fourSlipControl,
    },
  };
}


function layoutFromCatalogEntry(roleKey, candidate) {
  const stops = [...candidate.stops];
  const reels = matrixFromStops(stops);
  let lastHit = null;

  if (roleKey === "miss" || roleKey === "babaSandwich") {
    lastHit = {
      roleKey,
      roleName: ROLE_DEFS[roleKey].name,
      paylineIndex: null,
      paylineName: roleKey === "babaSandwich" ? "左リール BAR・リプレイ・BAR" : "非入賞",
      symbols: reels.map((reel) => reel[1]),
    };
  } else if (roleKey === "middleCherry") {
    lastHit = {
      roleKey,
      roleName: ROLE_DEFS[roleKey].name,
      paylineIndex: 1,
      paylineName: "左リール中段",
      symbols: ["チェリー", reels[1][1], reels[2][1]],
    };
  } else if (roleKey === "watermelonChance") {
    lastHit = {
      roleKey,
      roleName: ROLE_DEFS[roleKey].name,
      paylineIndex: candidate.payline.index,
      paylineName: candidate.payline.name,
      symbols: [...candidate.symbols],
    };
  } else if (candidate.win) {
    lastHit = {
      roleKey,
      roleName: ROLE_DEFS[roleKey].name,
      paylineIndex: candidate.win.paylineIndex,
      paylineName: candidate.win.paylineName,
      symbols: [...candidate.win.symbols],
    };
  }

  return { reels, stopIndexes: stops, lastHit };
}


function controlCatalogKey(roleKey) {
  return roleKey === "assistBar" ? "barLine" : roleKey;
}


return {wrapIndex, visibleWindowFromStop, visibleWindowFromPosition, matrixFromStops, extractLineSymbols, rolePatterns, matchesRolePattern, evaluateWins, symbolCountInWindow, hasCleanWatermelonDisplay, hasCleanWatermelonChanceDisplay, fixedStopsKey, controlCandidateIndexKey, forEachStopAssignment, controlledDisplayFallbacks, buildReelControlTables, isRobustRolePrefix, indexedControlChoices, decideRoleAwareStop, auditFourSlipControl, summarizeReelAuditInvariants, buildReelLayoutCatalog, layoutFromCatalogEntry, controlCatalogKey};
}
if(typeof module === 'object' && module.exports) module.exports={createReelControl, ReelControlError};
else root.ShibakuReelControl={createReelControl, ReelControlError};
})(typeof globalThis !== 'undefined' ? globalThis : this);
