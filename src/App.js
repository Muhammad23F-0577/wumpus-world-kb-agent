import React, { useState } from "react";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);
const key = (r, c) => `${r},${c}`;

/* ---------------- WORLD ---------------- */

function makeWorld(rows, cols, pits) {
  let g = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      pit: 0,
      w: 0,
      gold: 0
    }))
  );

  while (pits > 0) {
    let r = rand(rows), c = rand(cols);
    if ((r === 0 && c === 0) || g[r][c].pit) continue;
    g[r][c].pit = 1;
    pits--;
  }

  while (1) {
    let r = rand(rows), c = rand(cols);
    if ((r === 0 && c === 0) || g[r][c].pit) continue;
    g[r][c].w = 1;
    break;
  }

  while (1) {
    let r = rand(rows), c = rand(cols);
    if ((r === 0 && c === 0) || g[r][c].pit || g[r][c].w) continue;
    g[r][c].gold = 1;
    break;
  }

  return g;
}

/* ---------------- HELPERS ---------------- */

function near(r, c, rows, cols) {
  return [
    [r + 1, c],
    [r - 1, c],
    [r, c + 1],
    [r, c - 1]
  ].filter(([x, y]) => x >= 0 && y >= 0 && x < rows && y < cols);
}

/* ---------------- PERCEPT ---------------- */

function percept(world, r, c) {
  let breeze = 0, stench = 0;

  near(r, c, world.length, world[0].length).forEach(([x, y]) => {
    if (world[x][y].pit) breeze = 1;
    if (world[x][y].w) stench = 1;
  });

  return { breeze, stench };
}

/* ---------------- KB ---------------- */

function updateKB(kb, world, r, c, p) {
  let neighbors = near(r, c, world.length, world[0].length);
  let cell = key(r, c);

  if (p.breeze) {
    kb.push({
      type: "PIT_OR",
      origin: cell,
      clause: neighbors.map(([x, y]) => `PIT(${x},${y})`)
    });
  } else {
    neighbors.forEach(([x, y]) => {
      kb.push({ type: "NO_PIT", cell: key(x, y) });
    });
  }

  if (p.stench) {
    kb.push({
      type: "WUMPUS_OR",
      origin: cell,
      clause: neighbors.map(([x, y]) => `WUMPUS(${x},${y})`)
    });
  } else {
    neighbors.forEach(([x, y]) => {
      kb.push({ type: "NO_WUMPUS", cell: key(x, y) });
    });
  }
}

/* ---------------- CNF ---------------- */

function toCNF(kb) {
  let cnf = [];

  kb.forEach((x) => {
    if (x.type === "NO_PIT") cnf.push([`~PIT(${x.cell})`]);
    if (x.type === "NO_WUMPUS") cnf.push([`~WUMPUS(${x.cell})`]);
    if (x.type === "PIT_OR") cnf.push([...x.clause]);
    if (x.type === "WUMPUS_OR") cnf.push([...x.clause]);
  });

  return cnf;
}

/* ---------------- RESOLUTION ---------------- */

function negate(lit) {
  return lit.startsWith("~") ? lit.slice(1) : "~" + lit;
}

function resolutionEntails(kb, query) {
  let clauses = [...toCNF(kb), [negate(query)]];
  let seen = new Set();

  for (let i = 0; i < clauses.length; i++) {
    for (let j = i + 1; j < clauses.length; j++) {
      for (let a of clauses[i]) {
        let na = negate(a);

        if (clauses[j].includes(na)) {
          let resolvent = [
            ...clauses[i].filter((x) => x !== a),
            ...clauses[j].filter((x) => x !== na)
          ];

          resolvent = [...new Set(resolvent)];

          if (resolvent.length === 0) return true;

          let sig = resolvent.sort().join(",");

          if (!seen.has(sig) && clauses.length < 100) {
            seen.add(sig);
            clauses.push(resolvent);
          }
        }
      }
    }
  }

  return false;
}

/* ---------------- SAFE CHECK ---------------- */

function isSafe(kb, r, c) {
  let cell = key(r, c);

  let noPit = resolutionEntails(kb, `~PIT(${cell})`);
  let noW = resolutionEntails(kb, `~WUMPUS(${cell})`);

  return noPit && noW;
}

/* ---------------- APP ---------------- */

export default function App() {
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(5);
  const [pits, setPits] = useState(2);

  const [world, setWorld] = useState(null);
  const [agent, setAgent] = useState({ r: 0, c: 0 });

  const [kb, setKb] = useState([]);
  const [visit, setVisit] = useState(new Set(["0,0"]));
  const [perceptMap, setPerceptMap] = useState({});

  const [status, setStatus] = useState("Ready");
  const [run, setRun] = useState(0);
  const [showAll, setShowAll] = useState(0);
  const [p, setP] = useState({ breeze: 0, stench: 0 });

  function start() {
    let w = makeWorld(rows, cols, pits);

    setWorld(w);
    setAgent({ r: 0, c: 0 });
    setKb([]);
    setVisit(new Set(["0,0"]));
    setPerceptMap({});
    setStatus("Grid Generated");
    setRun(0);
    setShowAll(0);
  }

  async function solve() {
    if (!world || run) return;

    setRun(1);
    let q = [{ r: 0, c: 0 }];
    let v = new Set(["0,0"]);
    let localKB = [];

    while (q.length) {
      let cur = q.shift();
      setAgent(cur);

      let pp = percept(world, cur.r, cur.c);
      setP(pp);

      setPerceptMap((prev) => ({
        ...prev,
        [key(cur.r, cur.c)]: pp
      }));

      updateKB(localKB, world, cur.r, cur.c, pp);
      setKb([...localKB]);

      let cell = world[cur.r][cur.c];

      if (cell.pit) {
        setStatus("💀 Pit Found");
        setShowAll(1);
        setRun(0);
        return;
      }

      if (cell.w) {
        setStatus("👻 Wumpus Found");
        setShowAll(1);
        setRun(0);
        return;
      }

      if (cell.gold) {
        setStatus("🏆 Gold Found");
        setShowAll(1);
        setRun(0);
        return;
      }

      for (let [x, y] of near(cur.r, cur.c, rows, cols)) {
        let k = key(x, y);

        if (v.has(k)) continue;

        if (isSafe(localKB, x, y)) {
          v.add(k);
          q.push({ r: x, c: y });
        }
      }

      setVisit(new Set(v));
      await sleep(400);
    }

    setStatus("No Safe Move");
    setRun(0);
  }

  function cellView(r, c) {
    let cell = world[r][c];
    let k = key(r, c);
    let per = perceptMap[k];

    let emoji = "⬜";

    if (visit.has(k)) emoji = "🟩";

    if (per?.breeze && per?.stench) emoji = "🌬️👃";
    else if (per?.breeze) emoji = "🌬️";
    else if (per?.stench) emoji = "👃";

    if (agent.r === r && agent.c === c) emoji = "🤖";

    if (showAll) {
      if (cell.pit) emoji = "💀";
      if (cell.w) emoji = "👻";
      if (cell.gold) emoji = "🏆";
    }

    return emoji;
  }

  return (
    <div style={{ padding: 20, fontFamily: "Arial" }}>
      <h2>Wumpus World KB Agent</h2>

      <input value={rows} onChange={(e) => setRows(+e.target.value)} style={{ width: 60 }} />
      <input value={cols} onChange={(e) => setCols(+e.target.value)} style={{ width: 60, marginLeft: 8 }} />
      <input value={pits} onChange={(e) => setPits(+e.target.value)} style={{ width: 60, marginLeft: 8 }} />

      <button onClick={start} style={{ marginLeft: 8 }}>Generate</button>
      <button onClick={solve} style={{ marginLeft: 8 }}>
        {run ? "Running..." : "Run"}
      </button>

      {world && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols},50px)`,
            gap: 4,
            marginTop: 15
          }}
        >
          {world.map((row, r) =>
            row.map((_, c) => (
              <div
                key={r + "-" + c}
                style={{
                  width: 50,
                  height: 50,
                  border: "1px solid black",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 20
                }}
              >
                {cellView(r, c)}
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ marginTop: 15 }}>
        <p><b>Status:</b> {status}</p>
        <p><b>Breeze:</b> {p.breeze}</p>
        <p><b>Stench:</b> {p.stench}</p>
        <p><b>KB Size:</b> {kb.length}</p>
        <p><b>CNF Clauses:</b> {toCNF(kb).length}</p>
      </div>
    </div>
  );
}