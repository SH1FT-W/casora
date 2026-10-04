// Hasht Vorlagen exakt wie das Studio (casora-panel.js: stable + hashStr).
// Eingabe (stdin): [{name, bodies: [json…]}]  Ausgabe: {name: [hash…]}
function stable(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return "[" + x.map(stable).join(",") + "]";
  return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + stable(x[k])).join(",") + "}";
}
const hashStr = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
};
let input = "";
process.stdin.on("data", (d) => { input += d; });
process.stdin.on("end", () => {
  const out = {};
  for (const { name, bodies } of JSON.parse(input)) {
    out[name] = [...new Set(bodies.map((b) => hashStr(stable(JSON.parse(b)))))].sort();
  }
  process.stdout.write(JSON.stringify(out));
});
